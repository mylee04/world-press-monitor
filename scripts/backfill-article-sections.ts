import { Client } from 'pg';
import { isKnownNonArticleUrl } from '@/lib/article-url-filters';
import { deriveSectionFromContext } from '@/lib/article-section-context';
import { deriveSectionFromArticlePage } from '@/lib/article-page-section';
import { runWithConcurrency } from '@/lib/concurrency';
import { resolveDatabaseUrl } from '@/lib/database-url';
import { fetchWithRetry, readResponseText } from '@/lib/fetch-utils';
import { decodeHtmlEntities, normalizeReadableArticleTitle } from '@/lib/html-entities';
import type { NewsSection } from '@/lib/types';

type CandidateRow = {
  external_id: string;
  source: string;
  title_original: string;
  url: string;
  publication_datetime: string;
};

type BackfillDecision = {
  externalId: string;
  source: string;
  section: NewsSection;
  reason: string;
  evidence: 'meta' | 'article_section' | 'breadcrumb' | 'keywords' | 'context' | 'none';
};

type CliArgs = {
  apply: boolean;
  days: number;
  limit: number | null;
  concurrency: number;
  sources: string[];
};

const DEFAULT_DAYS = 31;
const DEFAULT_CONCURRENCY = 12;
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36';

function parseArgs(argv: string[]): CliArgs {
  return {
    apply: argv.includes('--apply'),
    days: parseNumberArg(argv, '--days=', DEFAULT_DAYS, 1, 90),
    limit: parseOptionalNumberArg(argv, '--limit=', 1),
    concurrency: parseNumberArg(argv, '--concurrency=', DEFAULT_CONCURRENCY, 1, 48),
    sources: parseListArg(argv, '--sources='),
  };
}

function parseNumberArg(argv: string[], prefix: string, fallback: number, min: number, max: number): number {
  const raw = argv.find((item) => item.startsWith(prefix));
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw.slice(prefix.length), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function parseOptionalNumberArg(argv: string[], prefix: string, min: number): number | null {
  const raw = argv.find((item) => item.startsWith(prefix));
  if (!raw) return null;
  const parsed = Number.parseInt(raw.slice(prefix.length), 10);
  if (!Number.isFinite(parsed) || parsed < min) return null;
  return parsed;
}

function parseListArg(argv: string[], prefix: string): string[] {
  const raw = argv.find((item) => item.startsWith(prefix));
  if (!raw) return [];
  return [...new Set(raw.slice(prefix.length).split(',').map((item) => item.trim()).filter(Boolean))];
}

function normalizeSource(value: string): string {
  return (value || '').trim().toLowerCase();
}

function parsePathname(url: string): string {
  try {
    return decodeURIComponent(new URL(url).pathname).toLowerCase();
  } catch {
    return '';
  }
}

function resolveTrustedContextSection(row: CandidateRow): BackfillDecision | null {
  const url = decodeHtmlEntities(row.url || '');
  const pathname = parsePathname(url);
  const source = normalizeSource(row.source);
  const title = normalizeReadableArticleTitle(row.title_original || '', url, row.source || '');
  const section = deriveSectionFromContext({ source: row.source, url, title });
  if (section === 'others') return null;

  if (source.includes('sports illustrated')) {
    return buildContextDecision(row, section, 'Trusted sports-only outlet context');
  }

  if (source.includes('a bola') || source.includes('tyc sports') || source.includes('tokyo sports')) {
    return buildContextDecision(row, section, 'Trusted sports-only outlet context');
  }

  if (source.includes('bbc news - sitemap index')) {
    if (/^\/sport\//.test(pathname)) return buildContextDecision(row, section, 'Trusted BBC sport path');
    if (/^\/[a-z-]+\/articles\//.test(pathname)) return buildContextDecision(row, 'world', 'Trusted BBC language-service article path');
  }

  if (source.includes('daily mail')) {
    if (/^\/sport\//.test(pathname)) return buildContextDecision(row, 'sports', 'Trusted Daily Mail sport path');
    if (/^\/tvshowbiz\//.test(pathname)) return buildContextDecision(row, 'entertainment', 'Trusted Daily Mail showbiz path');
    if (/^\/femail\//.test(pathname)) return buildContextDecision(row, 'lifestyle', 'Trusted Daily Mail lifestyle path');
    if (/^\/health\//.test(pathname)) return buildContextDecision(row, 'health', 'Trusted Daily Mail health path');
    if (/^\/sciencetech\//.test(pathname)) return buildContextDecision(row, 'tech', 'Trusted Daily Mail tech path');
    if (/^\/news\//.test(pathname)) return buildContextDecision(row, 'world', 'Trusted Daily Mail news path');
  }

  if (source.includes('the times of india')) {
    if (/^\/sports\//.test(pathname)) return buildContextDecision(row, 'sports', 'Trusted TOI sports path');
    if (/^\/business\//.test(pathname)) return buildContextDecision(row, 'business', 'Trusted TOI business path');
    if (/^\/technology\//.test(pathname)) return buildContextDecision(row, 'tech', 'Trusted TOI technology path');
    if (/^\/health\//.test(pathname)) return buildContextDecision(row, 'health', 'Trusted TOI health path');
    if (/^\/(?:entertainment|tv|web-series|etimes)\//.test(pathname)) return buildContextDecision(row, 'entertainment', 'Trusted TOI entertainment path');
    if (/^\/(?:lifestyle|life-style|astrology|religion)\//.test(pathname)) return buildContextDecision(row, 'lifestyle', 'Trusted TOI lifestyle path');
    if (/^\/(?:real-estate|auto)\//.test(pathname)) return buildContextDecision(row, 'business', 'Trusted TOI markets/auto path');
    if (/^\/(?:education|city|india|world|legal|times-special)\//.test(pathname)) return buildContextDecision(row, 'world', 'Trusted TOI general-news path');
  }

  if (source.includes('infobae')) {
    if (/^\/politica\//.test(pathname)) return buildContextDecision(row, 'politics', 'Trusted Infobae politics path');
    if (/^\/economia\//.test(pathname)) return buildContextDecision(row, 'business', 'Trusted Infobae business path');
    if (/^\/salud\//.test(pathname)) return buildContextDecision(row, 'health', 'Trusted Infobae health path');
    if (/^\/deportes\//.test(pathname)) return buildContextDecision(row, 'sports', 'Trusted Infobae sports path');
    if (/^\/teleshow\//.test(pathname)) return buildContextDecision(row, 'entertainment', 'Trusted Infobae entertainment path');
    if (/^\/cultura\//.test(pathname)) return buildContextDecision(row, 'arts', 'Trusted Infobae culture path');
    if (/^\/tecno\//.test(pathname)) return buildContextDecision(row, 'tech', 'Trusted Infobae tech path');
    if (/^\/(sociedad|america\/mundo|america\/america-latina)\//.test(pathname)) {
      return buildContextDecision(row, 'world', 'Trusted Infobae general-news path');
    }
  }

  if (source.includes('el cronista')) {
    if (/^\/finanzas-mercados\//.test(pathname)) return buildContextDecision(row, 'business', 'Trusted Cronista markets path');
    if (/^\/negocios\//.test(pathname)) return buildContextDecision(row, 'business', 'Trusted Cronista business path');
    if (/^\/economia-politica\//.test(pathname)) return buildContextDecision(row, 'politics', 'Trusted Cronista economy-politics path');
    if (/^\/informacion-gral\//.test(pathname)) return buildContextDecision(row, 'world', 'Trusted Cronista general-news path');
    if (/^\/deportes\//.test(pathname)) return buildContextDecision(row, 'sports', 'Trusted Cronista sports path');
    if (/^\/salud\//.test(pathname)) return buildContextDecision(row, 'health', 'Trusted Cronista health path');
    if (/^\/infotechnology\//.test(pathname)) return buildContextDecision(row, 'tech', 'Trusted Cronista tech path');
  }

  if (source.includes('sponichi')) {
    if (/^\/entertainment\//.test(pathname)) return buildContextDecision(row, 'entertainment', 'Trusted Sponichi entertainment path');
    if (/^\/(sports|baseball|soccer|basketball|golf|horseracing|battle|formula1)\//.test(pathname)) {
      return buildContextDecision(row, 'sports', 'Trusted Sponichi sports path');
    }
  }

  if (source.includes('조선닷컴')) {
    return buildContextDecision(row, section, 'Trusted Chosun section path');
  }

  if (source.includes('milenio')) {
    return buildContextDecision(row, section, 'Trusted Milenio section path');
  }

  if (source.includes('jiji press')) {
    return buildContextDecision(row, section, 'Trusted Jiji route/query section');
  }

  if (source.includes('g1 globo')) {
    return buildContextDecision(row, section, 'Trusted G1 section path');
  }

  if (/^ansa\b|ansa - sitemap index/.test(source)) {
    return buildContextDecision(row, section, 'Trusted ANSA section path');
  }

  if (source.includes('welt')) {
    return buildContextDecision(row, section, 'Trusted WELT section path');
  }

  if (source.includes('die zeit')) {
    return buildContextDecision(row, section, 'Trusted ZEIT section path');
  }

  if (source.includes('augsburger allgemeine')) {
    return buildContextDecision(row, section, 'Trusted Augsburger section path');
  }

  if (source.includes('merkur')) {
    return buildContextDecision(row, section, 'Trusted Merkur section path');
  }

  if (source.includes('proto thema')) {
    return buildContextDecision(row, section, 'Trusted Proto Thema section path');
  }

  if (source.includes('24 chasa')) {
    return buildContextDecision(row, section, 'Trusted 24 Chasa section path');
  }

  if (source.includes('dhnet')) {
    return buildContextDecision(row, section, 'Trusted DHnet section path');
  }

  if (source.includes('24horas')) {
    return buildContextDecision(row, section, 'Trusted 24Horas section path');
  }

  if (source.includes('the hindu')) {
    return buildContextDecision(row, section, 'Trusted The Hindu section path');
  }

  if (source.includes('hindustan times')) {
    return buildContextDecision(row, section, 'Trusted Hindustan Times section path');
  }

  if (source.includes('tvbs')) {
    return buildContextDecision(row, section, 'Trusted TVBS section path');
  }

  if (source.includes('mirror - news sitemap')) {
    return buildContextDecision(row, section, 'Trusted Mirror section path');
  }

  if (source.includes('independent.ie')) {
    return buildContextDecision(row, section, 'Trusted Independent.ie section path');
  }

  if (source.includes('telegraf')) {
    return buildContextDecision(row, section, 'Trusted Telegraf section path');
  }

  if (source.includes('rtl nieuws')) {
    return buildContextDecision(row, section, 'Trusted RTL Nieuws section path');
  }

  if (source.includes('the independent')) {
    return buildContextDecision(row, section, 'Trusted The Independent section path');
  }

  if (source.includes('liberty times')) {
    return buildContextDecision(row, section, 'Trusted Liberty Times section path');
  }

  if (source.includes('cnn brasil')) {
    return buildContextDecision(row, section, 'Trusted CNN Brasil section path');
  }

  if (source.includes('oricon')) {
    return buildContextDecision(row, section, 'Trusted Oricon entertainment outlet');
  }

  if (source.includes('ria novosti')) {
    return buildContextDecision(row, section, 'Trusted RIA title-based section');
  }

  if (source.includes('rossiyskaya gazeta')) {
    return buildContextDecision(row, section, 'Trusted Rossiyskaya Gazeta title-based section');
  }

  if (source === 'lenta') {
    return buildContextDecision(row, section, 'Trusted Lenta title-based section');
  }

  if (source.includes('ukrainska pravda')) {
    return buildContextDecision(row, section, 'Trusted Ukrainska Pravda title-based section');
  }

  if (source.includes('매일경제')) {
    return buildContextDecision(row, section, 'Trusted MK section path');
  }

  if (source.includes('daily express')) {
    return buildContextDecision(row, section, 'Trusted Daily Express section path');
  }

  if (source.includes('record')) {
    return buildContextDecision(row, section, 'Trusted Record sports outlet');
  }

  if (source.includes('kurir')) {
    return buildContextDecision(row, section, 'Trusted Kurir section path');
  }

  if (source === 'blic') {
    return buildContextDecision(row, section, 'Trusted Blic path/title context');
  }

  if (source.includes('okdiario')) {
    return buildContextDecision(row, section, 'Trusted OKdiario section path');
  }

  if (source.includes('24sata')) {
    return buildContextDecision(row, section, 'Trusted 24sata path/title context');
  }

  if (source.includes('20 minutos')) {
    return buildContextDecision(row, section, 'Trusted 20 Minutos section path');
  }

  if (source.includes('sapo - article sitemap')) {
    return buildContextDecision(row, section, 'Trusted SAPO host/path/title context');
  }

  if (source.includes('abc.es')) {
    return buildContextDecision(row, section, 'Trusted ABC.es section path');
  }

  if (source.includes('eldiario.es')) {
    return buildContextDecision(row, section, 'Trusted eldiario.es section path');
  }

  if (source.includes('la nación') || source.includes('la nacion')) {
    return buildContextDecision(row, section, 'Trusted La Nacion section path');
  }

  if (source.includes('la tercera')) {
    return buildContextDecision(row, section, 'Trusted La Tercera section path');
  }

  if (source.includes('new york post')) {
    return buildContextDecision(row, section, 'Trusted New York Post section path');
  }

  if (source.includes('toronto star')) {
    return buildContextDecision(row, section, 'Trusted Toronto Star section path');
  }

  if (source.includes('ctv atlantic')) {
    return buildContextDecision(row, section, 'Trusted CTV local-news path/title context');
  }

  if (source.includes('daily record')) {
    return buildContextDecision(row, section, 'Trusted Daily Record section path');
  }

  if (source.includes('expressen')) {
    return buildContextDecision(row, section, 'Trusted Expressen section path');
  }

  if (source.includes('newsweek')) {
    return buildContextDecision(row, section, 'Trusted Newsweek path/title context');
  }

  if (source.includes('la stampa')) {
    return buildContextDecision(row, section, 'Trusted La Stampa path/title context');
  }

  if (source.includes('birmingham live') || source.includes('liverpool echo') || source.includes('manchester evening news')) {
    return buildContextDecision(row, section, 'Trusted Reach local-news section path');
  }

  if (source.includes('el correo')) {
    return buildContextDecision(row, section, 'Trusted El Correo section path');
  }

  if (source.includes('el periódico')) {
    return buildContextDecision(row, section, 'Trusted El Periódico section path');
  }

  if (source.includes('el español')) {
    return buildContextDecision(row, section, 'Trusted El Español section path');
  }

  if (source.includes('in.gr')) {
    return buildContextDecision(row, section, 'Trusted In.gr section path');
  }

  if (source.includes('24tv.ua')) {
    return buildContextDecision(row, section, 'Trusted 24tv.ua section path');
  }

  if (source.includes('adnkronos')) {
    return buildContextDecision(row, section, 'Trusted Adnkronos section path');
  }

  if (source.includes('the indian express')) {
    return buildContextDecision(row, section, 'Trusted The Indian Express section path');
  }

  if (source.includes('liputan6')) {
    return buildContextDecision(row, section, 'Trusted Liputan6 section path');
  }

  if (source.includes('suara')) {
    return buildContextDecision(row, section, 'Trusted Suara path/title context');
  }

  if (source.includes('abema times')) {
    return buildContextDecision(row, section, 'Trusted Abema route');
  }

  if (source.includes('rt russian')) {
    return buildContextDecision(row, section, 'Trusted RT section path');
  }

  if (source.includes('izvestia')) {
    return buildContextDecision(row, section, 'Trusted Izvestia title-based section');
  }

  if (source === 'nv') {
    return buildContextDecision(row, section, 'Trusted NV host/path');
  }

  if (source.includes('aftonbladet')) {
    return buildContextDecision(row, section, 'Trusted Aftonbladet section path');
  }

  if (source.includes('tv3 lithuania')) {
    return buildContextDecision(row, section, 'Trusted TV3 Lithuania section path');
  }

  if (source.includes('delfi lithuania')) {
    return buildContextDecision(row, section, 'Trusted Delfi Lithuania path/title context');
  }

  if (source === 'n1') {
    return buildContextDecision(row, section, 'Trusted N1 section path');
  }

  if (source.includes('sabah')) {
    return buildContextDecision(row, section, 'Trusted Sabah section path');
  }

  if (source.includes('donga ilbo')) {
    return buildContextDecision(row, section, 'Trusted Donga Ilbo section path');
  }

  if (source.includes('nau.ch')) {
    return buildContextDecision(row, section, 'Trusted Nau.ch section path');
  }

  if (source.includes('n-tv')) {
    return buildContextDecision(row, section, 'Trusted n-tv section path');
  }

  if (source.includes('ekstra bladet')) {
    return buildContextDecision(row, section, 'Trusted Ekstra Bladet section path');
  }

  if (source.includes('india today')) {
    return buildContextDecision(row, section, 'Trusted India Today section path');
  }

  if (source.includes('parapolitika')) {
    return buildContextDecision(row, section, 'Trusted Parapolitika path/title context');
  }

  if (source.includes('european pravda')) {
    return buildContextDecision(row, section, 'Trusted European Pravda title/path');
  }

  if (source.includes('dagens industri')) {
    return buildContextDecision(row, section, 'Trusted Dagens Industri outlet context');
  }

  if (source.includes('olé') || source === 'ole') {
    return buildContextDecision(row, section, 'Trusted Ole sports outlet');
  }

  if (source.includes('kathimerini')) {
    return buildContextDecision(row, section, 'Trusted Kathimerini section path');
  }

  if (source.includes('cna (central news agency)')) {
    return buildContextDecision(row, section, 'Trusted CNA code/title context');
  }

  if (
    source.includes('informer')
    || source.includes('cumhuriyet')
    || source.includes('vecernji list')
    || source.includes('le figaro')
    || source.includes('china news service')
    || source.includes('bnt news')
    || source.includes('15min')
    || source.includes('한국경제')
    || source.includes('hankyung')
    || source.startsWith('cna ')
  ) {
    return buildContextDecision(row, section, 'Trusted source/path/title context');
  }

  if (source.includes('cgtn')) {
    return buildContextDecision(row, section, 'Trusted CGTN title-based section');
  }

  if (source === 'newsbeast') {
    return buildContextDecision(row, section, 'Trusted Newsbeast path/title context');
  }

  if (source.includes('naftemporiki')) {
    return buildContextDecision(row, section, 'Trusted Naftemporiki path/title context');
  }

  if (source.includes('radio sweden')) {
    return buildContextDecision(row, section, 'Trusted Radio Sweden title-based section');
  }

  if (source.includes("l'avenir")) {
    return buildContextDecision(row, section, 'Trusted L’Avenir path/title context');
  }

  if (source.includes('adresseavisen')) {
    return buildContextDecision(row, section, 'Trusted Adresseavisen path/title context');
  }

  if (source.includes('la libre')) {
    return buildContextDecision(row, section, 'Trusted La Libre title-based section');
  }

  if (source.includes('index.hr')) {
    return buildContextDecision(row, section, 'Trusted Index.hr section path');
  }

  if (source.includes('index.hu')) {
    return buildContextDecision(row, section, 'Trusted Index.hu section path');
  }

  if (source.includes('republika')) {
    return buildContextDecision(row, section, 'Trusted Republika host/path/title context');
  }

  if (source.includes('newsit')) {
    return buildContextDecision(row, section, 'Trusted Newsit section path');
  }

  if (source.includes('actu.fr')) {
    return buildContextDecision(row, section, 'Trusted Actu.fr title/path context');
  }

  if (source.includes('mehr news')) {
    return buildContextDecision(row, section, 'Trusted Mehr title/path context');
  }

  if (source.includes('o globo')) {
    return buildContextDecision(row, section, 'Trusted O Globo section path');
  }

  if (source.includes('estadão') || source.includes('estadao')) {
    return buildContextDecision(row, section, 'Trusted Estadão section path');
  }

  if (source.includes('valor econômico') || source.includes('valor economico')) {
    return buildContextDecision(row, section, 'Trusted Valor Econômico section path');
  }

  if (source.includes('polsatnews')) {
    return buildContextDecision(row, section, 'Trusted PolsatNews title/path context');
  }

  if (source.includes('focus')) {
    return buildContextDecision(row, section, 'Trusted Focus section path');
  }

  if (source.includes('bfm tv')) {
    return buildContextDecision(row, section, 'Trusted BFM TV host/path context');
  }

  if (source.includes('cash.ch')) {
    return buildContextDecision(row, section, 'Trusted Cash.ch outlet context');
  }

  if (source.includes('se.pl')) {
    return buildContextDecision(row, section, 'Trusted SE.pl host/path context');
  }

  if (source.includes('diena')) {
    return buildContextDecision(row, section, 'Trusted Diena section path');
  }

  if (source.includes('antara')) {
    return buildContextDecision(row, section, 'Trusted ANTARA title context');
  }

  if (source.includes('folha de s.paulo')) {
    return buildContextDecision(row, section, 'Trusted Folha redirect/title context');
  }

  if (source.includes('clarín') || source.includes('clarin')) {
    return buildContextDecision(row, section, 'Trusted Clarin section/title context');
  }

  if (source.includes('uol notícias')) {
    return buildContextDecision(row, section, 'Trusted UOL source/domain context');
  }

  if (source === 'observador') {
    return buildContextDecision(row, section, 'Trusted Observador path/title context');
  }

  if (source.includes('swissinfo es')) {
    return buildContextDecision(row, section, 'Trusted Swissinfo ES title-based section');
  }

  if (source.includes('kyodo news')) {
    return buildContextDecision(row, section, 'Trusted Kyodo title-based section');
  }

  if (source.includes('el cronista')) {
    return buildContextDecision(row, section, 'Trusted El Cronista section path');
  }

  if (source === 'bt') {
    return buildContextDecision(row, section, 'Trusted BT section path');
  }

  if (source.includes('el heraldo de mexico')) {
    return buildContextDecision(row, section, 'Trusted El Heraldo section path');
  }

  if (source.includes('la vanguardia')) {
    return buildContextDecision(row, section, 'Trusted La Vanguardia section path');
  }

  if (source === 'tn') {
    return buildContextDecision(row, section, 'Trusted TN section path');
  }

  if (source.includes('sözcü') || source.includes('sozcu')) {
    return buildContextDecision(row, section, 'Trusted Sozcu title-based section');
  }

  if (source.includes('stiripesurse')) {
    return buildContextDecision(row, section, 'Trusted Stiripesurse title-based section');
  }

  if (source === 'mediafax') {
    return buildContextDecision(row, section, 'Trusted Mediafax path/title context');
  }

  if (source.includes('aju news')) {
    return buildContextDecision(row, section, 'Trusted Aju News title-based section');
  }

  if (source.includes('yonhap (en)')) {
    return buildContextDecision(row, section, 'Trusted Yonhap EN title-based section');
  }

  if (source.includes('mirror media - externals') || source.includes('mirror media - posts')) {
    return buildContextDecision(row, section, 'Trusted Mirror Media title-based section');
  }

  if (source.includes('rainews')) {
    return buildContextDecision(row, section, 'Trusted RaiNews section path');
  }

  if (source.includes('ntv')) {
    return buildContextDecision(row, section, 'Trusted NTV route');
  }

  if (source.includes('yomiuri')) {
    return buildContextDecision(row, section, 'Trusted Yomiuri route');
  }

  if (source.includes('tass')) {
    return buildContextDecision(row, section, 'Trusted TASS section path');
  }

  return null;
}

function shouldFetchArticlePage(row: CandidateRow): boolean {
  const source = normalizeSource(row.source);
  if (source.includes('people.cn')) return true;
  if (source.includes('kbs news')) return true;
  if (source.includes('yahoo taiwan')) return true;
  if (source.includes('newsis')) return true;
  if (source.includes('infobae')) return true;
  if (source.includes('el cronista')) return true;
  if (source.includes('le télégramme')) return true;
  if (source.includes('kronen zeitung')) return true;
  if (source.includes('조선닷컴')) return true;
  if (source.includes('ettoday')) return true;
  if (source.includes('setn')) return true;
  if (source.includes('liberty times')) return true;
  if (source.includes('hk01')) return true;
  if (source.includes('nownews')) return true;
  if (source.includes('sankei')) return true;
  if (source.includes('pptvhd36')) return true;
  return false;
}

function buildContextDecision(row: CandidateRow, section: NewsSection, reason: string): BackfillDecision {
  return {
    externalId: row.external_id,
    source: row.source,
    section,
    reason,
    evidence: 'context',
  };
}

async function fetchArticleHtml(url: string): Promise<string | null> {
  try {
    const response = await fetchWithRetry(url, {
      timeoutMs: 12_000,
      attempts: 2,
      fetchOptions: {
        headers: {
          'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'accept-language': 'en-US,en;q=0.9',
          'user-agent': USER_AGENT,
        },
      },
    });
    if (!response.ok) return null;
    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    if (contentType && !contentType.includes('html') && !contentType.includes('xml')) return null;
    return (await readResponseText(response, response.url || url)).text;
  } catch {
    return null;
  }
}

async function resolveDecision(row: CandidateRow): Promise<BackfillDecision | null> {
  const url = decodeHtmlEntities(row.url || '');
  if (!url || isKnownNonArticleUrl(row.source || '', url)) return null;

  const trustedContext = resolveTrustedContextSection({ ...row, url });
  if (trustedContext) return trustedContext;

  if (!shouldFetchArticlePage({ ...row, url })) return null;

  const html = await fetchArticleHtml(url);
  if (!html) return null;

  const title = normalizeReadableArticleTitle(row.title_original || '', url, row.source || '');
  const derived = deriveSectionFromArticlePage({
    source: row.source,
    url,
    title,
    html,
  });
  if (derived.section === 'others') return null;

  return {
    externalId: row.external_id,
    source: row.source,
    section: derived.section,
    reason: derived.reason,
    evidence: derived.source,
  };
}

async function readCandidates(client: Client, args: CliArgs): Promise<CandidateRow[]> {
  const values: unknown[] = [args.days];
  const where: string[] = [
    `coalesce(section, 'others') = 'others'`,
    `publication_datetime >= now() - ($1::int * interval '1 day')`,
  ];

  if (args.sources.length > 0) {
    values.push(args.sources);
    where.push(`source = any($${values.length}::text[])`);
  }

  let limitSql = '';
  if (args.limit) {
    values.push(args.limit);
    limitSql = `limit $${values.length}`;
  }

  const result = await client.query<CandidateRow>(
    `
    select
      external_id,
      source,
      title_original,
      url,
      publication_datetime::text
    from news_articles
    where ${where.join('\n      and ')}
    order by publication_datetime desc, created_at desc
    ${limitSql}
    `,
    values,
  );

  return result.rows;
}

async function applyUpdates(client: Client, updates: BackfillDecision[]): Promise<number> {
  if (!updates.length) return 0;
  let updated = 0;
  for (let index = 0; index < updates.length; index += 250) {
    const chunk = updates.slice(index, index + 250);
    const values: unknown[] = [];
    const tuples: string[] = [];
    chunk.forEach((item, chunkIndex) => {
      const base = chunkIndex * 2;
      tuples.push(`($${base + 1}::text, $${base + 2}::text)`);
      values.push(item.externalId, item.section);
    });
    const result = await client.query(
      `
      update news_articles as n
      set
        section = data.section,
        updated_at = now()
      from (
        values ${tuples.join(',')}
      ) as data(external_id, section)
      where n.external_id = data.external_id
        and coalesce(n.section, 'others') = 'others'
        and data.section <> 'others'
      `,
      values,
    );
    updated += result.rowCount || 0;
  }
  return updated;
}

function summarizeDecisions(decisions: BackfillDecision[]): void {
  const byEvidence = new Map<string, number>();
  const bySection = new Map<string, number>();
  const bySource = new Map<string, number>();

  for (const decision of decisions) {
    byEvidence.set(decision.evidence, (byEvidence.get(decision.evidence) || 0) + 1);
    bySection.set(decision.section, (bySection.get(decision.section) || 0) + 1);
    bySource.set(decision.source, (bySource.get(decision.source) || 0) + 1);
  }

  console.log(`Resolved rows: ${decisions.length}`);
  console.log('By evidence:');
  for (const [key, count] of [...byEvidence.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  - ${key}: ${count}`);
  }

  console.log('By section:');
  for (const [key, count] of [...bySection.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  - ${key}: ${count}`);
  }

  console.log('Top sources:');
  for (const [key, count] of [...bySource.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
    console.log(`  - ${key}: ${count}`);
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const client = new Client({ connectionString: resolveDatabaseUrl() });
  await client.connect();

  try {
    const startedAt = Date.now();
    const candidates = await readCandidates(client, args);
    console.log(`Window: last ${args.days} day(s)`);
    console.log(`Candidates: ${candidates.length}`);
    console.log(`Apply mode: ${args.apply ? 'yes' : 'no'}`);
    console.log(`Concurrency: ${args.concurrency}`);
    if (args.sources.length > 0) {
      console.log(`Sources: ${args.sources.join(', ')}`);
    }

    let processed = 0;
    const decisions = (await runWithConcurrency(candidates, args.concurrency, async (row) => {
      const decision = await resolveDecision(row);
      processed += 1;
      if (processed % 500 === 0 || processed === candidates.length) {
        console.log(`Processed ${processed}/${candidates.length}`);
      }
      return decision;
    })).filter((item): item is BackfillDecision => Boolean(item));

    summarizeDecisions(decisions);

    if (!args.apply) {
      console.log('Dry-run mode: no rows updated.');
      return;
    }

    const updated = await applyUpdates(client, decisions);
    console.log(`Updated rows: ${updated}`);
    console.log(`Elapsed: ${Math.round((Date.now() - startedAt) / 1000)}s`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
