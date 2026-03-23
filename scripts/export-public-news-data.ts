#!/usr/bin/env bun
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { Pool } from 'pg';
import {
  PUBLIC_DATA_SCHEMA_VERSION,
  PUBLIC_DATA_SECTIONS,
  type PublicCountryFeedFile,
  type PublicCountryMonthShard,
  type PublicDashboardPreview,
  type PublicDataManifest,
  type PublicDateShard,
  type PublicIntegrationManifest,
  type PublicNewsArticle,
  type PublicSourceHealth,
  type PublicSourceRecord,
  type PublicSourcesFile,
} from '@/lib/public-data';
import { resolveDatabaseUrl } from '@/lib/database-url';
import {
  decodeHtmlEntities,
  looksLikeLowSignalArticleTitle,
  normalizeArticleTitle,
  normalizeHtmlText,
  normalizeReadableArticleTitle,
} from '@/lib/html-entities';
import { buildArticleTaxonomy } from '@/lib/article-taxonomy';
import { deriveSectionFromContext } from '@/lib/article-section-context';
import { isKnownNonArticleUrl } from '@/lib/article-url-filters';
import { classifySectionByKeyword } from '@/lib/keyword-classifier';
import type { NewsSection } from '@/lib/types';

type AtlasFeed = {
  name: string;
  url: string | null;
  sitemapUrl?: string | null;
};

type AtlasCountry = {
  name: string;
  code: string;
  feeds: AtlasFeed[];
};

type Atlas = {
  countries: AtlasCountry[];
};

type ArticleRow = {
  id: string;
  source: string;
  country: string | null;
  language: string | null;
  section: string | null;
  feed_categories: string[] | null;
  title: string;
  snippet: string | null;
  url: string;
  publication_datetime: string;
  created_at: string;
};

type HealthRow = {
  source: string;
  country: string | null;
  ran_at: string;
  method: string;
  attempted: boolean;
  ok: boolean;
  status_code: number | null;
  health_classification: string | null;
  error: string | null;
  requested_url: string | null;
  final_url: string | null;
};

type ExportStatsRow = {
  raw_rows_in_window: string;
  raw_latest_24h_inserted: string;
  raw_latest_24h_published: string;
  checked_sources_24h: string;
};

type ExportStats = {
  rawRowsInWindow: number;
  rawLatest24hInserted: number;
  rawLatest24hPublished: number;
  checkedSources24h: number;
  rowLimitHit: boolean;
};

type CountryDirectory = {
  countryCodeByName: Map<string, string>;
  countryNameByCode: Map<string, string>;
};

const DATABASE_URL = resolveDatabaseUrl();
const ATLAS_PATH = process.env.ATLAS_PATH || resolve(process.cwd(), 'data/rss-atlas.json');
const OUTPUT_DIR = resolve(process.cwd(), process.env.PUBLIC_EXPORT_DIR || 'exports/public-data');
const EXPORT_DAYS = clampInt(process.env.PUBLIC_EXPORT_DAYS, 1, 90, 14);
const LATEST_HOURS = clampInt(process.env.PUBLIC_EXPORT_LATEST_HOURS, 1, 72, 24);
const MAX_ROWS = clampInt(process.env.PUBLIC_EXPORT_MAX_ROWS, 100, 250000, 50000);
const PUBLIC_EXPORT_TIMEZONE = (process.env.PUBLIC_EXPORT_TIMEZONE || process.env.INGEST_TZ || 'America/Chicago').trim();
const PUBLIC_EXPORT_SCHEDULE_MINUTE = clampInt(process.env.PUBLIC_EXPORT_SCHEDULE_MINUTE, 0, 59, 40);
const WRITE_LATEST_24H_CSV = parseBool(process.env.PUBLIC_EXPORT_WRITE_LATEST_24H_CSV, true);
const WRITE_BY_DATE_CSV = parseBool(process.env.PUBLIC_EXPORT_WRITE_BY_DATE_CSV, false);
const WRITE_BY_COUNTRY_MONTH_CSV = parseBool(process.env.PUBLIC_EXPORT_WRITE_BY_COUNTRY_MONTH_CSV, false);
const FALLBACK_COUNTRY_CODE = 'GLOBAL';
const MAX_FUTURE_PUBLICATION_HOURS = clampInt(process.env.PUBLIC_EXPORT_MAX_FUTURE_HOURS, 1, 168, 6);
const SECTION_HINT_TERMS: ReadonlyArray<readonly [NewsSection, readonly string[]]> = [
  ['politics', ['politics', 'politic', 'politica', 'politik', 'politiek', 'politiikka', 'politika', 'opinion', 'election', 'elections', 'government', 'parliament', 'policy', 'president', 'presidency', 'cabinet', 'minister', 'renshi', 'polityka', 'politika ir politika', 'nuomones']],
  ['conflicts', ['conflict', 'conflicts', 'war', 'wars', 'ceasefire', 'truce', 'airstrike', 'airstrikes', 'missile', 'missiles', 'military', 'troops', 'invasion', 'drone', 'drones', 'shelling', 'rocket', 'rockets', 'gaza', 'hamas', 'hezbollah', 'hormuz', 'guerra', 'guerre', 'conflitto', 'conflit', 'krieg', 'savaş', 'savas', 'สงคราม', '전쟁', '분쟁', '충돌', '戦争', '紛争', '战争', '戰爭', '冲突', '衝突', 'война', 'конфликт']],
  ['business', ['business', 'economy', 'economia', 'economic', 'economico', 'economica', 'finance', 'finanza', 'finanzas', 'market', 'markets', 'mercado', 'mercados', 'negocios', 'money', 'borsa', 'wirtschaft', 'ekonomi', 'talous', 'ekonomika', 'porssi', 'omaraha', 'finans', 'verslas', 'wealth', 'monetary', 'trick trend', 'tyoelama']],
  ['tech', ['tech', 'technology', 'tecnologia', 'digital', 'gadget', 'gadgets', 'startup', 'software', 'cyber', 'ai', 'teknologia', 'digitoday', 'tiedejateknologia', 'technet', 'zive', 'bitti', 'it', 'ไอที']],
  ['sports', ['sport', 'sports', 'deporte', 'deportes', 'football', 'soccer', 'basketball', 'baseball', 'tennis', 'futbol', 'voetbal', 'hockey', 'golf', 'wbc', 'olympic', 'resultcenter', 'matchcenter', 'urheilu', 'jalkapallo', 'jaakiekko', 'liiga', 'nhl', 'fotbal', 'hokej', 'sumo', 'desporto', 'sportas', 'กีฬา', 'gamble', 'battle']],
  ['health', ['health', 'salud', 'salute', 'medical', 'medicine', 'medicina', 'hospital', 'wellness', 'sanidad', 'terveys', 'zdravi', 'saude', 'sveikata']],
  ['entertainment', ['entertainment', 'showbiz', 'celebrity', 'celebrities', 'music', 'film', 'cinema', 'television', 'fama', 'magazin', 'leute', 'viihde', 'koktejl', 'musiikki', 'elokuvat', 'tvshow', 'kpop', 'espectaculos', 'spettacoli', 'zabava', 'veidai', '芸能', '연예', '娛樂', '娱乐', 'บันเทิง']],
  ['lifestyle', ['lifestyle', 'fashion', 'style', 'travel', 'food', 'recipe', 'recipes', 'ravintolat', 'laisvalaikis', 'wellbeing', 'well being', 'gourmet', 'grub', 'restaurant', 'restaurants', 'moda', 'viaje', 'viagem', 'reisen', 'seyahat', '旅遊', '旅游', '旅行', '여행', 'แฟชั่น', 'ท่องเที่ยว']],
  ['arts', ['arts', 'culture', 'cultura', 'kulttuuri', 'kultura', 'artist', 'artists', 'museum', 'exhibition', 'theatre', 'theater', 'opera', 'literature', 'books', 'book', 'arte', 'kunst', 'искусство', '문화', '藝術', '艺术']],
  ['science', ['science', 'ciencia', 'scienza', 'research', 'space', 'astronomy', 'laboratory', 'tiede']],
  ['climate', ['climate', 'weather', 'meteo', 'environment', 'ambiente', 'sustainability', 'green', 'clima', 'orai']],
  ['world', ['world', 'international', 'abroad', 'foreign', 'mundo', 'monde', 'welt', 'estero', 'esteri', 'global', 'society', 'national', 'local', 'city', 'regional', 'regionales', 'regionals', 'pais', 'ausland', 'turkiye', 'kotimaa', 'ulkomaat', 'maailma', 'schweizundwelt', 'domaci', 'zahranicni', 'domestic', 'pasaulis', 'lietuva', 'kaunas', 'vilnius', 'klaipeda', 'kriminalai', 'miesto pulsas', 'salies pulsas', 'ต่างประเทศ', 'สังคม', 'crime']],
];
const SECTION_HINT_PATTERNS: ReadonlyArray<readonly [NewsSection, readonly RegExp[]]> = SECTION_HINT_TERMS.map(
  ([section, terms]) => [section, terms.map((term) => buildHintRegex(term))] as const
);
const GENERIC_HINT_NOISE_PATTERNS: ReadonlyArray<RegExp> = [
  /\bart[- ]\d+(?:\.html)?\b/giu,
  /\bc\d+\s+\d+(?:\.html)?\b/giu,
  /\b\d{6,}\b/gu,
];
const CONFLICT_SIGNAL_PATTERN =
  /war|wars|conflict|ceasefire|truce|airstrike|airstrikes|missile|missiles|military|troops|invasion|drone|drones|shelling|rocket|rockets|gaza|hamas|hezbollah|hormuz|guerre|guerra|conflit|conflitto|krieg|savaş|savas|สงคราม|전쟁|분쟁|충돌|戦争|紛争|战争|戰爭|冲突|衝突|война|конфликт|перемир|ракет|удар/iu;
const SOURCE_FALLBACKS: ReadonlyArray<{ pattern: RegExp; section: NewsSection }> = [
  { pattern: /people\.cn/i, section: 'world' },
  { pattern: /yahoo taiwan/i, section: 'world' },
  { pattern: /bbc news - sitemap index/i, section: 'world' },
  { pattern: /abema times/i, section: 'world' },
  { pattern: /^ansa\b|ansa - sitemap index/i, section: 'world' },
  { pattern: /augsburger allgemeine|die zeit|rainews|hk01|sankei|kronen zeitung|merkur|blic|lenta|yonhap|infobae|milenio|marica|topky|the standard - news sitemap|daily mail/i, section: 'world' },
  { pattern: /oricon/i, section: 'entertainment' },
  { pattern: /ettoday|mirror media|setn|nownews|tv3 lithuania|ukrainska pravda|ria novosti|tass/i, section: 'world' },
];

async function main(): Promise<void> {
  const atlas = loadAtlas();
  const countryDirectory = buildCountryDirectory(atlas);
  const pool = new Pool({ connectionString: DATABASE_URL });

  try {
    await ensureExportSchema(pool);
    const exportStats = await readExportStats(pool);
    const articles = await readArticles(pool, countryDirectory);
    const health = await readLatestHealth(pool);
    const sources = buildSourcesFile(atlas, health, countryDirectory);

    resetOutputDir(OUTPUT_DIR);
    writeDataFiles(articles, sources, countryDirectory, exportStats);

    console.log(
      `[export-public-news-data] exported ${articles.length} articles, ${sources.sources.length} sources from ${exportStats.rawRowsInWindow} raw rows to ${OUTPUT_DIR}`
    );
  } finally {
    await pool.end();
  }
}

async function ensureExportSchema(pool: Pool): Promise<void> {
  await pool.query(`
    alter table news_articles
      add column if not exists feed_categories text[] not null default '{}'
  `);
}

function clampInt(raw: string | undefined, min: number, max: number, fallback: number): number {
  const parsed = Number.parseInt(raw || '', 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function parseBool(raw: string | undefined, fallback: boolean): boolean {
  if (raw == null) return fallback;
  const normalized = raw.trim().toLowerCase();
  if (!normalized) return fallback;
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;
  return fallback;
}

function loadAtlas(): Atlas {
  const raw = readFileSync(ATLAS_PATH, 'utf8');
  const atlas = JSON.parse(raw) as Atlas;
  if (!Array.isArray(atlas.countries)) {
    throw new Error(`Invalid atlas format in ${ATLAS_PATH}`);
  }
  return atlas;
}

function buildCountryDirectory(atlas: Atlas): CountryDirectory {
  const countryCodeByName = new Map<string, string>();
  const countryNameByCode = new Map<string, string>();

  for (const country of atlas.countries) {
    if (!country.name || !country.code) continue;
    countryCodeByName.set(country.name.trim(), country.code.trim().toUpperCase());
    countryNameByCode.set(country.code.trim().toUpperCase(), country.name.trim());
  }

  countryCodeByName.set('Global', FALLBACK_COUNTRY_CODE);
  countryNameByCode.set(FALLBACK_COUNTRY_CODE, 'Global');

  return { countryCodeByName, countryNameByCode };
}

async function readExportStats(pool: Pool): Promise<ExportStats> {
  const result = await pool.query<ExportStatsRow>(
    `
    select
      count(*)::text as raw_rows_in_window,
      count(*) filter (where created_at >= now() - ($2::int * interval '1 hour'))::text as raw_latest_24h_inserted,
      count(*) filter (where publication_datetime >= now() - ($2::int * interval '1 hour'))::text as raw_latest_24h_published,
      (
        select count(distinct coalesce(country, 'Global') || '|' || source)::text
        from rss_health_status
        where ran_at >= now() - ($2::int * interval '1 hour')
          and runner = 'worker'
          and attempted
      ) as checked_sources_24h
    from news_articles
    where publication_datetime >= now() - ($1::int * interval '1 day')
    `,
    [EXPORT_DAYS, LATEST_HOURS]
  );

  const row = result.rows[0];
  const rawRowsInWindow = Number.parseInt(row?.raw_rows_in_window || '0', 10);
  const rawLatest24hInserted = Number.parseInt(row?.raw_latest_24h_inserted || '0', 10);
  const rawLatest24hPublished = Number.parseInt(row?.raw_latest_24h_published || '0', 10);
  const checkedSources24h = Number.parseInt(row?.checked_sources_24h || '0', 10);

  return {
    rawRowsInWindow,
    rawLatest24hInserted,
    rawLatest24hPublished,
    checkedSources24h,
    rowLimitHit: rawRowsInWindow > MAX_ROWS,
  };
}

async function readArticles(pool: Pool, directory: CountryDirectory): Promise<PublicNewsArticle[]> {
  const result = await pool.query<ArticleRow>(
    `
    select
      external_id as id,
      source,
      country,
      language,
      section,
      feed_categories,
      title_original as title,
      snippet_original as snippet,
      url,
      publication_datetime,
      created_at
    from news_articles
    where publication_datetime >= now() - ($1::int * interval '1 day')
    order by publication_datetime desc, created_at desc
    limit $2
    `,
    [EXPORT_DAYS, MAX_ROWS]
  );

  return result.rows.flatMap((row) => {
    const snippet = normalizeHtmlText(row.snippet || '');
    const url = decodeHtmlEntities(row.url || '');
    if (isKnownNonArticleUrl(row.source || '', url)) {
      return [];
    }
    const title = normalizeReadableArticleTitle(row.title || '', url, row.source || '');
    if (!title || looksLikeLowSignalArticleTitle(title, row.source || '', url)) {
      return [];
    }
    const countryName = normalizeCountryName(row.country);
    const countryCode = directory.countryCodeByName.get(countryName) || FALLBACK_COUNTRY_CODE;
    const publicationDatetime = normalizePublicationDatetime(row.publication_datetime, row.created_at);
    const taxonomy = buildArticleTaxonomy({
      storedSection: row.section,
      sourceCategories: row.feed_categories,
      source: row.source,
      url,
      title,
      snippet,
    });
    return [{
      id: row.id,
      source: row.source,
      country: countryName,
      countryCode,
      language: (row.language || '').trim() || 'und',
      primarySection: taxonomy.primarySection,
      sections: taxonomy.sections,
      sourceCategories: taxonomy.sourceCategories,
      title,
      snippet,
      keywordText: buildKeywordText([
        title,
        snippet,
        row.source,
        countryName,
        countryCode,
        taxonomy.primarySection,
        taxonomy.sections.join(' '),
        taxonomy.sourceCategories.join(' '),
      ]),
      url,
      publicationDatetime,
      createdAt: new Date(row.created_at).toISOString(),
    } satisfies PublicNewsArticle];
  });
}

function classifySectionBySourceFallback(row: ArticleRow): NewsSection {
  const hintText = buildArticleHintText(row.source, row.url);
  const source = (row.source || '').toLowerCase();
  const title = (row.title || '').toLowerCase();
  const url = (row.url || '').toLowerCase();
  const { hostname, pathname, search } = parseArticleUrl(row.url);

  if (looksLikeConflictSignal(`${row.title} ${hintText}`)) {
    return 'conflicts';
  }

  const pathSection = classifySectionByPath(pathname, hintText);
  if (pathSection !== 'others') {
    return pathSection;
  }

  if (source.includes('people.cn')) {
    if (/finance|money|capital/.test(hintText)) return 'business';
    if (/health/.test(hintText)) return 'health';
    if (/entertainment/.test(hintText)) return 'entertainment';
    if (/culture/.test(hintText)) return 'arts';
    return 'world';
  }

  if (source.includes('abema times')) {
    if (url.includes('/sumo/')) return 'sports';
    if (/culture/.test(hintText)) return 'arts';
    if (/entertainment|drama|music/.test(hintText)) return 'entertainment';
    return 'world';
  }

  if (source.includes('sponichi')) {
    if (/entertainment/.test(hintText)) return 'entertainment';
    if (/baseball|soccer|football|golf|tennis|gamble|battle|car/.test(hintText)) return 'sports';
    return 'sports';
  }

  if (source.includes('bote der urschweiz')) {
    if (/ sport /.test(` ${hintText} `)) return 'sports';
    if (/kultur|kulturpreis|krimi|thriller/.test(hintText)) return 'arts';
    if (/ravintolat|restaurant|lifestyle/.test(hintText)) return 'lifestyle';
    return 'world';
  }

  if (source.includes('a bola')) {
    if (/oscar|cinema|filme|musica|celebridade/.test(hintText)) return 'entertainment';
    return 'sports';
  }

  if (source.includes('aamulehti')) {
    if (/musiikki|elokuvat/.test(hintText)) return 'entertainment';
    if (/ravintolat/.test(hintText)) return 'lifestyle';
    if (/ristikko|kulttuuri/.test(hintText)) return 'arts';
    if (/tyoelama|talous|omaraha/.test(hintText)) return 'business';
    if (/jalkapallo|liiga|nhl|urheilu/.test(hintText)) return 'sports';
    if (/tiedejateknologia|digitoday|teknologia/.test(hintText)) return 'tech';
    if (/terveys/.test(hintText)) return 'health';
    if (/kolumnit|paakirjoitukset|politiikka/.test(hintText)) return 'politics';
    return 'world';
  }

  if (source.includes('noticias ao minuto')) {
    if (/economia/.test(hintText)) return 'business';
    if (/(^| )auto( |$)/.test(` ${hintText} `)) return 'business';
    if (/tech/.test(hintText)) return 'tech';
    if (/politica/.test(hintText)) return 'politics';
    if (/desporto/.test(hintText)) return 'sports';
    if (/saude/.test(hintText)) return 'health';
    if (/ciencia/.test(hintText)) return 'science';
    if (/ambiente/.test(hintText)) return 'climate';
    if (/lifestyle/.test(hintText)) return 'lifestyle';
    if (/fama/.test(hintText)) return 'entertainment';
    if (/cultura/.test(hintText)) return 'arts';
    if (/mundo|pais/.test(hintText)) return 'world';
    return 'world';
  }

  if (source.includes('el periódico')) {
    if (/\/deportes\//.test(pathname)) return 'sports';
    if (/\/economia\//.test(pathname)) return 'business';
    if (/\/politica\//.test(pathname)) return 'politics';
    if (/\/salud\//.test(pathname)) return 'health';
    if (/\/tecnologia\//.test(pathname)) return 'tech';
    if (/\/ocio-y-cultura\//.test(pathname) || /\/videos\/ocio-y-cultura\//.test(pathname)) return 'entertainment';
    return 'world';
  }

  if (source.includes('milenio')) {
    if (/\/deportes\//.test(pathname)) return 'sports';
    if (/\/negocios\//.test(pathname)) return 'business';
    if (/\/politica\//.test(pathname)) return 'politics';
    if (/\/salud\//.test(pathname)) return 'health';
    if (/\/tecnologia\//.test(pathname)) return 'tech';
    if (/\/cultura\//.test(pathname)) return 'arts';
    if (/\/espectaculos\//.test(pathname) || /\/cine\//.test(pathname)) return 'entertainment';
    return 'world';
  }

  if (source.includes('pptvhd36')) {
    if (/\/sport\/|ucl|bundesliga|พรีเมียร์ลีก|กีฬา/.test(hintText)) return 'sports';
    if (/wealth|monetary|trick trend/.test(hintText)) return 'business';
    if (/ไอที/.test(hintText)) return 'tech';
    if (/health|care/.test(hintText)) return 'health';
    if (/ข่าวบันเทิง|วาไรตี้/.test(hintText)) return 'entertainment';
    if (/ไลฟ์สไตล์/.test(hintText)) return 'lifestyle';
    if (/ต่างประเทศ|สังคม|อาชญากรรม|ข่าวในพระราชสำนัก|รายการข่าว|travel|tags/.test(hintText)) return 'world';
    return 'world';
  }

  if (source.includes('times of india')) {
    if (/\/sports\//.test(pathname)) return 'sports';
    if (/\/business\//.test(pathname)) return 'business';
    if (/\/technology\//.test(pathname)) return 'tech';
    if (/\/health\//.test(pathname)) return 'health';
    if (/\/entertainment\//.test(pathname)) return 'entertainment';
    if (/\/lifestyle\//.test(pathname)) return 'lifestyle';
    return 'world';
  }

  if (source.includes('taipei times')) {
    if (/\/news\/front\//.test(pathname) || /\/news\/taiwan\//.test(pathname)) return 'world';
    if (/\/news\/biz\//.test(pathname)) return 'business';
    if (/\/news\/sport\//.test(pathname)) return 'sports';
    if (/\/news\/feat\//.test(pathname)) return 'entertainment';
    if (/breast cancer|hospital|health|disease/.test(title)) return 'health';
    return 'world';
  }

  if (source.includes('g1 globo')) {
    if (/\/esporte\//.test(pathname)) return 'sports';
    if (/\/economia\//.test(pathname)) return 'business';
    if (/\/politica\//.test(pathname)) return 'politics';
    if (/\/tecnologia\//.test(pathname)) return 'tech';
    if (/\/bemestar\//.test(pathname)) return 'health';
    if (/\/meio-ambiente\//.test(pathname)) return 'climate';
    if (/\/pop-arte\//.test(pathname)) return 'entertainment';
    return 'world';
  }

  if (source.includes('jiji press')) {
    if (/g=prt/.test(url) || /[\?&]g=prt\b/.test(search)) {
      if (/映画|音楽|芸能|アカデミー/.test(title)) return 'entertainment';
      if (/講師|クリエイティブ|文化/.test(title)) return 'arts';
      return 'business';
    }
    if (/株|市場|金融|経済|投資|物価/.test(title)) return 'business';
    if (/選挙|首相|政権|国会/.test(title)) return 'politics';
    if (/野球|サッカー|相撲|五輪/.test(title)) return 'sports';
    return 'world';
  }

  if (source.includes('tvbs')) {
    if (/\/entertainment\//.test(pathname)) return 'entertainment';
    if (/\/sports\//.test(pathname)) return 'sports';
    if (/\/health\//.test(pathname)) return 'health';
    if (/\/tech\//.test(pathname)) return 'tech';
    if (/\/politics\//.test(pathname)) return 'politics';
    if (/\/money\//.test(pathname)) return 'business';
    return 'world';
  }

  if (source.includes('newsis')) {
    if (/주요일정/.test(title)) return 'politics';
    if (/전시/.test(title)) return 'arts';
    if (/연예|배우|가수|영화|드라마|공연|앨범|오스카|칸|뮤지컬/.test(title)) return 'entertainment';
    if (/야구|축구|농구|배구|골프|올림픽|kbo|k리그|ucl/.test(title)) return 'sports';
    if (/증시|주식|금융|부동산|기업|경제|환율|코스피|실적|산업/.test(title)) return 'business';
    if (/ai|인공지능|반도체|테크|기술|과학기술|사이버/.test(title)) return 'tech';
    if (/의료|병원|건강|질병|환자|백신|코로나/.test(title)) return 'health';
    if (/기후|산불|폭우|홍수|폭염|태풍/.test(title)) return 'climate';
    if (/과학|연구|우주|천문|실험/.test(title)) return 'science';
    if (/정부|국회|대통령|총리|장관|법원|검찰|외교|국방/.test(title)) return 'politics';
    return 'world';
  }

  if (source.includes('observador')) {
    if (/\/desporto\//.test(pathname)) return 'sports';
    if (/\/economia\//.test(pathname)) return 'business';
    if (/\/politica\//.test(pathname)) return 'politics';
    if (/\/cultura\//.test(pathname)) return 'arts';
    if (/\/lifestyle\//.test(pathname)) return 'lifestyle';
    if (/\/saude\//.test(pathname)) return 'health';
    return 'world';
  }

  if (source.includes('youth daily news') || source.includes('thai pbs') || source.includes('el país - últimas')) {
    return 'world';
  }

  if (source.includes('se.pl')) {
    if (hostname.startsWith('superseriale.')) return 'entertainment';
    if (/\/sport\//.test(pathname)) return 'sports';
    if (/\/biznes\//.test(pathname)) return 'business';
    if (/\/zdrowie\//.test(pathname)) return 'health';
    if (/\/wiadomosci\/exclusive\//.test(pathname)) return 'entertainment';
    return 'world';
  }

  if (source.includes('mtv uutiset')) {
    if (/maalikooste|haastattelu|jokerit|ipk|ketterä|kettera|k-vantaa|maali/.test(title)) return 'sports';
    if (/öljy|perintövero|perintovero|frb|trump|iran|euroop/.test(title)) return 'world';
    if (/\/videot\//.test(pathname)) return 'world';
    return 'world';
  }

  if (source.includes('kurir')) {
    if (/\/stars\/|\/zabava\//.test(pathname)) return 'entertainment';
    if (/\/sport\//.test(pathname)) return 'sports';
    if (/\/ekonomija\//.test(pathname)) return 'business';
    if (/\/zdravlje\//.test(pathname)) return 'health';
    return 'world';
  }

  if (source.includes('15min')) {
    if (/\/sportas\//.test(pathname)) return 'sports';
    if (/\/verslas\//.test(pathname)) return 'business';
    if (/\/gyvenimas\//.test(pathname)) return 'lifestyle';
    if (/\/mokslasit\//.test(pathname)) return 'science';
    return 'world';
  }

  if (source.includes('delfi lithuania')) {
    if (/\/krepsinis\/|\/sportas\//.test(pathname)) return 'sports';
    if (/\/verslo-poziuris\/|\/verslas\//.test(pathname)) return 'business';
    if (/\/veidai\//.test(pathname)) return 'entertainment';
    if (/\/seima\//.test(pathname)) return 'lifestyle';
    if (/\/kultura\//.test(pathname)) return 'arts';
    if (/\/sveikata\//.test(pathname)) return 'health';
    if (/\/mokslas\//.test(pathname)) return 'science';
    return 'world';
  }

  if (source.includes('novosti')) {
    if (/\/scena\//.test(pathname)) return 'entertainment';
    if (/\/sport\//.test(pathname)) return 'sports';
    if (/\/ekonomija\//.test(pathname)) return 'business';
    if (/\/zdravlje\//.test(pathname)) return 'health';
    return 'world';
  }

  if (source.includes('24 chasa')) {
    if (/\/sport\//.test(pathname)) return 'sports';
    if (/\/biznes\//.test(pathname)) return 'business';
    if (/\/zdrave\//.test(pathname)) return 'health';
    if (/\/ozhivlenie\//.test(pathname)) return 'entertainment';
    return 'world';
  }

  if (source.includes('gandul')) {
    if (/\/financiar\//.test(pathname)) return 'business';
    if (/\/sanatate\//.test(pathname)) return 'health';
    if (/\/sport\//.test(pathname)) return 'sports';
    if (/\/monden\//.test(pathname)) return 'entertainment';
    if (/\/cultura\//.test(pathname)) return 'arts';
    return 'world';
  }

  if (source.includes('aftonbladet') || source.includes('radio sweden') || source.includes('rtl nieuws') || source.includes('european pravda')) {
    return 'world';
  }

  if (source.includes('diena')) {
    if (/naujienos\/sportas/.test(url)) return 'sports';
    if (/naujienos\/verslas/.test(url)) return 'business';
    if (/naujienos\/sveikata/.test(url)) return 'health';
    if (/naujienos\/laisvalaikis ir kultura|naujienos\/laisvalaikis-ir-kultura/.test(hintText)) return 'arts';
    if (/naujienos\/(pasaulis|lietuva|kaunas|klaipeda|vilnius|kita|kriminalai|ivairenybes)/.test(url)) return 'world';
    return 'world';
  }

  if (source.includes('nrc - sitemap index')) {
    if (/sudoku|kamagurka|fokke sukke|cijferblok|vorto|in het midden/.test(hintText)) return 'arts';
    return 'world';
  }

  if (source.includes('the standard - news sitemap')) {
    if (/video/.test(hintText)) return 'world';
  }

  if (source.includes('mtv uutiset')) {
    if (/urheilu|nhl|liiga/.test(hintText)) return 'sports';
    if (/talous|porssi|omaraha/.test(hintText)) return 'business';
    if (/viihde|musiikki|elokuvat/.test(hintText)) return 'entertainment';
    if (/hyvinvointi|terveys/.test(hintText)) return 'health';
    if (/teknologia|digitoday/.test(hintText)) return 'tech';
    return 'world';
  }

  if (source.includes('g1 globo')) {
    if (/economia/.test(hintText)) return 'business';
    if (/tecnologia|inovacao/.test(hintText)) return 'tech';
    if (/esportes/.test(hintText)) return 'sports';
    if (/saude|bem estar/.test(hintText)) return 'health';
    if (/pop arte|musica|filmes|celebridades/.test(hintText)) return 'entertainment';
    if (/politica/.test(hintText)) return 'politics';
    return 'world';
  }

  if (source === 'kurir') {
    if (/sport/.test(hintText)) return 'sports';
    if (/biznis/.test(hintText)) return 'business';
    if (/zabava|stars/.test(hintText)) return 'entertainment';
    if (/zdravlje/.test(hintText)) return 'health';
    if (/vesti\/politika/.test(url) || /politika/.test(hintText)) return 'politics';
    return 'world';
  }

  if (source.includes('rossiyskaya gazeta')) {
    if (/econom|business/.test(hintText)) return 'business';
    if (/sport/.test(hintText)) return 'sports';
    if (/culture|kultura/.test(hintText)) return 'arts';
    if (/science|nauka/.test(hintText)) return 'science';
    return 'world';
  }

  if (source === 'novosti') {
    if (/sport/.test(hintText)) return 'sports';
    if (/ekonomija|biznis/.test(hintText)) return 'business';
    if (/kultura/.test(hintText)) return 'arts';
    if (/zabava/.test(hintText)) return 'entertainment';
    if (/zdravlje/.test(hintText)) return 'health';
    if (/politika/.test(hintText)) return 'politics';
    return 'world';
  }

  if (source === '24 chasa') {
    if (/sport/.test(hintText)) return 'sports';
    if (/biznes|ikonomika/.test(hintText)) return 'business';
    if (/zdrave/.test(hintText)) return 'health';
    if (/kultura/.test(hintText)) return 'arts';
    if (/razvlecheni|show/.test(hintText)) return 'entertainment';
    if (/politika/.test(hintText)) return 'politics';
    return 'world';
  }

  if (source.includes('nordjyske')) {
    if (/sport/.test(hintText)) return 'sports';
    if (/erhverv/.test(hintText)) return 'business';
    if (/kultur/.test(hintText)) return 'arts';
    if (/politik/.test(hintText)) return 'politics';
    return 'world';
  }

  if (source.includes('le télégramme')) {
    if (/sport/.test(hintText)) return 'sports';
    if (/economie/.test(hintText)) return 'business';
    if (/culture/.test(hintText)) return 'arts';
    if (/loisirs/.test(hintText)) return 'lifestyle';
    if (/sante/.test(hintText)) return 'health';
    if (/politique/.test(hintText)) return 'politics';
    return 'world';
  }

  if (source === 'gandul') {
    if (/sport/.test(hintText)) return 'sports';
    if (/financiar|economie|business/.test(hintText)) return 'business';
    if (/sanatate/.test(hintText)) return 'health';
    if (/cultura/.test(hintText)) return 'arts';
    if (/show/.test(hintText)) return 'entertainment';
    if (/politica/.test(hintText)) return 'politics';
    return 'world';
  }

  if (source.includes('antara')) {
    if (/olahraga/.test(hintText)) return 'sports';
    if (/ekonomi|bisnis/.test(hintText)) return 'business';
    if (/tekno/.test(hintText)) return 'tech';
    if (/hiburan/.test(hintText)) return 'entertainment';
    if (/lifestyle/.test(hintText)) return 'lifestyle';
    if (/politik/.test(hintText)) return 'politics';
    if (/kesehatan/.test(hintText)) return 'health';
    return 'world';
  }

  if (source === 'telegraf') {
    if (/sport/.test(hintText)) return 'sports';
    if (/biznis|ekonomija/.test(hintText)) return 'business';
    if (/kultura/.test(hintText)) return 'arts';
    if (/jetset|showbiz|zabava/.test(hintText)) return 'entertainment';
    if (/politika/.test(hintText)) return 'politics';
    return 'world';
  }

  if (source === '24sata') {
    if (/sport/.test(hintText)) return 'sports';
    if (/show|fun|zabava/.test(hintText)) return 'entertainment';
    if (/biznis/.test(hintText)) return 'business';
    if (/zdravlje/.test(hintText)) return 'health';
    if (/politika/.test(hintText)) return 'politics';
    return 'world';
  }

  if (source.includes('adnkronos')) {
    if (/sport/.test(hintText)) return 'sports';
    if (/economia|finanza/.test(hintText)) return 'business';
    if (/salute/.test(hintText)) return 'health';
    if (/cultura/.test(hintText)) return 'arts';
    if (/spettacoli/.test(hintText)) return 'entertainment';
    if (/politica/.test(hintText)) return 'politics';
    return 'world';
  }

  if (source.includes('delfi lithuania')) {
    if (/sportas/.test(hintText)) return 'sports';
    if (/verslas/.test(hintText)) return 'business';
    if (/kultura/.test(hintText)) return 'arts';
    if (/veidai/.test(hintText)) return 'entertainment';
    if (/laisvalaikis/.test(hintText)) return 'lifestyle';
    if (/sveikata/.test(hintText)) return 'health';
    if (/mokslas/.test(hintText)) return 'science';
    if (/politika/.test(hintText)) return 'politics';
    return 'world';
  }

  if (source.includes('suara')) {
    if (/bola|sport/.test(hintText)) return 'sports';
    if (/bisnis/.test(hintText)) return 'business';
    if (/tekno/.test(hintText)) return 'tech';
    if (/health|kesehatan/.test(hintText)) return 'health';
    if (/entertainment/.test(hintText)) return 'entertainment';
    if (/lifestyle/.test(hintText)) return 'lifestyle';
    if (/politik/.test(hintText)) return 'politics';
    return 'world';
  }

  if (source.includes('el español')) {
    if (/deportes/.test(hintText)) return 'sports';
    if (/economia|invertia/.test(hintText)) return 'business';
    if (/cultura/.test(hintText)) return 'arts';
    if (/porfolio/.test(hintText)) return 'lifestyle';
    if (/ciencia|tecnologia/.test(hintText)) return 'tech';
    if (/salud/.test(hintText)) return 'health';
    if (/espana|politica/.test(hintText)) return 'politics';
    return 'world';
  }

  if (source.includes('donga ilbo')) {
    if (/news\/economy/.test(url)) return 'business';
    if (/news\/politics/.test(url) || /news\/opinion/.test(url)) return 'politics';
    if (/news\/culture/.test(url)) return 'arts';
    if (/news\/entertainment/.test(url)) return 'entertainment';
    if (/news\/inter/.test(url) || /news\/society/.test(url)) return 'world';
  }

  if (source.includes('조선닷컴')) {
    if (/english\/sports-en/.test(url)) return 'sports';
    if (/economy\/|industry-en/.test(url)) return 'business';
    if (/international\//.test(url)) return 'world';
    if (/travel-food-en/.test(url)) return 'lifestyle';
    if (/culture-life\/book|culture-life\/culture_general/.test(url)) return 'arts';
    if (/kpop-culture-en|culture-life\/k-culture|entertainments/.test(url)) return 'entertainment';
  }

  for (const fallback of SOURCE_FALLBACKS) {
    if (fallback.pattern.test(row.source)) {
      return fallback.section;
    }
  }

  return 'others';
}

function classifySectionByStructuredHints(source: string, url: string): NewsSection {
  const hintText = buildArticleHintText(source, url);
  for (const [section, patterns] of SECTION_HINT_PATTERNS) {
    for (const pattern of patterns) {
      if (pattern.test(hintText)) {
        return section;
      }
    }
  }
  return 'others';
}

function buildArticleHintText(source: string, url: string): string {
  const fragments = [source];
  try {
    const parsed = new URL(url);
    fragments.push(parsed.hostname);
    fragments.push(safeDecodeURIComponent(parsed.pathname));
    fragments.push(safeDecodeURIComponent(parsed.search));
  } catch {
    fragments.push(url);
  }

  let hintText = fragments
    .join(' ')
    .replace(/[._/+?&=%-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

  for (const pattern of GENERIC_HINT_NOISE_PATTERNS) {
    hintText = hintText.replace(pattern, ' ');
  }

  return hintText.replace(/\s+/g, ' ').trim();
}

function buildHintRegex(term: string): RegExp {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`, 'iu');
}

function looksLikeGenericTitle(title: string): boolean {
  const normalized = normalizeArticleTitle(title || '', '');
  if (!normalized) return true;
  return looksLikeLowSignalArticleTitle(normalized);
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function looksLikeConflictSignal(value: string): boolean {
  return CONFLICT_SIGNAL_PATTERN.test(value);
}

function classifySectionByPath(pathname: string, hintText: string): NewsSection {
  if (!pathname && !hintText) return 'others';

  if (
    /\/(showbiz|entertainment|celebrit|celebrity|celeb|stars|star-life|fama|famosos|espectaculos|espetaculos|spettacoli|zabava|jetset|monden|veidai|koktejl|viihde|pop-arte|scena|kpop-culture|entertainments?|movie|movies|film|films|cinema|music|tv|television)\//.test(pathname)
    || /\b(showbiz|celebrity|celebrities|fama|espectaculos|spettacoli|zabava|veidai|koktejl|viihde|kpop|movie|movies|film|cinema|music|television)\b/.test(hintText)
  ) {
    return 'entertainment';
  }

  if (
    /\/(lifestyle|fashion|style|travel|food|recipe|recipes|gourmet|restaurants?|dining|wellbeing|well-being|ravintolat|laisvalaikis|seima|porfolio|moda|viaje|viajes|viagem|reisen|seyahat)\//.test(pathname)
    || /\b(lifestyle|fashion|style|travel|food|recipe|recipes|restaurant|restaurants|gourmet|wellbeing|well being|ravintolat|laisvalaikis|seima|moda|viaje|viagem|reisen|seyahat)\b/.test(hintText)
  ) {
    return 'lifestyle';
  }

  if (
    /\/(culture|cultura|kultura|kulttuuri|arts?|arte|museum|museums|exhibition|exhibitions|theatre|theater|opera|literature|books?|kunst)\//.test(pathname)
    || /\b(culture|cultura|kultura|kulttuuri|arts|arte|museum|exhibition|theatre|theater|opera|literature|books|kunst)\b/.test(hintText)
  ) {
    return 'arts';
  }

  return 'others';
}

function parseArticleUrl(url: string): { hostname: string; pathname: string; search: string } {
  try {
    const parsed = new URL(url);
    return {
      hostname: parsed.hostname.toLowerCase(),
      pathname: safeDecodeURIComponent(parsed.pathname).toLowerCase(),
      search: safeDecodeURIComponent(parsed.search).toLowerCase(),
    };
  } catch {
    return {
      hostname: '',
      pathname: '',
      search: '',
    };
  }
}

async function readLatestHealth(pool: Pool): Promise<Map<string, PublicSourceHealth>> {
  const result = await pool.query<HealthRow>(
    `
    select distinct on (coalesce(country, 'Global'), source)
      source,
      country,
      ran_at,
      method,
      attempted,
      ok,
      status_code,
      health_classification,
      error,
      requested_url,
      final_url
    from rss_health_status
    where ran_at >= now() - interval '30 days'
    order by coalesce(country, 'Global'), source, ran_at desc
    `
  );

  const map = new Map<string, PublicSourceHealth>();
  for (const row of result.rows) {
    const key = makeSourceKey(normalizeCountryName(row.country), row.source);
    map.set(key, {
      ranAt: new Date(row.ran_at).toISOString(),
      method: row.method === 'sitemap' ? 'sitemap' : 'rss',
      attempted: Boolean(row.attempted),
      ok: Boolean(row.ok),
      statusCode: row.status_code,
      healthClassification: row.health_classification,
      error: row.error,
      requestedUrl: row.requested_url,
      finalUrl: row.final_url,
    });
  }
  return map;
}

function buildSourcesFile(
  atlas: Atlas,
  latestHealth: Map<string, PublicSourceHealth>,
  directory: CountryDirectory
): PublicSourcesFile {
  const generatedAt = new Date().toISOString();
  const deduped = new Map<string, PublicSourceRecord>();

  for (const country of atlas.countries) {
    const countryCode = country.code.trim().toUpperCase();
    const countryName = country.name.trim();
    directory.countryNameByCode.set(countryCode, countryName);
    for (const feed of country.feeds || []) {
      if (!feed?.name) continue;
      const key = `${countryCode}|${feed.name.trim()}`;
      if (deduped.has(key)) continue;
      deduped.set(key, {
        source: feed.name.trim(),
        country: countryName,
        countryCode,
        rssUrl: typeof feed.url === 'string' && feed.url.trim().length > 0 ? feed.url.trim() : null,
        sitemapUrl:
          typeof feed.sitemapUrl === 'string' && feed.sitemapUrl.trim().length > 0 ? feed.sitemapUrl.trim() : null,
        latestHealth: latestHealth.get(makeSourceKey(countryName, feed.name.trim())) || null,
      });
    }
  }

  return {
    generatedAt,
    sources: [...deduped.values()].sort(
      (a, b) => a.country.localeCompare(b.country) || a.source.localeCompare(b.source)
    ),
  };
}

function resetOutputDir(path: string): void {
  rmSync(path, { recursive: true, force: true });
  mkdirSync(path, { recursive: true });
}

function writeDataFiles(
  articles: PublicNewsArticle[],
  sources: PublicSourcesFile,
  directory: CountryDirectory,
  exportStats: ExportStats
): void {
  const generatedAt = new Date().toISOString();
  const availableDates = getAvailableDates(articles);
  const latestDate = availableDates[0] || null;
  const currentUtcDate = new Date().toISOString().slice(0, 10);
  const featuredDate = availableDates.find((date) => date <= currentUtcDate) || latestDate;
  const latest24hInsertedArticles = filterLatestCreatedHours(articles, LATEST_HOURS);
  const latest24hPublishedArticles = filterLatestPublicationHours(articles, LATEST_HOURS);
  const sectionTotals = countSections(articles);
  const byDatePaths: string[] = [];
  const byCountryMonthPaths: string[] = [];

  const byDate = groupBy(articles, (article) => article.publicationDatetime.slice(0, 10));
  for (const [date, dateArticles] of [...byDate.entries()].sort((a, b) => b[0].localeCompare(a[0]))) {
    const shard: PublicDateShard = {
      generatedAt,
      date,
      articles: dateArticles,
    };
    const outputPath = resolve(OUTPUT_DIR, 'by-date', `${date}.json`);
    writeJson(outputPath, shard);
    byDatePaths.push(`/data/by-date/${date}.json`);
    if (WRITE_BY_DATE_CSV) {
      writeCsv(
        resolve(OUTPUT_DIR, 'downloads', 'by-date', `${date}.csv`),
        dateArticles
      );
    }
  }

  const dashboardPreviewArticles = featuredDate ? byDate.get(featuredDate) || [] : [];
  const dashboardPreview: PublicDashboardPreview = {
    date: featuredDate,
    articleCount: dashboardPreviewArticles.length,
    topCountries: buildCountryRollup(dashboardPreviewArticles, 6),
    headlines: dashboardPreviewArticles.slice(0, 8),
  };

  const byCountryMonth = groupBy(articles, (article) => `${article.countryCode}|${article.publicationDatetime.slice(0, 7)}`);
  const countryMonths: Record<string, string[]> = {};
  for (const [key, countryMonthArticles] of [...byCountryMonth.entries()].sort((a, b) => b[0].localeCompare(a[0]))) {
    const [countryCode, month] = key.split('|');
    countryMonths[countryCode] = [...new Set([...(countryMonths[countryCode] || []), month])].sort((a, b) => b.localeCompare(a));
    const shard: PublicCountryMonthShard = {
      generatedAt,
      countryCode,
      country: directory.countryNameByCode.get(countryCode) || countryMonthArticles[0]?.country || 'Global',
      month,
      articles: countryMonthArticles,
    };
    const outputPath = resolve(OUTPUT_DIR, 'by-country', countryCode, `${month}.json`);
    writeJson(outputPath, shard);
    byCountryMonthPaths.push(`/data/by-country/${countryCode}/${month}.json`);
    if (WRITE_BY_COUNTRY_MONTH_CSV) {
      writeCsv(
        resolve(OUTPUT_DIR, 'downloads', 'by-country', countryCode, `${month}.csv`),
        countryMonthArticles
      );
    }
  }

  if (WRITE_LATEST_24H_CSV) {
    writeCsv(resolve(OUTPUT_DIR, 'downloads', 'latest-24h.csv'), latest24hInsertedArticles);
  }
  writeJson(resolve(OUTPUT_DIR, 'sources.json'), sources);

  const countryCodes = [...new Set([
    ...articles.map((article) => article.countryCode),
    ...sources.sources.map((source) => source.countryCode),
  ])].sort((a, b) => a.localeCompare(b));
  const countryNames = Object.fromEntries(
    countryCodes.map((code) => [code, directory.countryNameByCode.get(code) || code])
  );
  const integrationFeeds = writeIntegrationFeeds(
    countryCodes,
    countryNames,
    latest24hPublishedArticles,
    latest24hInsertedArticles,
    generatedAt
  );

  const manifest: PublicDataManifest = {
    generatedAt,
    schemaVersion: PUBLIC_DATA_SCHEMA_VERSION,
    cadence: {
      frequency: 'hourly',
      scheduledMinute: PUBLIC_EXPORT_SCHEDULE_MINUTE,
      timezone: PUBLIC_EXPORT_TIMEZONE,
    },
    latestDate,
    featuredDate,
    countries: countryCodes,
    countryNames,
    countryMonths,
    sections: PUBLIC_DATA_SECTIONS,
    availableDates,
    downloads: {
      latest24h: WRITE_LATEST_24H_CSV ? '/data/downloads/latest-24h.csv' : '',
      byDate: WRITE_BY_DATE_CSV
        ? byDatePaths.map((path) => path.replace('/by-date/', '/downloads/by-date/').replace('.json', '.csv'))
        : [],
      byCountryMonth: WRITE_BY_COUNTRY_MONTH_CSV
        ? byCountryMonthPaths.map((path) =>
            path.replace('/by-country/', '/downloads/by-country/').replace('.json', '.csv')
          )
        : [],
    },
    shards: {
      byDate: latestDate ? `/data/by-date/${latestDate}.json` : null,
      byCountryMonth: byCountryMonthPaths[0] || null,
      featuredByDate: featuredDate ? `/data/by-date/${featuredDate}.json` : null,
    },
    totals: {
      articles: articles.length,
      latest24h: latest24hInsertedArticles.length,
      sources: sources.sources.length,
    },
    exportStats: {
      windowDays: EXPORT_DAYS,
      latestHours: LATEST_HOURS,
      maxRows: MAX_ROWS,
      rawRowsInWindow: exportStats.rawRowsInWindow,
      rawLatest24hInserted: exportStats.rawLatest24hInserted,
      rawLatest24hPublished: exportStats.rawLatest24hPublished,
      checkedSources24h: exportStats.checkedSources24h,
      rowLimitHit: exportStats.rowLimitHit,
    },
    dashboardPreview,
    sectionTotals,
  };

  writeJson(resolve(OUTPUT_DIR, 'manifest.json'), manifest);
  writeJson(resolve(OUTPUT_DIR, 'integration-manifest.json'), {
    generatedAt,
    schemaVersion: PUBLIC_DATA_SCHEMA_VERSION,
    cadence: manifest.cadence,
    windowHours: LATEST_HOURS,
    semantics: {
      published24h: 'publicationDatetime within the last 24 hours',
      inserted24h: 'createdAt within the last 24 hours',
    },
    filtering: {
      keywordTextField: 'keywordText',
      primarySectionField: 'primarySection',
      sectionsField: 'sections',
      sourceCategoriesField: 'sourceCategories',
      normalization:
        'lowercased, diacritics-stripped, whitespace-normalized title + snippet + source + country + countryCode + primarySection + sections + sourceCategories',
    },
    countries: countryCodes,
    countryNames,
    feeds: integrationFeeds,
  } satisfies PublicIntegrationManifest);
}

function countSections(articles: PublicNewsArticle[]): Record<NewsSection, number> {
  const totals = Object.fromEntries(PUBLIC_DATA_SECTIONS.map((section) => [section, 0])) as Record<NewsSection, number>;
  for (const article of articles) {
    totals[article.primarySection] += 1;
  }
  return totals;
}

function buildCountryRollup(
  articles: PublicNewsArticle[],
  limit: number
): Array<{ country: string; countryCode: string; count: number }> {
  const counts = new Map<string, number>();
  for (const article of articles) {
    const key = `${article.countryCode}|${article.country}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  return [...counts.entries()]
    .map(([key, count]) => {
      const [countryCode, country] = key.split('|');
      return { country, countryCode, count };
    })
    .sort((a, b) => b.count - a.count || a.countryCode.localeCompare(b.countryCode) || a.country.localeCompare(b.country))
    .slice(0, limit);
}

function getAvailableDates(articles: PublicNewsArticle[]): string[] {
  return [...new Set(articles.map((article) => article.publicationDatetime.slice(0, 10)))].sort((a, b) => b.localeCompare(a));
}

function filterLatestCreatedHours(articles: PublicNewsArticle[], hours: number): PublicNewsArticle[] {
  const cutoff = Date.now() - hours * 60 * 60 * 1000;
  return articles.filter((article) => new Date(article.createdAt).getTime() >= cutoff);
}

function filterLatestPublicationHours(articles: PublicNewsArticle[], hours: number): PublicNewsArticle[] {
  const cutoff = Date.now() - hours * 60 * 60 * 1000;
  return articles.filter((article) => new Date(article.publicationDatetime).getTime() >= cutoff);
}

function groupBy<T>(items: T[], keyFn: (item: T) => string): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    const current = grouped.get(key);
    if (current) {
      current.push(item);
      continue;
    }
    grouped.set(key, [item]);
  }
  return grouped;
}

function normalizeSection(value: string | null): NewsSection {
  const candidate = (value || 'others').trim().toLowerCase();
  return PUBLIC_DATA_SECTIONS.includes(candidate as NewsSection) ? (candidate as NewsSection) : 'others';
}

function normalizeCountryName(value: string | null): string {
  const normalized = (value || '').trim();
  return normalized || 'Global';
}

function buildKeywordText(parts: ReadonlyArray<string | null | undefined>): string {
  const text = parts
    .map((part) => decodeHtmlEntities(part || ''))
    .join(' ')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text;
}

function normalizePublicationDatetime(publicationDatetimeRaw: string, createdAtRaw: string): string {
  const publicationDatetime = new Date(publicationDatetimeRaw);
  const createdAt = new Date(createdAtRaw);
  if (!Number.isFinite(publicationDatetime.getTime())) {
    return createdAt.toISOString();
  }
  const futureCutoff = Date.now() + MAX_FUTURE_PUBLICATION_HOURS * 60 * 60 * 1000;
  if (publicationDatetime.getTime() > futureCutoff) {
    return createdAt.toISOString();
  }
  return publicationDatetime.toISOString();
}

function makeSourceKey(country: string, source: string): string {
  return `${country.trim()}|${source.trim()}`;
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function writeIntegrationFeeds(
  countryCodes: string[],
  countryNames: Record<string, string>,
  latest24hPublishedArticles: PublicNewsArticle[],
  latest24hInsertedArticles: PublicNewsArticle[],
  generatedAt: string
): Record<string, { published24h: string; inserted24h: string }> {
  const publishedByCountry = groupBy(latest24hPublishedArticles, (article) => article.countryCode);
  const insertedByCountry = groupBy(latest24hInsertedArticles, (article) => article.countryCode);
  const feeds: Record<string, { published24h: string; inserted24h: string }> = {};

  for (const countryCode of countryCodes) {
    const country = countryNames[countryCode] || countryCode;
    const publishedPath = `/data/country-published-24h-${countryCode}.json`;
    const insertedPath = `/data/country-inserted-24h-${countryCode}.json`;
    feeds[countryCode] = {
      published24h: publishedPath,
      inserted24h: insertedPath,
    };

    writeJson(resolve(OUTPUT_DIR, `country-published-24h-${countryCode}.json`), {
      generatedAt,
      schemaVersion: PUBLIC_DATA_SCHEMA_VERSION,
      windowHours: LATEST_HOURS,
      windowType: 'publicationDatetime',
      countryCode,
      country,
      articleCount: (publishedByCountry.get(countryCode) || []).length,
      articles: publishedByCountry.get(countryCode) || [],
    } satisfies PublicCountryFeedFile);

    writeJson(resolve(OUTPUT_DIR, `country-inserted-24h-${countryCode}.json`), {
      generatedAt,
      schemaVersion: PUBLIC_DATA_SCHEMA_VERSION,
      windowHours: LATEST_HOURS,
      windowType: 'createdAt',
      countryCode,
      country,
      articleCount: (insertedByCountry.get(countryCode) || []).length,
      articles: insertedByCountry.get(countryCode) || [],
    } satisfies PublicCountryFeedFile);
  }

  return feeds;
}

function writeCsv(path: string, articles: PublicNewsArticle[]): void {
  mkdirSync(dirname(path), { recursive: true });
  const header = [
    'id',
    'source',
    'country',
    'countryCode',
    'language',
    'primarySection',
    'sections',
    'sourceCategories',
    'title',
    'snippet',
    'keywordText',
    'url',
    'publicationDatetime',
    'createdAt',
  ];
  const rows = articles.map((article) =>
    [
      article.id,
      article.source,
      article.country,
      article.countryCode,
      article.language,
      article.primarySection,
      article.sections.join('|'),
      article.sourceCategories.join('|'),
      article.title,
      article.snippet,
      article.keywordText,
      article.url,
      article.publicationDatetime,
      article.createdAt,
    ]
      .map(escapeCsvCell)
      .join(',')
  );
  writeFileSync(path, `${header.join(',')}\n${rows.join('\n')}${rows.length ? '\n' : ''}`, 'utf8');
}

function escapeCsvCell(value: string | number | null): string {
  const text = `${value ?? ''}`;
  if (!/[",\n]/.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
}

main().catch((error) => {
  console.error(
    `[export-public-news-data] ${error instanceof Error ? error.message : String(error)}`
  );
  process.exit(1);
});
