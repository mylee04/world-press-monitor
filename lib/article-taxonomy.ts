import type { NewsSection } from '@/lib/types';
import {
  buildArticleHintText,
  classifySectionBySourceFallback,
  classifySectionByStructuredHints,
  deriveSectionFromContext,
  mapFeedCategoryToSection,
} from '@/lib/article-section-context';
import { looksLikeLowSignalArticleTitle, normalizeArticleTitle } from '@/lib/html-entities';
import { classifySectionByKeyword } from '@/lib/keyword-classifier';

const VALID_NEWS_SECTIONS: ReadonlySet<NewsSection> = new Set<NewsSection>([
  'world',
  'politics',
  'conflicts',
  'business',
  'tech',
  'sports',
  'health',
  'entertainment',
  'lifestyle',
  'arts',
  'science',
  'climate',
  'others',
]);

export const NEWS_SECTION_ORDER: NewsSection[] = [
  'world',
  'politics',
  'conflicts',
  'business',
  'tech',
  'sports',
  'health',
  'entertainment',
  'lifestyle',
  'arts',
  'science',
  'climate',
  'others',
];

type ArticleTaxonomyInput = {
  storedSection?: string | null;
  sourceCategories?: ReadonlyArray<string> | null;
  source: string;
  url: string;
  title: string;
  snippet?: string | null;
};

export type ArticleTaxonomy = {
  primarySection: NewsSection;
  sections: NewsSection[];
  sourceCategories: string[];
  primaryTopic: string | null;
  topics: string[];
};

type TopicRule = {
  topic: string;
  patterns: readonly RegExp[];
};

const rx = (pattern: string): RegExp => new RegExp(pattern, 'iu');

const SECTION_TOPIC_RULES: Partial<Record<NewsSection, readonly TopicRule[]>> = {
  world: [
    { topic: 'diplomacy', patterns: [rx('diplomac|summit|treaty|embassy|foreign minister|bilateral|delegation|consul')] },
    { topic: 'migration', patterns: [rx('migration|migrant|refugee|asylum|border crossing|deportation|diaspora')] },
    { topic: 'disasters', patterns: [rx('earthquake|flood|wildfire|storm|hurricane|typhoon|landslide|disaster|eruption')] },
    { topic: 'aviation / transport', patterns: [rx('aviation|airline|airport|flight|railway|train crash|shipping|ferry|port')] },
    { topic: 'crime / security', patterns: [rx('kidnap|murder|police raid|organized crime|smuggling|terror alert|security alert')] },
  ],
  politics: [
    { topic: 'elections', patterns: [rx('election|ballot|polls?\\b|campaign|primary race|runoff|vote count|referendum')] },
    { topic: 'government policy', patterns: [rx('cabinet|parliament|congress|senate|minister|ministry|bill\\b|lawmakers?|executive order|regulation')] },
    { topic: 'courts / justice', patterns: [rx('court|judge|lawsuit|trial|verdict|prosecutor|supreme court|indictment|appeal')] },
    { topic: 'diplomacy', patterns: [rx('summit|treaty|foreign policy|embassy|diplomat|sanctions|peace talks')] },
    { topic: 'protests', patterns: [rx('protest|demonstration|march\\b|rally\\b|strike\\b|sit-in|activists?')] },
  ],
  conflicts: [
    { topic: 'airstrikes / missiles', patterns: [rx('airstrike|missile|rocket fire|drone strike|bombing|shelling')] },
    { topic: 'ground operations', patterns: [rx('troops?|offensive|frontline|artillery|incursion|clashes?|battlefield')] },
    { topic: 'ceasefire / talks', patterns: [rx('ceasefire|truce|peace talks|negotiation|mediat|de-escalation')] },
    { topic: 'hostages / prisoners', patterns: [rx('hostage|detainee|prisoner exchange|captives?|release talks')] },
    { topic: 'defense / weapons', patterns: [rx('defense|military aid|weapons?|arms deal|warplane|navy|munitions')] },
  ],
  business: [
    { topic: 'markets', patterns: [rx('\\bmarkets?\\b|stocks?\\b|equities|shares?\\b|nasdaq|dow jones|s&p\\b|index futures|bourse|trading|mercados?|bolsa|mercado bursatil')] },
    { topic: 'economy', patterns: [rx('econom(y|ic)|economia|economico|inflation|gdp\\b|macroeconom|recession|jobs report|unemployment|consumer prices|fiscal|central bank')] },
    { topic: 'banking / fintech', patterns: [rx('banking|bank\\b|banco\\b|lender|fintech|finanzas?|payments?|pagos?|pagamentos|digital wallet|credit card|loans?\\b|credito|insurer')] },
    { topic: 'companies', patterns: [rx('earnings|quarterly results|ceo\\b|merger|acquisition|ipo\\b|startup|corporate|shareholder|boardroom')] },
    { topic: 'real estate', patterns: [rx('real estate|housing|mortgage|property market|home sales|commercial property|developers?|inmobili|imobili|vivienda')] },
    { topic: 'energy', patterns: [rx('oil\\b|gas\\b|opec|renewables?|solar|wind power|electricity|utility|lng\\b|energia|petroleo|petroleo|gas natural')] },
    { topic: 'retail / consumer', patterns: [rx('retail|consumer spending|e-commerce|supermarket|luxury|shopping|restaurants?|consumo|varejo|minorista')] },
    { topic: 'autos / transport', patterns: [rx('automotive|automaker|ev sales|airlines?|aviation|shipping|logistics|rail operator|truck|transporte|logistica|aviacao|automovil|automoveis')] },
    { topic: 'crypto', patterns: [rx('crypto|criptom|bitcoin|ethereum|token\\b|blockchain|web3|stablecoin')] },
  ],
  tech: [
    { topic: 'ai', patterns: [rx('\\bai\\b|\\bia\\b|artificial intelligence|inteligencia artificial|machine learning|llm\\b|chatbot|generative ai|openai|anthropic')] },
    { topic: 'gadgets', patterns: [rx('smartphone|iphone|android phone|tablet|laptop|wearable|smartwatch|camera|gadget')] },
    { topic: 'cybersecurity', patterns: [rx('cyber|ciberseguridad|hack(ed|ing)?|ransomware|malware|phishing|data breach|zero-day|infosec')] },
    { topic: 'software / cloud', patterns: [rx('software|app\\b|saas|cloud computing|developer tool|operating system|browser|database|nube')] },
    { topic: 'chips', patterns: [rx('chip(s)?\\b|semiconductor|foundry|wafer|gpu\\b|processor|tsmc|fabrication')] },
    { topic: 'telecom', patterns: [rx('telecom|telecomunic|5g\\b|broadband|carrier\\b|mobile network|fiber\\b|satellite internet')] },
    { topic: 'social media', patterns: [rx('social media|tiktok|instagram|facebook|meta\\b|x corp|youtube|snapchat')] },
    { topic: 'gaming', patterns: [rx('video game|gaming\\b|videojuegos?|jogos?\\b|playstation|xbox|nintendo|steam\\b|esports?')] },
    { topic: 'space', patterns: [rx('space\\b|rocket|satellite|nasa\\b|spacex|lunar|orbital|astronaut')] },
  ],
  sports: [
    { topic: 'american football', patterns: [rx('nfl\\b|super bowl|college football|ncaa football|american football')] },
    { topic: 'football', patterns: [rx('football|soccer|futbol|futebol|calcio|premier league|la liga|bundesliga|serie a|uefa|fifa|champions league|copa libertadores|mls\\b')] },
    { topic: 'basketball', patterns: [rx('basketball|baloncesto|basquet|basquete|nba\\b|wnba\\b|euroleague|ncaa basketball|fiba\\b')] },
    { topic: 'baseball', patterns: [rx('baseball|mlb\\b|beisbol|npb\\b|world series')] },
    { topic: 'tennis', patterns: [rx('tennis|tenis|atp\\b|wta\\b|wimbledon|roland garros|us open|australian open')] },
    { topic: 'golf', patterns: [rx('golf|pga\\b|lpga\\b|masters tournament|ryder cup')] },
    { topic: 'motorsport', patterns: [rx('formula 1|\\bf1\\b|nascar|indycar|motogp|rally|motorsport|automovilismo|motor')] },
    { topic: 'cricket', patterns: [rx('cricket|ipl\\b|test match|odi\\b|t20\\b')] },
    { topic: 'hockey', patterns: [rx('hockey|nhl\\b|ice hockey|field hockey')] },
    { topic: 'volleyball', patterns: [rx('volleyball|voleibol|voley|beach volleyball')] },
    { topic: 'boxing / mma', patterns: [rx('boxing|boxeo|boxer\\b|ufc\\b|mma\\b|bellator|octagon')] },
    { topic: 'olympics', patterns: [rx('olympic|paralympic')] },
    { topic: 'winter sports', patterns: [rx('skiing|snowboard|biathlon|figure skating|speed skating|curling')] },
    { topic: 'snooker', patterns: [rx('snooker')] },
    { topic: 'esports', patterns: [rx('esports?|e-sports')] },
  ],
  health: [
    { topic: 'public health', patterns: [rx('outbreak|pandemic|epidemic|vaccin|virus|disease control|who\\b|cdc\\b|infection')] },
    { topic: 'healthcare', patterns: [rx('hospital|clinic|healthcare|medical care|nursing|medicare|insurance plan|surgery')] },
    { topic: 'mental health', patterns: [rx('mental health|depression|anxiety|suicide prevention|therapy|addiction')] },
    { topic: 'pharma / biotech', patterns: [rx('pharma|biotech|drugmaker|clinical trial|fda\\b|therapeutic|vaccine maker')] },
    { topic: 'nutrition / fitness', patterns: [rx('nutrition|diet\\b|obesity|fitness|exercise|wellness|protein\\b')] },
  ],
  entertainment: [
    { topic: 'film / tv', patterns: [rx('film\\b|movie|cinema|television|tv series|streaming|netflix|box office')] },
    { topic: 'music', patterns: [rx('music|album|single\\b|concert|tour dates|festival|billboard charts')] },
    { topic: 'celebrities', patterns: [rx('celebrit|actor|actress|star couple|influencer|royal family')] },
    { topic: 'awards', patterns: [rx('oscars?|emmys?|grammys?|bafta|cannes|golden globes')] },
  ],
  lifestyle: [
    { topic: 'fashion / beauty', patterns: [rx('fashion|beauty|makeup|skincare|jewelry|runway|designer')] },
    { topic: 'travel', patterns: [rx('travel|tourism|vacation|holiday guide|hotel|destination|cruise')] },
    { topic: 'food / drink', patterns: [rx('food\\b|recipe|restaurant|chef\\b|wine\\b|coffee\\b|cocktail')] },
    { topic: 'home / design', patterns: [rx('interior|decor|home design|garden|furniture|renovation')] },
    { topic: 'relationships / family', patterns: [rx('dating|wedding|marriage|parenting|family life|relationships?')] },
  ],
  arts: [
    { topic: 'visual art', patterns: [rx('gallery|museum|exhibit|exhibition|painting|sculpture|art fair')] },
    { topic: 'books / literature', patterns: [rx('book\\b|novel|literature|author\\b|poetry|publishing')] },
    { topic: 'theater / dance', patterns: [rx('theatre|theater|stage play|ballet|opera|dance company')] },
    { topic: 'architecture / design', patterns: [rx('architecture|architect|design week|urban design')] },
  ],
  science: [
    { topic: 'space / astronomy', patterns: [rx('space\\b|astronomy|telescope|planet|galaxy|asteroid|astronaut')] },
    { topic: 'biology / medicine', patterns: [rx('genetic|genome|biology|species\\b|cell study|medical research')] },
    { topic: 'archaeology / history', patterns: [rx('archaeolog|fossil|ancient|excavation|artifact|paleontolog')] },
    { topic: 'physics / energy', patterns: [rx('physics|quantum|particle|fusion\\b|nuclear research|material science')] },
  ],
  climate: [
    { topic: 'extreme weather', patterns: [rx('heatwave|wildfire|flood|storm|hurricane|typhoon|drought|extreme weather')] },
    { topic: 'energy transition', patterns: [rx('renewable|solar|wind\\b|battery|electric vehicle|energy transition|grid\\b')] },
    { topic: 'emissions / policy', patterns: [rx('carbon|emissions?|net zero|climate policy|cop\\d+|decarbon')] },
    { topic: 'conservation', patterns: [rx('conservation|biodiversity|deforestation|marine life|forest protection|oceans?')] },
  ],
};

export function normalizeNewsSection(value: string | null | undefined): NewsSection {
  const normalized = (value || '').trim().toLowerCase();
  if (VALID_NEWS_SECTIONS.has(normalized as NewsSection)) {
    return normalized as NewsSection;
  }
  return 'others';
}

export function normalizeSourceCategories(values: ReadonlyArray<string> | null | undefined): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const value of values || []) {
    const trimmed = value.replace(/\s+/g, ' ').trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(trimmed);
  }

  return normalized;
}

export function buildArticleTaxonomy(input: ArticleTaxonomyInput): ArticleTaxonomy {
  const title = (input.title || '').trim();
  const snippet = (input.snippet || '').trim();
  const source = (input.source || '').trim();
  const url = (input.url || '').trim();
  const sourceCategories = normalizeSourceCategories(input.sourceCategories);
  const storedSection = normalizeNewsSection(input.storedSection);
  const genericTitle = looksLikeGenericTitle(title, url);
  const hintText = source || url ? buildArticleHintText(source, url) : '';

  const feedCategorySections = sourceCategories
    .map((category) => classifySourceCategorySection(category))
    .filter((section): section is NewsSection => section !== 'others');
  const titleSection = genericTitle ? 'others' : classifySectionByKeyword(title, 'others').section;
  const textSection = !genericTitle && snippet
    ? classifySectionByKeyword(`${title} ${snippet}`, 'others').section
    : 'others';
  const hintKeywordSection = hintText ? classifySectionByKeyword(hintText, 'others').section : 'others';
  const structuredHintSection = source || url ? classifySectionByStructuredHints(source, url) : 'others';
  const sourceFallbackSection = source || url ? classifySectionBySourceFallback({ source, url, title }) : 'others';
  const contextSection = source || url ? deriveSectionFromContext({ source, url, title }) : 'others';
  const derivedSection = pickFirstMeaningfulSection([
    titleSection,
    textSection,
    structuredHintSection,
    hintKeywordSection,
    sourceFallbackSection,
    contextSection,
    ...feedCategorySections,
  ]);

  let primarySection = storedSection;
  if (primarySection === 'others') {
    primarySection = derivedSection;
  } else if (
    (primarySection === 'arts' || primarySection === 'entertainment' || primarySection === 'lifestyle')
    && derivedSection !== 'others'
  ) {
    primarySection = derivedSection;
  }

  const sections: NewsSection[] = [];
  pushSection(sections, primarySection);
  for (const section of [
    ...feedCategorySections,
    titleSection,
    textSection,
    structuredHintSection,
    hintKeywordSection,
    sourceFallbackSection,
    contextSection,
  ]) {
    pushSection(sections, section);
  }

  if (sections.length > 1) {
    const othersIndex = sections.indexOf('others');
    if (othersIndex >= 0) sections.splice(othersIndex, 1);
  }

  if (!sections.length) {
    sections.push('others');
  }

  const topicSection = primarySection === 'others'
    ? pickFirstMeaningfulSection(sections)
    : primarySection;
  const topics = topicSection === 'others'
    ? []
    : classifyDetailedTopics(
      topicSection,
      buildTopicSignalText([
        ...sourceCategories,
        title,
        snippet,
        url,
      ])
    );

  return {
    primarySection,
    sections,
    sourceCategories,
    primaryTopic: topics[0] || null,
    topics,
  };
}

function classifySourceCategorySection(value: string): NewsSection {
  return mapFeedCategoryToSection(value) || classifySectionByKeyword(value, 'others').section;
}

function looksLikeGenericTitle(title: string, url: string): boolean {
  const normalized = normalizeArticleTitle(title || '', url || '');
  if (!normalized) return true;
  return looksLikeLowSignalArticleTitle(normalized);
}

function pickFirstMeaningfulSection(sections: ReadonlyArray<NewsSection>): NewsSection {
  return sections.find((section) => section && section !== 'others') || 'others';
}

function pushSection(target: NewsSection[], candidate: NewsSection): void {
  if (!candidate) return;
  if (target.includes(candidate)) return;
  target.push(candidate);
}

function buildTopicSignalText(values: ReadonlyArray<string | null | undefined>): string {
  return values
    .map((value) => normalizeTopicSignal(value || ''))
    .filter(Boolean)
    .join(' ');
}

function normalizeTopicSignal(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function classifyDetailedTopics(section: NewsSection, signalText: string): string[] {
  if (!signalText) return [];
  const rules = SECTION_TOPIC_RULES[section] || [];
  const topics: string[] = [];

  for (const rule of rules) {
    if (!rule.patterns.some((pattern) => pattern.test(signalText))) continue;
    topics.push(rule.topic);
  }

  return topics;
}
