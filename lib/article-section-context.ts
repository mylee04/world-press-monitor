import type { NewsSection } from '@/lib/types';

export type ArticleSectionContext = {
  source: string;
  url: string;
  title?: string;
};

const CATEGORY_SECTION_MAP: Record<string, NewsSection> = {
  politics: 'politics',
  political: 'politics',
  policy: 'politics',
  opinion: 'politics',
  conflict: 'conflicts',
  conflicts: 'conflicts',
  war: 'conflicts',
  wars: 'conflicts',
  military: 'conflicts',
  defence: 'conflicts',
  defense: 'conflicts',
  business: 'business',
  economy: 'business',
  economics: 'business',
  economic: 'business',
  finance: 'business',
  financial: 'business',
  gazdasag: 'business',
  market: 'business',
  markets: 'business',
  money: 'business',
  globenewswire: 'business',
  gnw: 'business',
  energy: 'business',
  tech: 'tech',
  product: 'tech',
  technology: 'tech',
  science: 'science',
  sports: 'sports',
  sport: 'sports',
  health: 'health',
  entertainment: 'entertainment',
  showbiz: 'entertainment',
  celebrity: 'entertainment',
  celebrities: 'entertainment',
  limon: 'entertainment',
  music: 'entertainment',
  movie: 'entertainment',
  movies: 'entertainment',
  film: 'entertainment',
  films: 'entertainment',
  tv: 'entertainment',
  television: 'entertainment',
  lifestyle: 'lifestyle',
  fashion: 'lifestyle',
  style: 'lifestyle',
  travel: 'lifestyle',
  food: 'lifestyle',
  recipe: 'lifestyle',
  recipes: 'lifestyle',
  arts: 'arts',
  art: 'arts',
  culture: 'arts',
  climate: 'climate',
  world: 'world',
  international: 'world',
  local: 'world',
  lokal: 'world',
  regional: 'world',
  breaking: 'world',
  news: 'world',
  'all news': 'world',
  eesti: 'world',
  nigeria: 'world',
  'the gioi': 'world',
  noticias: 'world',
  nyheter: 'world',
  sociedad: 'world',
  nacionales: 'world',
  actualidad: 'world',
  actualitate: 'world',
  atualidade: 'world',
  portada: 'world',
  berlin: 'world',
  canada: 'world',
  belfold: 'world',
  brasil: 'world',
  chronik: 'world',
  hrvatska: 'world',
  innlent: 'world',
  'keski-suomi': 'world',
  kulfold: 'world',
  lietuvoje: 'world',
  nacional: 'world',
  nasional: 'world',
  policiales: 'world',
  regiony: 'world',
  'rus.postimees.ee': 'world',
  slovenija: 'world',
  slovensko: 'world',
  tujina: 'world',
  uudised: 'world',
  evropa: 'world',
  vijesti: 'world',
  zahranicie: 'world',
  регионални: 'world',
  internacionales: 'world',
  '*noticias republica dominicana': 'world',
  'das wichtigste des tages': 'world',
  'jaunakas zinas': 'world',
  'شرق وغرب': 'world',
  general: 'others',
  others: 'others',
  security: 'tech',
  politica: 'politics',
  politique: 'politics',
  politik: 'politics',
  정치: 'politics',
  政治: 'politics',
  政壇: 'politics',
  경제: 'business',
  금융: 'business',
  증권: 'business',
  financas: 'business',
  finanzas: 'business',
  'finanzas y mercados': 'business',
  財經: 'business',
  财经: 'business',
  經濟: 'business',
  经济: 'business',
  股市: 'business',
  證券: 'business',
  证券: 'business',
  sportsnews: 'sports',
  'college basketball': 'sports',
  deportes: 'sports',
  sportsmail: 'sports',
  스포츠: 'sports',
  체육: 'sports',
  운동: 'sports',
  體育: 'sports',
  体育: 'sports',
  運動: 'sports',
  运动: 'sports',
  娱乐: 'entertainment',
  娛樂: 'entertainment',
  電影: 'entertainment',
  电影: 'entertainment',
  연예: 'entertainment',
  문화: 'arts',
  科技: 'tech',
  科学: 'science',
  健康: 'health',
  生活: 'lifestyle',
  旅遊: 'lifestyle',
  旅游: 'lifestyle',
  氣候: 'climate',
  气候: 'climate',
  教育: 'world',
  教育新闻: 'world',
  education: 'world',
  career: 'world',
  mondo: 'world',
  panorama: 'world',
  feuilleton: 'arts',
  wirtschaft: 'business',
  salute: 'health',
  tecnologia: 'tech',
  scienza: 'science',
  사회: 'world',
  사회일반: 'world',
  社会: 'world',
  社會: 'world',
  society: 'world',
  debat: 'politics',
  erhverv: 'business',
  kultur: 'arts',
  mad: 'lifestyle',
  bolig: 'lifestyle',
  bolighandler: 'business',
  alarm112: 'world',
  trafik: 'world',
  samfund: 'world',
  國際: 'world',
  국제: 'world',
  国际: 'world',
  國內: 'world',
  国内: 'world',
  財經新聞: 'business',
  'phap luat': 'politics',
  'thoi su': 'world',
  'thoi tiet': 'climate',
  'giao duc': 'world',
  'kinh doanh': 'business',
  ελλαδα: 'world',
  ζωη: 'lifestyle',
  πολιτικη: 'politics',
  οικονομια: 'business',
  κακοκαιρια: 'climate',
  γυναικα: 'lifestyle',
  αυτοκινητο: 'business',
  πολιτισμος: 'arts',
  българия: 'world',
  'от страната и света': 'world',
  новини: 'world',
  свят: 'world',
  общество: 'world',
  любопитно: 'lifestyle',
  звезди: 'entertainment',
  астрология: 'lifestyle',
  рецепти: 'lifestyle',
  kronika: 'world',
  крими: 'world',
  темида: 'politics',
  афиш: 'arts',
  волейбол: 'sports',
  'здраве и красота': 'lifestyle',
  подіі: 'world',
  'за кордоном': 'world',
  'в россии': 'world',
  'в мире': 'world',
  gundem: 'world',
  'ic haber': 'world',
  dunya: 'world',
  '3. sayfa': 'world',
  'milli takımlar': 'sports',
  voleybol: 'sports',
  otomobil: 'business',
  medya: 'entertainment',
  техно: 'tech',
  'дом и сад': 'lifestyle',
  'чп и криминал': 'world',
  'наша латвия': 'world',
  srbija: 'world',
  vesti: 'world',
  hronika: 'world',
  info: 'world',
  vip: 'entertainment',
  zadruga: 'entertainment',
  astro: 'lifestyle',
  novcanik: 'business',
  porodica: 'lifestyle',
  zdravlje: 'health',
  recepti: 'lifestyle',
  region: 'world',
  zinas: 'world',
  meinfussball: 'sports',
  kommentar: 'politics',
  друштво: 'world',
  европа: 'world',
  балкани: 'world',
  интересности: 'lifestyle',
  международни: 'world',
  'люблю!': 'lifestyle',
  '\u0623\u062e\u0628\u0627\u0631': 'world',
  '\u0623\u062e\u0628\u0627\u0631 \u0645\u0635\u0631': 'world',
  '\u0623\u062e\u0628\u0627\u0631 \u0627\u0644\u0639\u0627\u0644\u0645': 'world',
  '\u0622\u062e\u0631\u0020\u0627\u0644\u0627\u062e\u0628\u0627\u0631': 'world',
  '\u0622\u062e\u0631 \u0627\u0644\u0623\u062e\u0628\u0627\u0631': 'world',
  '\u0627\u0644\u0639\u0627\u0644\u0645': 'world',
  '\u0627\u062e\u0628\u0627\u0631 \u0627\u0644\u0627\u0631\u062f\u0646': 'world',
  '\u0627\u0644\u0627\u0631\u062f\u0646 \u0627\u0644\u064a\u0648\u0645': 'world',
  '\u0627\u0644\u0623\u0631\u062f\u0646 \u0627\u0644\u064a\u0648\u0645': 'world',
  '\u062a\u0639\u0644\u064a\u0645 \u0648 \u062c\u0627\u0645\u0639\u0627\u062a': 'world',
  '\u0639\u0645\u0648\u0646\u064a\u0648\u0646': 'world',
  '\u0627\u0642\u062a\u0635\u0627\u062f': 'business',
  '\u0627\u0644\u0627\u0642\u062a\u0635\u0627\u062f \u0627\u0644\u0639\u0627\u0644\u0645\u0649': 'business',
  '\u0623\u0633\u0648\u0627\u0642': 'business',
  '\u0633\u064a\u0627\u0633\u0629': 'politics',
  '\u0645\u0642\u0627\u0644\u0627\u062a \u0645\u062e\u062a\u0627\u0631\u0629': 'politics',
  '\u0645\u0646\u0648\u0639\u0627\u062a': 'lifestyle',
  '\u0623\u064a \u062e\u062f\u0645\u0629': 'lifestyle',
  '\u0623\u0633\u0631\u0629': 'lifestyle',
  '\u0625\u0639\u0644\u0627\u0645': 'entertainment',
  '\u0628\u0627\u0646\u0648\u0631\u0627\u0645\u0627': 'entertainment',
  '\u062a\u0648\u0627\u0628\u0644': 'entertainment',
  '\u062d\u0631\u0627\u0643': 'politics',
  '\u0646\u0628\u0636 \u0627\u0644\u0634\u0627\u0631\u0639': 'world',
  '\u0627\u0644\u0645\u062d\u0627\u0641\u0638\u0627\u062a': 'world',
  '\u0625\u064a\u0631\u0627\u0646': 'world',
  '\u0645\u0642\u0627\u0644\u0627\u062a': 'politics',
  '\u0623\u062e\u0631 \u0643\u0644\u0627\u0645': 'world',
  '\u0631\u064a\u0627\u0636\u0629': 'sports',
  '\u0643\u062a\u0627\u0628\u0020\u0639\u0645\u0648\u0646': 'politics',
  '\u0e02\u0e48\u0e32\u0e27\u0e2d\u0e31\u0e1b\u0e40\u0e14\u0e15': 'world',
  '\u0e20\u0e39\u0e21\u0e34\u0e20\u0e32\u0e04': 'world',
};

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
  /\b(?:war|wars|conflict|ceasefire|truce|airstrike|airstrikes|missile|missiles|military|troops|invasion|drone|drones|shelling|rocket|rockets|gaza|hamas|hezbollah|hormuz|guerre|guerra|conflit|conflitto|krieg)\b|savaş|savas|สงคราม|전쟁|분쟁|충돌|戦争|紛争|战争|戰爭|冲突|衝突|война|конфликт|перемир|ракет|удар/iu;

const SOURCE_FALLBACKS: ReadonlyArray<{ pattern: RegExp; section: NewsSection }> = [
  { pattern: /people\.cn/i, section: 'world' },
  { pattern: /yahoo taiwan/i, section: 'world' },
  { pattern: /bbc news - sitemap index/i, section: 'world' },
  { pattern: /abema times/i, section: 'world' },
  { pattern: /^ansa\b|ansa - sitemap index/i, section: 'world' },
  { pattern: /^focus$/i, section: 'world' },
  { pattern: /times of india/i, section: 'world' },
  { pattern: /newsis|jiji press|yomiuri/i, section: 'world' },
  { pattern: /augsburger allgemeine|die zeit|rainews|hk01|sankei|kronen zeitung|merkur|blic|lenta|yonhap|infobae|milenio|marica|topky|the standard - news sitemap|daily mail/i, section: 'world' },
  { pattern: /oricon/i, section: 'entertainment' },
  { pattern: /kapanlagi/i, section: 'entertainment' },
  { pattern: /sports illustrated|espn|sponichi/i, section: 'sports' },
  { pattern: /btolat/i, section: 'sports' },
  { pattern: /space\.com/i, section: 'science' },
  { pattern: /rosario3 - home/i, section: 'world' },
  { pattern: /ettoday|mirror media|setn|nownews|tv3 lithuania|ukrainska pravda|ria novosti|tass/i, section: 'world' },
];

export function mapFeedCategoryToSection(value: string | null | undefined): NewsSection | null {
  const normalized = normalizeCategoryValue(value);
  if (!normalized) return null;

  const direct = CATEGORY_SECTION_MAP[normalized];
  if (direct) return direct;

  if (matchesCategoryPatterns(normalized, ['politic', 'politica', 'politique', 'politik', 'opinion', '정치', 'полит'])) {
    return 'politics';
  }

  if (matchesCategoryPatterns(normalized, ['conflict', 'war', 'military', 'defen', 'guerra', 'krieg', '전쟁', '분쟁', 'войн'])) {
    return 'conflicts';
  }

  if (matchesCategoryPatterns(normalized, [
    'business',
    'econom',
    'financ',
    'mercad',
    'negocio',
    'dinero',
    '재테크',
    '경제',
    '금융',
    '증권',
    '주식',
    '財經',
    '财经',
    '經濟',
    '经济',
  ])) {
    return 'business';
  }

  if (matchesCategoryPatterns(normalized, ['tech', 'technolog', 'digital', 'startup', 'ai', 'it', '科技', '기술'])) {
    return 'tech';
  }

  if (matchesCategoryPatterns(normalized, [
    'sport',
    'deport',
    'football',
    'basketball',
    'baseball',
    'tennis',
    'golf',
    'soccer',
    'college basketball',
    '스포츠',
    '축구',
    '야구',
    '농구',
    '배구',
    '골프',
    '運動',
    '体育',
    '體育',
    'กีฬา',
  ])) {
    return 'sports';
  }

  if (matchesCategoryPatterns(normalized, ['health', 'salud', 'medical', 'medicine', 'wellness', '건강', '의료', '健康'])) {
    return 'health';
  }

  if (matchesCategoryPatterns(normalized, [
    'entertain',
    'showbiz',
    'celeb',
    'movie',
    'film',
    'music',
    'tv',
    'cinema',
    'espect',
    'fama',
    '연예',
    '娛樂',
    '娱乐',
  ])) {
    return 'entertainment';
  }

  if (matchesCategoryPatterns(normalized, ['lifestyle', 'fashion', 'style', 'travel', 'food', 'recipe', '생활', '生活', '旅遊', '旅游'])) {
    return 'lifestyle';
  }

  if (matchesCategoryPatterns(normalized, ['arts', 'art', 'culture', 'cultura', '문화', '藝術', '艺术'])) {
    return 'arts';
  }

  if (matchesCategoryPatterns(normalized, ['science', 'research', 'space', 'astronomy', '과학', '科学'])) {
    return 'science';
  }

  if (matchesCategoryPatterns(normalized, ['climate', 'environment', 'weather', 'ambiente', '기후', '環境', '环境'])) {
    return 'climate';
  }

  if (matchesCategoryPatterns(normalized, [
    'world',
    'international',
    'mundo',
    'monde',
    'welt',
    'society',
    '사회',
    '국제',
    '國際',
    '国际',
    'education',
    'career',
    'general news',
  ])) {
    return 'world';
  }

  return null;
}

function matchesCategoryPatterns(normalized: string, patterns: string[]): boolean {
  return patterns.some((pattern) => normalized.includes(pattern.toLowerCase()));
}

export function buildArticleHintText(source: string, url: string): string {
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

export function classifySectionByStructuredHints(source: string, url: string): NewsSection {
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

export function classifySectionBySourceFallback(context: ArticleSectionContext): NewsSection {
  const source = (context.source || '').toLowerCase();
  const title = (context.title || '').toLowerCase();
  const url = (context.url || '').toLowerCase();
  const hintText = buildArticleHintText(context.source || '', context.url || '');
  const { hostname, pathname, search } = parseArticleUrl(context.url || '');

  if (looksLikeConflictSignal(`${context.title || ''} ${hintText}`)) {
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
    if (/\/(?:entame|anime)\//.test(pathname)) return 'entertainment';
    if (/\/(?:sumo|sports|mahjong|poker|shogi)\//.test(pathname)) return 'sports';
    if (/^\/articles(?:\/photo)?\/?$/u.test(pathname)) return 'world';
    if (/^\/(?:ko|en|de|fr|zh|zt)\/articles\//.test(pathname)) return 'world';
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
    if (/\/astrology\//.test(pathname) || /\/religion\//.test(pathname)) return 'lifestyle';
    if (/\/life-style\//.test(pathname)) return 'lifestyle';
    if (/\/(?:tv|web-series|etimes)\//.test(pathname)) return 'entertainment';
    if (/\/real-estate\//.test(pathname) || /\/auto\//.test(pathname)) return 'business';
    if (/\/(?:legal|times-special|education)\//.test(pathname)) return 'world';
    return 'world';
  }

  if (source.includes('informer')) {
    if (/^\/sport\//.test(pathname)) return 'sports';
    if (/^\/politika\//.test(pathname)) return 'politics';
    if (/^\/(?:dzet-set|zabava|tv)\//.test(pathname)) return 'entertainment';
    if (/^\/magazin\//.test(pathname)) return 'lifestyle';
    if (/^\/(?:planeta|hronika|drustvo)\//.test(pathname)) return 'world';
    return 'world';
  }

  if (source.includes('cumhuriyet')) {
    const titleSection = classifyCumhuriyetTitle(title);
    if (/^\/spor\//.test(pathname)) return 'sports';
    if (/^\/siyaset\//.test(pathname)) return 'politics';
    if (/^\/(?:ekonomi|otomotiv)\//.test(pathname)) return 'business';
    if (/^\/(?:bilim-teknoloji|teknoloji)\//.test(pathname)) return 'tech';
    if (/^\/magazin\//.test(pathname)) return 'entertainment';
    if (/^\/(?:yasam|gurme|astroloji|cumhuriyet-pazar)\//.test(pathname)) return 'lifestyle';
    if (/^\/(?:kultur-sanat|sanat|kitap|edebiyat)\//.test(pathname)) return 'arts';
    if (/^\/yazarlar\//.test(pathname)) return titleSection !== 'others' ? titleSection : 'politics';
    if (/^\/(?:dunya|turkiye|cumhuriyet-in-egesi)\//.test(pathname)) {
      return titleSection !== 'others' ? titleSection : 'world';
    }
    if (titleSection !== 'others') return titleSection;
    return 'world';
  }

  if (source.includes('vecernji list')) {
    const titleSection = classifyVecernjiTitle(title);
    if (/^\/sport\//.test(pathname)) return 'sports';
    if (/^\/showbiz\//.test(pathname)) return 'entertainment';
    if (/^\/lifestyle\//.test(pathname)) return 'lifestyle';
    if (/^\/kultura\//.test(pathname)) return 'arts';
    if (/^\/biznis\//.test(pathname)) return 'business';
    if (/^\/barkod\//.test(pathname)) return titleSection !== 'others' ? titleSection : 'lifestyle';
    if (/^\/(?:vijesti|zagreb)\//.test(pathname)) return titleSection !== 'others' ? titleSection : 'world';
    if (titleSection !== 'others') return titleSection;
    return 'world';
  }

  if (source.includes('le figaro')) {
    const titleSection = classifyLeFigaroTitle(title);
    if (/^\/sports\//.test(pathname)) return 'sports';
    if (/^\/(?:flash-eco|conjoncture|economie|entreprises)\//.test(pathname)) return 'business';
    if (/^\/elections\//.test(pathname)) return 'politics';
    if (/^\/(?:cinema|musique|television|people)\//.test(pathname)) return 'entertainment';
    if (/^\/(?:culture|livres|arts-expositions)\//.test(pathname)) return 'arts';
    if (/^\/(?:voyages|bons-plans|style|gastronomie|maison)\//.test(pathname)) return 'lifestyle';
    if (/^\/sante\//.test(pathname)) return 'health';
    if (/^\/tech\//.test(pathname)) return 'tech';
    if (/^\/vox\//.test(pathname)) return titleSection !== 'others' ? titleSection : 'politics';
    if (/^\/story\//.test(pathname)) return titleSection !== 'others' ? titleSection : 'world';
    if (/^\/(?:international|actualite-france|faits-divers|flash-actu|societe)\//.test(pathname)) {
      return titleSection !== 'others' ? titleSection : 'world';
    }
    if (titleSection !== 'others') return titleSection;
    return 'world';
  }

  if (source.includes('newsit')) {
    if (/^\/media\//.test(pathname)) return 'entertainment';
    if (/^\/athlitika\//.test(pathname)) return 'sports';
    if (/^\/oikonomia\//.test(pathname)) return 'business';
    if (/^\/politikh\//.test(pathname)) return 'politics';
    if (/^\/auto\//.test(pathname)) return 'business';
    if (/^\/(?:texnologia|technology)\//.test(pathname)) return 'tech';
    if (/^\/(?:ygeia|health)\//.test(pathname)) return 'health';
    if (/^\/(?:ellada|kosmos|koinonia)\//.test(pathname)) return 'world';
    return 'world';
  }

  if (source.includes('mehr news')) {
    const titleSection = classifyMehrTitle(title);
    if (/^\/(?:news|photo|film)\//.test(pathname)) return titleSection !== 'others' ? titleSection : 'world';
    if (titleSection !== 'others') return titleSection;
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

  if (source.includes('cnn brasil')) {
    if (/^\/esportes\//.test(pathname)) return 'sports';
    if (/^\/economia\//.test(pathname)) return 'business';
    if (/^\/entretenimento\//.test(pathname)) return 'entertainment';
    if (/^\/politica\//.test(pathname)) return 'politics';
    if (/^\/saude\//.test(pathname)) return 'health';
    if (/^\/tecnologia\//.test(pathname)) return 'tech';
    if (/^\/educacao\//.test(pathname)) return 'science';
    if (/^\/(?:nacional|internacional)\//.test(pathname)) return 'world';
    return 'world';
  }

  if (source.includes('tvbs')) {
    if (/^\/life\//.test(pathname)) return 'lifestyle';
    if (/^\/entertainment\//.test(pathname)) return 'entertainment';
    if (/^\/sports\//.test(pathname)) return 'sports';
    if (/^\/money\//.test(pathname)) return 'business';
    if (/^\/politics\//.test(pathname)) return 'politics';
    if (/^\/health\//.test(pathname)) return 'health';
    if (/^\/tech\//.test(pathname)) return 'tech';
    if (/^\/(?:world|china|local|focus|compilation)\//.test(pathname)) return 'world';
    return 'world';
  }

  if (source.includes('mirror - news sitemap')) {
    if (/^\/sport\//.test(pathname)) return 'sports';
    if (/^\/money\//.test(pathname)) return 'business';
    if (/^\/(?:tv|3am)\//.test(pathname)) return 'entertainment';
    if (/^\/lifestyle\//.test(pathname)) return 'lifestyle';
    if (/^\/news\/health\//.test(pathname)) return 'health';
    if (/^\/news\//.test(pathname)) return 'world';
    return 'world';
  }

  if (source.includes('independent.ie')) {
    if (/^\/sport\//.test(pathname)) return 'sports';
    if (/^\/(?:business|farming)\//.test(pathname)) return 'business';
    if (/^\/entertainment\//.test(pathname)) return 'entertainment';
    if (/^\/life\//.test(pathname)) return 'lifestyle';
    if (/^\/opinion\//.test(pathname)) return 'politics';
    if (/^\/(?:irish-news|regionals|world-news)\//.test(pathname)) return 'world';
    return 'world';
  }

  if (source.includes('telegraf')) {
    if (/^\/sport\//.test(pathname)) return 'sports';
    if (/^\/jetset\//.test(pathname)) return 'entertainment';
    if (/^\/(?:biznis|auto)\//.test(pathname)) return 'business';
    if (/^\/hi-tech\//.test(pathname)) return 'tech';
    if (/^\/kultura\//.test(pathname)) return 'arts';
    if (/^\/zanimljivosti\//.test(pathname)) return 'lifestyle';
    if (/^\/vesti\//.test(pathname)) return 'world';
    return 'world';
  }

  if (source.includes('the independent')) {
    if (/^\/(?:sport|bulletin\/sport)\//.test(pathname)) return 'sports';
    if (/^\/news\/business\//.test(pathname)) return 'business';
    if (/^\/(?:arts-entertainment|tv)\//.test(pathname)) return 'entertainment';
    if (/^\/(?:travel|extras\/indybest)\//.test(pathname)) return 'lifestyle';
    if (/^\/bulletin\/culture\//.test(pathname)) return 'arts';
    if (/^\/(?:news|bulletin\/news)\//.test(pathname)) return 'world';
    return 'world';
  }

  if (source.includes('hk01')) {
    if (/^\/(?:政情|01論壇)\//u.test(pathname)) return 'politics';
    if (/^\/(?:財經快訊|地產樓市)\//u.test(pathname)) return 'business';
    if (/^\/(?:即時體育)\//u.test(pathname)) return 'sports';
    if (/^\/(?:即時娛樂)\//u.test(pathname)) return 'entertainment';
    if (/^\/(?:熱爆話題|親子|旅遊|美食|開罐|扮靚)\//u.test(pathname)) return 'lifestyle';
    if (/^\/(?:即時國際|即時中國|社會新聞|突發|大國小事)\//u.test(pathname)) return 'world';
    return 'world';
  }

  if (/^ansa\b|ansa - sitemap index/.test(source)) {
    if (/\/sport\/|\/calcio\/|\/tennis\//.test(pathname)) return 'sports';
    if (/\/economia\/|\/canale_motori\//.test(pathname)) return 'business';
    if (/\/politica\//.test(pathname)) return 'politics';
    if (/\/canale_saluteebenessere\//.test(pathname)) return 'health';
    if (/\/canale_tecnologia\/|\/osservatorio_intelligenza_artificiale\//.test(pathname)) return 'tech';
    if (/\/canale_scienza\//.test(pathname)) return 'science';
    if (/\/canale_lifestyle\/|\/canale_viaggi\/|\/canale_terraegusto\//.test(pathname)) return 'lifestyle';
    if (/\/cultura\/|\/libri\//.test(pathname)) return 'arts';
    if (/\/spettacoli\//.test(pathname)) return 'entertainment';
    return 'world';
  }

  if (source.includes('welt')) {
    if (/\/wirtschaft\//.test(pathname)) return 'business';
    if (/\/politik\//.test(pathname)) return 'politics';
    if (/\/sport\//.test(pathname)) return 'sports';
    if (/\/kultur\//.test(pathname)) return 'arts';
    if (/\/reise\//.test(pathname)) return 'lifestyle';
    if (/\/gesundheit\//.test(pathname)) return 'health';
    if (/\/wissenschaft\//.test(pathname)) return 'science';
    return 'world';
  }

  if (source.includes('die zeit')) {
    if (/\/feuilleton\//.test(pathname)) return 'arts';
    if (/\/politik\//.test(pathname)) return 'politics';
    if (/\/wirtschaft\//.test(pathname) || /\/arbeit\//.test(pathname)) return 'business';
    if (/\/sport\//.test(pathname)) return 'sports';
    if (/\/wissen\//.test(pathname)) return 'science';
    if (/\/mobilitaet\/|\/reisen?\//.test(pathname)) return 'lifestyle';
    if (/\/gesundheit\//.test(pathname)) return 'health';
    return 'world';
  }

  if (source.includes('augsburger allgemeine')) {
    if (/\/sport\//.test(pathname)) return 'sports';
    if (/\/wirtschaft\/|\/geld-leben\//.test(pathname)) return 'business';
    if (/\/politik\//.test(pathname)) return 'politics';
    if (/\/reise\//.test(pathname)) return 'lifestyle';
    if (/\/gesundheit\//.test(pathname)) return 'health';
    if (/\/kultur\//.test(pathname)) return 'arts';
    return 'world';
  }

  if (source.includes('merkur')) {
    if (/\/sport\//.test(pathname)) return 'sports';
    if (/\/politik\//.test(pathname)) return 'politics';
    if (/\/wirtschaft\//.test(pathname)) return 'business';
    if (/\/wissen\//.test(pathname)) return 'science';
    if (/\/reise\/|\/leben\//.test(pathname)) return 'lifestyle';
    if (/\/boulevard\//.test(pathname)) return 'entertainment';
    if (/\/verbraucher\//.test(pathname)) return 'lifestyle';
    return 'world';
  }

  if (source.includes('proto thema')) {
    if (/\/economy\//.test(pathname)) return 'business';
    if (/\/sports\//.test(pathname)) return 'sports';
    if (/\/politics\//.test(pathname)) return 'politics';
    if (/\/culture\//.test(pathname)) return 'arts';
    if (/\/technology\//.test(pathname)) return 'tech';
    if (/\/ugeia\//.test(pathname)) return 'health';
    if (/\/life-style\/|\/marie-claire\/|\/travelgr\/|\/cantina\/|\/zoi\/|\/topetmou\/|\/travelling\//.test(pathname)) {
      return 'lifestyle';
    }
    if (/\/newsautogr\/|\/car-and-speed\//.test(pathname)) return 'business';
    return 'world';
  }

  if (source.includes('parapolitika')) {
    const titleSection = classifyParapolitikaTitle(title);
    if (/^\/sports\//.test(pathname)) return 'sports';
    if (/^\/(?:oikonomia|business|auto)\//.test(pathname)) return 'business';
    if (/^\/(?:lifestyle|zoi|gefsis|viral|animall|zodia)\//.test(pathname)) return 'lifestyle';
    if (/^\/media\//.test(pathname)) return 'entertainment';
    if (/^\/(?:politiki|parapolitika|stiles|autodioikisi-en-drasei)\//.test(pathname)) {
      return titleSection !== 'others' ? titleSection : 'politics';
    }
    if (/^\/(?:politismos|the-times)\//.test(pathname)) return 'arts';
    if (/^\/ugeia\//.test(pathname)) return 'health';
    if (/^\/stories\//.test(pathname)) return titleSection !== 'others' ? titleSection : 'world';
    if (/^\/(?:ellada|diethni)\//.test(pathname)) return titleSection !== 'others' ? titleSection : 'world';
    if (titleSection !== 'others') return titleSection;
    return 'world';
  }

  if (source.includes('the hindu')) {
    if (/\/entertainment\//.test(pathname)) return 'entertainment';
    if (/\/business\//.test(pathname)) return 'business';
    if (/\/sport\//.test(pathname)) return 'sports';
    if (/\/sci-tech\//.test(pathname)) return 'tech';
    if (/\/science\//.test(pathname) || /\/education\//.test(pathname)) return 'science';
    if (/\/life-and-style\//.test(pathname)) return 'lifestyle';
    if (/\/opinion\/|\/elections\//.test(pathname)) return 'politics';
    return 'world';
  }

  if (source.includes('24 chasa')) {
    if (/^\/sport\//.test(pathname)) return 'sports';
    if (/^\/biznes\//.test(pathname)) return 'business';
    if (/^\/mneniya\//.test(pathname)) return 'politics';
    if (/^\/zdrave\//.test(pathname)) return 'health';
    if (/^\/ozhivlenie\//.test(pathname)) return 'entertainment';
    if (/^\/spravochnik\//.test(pathname)) return 'lifestyle';
    if (/^\/(?:bulgaria|mezhdunarodni|proekti)\//.test(pathname)) return 'world';
    return 'world';
  }

  if (source === '24sata') {
    const titleSection = classify24sataTitle(title);
    if (/^\/sport\//.test(pathname)) return 'sports';
    if (/^\/show\//.test(pathname)) return 'entertainment';
    if (/^\/lifestyle\//.test(pathname)) return 'lifestyle';
    if (/^\/news\//.test(pathname)) return titleSection !== 'others' ? titleSection : 'world';
    if (titleSection !== 'others') return titleSection;
    return 'world';
  }

  if (source.includes('dhnet')) {
    if (/^\/sports?\//.test(pathname)) return 'sports';
    if (/^\/conso\//.test(pathname)) return 'business';
    if (/^\/people\//.test(pathname)) return 'entertainment';
    if (/^\/lifestyle\//.test(pathname)) return 'lifestyle';
    if (/^\/(?:actu|regions|dernieres-depeches)\//.test(pathname)) return 'world';
    return 'world';
  }

  if (source.includes('actu.fr')) {
    const titleSection = classifyActuTitle(title);
    if (/^\/(?:sport|sports|football|rugby|basket)\//.test(pathname)) return 'sports';
    if (/^\/economie\//.test(pathname)) return 'business';
    if (titleSection !== 'others') return titleSection;
    return 'world';
  }

  if (source.includes('24horas')) {
    if (/^\/deportes\//.test(pathname)) return 'sports';
    if (/^\/actualidad\/politica\//.test(pathname)) return 'politics';
    if (/^\/(?:actualidad\/economia|te-sirve\/(?:bonos|empleos|sii))\//.test(pathname)) return 'business';
    if (/^\/(?:tendencias\/espectaculos|tendencias\/ocio)\//.test(pathname)) return 'entertainment';
    if (/^\/tendencias\/tecnologia-y-ciencias\//.test(pathname)) return 'tech';
    if (/^\/(?:tendencias\/(?:recetas|turismo)|te-sirve)\//.test(pathname)) return 'lifestyle';
    if (/^\/(?:coronavirus|te-sirve\/salud)\//.test(pathname)) return 'health';
    if (/^\/el-tiempo\//.test(pathname)) return 'climate';
    if (/^\/(?:actualidad|internacional|regiones|programas|noticiarios|informe-especial|especial-8m)\//.test(pathname)) return 'world';
    return 'world';
  }

  if (source.includes('liberty times')) {
    if (hostname.startsWith('ent.')) return 'entertainment';
    if (hostname.startsWith('ec.') || hostname.startsWith('auto.')) return 'business';
    if (hostname.startsWith('3c.')) return 'tech';
    if (hostname.startsWith('sports.')) return 'sports';
    if (hostname.startsWith('food.') || hostname.startsWith('istyle.') || hostname.startsWith('playing.')) return 'lifestyle';
    if (hostname.startsWith('health.')) return 'health';
    if (/\/news\/life\//.test(pathname)) return 'lifestyle';
    if (/\/news\/business\//.test(pathname)) return 'business';
    if (/\/news\/politics\//.test(pathname)) return 'politics';
    if (/\/news\/world\//.test(pathname)) return 'world';
    return 'world';
  }

  if (source.includes('tass')) {
    if (/\/armiya-i-opk\//.test(pathname)) return 'conflicts';
    if (/\/politika\//.test(pathname)) return 'politics';
    if (/\/ekonomika|\/ekonomika-i-biznes|\/nedvizhimost\//.test(pathname)) return 'business';
    if (/\/sport\//.test(pathname)) return 'sports';
    if (/\/nauka|\/kosmos\//.test(pathname)) return 'science';
    if (/\/kultura\//.test(pathname)) return 'arts';
    return 'world';
  }

  if (source.includes('el correo')) {
    if (/^\/deportes\//.test(pathname)) return 'sports';
    if (/^\/economia\//.test(pathname)) return 'business';
    if (/^\/politica\//.test(pathname)) return 'politics';
    if (/^\/salud\//.test(pathname)) return 'health';
    if (/^\/tecnologia\//.test(pathname)) return 'tech';
    if (/^\/culturas\//.test(pathname)) return 'arts';
    if (/^\/(?:alava|bizkaia|sociedad|internacional|loteria)\//.test(pathname)) return 'world';
    return 'world';
  }

  if (source.includes('el periódico')) {
    if (/^\/es\/deportes\//.test(pathname)) return 'sports';
    if (/^\/es\/economia\//.test(pathname)) return 'business';
    if (/^\/es\/politica\//.test(pathname)) return 'politics';
    if (/^\/es\/sanidad\//.test(pathname)) return 'health';
    if (/^\/es\/tele\//.test(pathname)) return 'entertainment';
    if (/^\/es\/ocio-y-cultura\//.test(pathname)) return 'arts';
    if (/^\/es\/motor\//.test(pathname)) return 'business';
    if (/^\/es\/opinion\//.test(pathname)) return 'politics';
    if (/^\/es\/(?:sociedad|sucesos|barcelona|internacional)\//.test(pathname)) return 'world';
    return 'world';
  }

  if (source.includes('el español')) {
    if (/^\/deportes\//.test(pathname)) return 'sports';
    if (/^\/invertia\//.test(pathname)) return 'business';
    if (/^\/corazon\//.test(pathname)) return 'entertainment';
    if (/^\/(?:quincemil|treintayseis)\/vivir\//.test(pathname)) return 'lifestyle';
    if (/^\/(?:castilla-y-leon|eldigitalcastillalamancha|quincemil|treintayseis|aragon)\//.test(pathname)) return 'world';
    return 'world';
  }

  if (source.includes('in.gr')) {
    const datedSection = pathname.match(/^\/\d{4}\/\d{2}\/\d{2}\/([^/]+)\//)?.[1] || '';
    if (datedSection === 'sports' || /\/matchcenter\//.test(pathname)) return 'sports';
    if (datedSection === 'politics' || datedSection === 'apopsi' || datedSection === 'editorial') return 'politics';
    if (datedSection === 'economy') return 'business';
    if (datedSection === 'life' || datedSection === 'pet-stories') return 'lifestyle';
    if (datedSection === 'go-fun') return 'entertainment';
    if (datedSection === 'in-science') return 'science';
    if (datedSection === 'health') return 'health';
    if (datedSection === 'greece' || datedSection === 'world' || datedSection === 'plus' || datedSection === 'stories' || datedSection === 'english-edition') {
      return 'world';
    }
    return 'world';
  }

  if (source.includes('24tv.ua')) {
    if (/^\/military\//.test(pathname)) return 'conflicts';
    if (/^\/(?:economy|realestate24|agro24)\//.test(pathname)) return 'business';
    if (/^\/tech\//.test(pathname)) return 'tech';
    if (/^\/show24\//.test(pathname)) return 'entertainment';
    if (/^\/sport24\//.test(pathname)) return 'sports';
    if (/^\/health24\//.test(pathname)) return 'health';
    if (/^\/trends24\//.test(pathname)) return 'lifestyle';
    if (/^\/(?:geopolitics|zakordon24|education)\//.test(pathname)) return 'world';
    return 'world';
  }

  if (source.includes('adnkronos')) {
    if (/^\/immediapress\//.test(pathname)) return 'business';
    if (/^\/casa-europa\//.test(pathname)) return 'politics';
    if (/^\/(?:internazionale|rassegna-stampa|multimedia)\//.test(pathname)) return 'world';
    return 'world';
  }

  if (source.includes('the indian express')) {
    if (/^\/article\/sports\//.test(pathname)) return 'sports';
    if (/^\/article\/entertainment\//.test(pathname)) return 'entertainment';
    if (/^\/article\/lifestyle\//.test(pathname) || /^\/article\/horoscope\//.test(pathname)) return 'lifestyle';
    if (/^\/article\/technology\//.test(pathname)) return 'tech';
    if (/^\/article\/(?:opinion|political-pulse)\//.test(pathname)) return 'politics';
    if (/^\/article\/(?:cities|india|legal-news|education|trending)\//.test(pathname)) return 'world';
    return 'world';
  }

  if (source.includes('hindustan times')) {
    if (/^\/(?:sports|cricket)\//.test(pathname)) return 'sports';
    if (/^\/(?:entertainment|htcity)\//.test(pathname)) return 'entertainment';
    if (/^\/lifestyle\/health\//.test(pathname)) return 'health';
    if (/^\/lifestyle\//.test(pathname) || /^\/astrology\//.test(pathname)) return 'lifestyle';
    if (/^\/education\//.test(pathname)) return 'science';
    if (/^\/opinion\//.test(pathname)) return 'politics';
    if (/^\/(?:cities|world-news|trending|ht-insight)\//.test(pathname)) return 'world';
    return 'world';
  }

  if (source.includes('liputan6')) {
    if (/^\/bola\//.test(pathname)) return 'sports';
    if (/^\/(?:saham|crypto|otomotif)\//.test(pathname)) return 'business';
    if (/^\/tekno\//.test(pathname)) return 'tech';
    if (/^\/(?:on-off|showbiz)\//.test(pathname)) return 'entertainment';
    if (/^\/health\//.test(pathname)) return 'health';
    if (/^\/(?:hot|islami|citizen6|cek-fakta|disabilitas|opini|surabaya)\//.test(pathname)) return 'world';
    return 'world';
  }

  if (source.includes('suara')) {
    const titleSection = classifySuaraTitle(title);
    if (/^\/(?:bola|sport)\//.test(pathname)) return 'sports';
    if (/^\/(?:bisnis|bri|otomotif)\//.test(pathname)) return 'business';
    if (/^\/tekno\//.test(pathname)) return 'tech';
    if (/^\/health\//.test(pathname)) return 'health';
    if (/^\/lifestyle\//.test(pathname)) return 'lifestyle';
    if (/^\/entertainment\//.test(pathname)) return 'entertainment';
    if (/^\/(?:video|foto|opini|news)\//.test(pathname) && titleSection !== 'others') return titleSection;
    if (/^\/opini\//.test(pathname)) return 'politics';
    if (/^\/(?:video|foto|news)\//.test(pathname)) return 'world';
    if (titleSection !== 'others') return titleSection;
    return 'world';
  }

  if (source === 'record') {
    if (/^\/indica\/tecnologia\//.test(pathname)) return 'tech';
    return 'sports';
  }

  if (source.includes('kurir')) {
    if (/^\/sport\//.test(pathname)) return 'sports';
    if (/^\/biznis\//.test(pathname)) return 'business';
    if (/^\/techvision\//.test(pathname)) return 'tech';
    if (/^\/vesti\/politika\//.test(pathname)) return 'politics';
    if (/^\/(?:zabava|stars)\//.test(pathname)) return 'entertainment';
    if (/^\/(?:vesti|region|crna-hronika)\//.test(pathname)) return 'world';
    return 'world';
  }

  if (source === 'blic') {
    const titleSection = classifyBlicTitle(title);
    if (/^\/vesti\/politika\//.test(pathname) || /^\/komentar\//.test(pathname)) return 'politics';
    if (/^\/vesti\//.test(pathname)) return titleSection !== 'others' ? titleSection : 'world';
    if (/^\/biznis\/tech\//.test(pathname) || /^\/it\//.test(pathname)) return 'tech';
    if (/^\/biznis\//.test(pathname)) return 'business';
    if (/^\/zdravlje\//.test(pathname)) return 'health';
    if (/^\/(?:slobodno-vreme|good-life|like|sudbine)\//.test(pathname)) return 'lifestyle';
    if (/^\/kultura\//.test(pathname)) return 'arts';
    if (/^\/bbc\//.test(pathname)) return titleSection !== 'others' ? titleSection : 'world';
    if (/^\/print\//.test(pathname)) return 'world';
    if (titleSection !== 'others') return titleSection;
    return 'world';
  }

  if (source.includes('rtl nieuws')) {
    if (/^\/boulevard\//.test(pathname)) return 'entertainment';
    if (/^\/tv\/fragmenten\//.test(pathname)) return 'entertainment';
    if (/^\/nieuws\/sport\//.test(pathname)) return 'sports';
    if (/^\/nieuws\/economie\//.test(pathname)) return 'business';
    if (/^\/nieuws\/politiek\//.test(pathname)) return 'politics';
    if (/^\/nieuws\/weer\//.test(pathname)) return 'climate';
    if (/^\/(?:lifestyle|wonen)\//.test(pathname)) return 'lifestyle';
    if (/^\/nieuws\//.test(pathname)) return 'world';
    return 'world';
  }

  if (source.includes('okdiario')) {
    if (/^\/economia\//.test(pathname)) return 'business';
    if (/^\/deportes\//.test(pathname)) return 'sports';
    if (/^\/salud\//.test(pathname)) return 'health';
    if (/^\/tecnologia\//.test(pathname)) return 'tech';
    if (/^\/cool\//.test(pathname)) return 'lifestyle';
    if (/^\/(?:opinion|espana|politica)\//.test(pathname)) return 'politics';
    if (/^\/(?:actualidad|andalucia|internacional|madrid|comunidad-valenciana|cataluna)\//.test(pathname)) return 'world';
    return 'world';
  }

  if (source.includes('20 minutos')) {
    if (/^\/deportes\//.test(pathname)) return 'sports';
    if (/^\/(?:economia|lainformacion|motor)\//.test(pathname)) return 'business';
    if (/^\/tecnologia\//.test(pathname)) return 'tech';
    if (/^\/salud\//.test(pathname)) return 'health';
    if (/^\/ciencia\//.test(pathname)) return 'science';
    if (/^\/(?:gente|television|cinemania|musica|play|recreo)\//.test(pathname)) return 'entertainment';
    if (/^\/(?:mujer|viajes|viajar|gastronomia|consumoclaro|ofertas-descuentos|favorito|animaleros)\//.test(pathname)) {
      return 'lifestyle';
    }
    if (/^\/(?:cultura|libros)\//.test(pathname)) return 'arts';
    if (/^\/opinion\//.test(pathname)) return 'politics';
    if (/^\/(?:internacional|nacional|sociedad|espana|canarias|cataluna|madrid|andalucia|aragon|asturias|cantabria|castilla-y-leon|castilla-la-mancha|comunidad-valenciana|comunitat-valenciana|euskadi|extremadura|galicia|illes-balears|la-rioja|murcia|navarra|sevilla|catalunya|capaces|gonzoo)\//.test(pathname)) {
      return 'world';
    }
    return 'world';
  }

  if (source.includes('abc.es')) {
    if (/^\/deportes\//.test(pathname) || /\/deportes\//.test(pathname)) return 'sports';
    if (/^\/(?:economia|motor)\//.test(pathname) || /\/economia\//.test(pathname)) return 'business';
    if (/^\/(?:play|gente)\//.test(pathname)) return 'entertainment';
    if (/^\/cultura\//.test(pathname)) return 'arts';
    if (/^\/ciencia\//.test(pathname)) return 'science';
    if (/^\/salud\//.test(pathname) || /\/salud\//.test(pathname)) return 'health';
    if (/^\/(?:estilo|viajar|gurme|bienestar|queplan|favorito)\//.test(pathname)) return 'lifestyle';
    if (/^\/(?:opinion|elecciones)\//.test(pathname)) return 'politics';
    if (/^\/(?:espana|internacional|sevilla|madrid|andalucia|galicia|aragon|comunidad-valenciana|castilla-la-mancha|castilla-leon|cataluna|sociedad|loteria)\//.test(pathname)) {
      return 'world';
    }
    return 'world';
  }

  if (source.includes('sapo - article sitemap')) {
    const titleSection = classifySapoTitle(title);
    if (hostname.endsWith('tek.sapo.pt') || hostname.endsWith('pplware.sapo.pt')) return 'tech';
    if (
      hostname.endsWith('executivedigest.sapo.pt')
      || hostname.endsWith('jornaleconomico.sapo.pt')
      || hostname.endsWith('eco.sapo.pt')
      || hostname.endsWith('marketeer.sapo.pt')
      || hostname.endsWith('hrportugal.sapo.pt')
    ) {
      return 'business';
    }
    if (hostname.endsWith('travelmagg.sapo.pt')) return 'lifestyle';
    if (hostname.endsWith('magg.sapo.pt')) {
      if (/^\/(?:celebridades|televisao)\//.test(pathname)) return 'entertainment';
      if (/^\/saude\//.test(pathname)) return 'health';
      if (/^\/(?:beleza|moda|relacoes|comida|decoracao|cultura-lifestyle)\//.test(pathname)) return 'lifestyle';
      if (titleSection !== 'others') return titleSection;
      return 'lifestyle';
    }
    if (/^\/noticias\/ciencia\//.test(pathname)) return 'science';
    if (/^\/noticias\/negocios\//.test(pathname)) return 'business';
    if (/^\/opiniao\//.test(pathname)) return 'politics';
    if (/^\/mobile\//.test(pathname)) return 'tech';
    if (/^\/(?:celebridades|televisao)\//.test(pathname)) return 'entertainment';
    if (/^\/vida-saudavel\//.test(pathname)) return 'health';
    if (/^\/(?:moda|beleza|comida|hoteis|o-melhor-de-portugal|top10)\//.test(pathname)) return 'lifestyle';
    if (/^\/(?:noticias|artigo|grandes-cidades|multimedia)\//.test(pathname) && titleSection !== 'others') return titleSection;
    if (titleSection !== 'others') return titleSection;
    return 'world';
  }

  if (source.includes('eldiario.es')) {
    if (/^\/vertele\//.test(pathname)) return 'entertainment';
    if (/(?:^|\/)deportes\//.test(pathname)) return 'sports';
    if (/(?:^|\/)politica\//.test(pathname) || /^\/opinion\//.test(pathname)) return 'politics';
    if (/(?:^|\/)economia\//.test(pathname)) return 'business';
    if (/ciencia_y_medio_ambiente|medio_ambiente/.test(pathname)) return 'climate';
    if (/^\/cultura\//.test(pathname)) return 'arts';
    if (/^\/salud\//.test(pathname)) return 'health';
    if (/^\/tecnologia\//.test(pathname)) return 'tech';
    return 'world';
  }

  if (source.includes('la nación') || source.includes('la nacion')) {
    if (/^\/deportes\//.test(pathname)) return 'sports';
    if (/^\/(?:economia|propiedades)\//.test(pathname)) return 'business';
    if (/^\/espectaculos\//.test(pathname)) return 'entertainment';
    if (/^\/(?:lifestyle|horoscopo)\//.test(pathname)) return 'lifestyle';
    if (/^\/(?:politica|opinion)\//.test(pathname)) return 'politics';
    if (/^\/tecnologia\//.test(pathname)) return 'tech';
    if (/^\/(?:estados-unidos|el-mundo|sociedad|seguridad)\//.test(pathname)) return 'world';
    return 'others';
  }

  if (source.includes('la tercera')) {
    const titleSection = classifyClarinTitle(title);
    if (/^\/el-deportivo\//.test(pathname)) return 'sports';
    if (/^\/(?:pulso|mineria|mtonline|publirreportajes)\//.test(pathname)) return 'business';
    if (/^\/(?:politica|opinion|editorial|lt-board|cartas-al-director)\//.test(pathname)) return 'politics';
    if (/^\/culto\//.test(pathname)) return titleSection !== 'others' ? titleSection : 'arts';
    if (/^\/sustentabilidad\//.test(pathname)) return 'climate';
    if (/^\/(?:servicios|tendencias|paula|finde|lt-beneficios)\//.test(pathname)) {
      if (/temblor|sismo|epicentro|magnitud/i.test(title)) return 'climate';
      return titleSection !== 'others' ? titleSection : 'lifestyle';
    }
    if (/^\/(?:mundo|nacional|videos)\//.test(pathname)) return titleSection !== 'others' ? titleSection : 'world';
    if (titleSection !== 'others') return titleSection;
    return 'world';
  }

  if (source.includes('rt russian')) {
    if (/\/sport\//.test(pathname)) return 'sports';
    if (/\/business\//.test(pathname)) return 'business';
    if (/\/(?:russia|world|ussr|nopolitics)\//.test(pathname)) return 'world';
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

  if (source.includes('china news service')) {
    const titleSection = classifyChinaNewsTitle(title);
    if (/^\/gj\//.test(pathname)) return 'world';
    if (/^\/ty\//.test(pathname)) return 'sports';
    if (/^\/cul\//.test(pathname)) return 'arts';
    if (/^\/jk\//.test(pathname)) return 'health';
    if (/^\/edu\//.test(pathname)) return titleSection !== 'others' ? titleSection : 'science';
    if (/^\/txy\//.test(pathname)) return titleSection !== 'others' ? titleSection : 'arts';
    if (/^\/tp\//.test(pathname)) return titleSection !== 'others' ? titleSection : 'lifestyle';
    if (/^\/(?:sh|dwq|aseaninfo)\//.test(pathname)) return titleSection !== 'others' ? titleSection : 'world';
    if (titleSection !== 'others') return titleSection;
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

  if (source.startsWith('cna ') || source.includes('cna (central news agency)')) {
    const titleSection = classifyCnaTitle(title);
    if (hostname.startsWith('netzero.')) return 'climate';
    if (source.includes('運動')) return 'sports';
    if (source.includes('產經證券')) return 'business';
    if (source.includes('科技')) return 'tech';
    if (source.includes('娛樂')) return 'entertainment';
    if (source.includes('文化')) return 'arts';
    if (source.includes('政治')) return 'politics';
    if (source.includes('生活')) return titleSection !== 'others' ? titleSection : 'lifestyle';
    if (source.includes('國際') || source.includes('地方') || source.includes('社會') || source.includes('兩岸')) {
      return titleSection !== 'others' ? titleSection : 'world';
    }
    if (/^\/news\/aspt\//.test(pathname)) return 'sports';
    if (/^\/news\/afe\//.test(pathname)) return 'business';
    if (/^\/news\/ait\//.test(pathname)) return 'tech';
    if (/^\/news\/acul\//.test(pathname)) return 'arts';
    if (/^\/news\/amov\//.test(pathname)) return 'entertainment';
    if (/^\/news\/apol\//.test(pathname)) return 'politics';
    if (/^\/news\/aopl\//.test(pathname)) return titleSection !== 'others' ? titleSection : 'world';
    if (/^\/news\/(?:aipl|asoc|aloc|acn)\//.test(pathname)) return titleSection !== 'others' ? titleSection : 'world';
    if (/^\/news\/ahel\//.test(pathname)) return titleSection !== 'others' ? titleSection : 'lifestyle';
    if (titleSection !== 'others') return titleSection;
    return 'world';
  }

  if (source.includes('kbs news')) {
    const titleSection = classifyKbsTitle(title);
    if (titleSection !== 'others') return titleSection;
    return 'world';
  }

  if (source.includes('bnt news')) {
    const titleSection = classifyBntTitle(title);
    if (titleSection !== 'others') return titleSection;
    return 'world';
  }

  if (source.includes('15min')) {
    if (/^\/(?:sportas|24sek)\//.test(pathname)) return 'sports';
    if (/^\/verslas\//.test(pathname)) return 'business';
    if (/^\/sveikata\//.test(pathname)) return 'health';
    if (/^\/kultura\//.test(pathname)) return 'arts';
    if (/^\/zmones\//.test(pathname)) return 'entertainment';
    if (/^\/gyvenimas\//.test(pathname)) return 'lifestyle';
    if (/^\/mokslasit\//.test(pathname)) return 'science';
    return 'world';
  }

  if (source.includes('한국경제') || source.includes('hankyung')) {
    const titleSection = classifyHankyungTitle(title);
    if (titleSection !== 'others') return titleSection;
    return 'world';
  }

  if (source.includes('매일경제')) {
    if (/^\/news\/politics\//.test(pathname)) return 'politics';
    if (/^\/news\/(?:business|economy|stock|realestate)\//.test(pathname)) return 'business';
    if (/^\/news\/it\//.test(pathname)) return 'tech';
    if (/^\/news\/(?:sports|baseball|soccer|basketball|golf)\//.test(pathname)) return 'sports';
    if (/^\/news\/broadcasting-service\//.test(pathname)) return 'entertainment';
    if (/^\/news\/culture\//.test(pathname)) return 'arts';
    if (/^\/news\/(?:world|society|hot-issues|photos)\//.test(pathname)) return 'world';
    return 'world';
  }

  if (source.includes('daily express')) {
    if (/^\/sport\//.test(pathname)) return 'sports';
    if (/^\/finance\//.test(pathname)) return 'business';
    if (/^\/(?:showbiz|celebrity-news|entertainment)\//.test(pathname)) return 'entertainment';
    if (/^\/(?:life-style|travel)\//.test(pathname)) return 'lifestyle';
    if (/^\/news\//.test(pathname)) return 'world';
    return 'world';
  }

  if (source.includes('cnn türk') || hostname.endsWith('cnnturk.com')) {
    if (/^\/spor\//.test(pathname)) return 'sports';
    if (/^\/magazin\//.test(pathname)) return 'entertainment';
    if (/^\/kesfet\//.test(pathname)) return 'lifestyle';
    if (/^\/dunya\//.test(pathname)) return looksLikeConflictSignal(`${title} ${hintText}`) ? 'conflicts' : 'world';
    if (/^\/yerel-haberler\//.test(pathname)) {
      if (/kültür|kultur|sanat|miras|dans|festival|sergi|tiyatro|edebiyat|müze|muze|müzik|muzik/i.test(title)) return 'arts';
      if (/parti|belediye|başkan|baskan|vali|bakan|cumhurbaşkanı|cumhurbaskani|meclis|ziyaret/i.test(title)) return 'politics';
      if (/ekonomi|borsa|faiz|enflasyon|yatırım|yatirim|iş dünyası|is dunyasi/i.test(title)) return 'business';
      if (/sağlık|saglik|hastane|doktor|aşı|asi/i.test(title)) return 'health';
      if (/spor|futbol|basketbol|tenis|voleybol|güreş|gures|maç|mac/i.test(title)) return 'sports';
      return 'world';
    }
    if (/^\/(?:turkiye|yerel-haberler|video\/turkiye)\//.test(pathname)) return 'world';
    return 'world';
  }

  if (source.includes('hürriyet') || source.includes('hurriyet') || hostname.endsWith('hurriyet.com.tr')) {
    if (/^\/spor\//.test(pathname)) return 'sports';
    if (/^\/(?:kelebek|magazin)\//.test(pathname)) return 'entertainment';
    if (/^\/(?:yasam|seyahat|lezzetli-hayat)\//.test(pathname)) return 'lifestyle';
    if (/^\/ekonomi\//.test(pathname)) return 'business';
    if (/^\/teknoloji\//.test(pathname)) return 'tech';
    if (/^\/dunya\//.test(pathname)) return looksLikeConflictSignal(`${title} ${hintText}`) ? 'conflicts' : 'world';
    if (/^\/gundem\//.test(pathname)) {
      if (/kültür|kultur|sanat|miras|dans|festival|sergi|tiyatro|edebiyat|müze|muze|müzik|muzik/i.test(title)) return 'arts';
      if (/parti|başkan|baskan|bakan|cumhurbaşkanı|cumhurbaskani|meclis|ziyaret|milletvekili|vali/i.test(title)) return 'politics';
      if (/ekonomi|borsa|faiz|enflasyon|yatırım|yatirim/i.test(title)) return 'business';
      if (/sağlık|saglik|hastane|doktor|aşı|asi/i.test(title)) return 'health';
      return 'world';
    }
    return 'world';
  }

  if (source.includes('new york post')) {
    if (hostname.endsWith('pagesix.com') || hostname.endsWith('decider.com')) return 'entertainment';
    if (/^\/\d{4}\/\d{2}\/\d{2}\/(?:sports|betting)\//.test(pathname)) return 'sports';
    if (/^\/\d{4}\/\d{2}\/\d{2}\/business\//.test(pathname)) return 'business';
    if (/^\/\d{4}\/\d{2}\/\d{2}\/(?:fashion|shopping|living|astrology|parents)\//.test(pathname)) return 'lifestyle';
    if (/^\/\d{4}\/\d{2}\/\d{2}\/(?:metro|us-news|world-news|opinion)\//.test(pathname)) return 'world';
    return 'world';
  }

  if (source.includes('toronto star')) {
    if (/^\/sports\//.test(pathname)) return 'sports';
    if (/^\/business\//.test(pathname)) return 'business';
    if (/^\/politics\//.test(pathname) || /^\/opinion\//.test(pathname)) return 'politics';
    if (/^\/entertainment\//.test(pathname)) return 'entertainment';
    if (/^\/life\//.test(pathname)) return 'lifestyle';
    if (/^\/(?:news|globenewswire)\//.test(pathname)) return 'world';
    return 'world';
  }

  if (source.includes('ctv atlantic')) {
    const titleSection = classifyGlobalEnglishTitle(title);
    if (/^\/business\//.test(pathname)) return 'business';
    if (/^\/world\//.test(pathname)) return titleSection !== 'others' ? titleSection : 'world';
    if (/^\/(?:calgary|vancouver|toronto|ottawa|kitchener|edmonton|winnipeg|barrie|windsor|northern-ontario|montreal|london|regina|saskatoon|canada)\//.test(pathname)) {
      return titleSection !== 'others' ? titleSection : 'world';
    }
    if (/^\/atlantic\//.test(pathname)) return titleSection !== 'others' ? titleSection : 'world';
    if (titleSection !== 'others') return titleSection;
    return 'world';
  }

  if (source.includes('daily record')) {
    if (/^\/sport\//.test(pathname)) return 'sports';
    if (/^\/news\/politics\//.test(pathname)) return 'politics';
    if (/^\/news\/health\//.test(pathname)) return 'health';
    if (/^\/lifestyle\/(?:money|property|motoring)\//.test(pathname)) return 'business';
    if (/^\/entertainment\//.test(pathname)) return 'entertainment';
    if (/^\/lifestyle\/(?:fashion-beauty|travel|food-drink)\//.test(pathname)) return 'lifestyle';
    if (/^\/(?:news|in-your-area)\//.test(pathname)) return 'world';
    if (/^\/scotland-now\//.test(pathname)) return 'lifestyle';
    return 'world';
  }

  if (source.includes('expressen')) {
    if (/^\/sport\//.test(pathname)) return 'sports';
    if (/^\/nyheter\/politik\//.test(pathname) || /^\/kronikorer\//.test(pathname)) return 'politics';
    if (/^\/nyheter\/vader\//.test(pathname)) return 'climate';
    if (/^\/livsstil\/halsa\//.test(pathname)) return 'health';
    if (/^\/(?:noje|nyheter\/kungligt)\//.test(pathname)) return 'entertainment';
    if (/^\/livsstil\//.test(pathname)) return 'lifestyle';
    if (/^\/tv\//.test(pathname)) return 'world';
    if (/^\/(?:nyheter|podcast)\//.test(pathname)) return 'world';
    return 'world';
  }

  if (source.includes('newsweek')) {
    const titleSection = classifyGlobalEnglishTitle(title);
    if (/^\/sports\//.test(pathname)) return 'sports';
    if (/^\/entertainment\//.test(pathname)) return 'entertainment';
    if (/^\/opinion\//.test(pathname)) return 'politics';
    if (/^\/(?:business|money)\//.test(pathname)) return 'business';
    if (/^\/health\//.test(pathname)) return 'health';
    if (/^\/tech(?:nology)?\//.test(pathname)) return 'tech';
    if (/^\/culture\//.test(pathname)) return 'arts';
    if (/^\/travel\//.test(pathname)) return 'lifestyle';
    if (/^\/[^/]+$/.test(pathname)) return titleSection !== 'others' ? titleSection : 'world';
    if (titleSection !== 'others') return titleSection;
    return 'world';
  }

  if (source.includes('la stampa')) {
    const titleSection = classifyLaStampaTitle(title);
    if (/^\/sport\//.test(pathname)) return 'sports';
    if (/^\/(?:economia|motori)\//.test(pathname)) return 'business';
    if (/^\/politica\//.test(pathname)) return 'politics';
    if (/^\/salute\//.test(pathname)) return 'health';
    if (/^\/tecnologia\//.test(pathname)) return 'tech';
    if (/^\/spettacoli\//.test(pathname)) return 'entertainment';
    if (/^\/cultura\//.test(pathname)) return 'arts';
    if (/^\/torinosette\//.test(pathname)) return titleSection !== 'others' ? titleSection : 'lifestyle';
    if (/^\/(?:esteri|cronaca|torino|imperia-sanremo|verbano-cusio-ossola|alessandria|novara|savona|cuneo|asti|vercelli|biella|aosta)\//.test(pathname)) {
      return titleSection !== 'others' ? titleSection : 'world';
    }
    if (titleSection !== 'others') return titleSection;
    return 'world';
  }

  if (source.includes('birmingham live') || source.includes('liverpool echo') || source.includes('manchester evening news')) {
    if (/^\/sport\//.test(pathname)) return 'sports';
    if (/^\/motoring\//.test(pathname)) return 'business';
    if (/^\/travel\//.test(pathname)) return 'lifestyle';
    if (/^\/news\/(?:cost-of-living|money|property)\//.test(pathname)) return 'business';
    if (/^\/news\/health\//.test(pathname)) return 'health';
    if (/^\/news\/showbiz-tv\//.test(pathname)) return 'entertainment';
    if (/^\/whats-on\/(?:shopping|family-kids-news|food-drink-news)\//.test(pathname)) return 'lifestyle';
    if (/^\/whats-on\/(?:whats-on-news|peaky-blinders|film-news|music-nightlife-news)\//.test(pathname)) return 'entertainment';
    if (/^\/news\/news-opinion\//.test(pathname)) return 'politics';
    if (/^\/lifestyle\//.test(pathname) || /^\/(?:subscriber-rewards|black-country|whatsapp-community)\//.test(pathname)) return 'lifestyle';
    if (/^\/news\//.test(pathname)) return 'world';
    return 'world';
  }

  if (source.includes('index.hr')) {
    if (/^\/sport\//.test(pathname)) return 'sports';
    if (/^\/(?:shopping|auto)\//.test(pathname)) return 'business';
    if (/^\/(?:magazin|showbiz)\//.test(pathname)) return 'entertainment';
    if (/^\/fit\//.test(pathname)) return 'health';
    if (/^\/(?:chill|ljubimci|mame|horoskop|food)\//.test(pathname)) return 'lifestyle';
    if (/^\/vijesti\//.test(pathname)) return 'world';
    return 'world';
  }

  if (source.includes('index.hu')) {
    if (/^\/(?:sport|bajnokokligaja)\//.test(pathname)) return 'sports';
    if (/^\/gazdasag\//.test(pathname)) return 'business';
    if (/^\/(?:velemeny|belfold\/csatater)\//.test(pathname)) return 'politics';
    if (/^\/(?:techtud|tech)\//.test(pathname)) return 'tech';
    if (/^\/tudomany\//.test(pathname)) return 'science';
    if (/^\/kultur\//.test(pathname)) return 'arts';
    if (/^\/fomo\//.test(pathname)) return 'lifestyle';
    if (/^\/(?:belfold|kulfold|bcs)\//.test(pathname)) return 'world';
    return 'world';
  }

  if (source.includes('republika')) {
    const titleSection = classifyRepublikaTitle(title);
    if (hostname.startsWith('news.')) return titleSection !== 'others' ? titleSection : 'world';
    if (hostname.startsWith('visual.')) return titleSection !== 'others' ? titleSection : 'world';
    if (hostname.startsWith('khazanah.')) return titleSection !== 'others' ? titleSection : 'lifestyle';
    if (/^\/sport\//.test(pathname)) return 'sports';
    if (/^\/vesti\/politika\//.test(pathname)) return 'politics';
    if (/^\/biznis\//.test(pathname)) return 'business';
    if (/^\/vesti\/vremenska-prognoza\//.test(pathname)) return 'climate';
    if (/^\/putovanja\//.test(pathname)) return 'lifestyle';
    if (/^\/zabava\/kultura\//.test(pathname)) return 'arts';
    if (/^\/(?:zabava|elita-9-farmeri)\//.test(pathname)) return 'entertainment';
    if (/^\/(?:hronika|svet|vesti)\//.test(pathname)) return 'world';
    if (titleSection !== 'others') return titleSection;
    return 'world';
  }

  if (source.includes('o globo')) {
    if (/^\/esportes\//.test(pathname)) return 'sports';
    if (/^\/(?:economia|patrocinado|conteudo-de-marca)\//.test(pathname)) return 'business';
    if (/^\/economia\/tecnologia\//.test(pathname)) return 'tech';
    if (/^\/saude\//.test(pathname)) return 'health';
    if (/^\/(?:politica|opiniao)\//.test(pathname)) return 'politics';
    if (/^\/blogs\/(?:malu-gaspar|miriam-leitao|bernardo-mello-franco|vera-magalhaes|guga-chacra|merval-pereira)\//.test(pathname)) {
      return 'politics';
    }
    if (/^\/(?:cultura|rioshow)\//.test(pathname)) return 'arts';
    if (/^\/(?:play|ela\/gente|clube-o-globo\/entretenimento)\//.test(pathname)) return 'entertainment';
    if (/^\/(?:ela|boa-viagem)\//.test(pathname)) return 'lifestyle';
    if (/^\/(?:mundo\/clima-e-ciencia|blogs\/clima-extremo|brasil\/meio-ambiente)\//.test(pathname)) return 'climate';
    if (/^\/(?:mundo|rio|brasil|fato-ou-fake|o-globo-por-dentro|blogs)\//.test(pathname)) return 'world';
    return 'world';
  }

  if (source.includes('estadão') || source.includes('estadao')) {
    const titleSection = classifyEstadaoTitle(title);
    if (/^\/esportes\//.test(pathname)) return 'sports';
    if (/^\/(?:economia|jornal-do-carro)\//.test(pathname)) return 'business';
    if (/^\/(?:politica|opiniao)\//.test(pathname)) return 'politics';
    if (/^\/ciencia\//.test(pathname)) return 'science';
    if (/^\/paladar\//.test(pathname)) return 'lifestyle';
    if (/^\/emais\/(?:tv|gente)\//.test(pathname)) return 'entertainment';
    if (/^\/emais\//.test(pathname)) return 'lifestyle';
    if (/^\/cultura\/(?:cinema|musica|series|televisao)\//.test(pathname)) return 'entertainment';
    if (/^\/cultura\//.test(pathname)) return 'arts';
    if (/^\/web-stories\/paladar\//.test(pathname)) return 'lifestyle';
    if (/^\/web-stories\/saude\//.test(pathname)) return 'health';
    if (/^\/(?:eldorado|podcasts|web-stories)\//.test(pathname) && titleSection !== 'others') return titleSection;
    if (/^\/(?:brasil|sao-paulo|educacao|acervo|eldorado|podcasts|web-stories)\//.test(pathname)) return 'world';
    if (titleSection !== 'others') return titleSection;
    return 'world';
  }

  if (source.includes('valor econômico') || source.includes('valor economico')) {
    if (/^\/politica\//.test(pathname) || /^\/opiniao\//.test(pathname)) return 'politics';
    if (/^\/(?:financas\/criptomoedas|empresas\/inteligencia-artificial)\//.test(pathname)) return 'tech';
    if (/^\/(?:empresas|financas|patrocinado|conteudo-de-marca|carreira|legislacao)\//.test(pathname)) return 'business';
    if (/^\/(?:brasil|mundo|eu-e|impresso)\//.test(pathname)) return 'world';
    return 'business';
  }

  if (source.includes('polsatnews')) {
    const titleSection = classifyPolsatTitle(title);
    if (/^\/ciekawostki\//.test(pathname)) return 'lifestyle';
    if (/^\/(?:graffiti|gosc-wydarzen|wideo-program)\//.test(pathname)) {
      return titleSection !== 'others' ? titleSection : 'politics';
    }
    if (/^\/(?:wideo|wiadomosc)\//.test(pathname)) {
      return titleSection !== 'others' ? titleSection : 'world';
    }
    return titleSection !== 'others' ? titleSection : 'world';
  }

  if (source.includes('tv3 lithuania')) {
    const titleSection = classifyTv3Title(title);
    if (/^\/naujiena\/sportas\//.test(pathname)) return 'sports';
    if (/^\/naujiena\/verslas\//.test(pathname) || /^\/naujiena\/automanas\//.test(pathname)) return 'business';
    if (/^\/naujiena\/zmones\//.test(pathname)) return 'entertainment';
    if (/^\/naujiena\/gyvenimas\//.test(pathname)) return 'lifestyle';
    if (/^\/naujiena\/mokslasirit\//.test(pathname)) return 'science';
    if (/^\/naujiena\/\d+\//.test(pathname) && titleSection !== 'others') return titleSection;
    if (/^\/naujiena\/(?:lietuva|uzsienis|video)\//.test(pathname)) return 'world';
    if (titleSection !== 'others') return titleSection;
    return 'world';
  }

  if (source.includes('delfi lithuania')) {
    const titleSection = classifyDelfiTitle(title);
    if (/^\/(?:krepsinis|sportas)\//.test(pathname)) return 'sports';
    if (/^\/(?:verslas|verslo-poziuris|auto|agro)\//.test(pathname)) return 'business';
    if (/^\/sveikata\//.test(pathname)) return 'health';
    if (/^\/(?:veidai|m360)\//.test(pathname)) return 'entertainment';
    if (/^\/(?:gyvenimas|moterys|seima|maistas|bustas|keliones|letena)\//.test(pathname)) return 'lifestyle';
    if (/^\/mokslas\//.test(pathname)) return 'science';
    if (/^\/saugu\//.test(pathname)) return titleSection !== 'others' ? titleSection : 'tech';
    if (/^\/(?:grynas|orai)\//.test(pathname)) return 'climate';
    if (/^\/kultura\//.test(pathname)) return 'arts';
    if (/^\/naujienos\/politika\//.test(pathname) || /^\/fone\/politika\//.test(pathname)) return 'politics';
    if (/^\/(?:naujienos|news)\//.test(pathname)) return titleSection !== 'others' ? titleSection : 'world';
    if (/^\/projektai\//.test(pathname)) return titleSection !== 'others' ? titleSection : 'lifestyle';
    if (/^\/fone\//.test(pathname)) return titleSection !== 'others' ? titleSection : 'world';
    if (titleSection !== 'others') return titleSection;
    return 'world';
  }

  if (source === 'n1') {
    if (/^\/biznis\//.test(pathname)) return 'business';
    if (/^\/magazin\/showbiz\//.test(pathname)) return 'entertainment';
    if (/^\/magazin\/zdravlje\//.test(pathname)) return 'health';
    if (/^\/magazin\/scitech\//.test(pathname)) return 'tech';
    if (/^\/magazin\/auto\//.test(pathname)) return 'business';
    if (/^\/magazin\/(?:lifestyle|ljubimci|cooking)\//.test(pathname)) return 'lifestyle';
    if (/^\/(?:english\/news|video)\//.test(pathname)) return 'world';
    return 'world';
  }

  if (source.includes('sabah')) {
    if (/^\/spor\//.test(pathname)) return 'sports';
    if (/^\/finans\//.test(pathname)) return 'business';
    if (/^\/teknokulis\//.test(pathname)) return 'tech';
    if (/^\/trend\//.test(pathname) || /^\/(?:video|fotohaber)\/yasam\//.test(pathname)) return 'lifestyle';
    if (/^\/yazarlar\//.test(pathname)) return 'politics';
    if (/^\/(?:gundem|resmi-ilan)\//.test(pathname)) return 'world';
    return 'world';
  }

  if (source.includes('aftonbladet')) {
    if (/^\/sportbladet\//.test(pathname) || /^\/senastenytt\/ttsport\//.test(pathname)) return 'sports';
    if (/^\/minekonomi\//.test(pathname)) return 'business';
    if (/^\/nojesbladet\//.test(pathname)) return 'entertainment';
    if (/^\/(?:debatt|ledare)\//.test(pathname)) return 'politics';
    if (/^\/nyheter\//.test(pathname)) return 'world';
    return 'world';
  }

  if (source.includes('donga ilbo')) {
    if (/^\/news\/sports\//i.test(pathname)) return 'sports';
    if (/^\/news\/economy\//i.test(pathname)) return 'business';
    if (/^\/news\/politics\//i.test(pathname) || /^\/news\/opinion\//i.test(pathname)) return 'politics';
    if (/^\/news\/entertainment\//i.test(pathname)) return 'entertainment';
    if (/^\/news\/culture\//i.test(pathname)) return 'arts';
    if (/^\/news\/it\//i.test(pathname)) return 'tech';
    if (/^\/news\/(?:society|inter|people)\//i.test(pathname)) return 'world';
    return 'world';
  }

  if (source.includes('ukrainska pravda')) {
    const titleSection = classifyUkrainskaPravdaTitle(title);
    if (titleSection !== 'others') return titleSection;
    return 'world';
  }

  if (source.includes('nau.ch')) {
    if (/^\/sport\//.test(pathname)) return 'sports';
    if (/^\/news\/wirtschaft\//.test(pathname)) return 'business';
    if (/^\/politik\//.test(pathname)) return 'politics';
    if (/^\/people\//.test(pathname)) return 'entertainment';
    if (/^\/(?:ort|news\/(?:schweiz|europa|ausland|amerika))\//.test(pathname)) return 'world';
    return 'world';
  }

  if (source.includes('ria novosti') || source.includes('rossiyskaya gazeta') || source === 'lenta' || source.includes('izvestia')) {
    const titleSection = classifyRussianNewsTitle(title);
    if (titleSection !== 'others') return titleSection;
    return 'world';
  }

  if (source === 'nv') {
    if (hostname.startsWith('biz.')) return 'business';
    if (hostname.startsWith('sport.')) return 'sports';
    if (hostname.startsWith('techno.')) return 'tech';
    if (hostname.startsWith('life.')) {
      if (/\/znamenitosti\//.test(pathname)) return 'entertainment';
      return 'lifestyle';
    }
    if (/^\/opinion\//.test(pathname)) return 'politics';
    if (/^\/(?:food|lifestyle)\//.test(pathname)) return 'lifestyle';
    if (/^\/kultura\//.test(pathname)) return 'arts';
    if (/^\/auto\//.test(pathname)) return 'business';
    if (/^\/(?:world|ukraine|ukr|socium|blogs|kyiv)\//.test(pathname)) return 'world';
    return 'world';
  }

  if (source.includes('n-tv')) {
    if (/^\/sport\//.test(pathname)) return 'sports';
    if (/^\/(?:wirtschaft|auto)\//.test(pathname)) return 'business';
    if (/^\/politik\//.test(pathname)) return 'politics';
    if (/^\/wissen\//.test(pathname)) return 'science';
    if (/^\/unterhaltung\//.test(pathname)) return 'entertainment';
    if (/^\/ratgeber\//.test(pathname)) return 'lifestyle';
    if (/^\/(?:panorama|regionales)\//.test(pathname)) return 'world';
    return 'world';
  }

  if (source.includes('rainews')) {
    if (/^\/sport\//.test(pathname)) return 'sports';
    if (/^\/economia\//.test(pathname)) return 'business';
    if (/^\/politica\//.test(pathname)) return 'politics';
    if (/^\/salute\//.test(pathname)) return 'health';
    if (/^\/cultura\//.test(pathname)) return 'arts';
    if (/^\/scienza\//.test(pathname)) return 'science';
    if (/^\/(?:tgr|video|articoli)\//.test(pathname)) return 'world';
    return 'world';
  }

  if (source.includes('ntv')) {
    if (/\/category\/sports\//.test(pathname) || /\/sporskor\//.test(pathname)) return 'sports';
    if (/\/category\/economy\//.test(pathname) || /\/ntvpara\//.test(pathname)) return 'business';
    if (/\/category\/politics\//.test(pathname)) return 'politics';
    if (/\/category\/culture\//.test(pathname)) return 'arts';
    if (/\/category\/international\//.test(pathname) || /\/dunya\//.test(pathname)) return 'world';
    if (/\/category\/society\//.test(pathname) || /\/yerel-haberler\//.test(pathname) || /\/turkiye\//.test(pathname)) return 'world';
    if (/\/saglik\//.test(pathname)) return 'health';
    if (/\/yasam\//.test(pathname)) return 'lifestyle';
    if (/\/otomobil\//.test(pathname)) return 'business';
    return 'world';
  }

  if (source.includes('ekstra bladet')) {
    if (/^\/sport\//.test(pathname)) return 'sports';
    if (/^\/(?:nyheder\/politik|nyheder\/lederen)\//.test(pathname)) return 'politics';
    if (/^\/forbrug\/teknologi\//.test(pathname)) return 'tech';
    if (/^\/forbrug\/sundhed\//.test(pathname)) return 'health';
    if (/^\/nyheder\/videnskab\//.test(pathname)) return 'science';
    if (/^\/(?:underholdning|musik)\//.test(pathname)) return 'entertainment';
    if (/^\/(?:forbrug|bil)\//.test(pathname)) return 'business';
    if (/^\/(?:nyheder|krimi|play)\//.test(pathname)) return 'world';
    return 'world';
  }

  if (source.includes('india today')) {
    if (/^\/sports\//.test(pathname)) return 'sports';
    if (/^\/(?:business|auto|jobs)\//.test(pathname)) return 'business';
    if (/^\/(?:technology|science)\//.test(pathname)) return 'tech';
    if (/^\/health\//.test(pathname)) return 'health';
    if (/^\/(?:movies|entertainment)\//.test(pathname)) return 'entertainment';
    if (/^\/(?:horoscopes|lifestyle|magazine)\//.test(pathname)) return 'lifestyle';
    if (/^\/(?:elections|india-today-insight)\//.test(pathname)) return 'politics';
    if (/^\/(?:india|world|trending-news|information|education-today|cities|diu)\//.test(pathname)) return 'world';
    return 'world';
  }

  if (source.includes('european pravda')) {
    const titleSection = classifyEuropeanPravdaTitle(title);
    if (titleSection !== 'others') return titleSection;
    if (/^\/(?:rus\/)?(?:news|articles|experts|interview)\//.test(pathname)) return 'politics';
    return 'politics';
  }

  if (source.includes('dagens industri')) {
    if (/^\/(?:ledare|debatt)\//.test(pathname)) return 'politics';
    if (/^\/digital\//.test(pathname)) return 'tech';
    return 'business';
  }

  if (source.includes('olé') || source === 'ole') {
    if (/^\/esports\//.test(pathname)) return 'tech';
    return 'sports';
  }

  if (source.includes('kathimerini')) {
    if (/^\/athletics\//.test(pathname)) return 'sports';
    if (/^\/culture\//.test(pathname)) return 'arts';
    if (/^\/(?:politics|opinion)\//.test(pathname)) return 'politics';
    if (/^\/(?:economy|business)\//.test(pathname)) return 'business';
    if (/^\/science\//.test(pathname)) return 'science';
    if (/^\/health\//.test(pathname)) return 'health';
    if (/^\/eortologio\//.test(pathname) || /^\/k\/(?:gastronomos|travel)\//.test(pathname)) return 'lifestyle';
    return 'world';
  }

  if (source.includes('cgtn')) {
    const titleSection = classifyGlobalEnglishTitle(title);
    if (titleSection !== 'others') return titleSection;
    return 'world';
  }

  if (source === 'newsbeast') {
    const titleSection = classifyNewsbeastTitle(title);
    if (/^\/sports\//.test(pathname)) return 'sports';
    if (/^\/financial\//.test(pathname)) return 'business';
    if (/^\/politiki\//.test(pathname)) return 'politics';
    if (/^\/health\//.test(pathname)) return 'health';
    if (/^\/technology\//.test(pathname)) return 'tech';
    if (/^\/(?:media|entertainment)\//.test(pathname)) return 'entertainment';
    if (/^\/(?:woman|lifestyle|travel|geuseis|zwdia)\//.test(pathname)) return 'lifestyle';
    if (/^\/(?:world|greece|society)\//.test(pathname)) return titleSection !== 'others' ? titleSection : 'world';
    if (titleSection !== 'others') return titleSection;
    return 'world';
  }

  if (source.includes('naftemporiki')) {
    const titleSection = classifyNaftemporikiTitle(title);
    if (/^\/sports\//.test(pathname)) return 'sports';
    if (/^\/(?:finance|business)\//.test(pathname)) return 'business';
    if (/^\/politics\//.test(pathname)) return 'politics';
    if (/^\/technology\//.test(pathname)) return 'tech';
    if (/^\/health\//.test(pathname)) return 'health';
    if (/^\/green\//.test(pathname)) return 'climate';
    if (/^\/auto\//.test(pathname)) return 'business';
    if (/^\/culture\/(?:cinema|music)\//.test(pathname)) return 'entertainment';
    if (/^\/culture\//.test(pathname)) return 'arts';
    if (/^\/(?:kosmos|society)\//.test(pathname)) return titleSection !== 'others' ? titleSection : 'world';
    if (/^\/afieromata\//.test(pathname)) return titleSection !== 'others' ? titleSection : 'arts';
    if (titleSection !== 'others') return titleSection;
    return 'world';
  }

  if (source.includes('radio sweden')) {
    const titleSection = classifyRadioSwedenTitle(title);
    if (titleSection !== 'others') return titleSection;
    return 'world';
  }

  if (source.includes("l'avenir")) {
    const titleSection = classifyLaLibreTitle(title);
    if (/^\/sports\//.test(pathname)) return 'sports';
    if (/^\/lifestyle\//.test(pathname)) return 'lifestyle';
    if (/^\/actu\/conso\//.test(pathname)) return 'business';
    if (/^\/actu\//.test(pathname)) return titleSection !== 'others' ? titleSection : 'world';
    if (/^\/fil-info\/regions\//.test(pathname)) return titleSection !== 'others' ? titleSection : 'world';
    if (/^\/regions\//.test(pathname)) return titleSection !== 'others' ? titleSection : 'world';
    if (titleSection !== 'others') return titleSection;
    return 'world';
  }

  if (source.includes('adresseavisen')) {
    const titleSection = classifyAdresseavisenTitle(title);
    if (/^\/sport\//.test(pathname)) return 'sports';
    if (/^\/okonomi\//.test(pathname)) return 'business';
    if (/^\/(?:politikk|debatt)\//.test(pathname)) return 'politics';
    if (/^\/kultur\//.test(pathname)) return 'arts';
    if (/^\/forbruker\//.test(pathname)) return 'lifestyle';
    if (/^\/(?:nyheter|nyhetsstudio|video|mn24|trd.by)\//.test(pathname)) return titleSection !== 'others' ? titleSection : 'world';
    if (/^\/magasin\//.test(pathname)) return titleSection !== 'others' ? titleSection : 'lifestyle';
    if (titleSection !== 'others') return titleSection;
    return 'world';
  }

  if (source.includes('la libre')) {
    const titleSection = classifyLaLibreTitle(title);
    if (titleSection !== 'others') return titleSection;
    return 'world';
  }

  if (source.includes('focus')) {
    const titleSection = classifyFocusTitle(title);
    if (/^\/politik\//.test(pathname)) return 'politics';
    if (/^\/sport\//.test(pathname)) return 'sports';
    if (/^\/(?:finanzen|auto)\//.test(pathname)) return 'business';
    if (/^\/gesundheit\//.test(pathname)) return 'health';
    if (/^\/kultur\/(?:kino-tv|stars|royals|musik)\//.test(pathname)) return 'entertainment';
    if (/^\/kultur\//.test(pathname)) return 'arts';
    if (/^\/(?:digital|wissen\/technik)\//.test(pathname)) return 'tech';
    if (/^\/(?:wissen\/(?:natur|weltraum|mensch)|wissen)\//.test(pathname)) return 'science';
    if (/^\/earth\//.test(pathname)) return 'climate';
    if (/^\/(?:reisen|familie)\//.test(pathname)) return 'lifestyle';
    if (/^\/die-debatte\//.test(pathname) && titleSection !== 'others') return titleSection;
    if (/^\/(?:panorama|regional|tagesthema)\//.test(pathname)) return 'world';
    if (titleSection !== 'others') return titleSection;
    return 'world';
  }

  if (source.includes('bfm tv')) {
    const titleSection = classifyBfmtvTitle(title);
    if (hostname.includes('rmcsport.bfmtv.com')) return 'sports';
    if (hostname.includes('rmc.bfmtv.com')) {
      if (/^\/actualites\/politique\//.test(pathname)) return 'politics';
      if (/^\/actualites\/economie\//.test(pathname) || /^\/conso\//.test(pathname)) return 'business';
      if (/^\/replay-emissions\//.test(pathname) && titleSection !== 'others') return titleSection;
      if (titleSection !== 'others') return titleSection;
      return 'world';
    }
    if (/^\/politique\//.test(pathname)) return 'politics';
    if (/^\/economie\//.test(pathname) || /^\/(?:crypto|auto|immobilier|luxe)\//.test(pathname)) return 'business';
    if (/^\/tech\//.test(pathname)) return 'tech';
    if (/^\/sante\//.test(pathname)) return 'health';
    if (/^\/people\//.test(pathname)) return 'entertainment';
    if (/^\/culture\//.test(pathname)) return 'arts';
    if (/^\/sciences\//.test(pathname)) return 'science';
    if (/^\/(?:meteo|environnement)\//.test(pathname)) return 'climate';
    if (/^\/replay-emissions\//.test(pathname) && titleSection !== 'others') return titleSection;
    if (/^\/(?:international|police-justice|societe|lyon|marseille|cote-d-azur|var|grand-lille|grand-littoral|bfm-dici|alsace|normandie|bordeaux|charente-maritime|nantes|paris|toulouse|pratique|evenements)\//.test(pathname)) {
      return 'world';
    }
    if (titleSection !== 'others') return titleSection;
    return 'world';
  }

  if (source.includes('cash.ch')) {
    return 'business';
  }

  if (source.includes('se.pl')) {
    if (hostname.startsWith('superbiz.')) {
      if (/^\/technologie\//.test(pathname)) return 'tech';
      return 'business';
    }
    if (hostname.startsWith('polityka.')) return 'politics';
    if (hostname.startsWith('portalobronny.')) {
      if (/^\/wojna-w-ukrainie\//.test(pathname)) return 'conflicts';
      if (/^\/przemysl-zbrojeniowy\//.test(pathname)) return 'business';
      return 'politics';
    }
    if (hostname.startsWith('superseriale.')) return 'entertainment';
    if (hostname.startsWith('beszamel.')) return 'lifestyle';
    if (hostname.startsWith('pogoda.')) return 'climate';
    if (/^\/styl-zycia\//.test(pathname)) return 'lifestyle';
    if (/^\/rozrywka\//.test(pathname)) return 'entertainment';
    if (/^\/zdrowie\//.test(pathname)) return 'health';
    if (/^[^/]+\.html$/.test(pathname) && hostname.endsWith('.se.pl')) return 'world';
    if (/^\/(?:wiadomosci|warszawa|trojmiasto|krakow|slask|torun|poznan|bydgoszcz|rzeszow|olsztyn|kielce|koszalin|zielona-gora|gorzow|tarnow|opole)\//.test(pathname)) {
      return 'world';
    }
    return 'world';
  }

  if (source.includes('diena')) {
    if (hostname.endsWith('diena.lt')) {
      if (/^\/naujienos\/sportas\//.test(pathname)) return 'sports';
      if (/^\/naujienos\/verslas\//.test(pathname)) return 'business';
      if (/^\/naujienos\/sveikata\//.test(pathname)) return 'health';
      if (/^\/naujienos\/orai\//.test(pathname)) return 'climate';
      if (/^\/naujienos\/ivairenybes\/mokslas-ir-it\//.test(pathname)) return 'tech';
      if (/^\/naujienos\/ivairenybes\/horoskopai\//.test(pathname)) return 'lifestyle';
      if (/^\/naujienos\/(?:laisvalaikis-ir-kultura\/zvaigzdes-ir-pramogos|kaunas\/menas-ir-pramogos|klaipeda\/menas-ir-pramogos)\//.test(pathname)) {
        return 'entertainment';
      }
      if (/^\/naujienos\/laisvalaikis-ir-kultura\//.test(pathname)) return 'arts';
      if (/^\/naujienos\/lietuva\/politika\//.test(pathname)) return 'politics';
      if (/^\/naujienos\/pasaulis\/konfliktai-nelaimes\//.test(pathname)) return 'conflicts';
      if (/^\/naujienos\/(?:pasaulis|lietuva|kriminalai|kaunas|klaipeda|vilnius|ivairenybes|kita|nuomones|grazi-diena|kauno-dienos-studija)\//.test(pathname)) {
        return 'world';
      }
    }
    if (hostname.endsWith('diena.lv')) {
      if (/^\/raksts\/sports\//.test(pathname)) return 'sports';
      if (/^\/raksts\/uznemeja-diena\//.test(pathname)) return 'business';
      if (/^\/raksts\/viedokli\//.test(pathname)) return 'politics';
      if (/^\/raksts\/izklaide\//.test(pathname)) return 'entertainment';
      if (/^\/raksts\/dzivesstils\//.test(pathname)) return 'lifestyle';
      if (/^\/raksts\/(?:pasaule|latvija|kd|citi|diena-citi)\//.test(pathname)) return 'world';
    }
    return 'world';
  }

  if (source.includes('antara')) {
    const titleSection = classifyAntaraTitle(title);
    if (hostname.startsWith('otomotif.')) return 'business';
    if (titleSection !== 'others') return titleSection;
    return 'world';
  }

  if (source.includes('folha de s.paulo')) {
    const titleSection = classifyFolhaTitle(title);
    const redirectedUrl = extractRedirectTargetUrl(url);
    const target = parseArticleUrl(redirectedUrl);
    if (target.hostname.includes('f5.folha.uol.com.br')) return 'entertainment';
    if (target.hostname.includes('guia.folha.uol.com.br')) return 'lifestyle';
    if (target.hostname.includes('www1.folha.uol.com.br')) {
      if (/^\/(?:poder|opiniao)\//.test(target.pathname)) return 'politics';
      if (/^\/(?:ilustrada|ilustrissima)\//.test(target.pathname)) return 'entertainment';
      if (/^\/(?:equilibrio|equilibrioesaude)\//.test(target.pathname)) return 'health';
      if (/^\/tec\//.test(target.pathname)) return 'tech';
      if (/^\/blogs\/sobre-trilhos\//.test(target.pathname)) return 'business';
      if (/^\/colunas\/tostao\//.test(target.pathname)) return 'sports';
      if (/^\/colunas\/reinaldojoselopes\//.test(target.pathname)) return 'science';
      if (/^\/(?:cotidiano|educacao|paineldoleitor|folhinha)\//.test(target.pathname)) return 'world';
      if (/^\/colunas\//.test(target.pathname) && titleSection !== 'others') return titleSection;
    }
    if (titleSection !== 'others') return titleSection;
    return 'world';
  }

  if (source.includes('clarín') || source.includes('clarin')) {
    if (/^\/deportes\//.test(pathname)) return 'sports';
    if (/^\/(?:economia|autos|rural|brandstudio)\//.test(pathname)) return 'business';
    if (/^\/salud\//.test(pathname)) return 'health';
    if (/^\/(?:espectaculos|musica)\//.test(pathname)) return 'entertainment';
    if (/^\/(?:buena-vida|astrologia)\//.test(pathname)) return 'lifestyle';
    if (/^\/(?:cultura|arq)\//.test(pathname)) return 'arts';
    const titleSection = classifyClarinTitle(title);
    if (titleSection !== 'others') return titleSection;
    return 'world';
  }

  if (source.includes('uol notícias')) {
    const titleSection = classifyUolTitle(title);
    if (hostname.includes('folha.uol.com.br')) {
      if (/^\/ilustrada\//.test(pathname)) return 'entertainment';
      if (/^\/(?:equilibrio|equilibrioesaude)\//.test(pathname)) return 'health';
      if (/^\/poder\//.test(pathname)) return 'politics';
      if (/^\/tec\//.test(pathname)) return 'tech';
      if (/^\/blogs\/sobre-trilhos\//.test(pathname)) return 'business';
      if (/^\/cotidiano\//.test(pathname)) return 'world';
    }
    if (hostname.includes('noticias.uol.com.br')) {
      if (/^\/internacional\//.test(pathname)) return 'world';
      if (/^\/cotidiano\//.test(pathname)) return 'world';
      if (/^\/ultimas-noticias\//.test(pathname) && titleSection !== 'others') return titleSection;
      if (/^\/colunas\//.test(pathname) && titleSection !== 'others') return titleSection;
    }
    if (hostname.includes('redetv.uol.com.br')) {
      if (/^\/jornalismo\//.test(pathname)) return 'world';
    }
    if (hostname.includes('tnonline.uol.com.br')) {
      if (/^\/noticias\//.test(pathname)) return 'world';
    }
    if (titleSection !== 'others') return titleSection;
    return 'world';
  }

  if (source === 'observador') {
    const titleSection = classifyObservadorTitle(title);
    if (/^\/programas\/noticiario\//.test(pathname)) return 'world';
    if (/^\/programas\/tres-toques\//.test(pathname) || /^\/newsletters\/desporto\//.test(pathname)) return 'sports';
    if (/^\/opiniao\//.test(pathname)) return 'politics';
    if (/^\/programas\/(?:ideias-feitas|programa-comentarios|contra-corrente|resposta-pronta|justica-cega|explicador|sob-escuta)\//.test(pathname)) {
      return titleSection !== 'others' ? titleSection : 'politics';
    }
    if (/^\/programas\/(?:vichyssoise|portugues-suave|isto-nao-passa-na-radio)\//.test(pathname)) {
      return titleSection !== 'others' ? titleSection : 'lifestyle';
    }
    if (/^\/programas\/(?:a-hist-ria-do-dia|reportagem-observador)\//.test(pathname)) {
      return titleSection !== 'others' ? titleSection : 'world';
    }
    if (/^\/(?:factchecks|liveblogs|especiais)\//.test(pathname)) return titleSection !== 'others' ? titleSection : 'world';
    if (/^\/\d{4}\/\d{2}\/\d{2}\//.test(pathname)) return titleSection !== 'others' ? titleSection : 'world';
    if (titleSection !== 'others') return titleSection;
    return 'world';
  }

  if (source.includes('swissinfo es')) {
    const titleSection = classifySwissinfoEsTitle(title);
    if (titleSection !== 'others') return titleSection;
    return 'world';
  }

  if (source.includes('kyodo news')) {
    const titleSection = classifyKyodoTitle(title);
    if (titleSection !== 'others') return titleSection;
    return 'world';
  }

  if (source.includes('el cronista')) {
    if (/^\/brand-strategy\//.test(pathname)) return 'business';
    if (/^\/(?:informacion-gral|agencias|colombia\/actualidad-co)\//.test(pathname)) return 'world';
    if (/^\/(?:clase\/trendy|colombia\/curiosidades|colombia\/tiempo-libre)\//.test(pathname)) return 'lifestyle';
    if (/^\/columnistas\//.test(pathname)) return 'politics';
    return 'others';
  }

  if (source === 'bt') {
    if (/^\/(?:fodbold|cykling|boksning|betting)\//.test(pathname)) return 'sports';
    if (/^\/(?:erhverv|aktier|dagligvarer|bolig|biler)\//.test(pathname)) return 'business';
    if (/^\/(?:danske-kendte|film,-tv-og-streaming|underholdning|musik|anmeldelser)\//.test(pathname)) return 'entertainment';
    if (/^\/forbrug\/sundhed\//.test(pathname)) return 'health';
    if (/^\/nyheder\/videnskab\//.test(pathname)) return 'science';
    if (/^\/debat\//.test(pathname)) return 'politics';
    if (/^\/(?:udland|samfund|royale|krimi|nyheder|advertorial)\//.test(pathname)) return 'world';
    return 'world';
  }

  if (source.includes('el heraldo de mexico')) {
    if (/^\/deportes\//.test(pathname)) return 'sports';
    if (/^\/economia\//.test(pathname)) return 'business';
    if (/^\/opinion\//.test(pathname)) return 'politics';
    if (/^\/tecnologia\//.test(pathname)) return 'tech';
    if (/^\/espectaculos\//.test(pathname)) return 'entertainment';
    if (/^\/cultura\//.test(pathname)) return 'arts';
    if (/^\/(?:estilo-de-vida|tendencias)\//.test(pathname)) return 'lifestyle';
    if (/^\/(?:nacional|mundo|edicion-impresa|el-mundo-del-derecho)\//.test(pathname)) return 'world';
    return 'world';
  }

  if (source.includes('la vanguardia')) {
    if (/^\/deportes\//.test(pathname)) return 'sports';
    if (/^\/(?:economia|dinero|motor|empresas-de-vanguardia)\//.test(pathname)) return 'business';
    if (/^\/neo\//.test(pathname)) return 'tech';
    if (/^\/(?:gente|television)\//.test(pathname)) return 'entertainment';
    if (/^\/cultura\//.test(pathname)) return 'arts';
    if (/^\/(?:magazine|comer|comprar|loterias|vivo)\//.test(pathname)) return 'lifestyle';
    if (/^\/(?:local|encatala|vida|participacion|relatos)\//.test(pathname)) return 'world';
    return 'world';
  }

  if (source === 'tn') {
    if (/^\/deportes\//.test(pathname)) return 'sports';
    if (/^\/clima\//.test(pathname)) return 'climate';
    if (/^\/(?:economia|campo|autos)\//.test(pathname)) return 'business';
    if (/^\/(?:politica|opinion)\//.test(pathname)) return 'politics';
    if (/^\/tecno\//.test(pathname)) return 'tech';
    if (/^\/salud\//.test(pathname)) return 'health';
    if (/^\/(?:show|musica)\//.test(pathname)) return 'entertainment';
    if (/^\/cultura\//.test(pathname)) return 'arts';
    if (/^\/(?:cocina|estilo|turismo)\//.test(pathname)) return 'lifestyle';
    if (/^\/(?:sociedad|policiales|internacional|estados-unidos|general|videos)\//.test(pathname)) return 'world';
    return 'world';
  }

  if (source.includes('sözcü') || source.includes('sozcu')) {
    const titleSection = classifySozcuTitle(title);
    if (titleSection !== 'others') return titleSection;
    return 'world';
  }

  if (source.includes('stiripesurse')) {
    const titleSection = classifyStiripesurseTitle(title);
    if (titleSection !== 'others') return titleSection;
    return 'world';
  }

  if (source === 'mediafax') {
    const titleSection = classifyMediafaxTitle(title);
    if (/^\/(?:economic|financiar|agricultura|energie|auto|comunicate|comunicate-de-presa)\//.test(pathname)) return 'business';
    if (/^\/sport\//.test(pathname)) return 'sports';
    if (/^\/politic\//.test(pathname)) return 'politics';
    if (/^\/life-entertaiment\//.test(pathname)) return 'entertainment';
    if (/^\/horoscop\//.test(pathname)) return 'lifestyle';
    if (/^\/life-inedit\//.test(pathname)) return titleSection !== 'others' ? titleSection : 'lifestyle';
    if (/^\/tehnologie\//.test(pathname)) return 'tech';
    if (/^\/cultura-media\//.test(pathname)) return 'arts';
    if (/^\/sanatate\//.test(pathname)) return 'health';
    if (/^\/stiinta-sanatate\//.test(pathname)) return titleSection !== 'others' ? titleSection : 'science';
    if (/^\/meteo\//.test(pathname)) return 'climate';
    if (/^\/(?:externe|stirile-zilei|social|english|justitie|off-the-record|breaking-news|diverse)\//.test(pathname)) {
      return titleSection !== 'others' ? titleSection : 'world';
    }
    if (titleSection !== 'others') return titleSection;
    return 'world';
  }

  if (source.includes('aju news')) {
    const titleSection = classifyAjuTitle(title);
    if (titleSection !== 'others') return titleSection;
    return 'world';
  }

  if (source.includes('yonhap (en)')) {
    const titleSection = classifyYonhapTitle(title);
    if (titleSection !== 'others') return titleSection;
    return 'world';
  }

  if (source.includes('mirror media - externals') || source.includes('mirror media - posts')) {
    const titleSection = classifyMirrorMediaTitle(title);
    if (titleSection !== 'others') return titleSection;
    return 'world';
  }

  if (source.includes('yomiuri')) {
    if (/\/sports\//.test(pathname) || /\/giants\//.test(pathname) || /\/olympic\//.test(pathname) || /\/igoshougi\//.test(pathname)) {
      return 'sports';
    }
    if (/\/economy\//.test(pathname)) return 'business';
    if (/\/politics\//.test(pathname) || /\/editorial\//.test(pathname) || /\/election\//.test(pathname)) return 'politics';
    if (/\/world\//.test(pathname) || /\/local\//.test(pathname) || /\/national\//.test(pathname) || /\/shinsai311\//.test(pathname)) {
      return 'world';
    }
    if (/\/culture\//.test(pathname) || /\/comic\//.test(pathname) || /\/novel\//.test(pathname) || /\/serial\//.test(pathname)) {
      return 'arts';
    }
    if (/\/life\//.test(pathname) || /\/hobby\//.test(pathname) || /\/otekomachi\//.test(pathname)) return 'lifestyle';
    if (/\/science\//.test(pathname)) return 'science';
    if (/\/medical\//.test(pathname)) return 'health';
    if (/\/kyoiku\//.test(pathname) || /\/teen\//.test(pathname) || /\/kodomo\//.test(pathname)) return 'world';
    return 'world';
  }

  if (source.includes('sports illustrated') || source.includes('espn')) {
    return 'sports';
  }

  if (source.includes('a bola') || source.includes('tyc sports') || source.includes('tokyo sports')) {
    return 'sports';
  }

  for (const fallback of SOURCE_FALLBACKS) {
    if (fallback.pattern.test(context.source)) {
      return fallback.section;
    }
  }

  if (source.includes('조선닷컴')) {
    if (/english\/sports-en/.test(url)) return 'sports';
    if (/economy\/|industry-en/.test(url)) return 'business';
    if (/international\//.test(url)) return 'world';
    if (/travel-food-en/.test(url)) return 'lifestyle';
    if (/culture-life\/book|culture-life\/culture_general/.test(url)) return 'arts';
    if (/kpop-culture-en|culture-life\/k-culture|entertainments/.test(url)) return 'entertainment';
  }

  return 'others';
}

export function deriveSectionFromContext(context: ArticleSectionContext): NewsSection {
  const sourceFallbackSection = classifySectionBySourceFallback(context);
  if (sourceFallbackSection !== 'others') {
    return sourceFallbackSection;
  }
  return classifySectionByStructuredHints(context.source, context.url);
}

function normalizeCategoryValue(value: string | null | undefined): string {
  return (value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function buildHintRegex(term: string): RegExp {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`, 'iu');
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

function classifyKbsTitle(title: string): NewsSection {
  if (!title) return 'others';
  if (/공격|타격|작전|미사일|드론|전쟁|폭격|호르무즈|해협/.test(title)) return 'conflicts';
  if (/골다공증|환자|병원|의사|건강|질환|백신|사망 위험/.test(title)) return 'health';
  if (/날씨|폭염|폭우|한파|태풍|제주도에는 비|기온|기상/.test(title)) return 'climate';
  if (/민주당|국민의힘|본회의|국정조사|대통령|총리|장관|정부|국회|법안|검찰|여당|야당/.test(title)) return 'politics';
  if (/증시|주가|경제|유가|가스|기업|부동산|노동부|임금체불|공항 혼잡|TSA/.test(title)) return 'business';
  if (/BTS|공연|컴백|가수|배우|드라마|영화|콘서트/.test(title)) return 'entertainment';
  if (/야구|축구|농구|배구|골프|올림픽|월드컵|선수|경기/.test(title)) return 'sports';
  if (/G7|EU|미국|러시아|중국|이스라엘|이란|외교장관|정상회담|트럼프|머스크|나토|미군/.test(title)) return 'world';
  return 'others';
}

function classifyMehrTitle(title: string): NewsSection {
  if (!title) return 'others';
  if (/تل[‌ ]?آویو|اسرائیل|اسرائيل|موشک|موشک‌های|حمله|آژیر|سپاه|تنگه هرمز|خوشه‌ای|دشمن/.test(title)) return 'conflicts';
  if (/ترامپ|رئیس جمهور|رييس جمهور|دولت|مجلس|وزیر|وزير|سازمان اطلاعات|انتخابات/.test(title)) return 'politics';
  if (/بیمه سلامت|بيمه سلامت|سلامت|خون|بیمارستان|بيمارستان|پزشک|درمان/.test(title)) return 'health';
  if (/میلیارد|ميليارد|ریال|ريال|برق|آب|نیروگاه|نيروگاه|ظرفیت|ظرفيت|تولید|توليد|عرضه|اقتصاد|بازار/.test(title)) return 'business';
  if (/موزه|باستان‌شناسی|باستان شناسی|مردم‌شناسی|مردم شناسی|نمایشگاه|نمايشگاه|فرهنگ|هنر/.test(title)) return 'arts';
  if (/گردشگری|گردشگر|اقامتگاه|بوم[‌ ]?گردی|نوروزی|سفر|مسافران/.test(title)) return 'lifestyle';
  return 'others';
}

function classifyActuTitle(title: string): NewsSection {
  if (!title) return 'others';
  if (/municipales|maire|mairie|conseil municipal|élection|election|élu|elu|préfet|prefet/i.test(title)) return 'politics';
  if (/expo|exposition|photo|festival|concert|spectacle|théâtre|theatre|musée|musee|livre/i.test(title)) return 'arts';
  if (/tourisme|touristique|vacances|balade|randonnée|randonnee|plage|fête|fete|foire/i.test(title)) return 'lifestyle';
  return 'others';
}

function classifyRepublikaTitle(title: string): NewsSection {
  if (!title) return 'others';
  if (/menteri|pemerintah|bupati|gubernur|wali kota|dpr|pemilu|pilkada|strategi/i.test(title)) return 'politics';
  if (/bandara|kinerja|ekonomi|bisnis|ongkos|hemat|pasar|penyeberangan|transportasi/i.test(title)) return 'business';
  if (/literasi|buku|museum|seni|budaya/i.test(title)) return 'arts';
  if (/wisata|destinasi|libur|lebaran|shalat|idul fitri|ramai dikunjungi|semangat/i.test(title)) return 'lifestyle';
  return 'others';
}

function classifyUkrainskaPravdaTitle(title: string): NewsSection {
  if (!title) return 'others';
  if (/обстріл|обстріли|дрон|дрони|fpv|вертоліт|бомб|ракет|атаки|авіазавод|військ|генштаб|фронт|влучання|пво|бпла|ка-52/iu.test(title)) {
    return 'conflicts';
  }
  if (/зеленськ|трамп|нато|умєров|лукашенко|сійярто|санкц|переговор|делегац|мзс|польщ|туреччин|сша|єс|євросоюз|угорщ|вибор/iu.test(title)) {
    return 'politics';
  }
  if (/бізнес|мвф|економ|податк|кредит|інфраструктур/iu.test(title)) {
    return 'business';
  }
  return 'others';
}

function classifyRussianNewsTitle(title: string): NewsSection {
  if (!title) return 'others';
  if (/бпла|пво|всу|дрон|удар|атака|атак|боеприпас|сво|ракет|фронт|минобор|израил|иран|взрыв|бомб|боевых действий|ормуз/iu.test(title)) {
    return 'conflicts';
  }
  if (/матч|кхл|рпл|апл|кубок|чемпион|лыжник|биатлон|футбол|хокке|теннис|бокс|спорт|паралимп|вратар|гол|баскет|волейбол/iu.test(title)) {
    return 'sports';
  }
  if (/эконом|рубл|нефт|газ|пенси|жкх|налог|банк|сбербанк|дивиденд|товарн(?:ый|ого) знак|автомобил|рынок|капитализац|вычет|продаж|инвест|бюджет/iu.test(title)) {
    return 'business';
  }
  if (/врач|болезн|здоров|рак|пациент|психолог|мяс/iu.test(title)) {
    return 'health';
  }
  if (/концерт|сериал|акт(?:е|ё)р|актрис|певиц|певец|фильм|бэнкси|театр|книг|пугачева|bts|трилог|комик|шоу/iu.test(title)) {
    return 'entertainment';
  }
  if (/путин|госдум|кремл|мид|конгрессвумен|нато|санкц|переговор|макрон|мерц|орбан|лукашенко|трамп|евросоюз|правительств|министр|посол/iu.test(title)) {
    return 'politics';
  }
  return 'others';
}

function classifyEuropeanPravdaTitle(title: string): NewsSection {
  if (!title) return 'others';
  if (/attack|strike|missile|drone|troops|air defense|war|military|shelling|front/i.test(title)) return 'conflicts';
  if (/economy|trade|tariff|gas|oil|budget|loan|imf|markets?/i.test(title)) return 'business';
  if (/president|prime minister|minister|government|parliament|election|eu|nato|commission|summit|sanctions?/i.test(title)) {
    return 'politics';
  }
  return 'others';
}

function classifyRadioSwedenTitle(title: string): NewsSection {
  if (!title) return 'others';
  if (/attack|krig|missil|drön|döda|sjukhusattack|sudan|darfur|ukraina/i.test(title)) return 'conflicts';
  if (/fotboll|hockey|guld|duplantis|match|cup|oskarshamn|seger|tävla|vm|olympi/i.test(title)) return 'sports';
  if (/oljepris|ekonomi|ränta|börs|jobb|arbetslös/i.test(title)) return 'business';
  if (/film|musik|bok|ghostbusters|skådespel|serie/i.test(title)) return 'entertainment';
  if (/sjukhus|vård|hälsa|smitta|vaccin/i.test(title)) return 'health';
  if (/regering|minister|val|politik|riksdag/i.test(title)) return 'politics';
  return 'others';
}

function classifyAdresseavisenTitle(title: string): NewsSection {
  if (!title) return 'others';
  if (/rakett|angrep|krigen|krig|eksplosjon|ubåt|ukraina|teheran|persiabukta|qatar|iran/i.test(title)) return 'conflicts';
  if (/trump|regjering|minister|valg|storting|politikk|ice på flyplasser/i.test(title)) return 'politics';
  if (/pris|økonomi|rente|olje|diesel|bolig|bedrift|næringsliv/i.test(title)) return 'business';
  if (/fotball|langrenn|ski|cup|seier|mesterskap|sport/i.test(title)) return 'sports';
  if (/helse|sykehus|lege|virus|influensa/i.test(title)) return 'health';
  if (/konsert|teater|kunst|bok|museum|festival/i.test(title)) return 'arts';
  if (/mat|reise|forbruker/i.test(title)) return 'lifestyle';
  return 'others';
}

function classifyLaLibreTitle(title: string): NewsSection {
  if (!title) return 'others';
  if (/motogp|triathlon|athl[ée]t|football|rugby|basket|tennis|match|victoire|but|passe|crampes|grand prix|f1|formule 1/i.test(title)) {
    return 'sports';
  }
  if (/attaque|guerre|armée|armee|missile|frappe|bombard|attentats/i.test(title)) return 'conflicts';
  if (/concert|film|s[ée]rie|musique|festival|album|livre|th[ée]âtre|theatre|exposition/i.test(title)) return 'entertainment';
  if (/sant[ée]|h[ôo]pital|hopital|antipoison|maladie|vaccin|m[ée]decin/i.test(title)) return 'health';
  if (/ia|intelligence artificielle|tech/i.test(title)) return 'tech';
  if (/bourse|march[ée]|marche|entreprise|banque|inflation|emploi|euro|[ée]conomie|economie/i.test(title)) return 'business';
  if (/gouvernement|pr[ée]sident|president|ministre|parlement|[ée]lection|election|coalition|vote|maire/i.test(title)) return 'politics';
  if (/mus[ée]e|musée|art|culture/i.test(title)) return 'arts';
  return 'others';
}

function classifyFocusTitle(title: string): NewsSection {
  if (!title) return 'others';
  if (/bundesliga|formel 1|tennis|sport|fussball|basketball|olympi|wintersport/i.test(title)) return 'sports';
  if (/oelpreis|ölpreis|spritpreis|benzin|diesel|tanken|wirtschaft|bank|banken|bmw|vw|autoindustrie|e-auto|boerse|börse|miete|mietkosten|fracking|haushalt|sondervermoegen|sondervermögen|arbeitsplaetze|arbeitsplätze/i.test(title)) {
    return 'business';
  }
  if (/merz|spd|afd|trump|buergergeld|bürgergeld|antisemit|abschieb|kanzler|regierung|politik|brandmauer|kuehnert|kühnert|linke|kirche|richter|steuer/i.test(title)) {
    return 'politics';
  }
  if (/co2|el nino|el niño|gewaesserschutz|gewässerschutz|super-el-nino|super-el-niño|artenschutz|klima/i.test(title)) return 'climate';
  return 'others';
}

function classifyBfmtvTitle(title: string): NewsSection {
  if (!title) return 'others';
  if (/ligue 1|psg|om[: ]|ol[: ]|f1|mma|coupe du monde|can 2025|paris-nice|giroud|mbapp[ée]|zidane|rugby|sport/i.test(title)) {
    return 'sports';
  }
  if (/municipales|lfi|rassemblement national|olivier faure|horizons|ps |politique/i.test(title)) return 'politics';
  if (/caf[ée] de l['’]?[ée]co|prix du gaz|carburant|banque|compte bancaire|taxe|prime d['’]activit[ée]|fioul|marketplace|amazon|shein|temu|vinted|leboncoin|magasins|robotaxis|stellantis/i.test(title)) {
    return 'business';
  }
  if (/salmonelle|diarrh[ée]e|vomissements|sommeil|sant[ée]/i.test(title)) return 'health';
  if (/bonjour alsace|bonsoir alsace|pat['’]?patrouille|deep-dating/i.test(title)) return 'world';
  return 'others';
}

function classifyPolsatTitle(title: string): NewsSection {
  if (!title) return 'others';
  if (/mecz|liga|ufc|boks|manchester united|bournemouth|sport|gola|pilk|piłk|siatkow|koszyk|harry maguire/i.test(title)) {
    return 'sports';
  }
  if (/atak|wojn|iran|izrael|ukrain|rosj|dron|chahed|f-16|ewakuac|granic|wybuch|bomb/i.test(title)) {
    return 'conflicts';
  }
  if (/tusk|prezydent|minist|nawrocki|trzaskowski|kaczynski|holown|czarzasty|bosak|duda|bodnar|blaszczak|wybor|sejm|pis|psl|mon|msz|rzadu|rządu/i.test(title)) {
    return 'politics';
  }
  if (/ceny pradu|cen energii|800 plus|inflac|gospodark|kredyt|pieniadz|pieniądz/i.test(title)) return 'business';
  if (/zdrowotn|lekow|szpital|zdrowia/i.test(title)) return 'health';
  if (/kapsuly dragon|astronau|kosmiczn/i.test(title)) return 'science';
  if (/aplikacja|technolog/i.test(title)) return 'tech';
  return 'others';
}

function classifyTv3Title(title: string): NewsSection {
  if (!title) return 'others';
  if (/pergale|baudinys|ivartis|pusfinal|cempionat|ufc|manchester united|bournemouth|fenerbahce|maco dali|sporto|futbolo|krepsin|imtyninink/i.test(title)) {
    return 'sports';
  }
  if (/karo|irane|ukrainoje|egzekucij|mirties bausme|bazemis|atak|gynybos ministerija|karalyste leis jav/i.test(title)) {
    return 'conflicts';
  }
  if (/trumpas|lukasenk|ministerija|jav|lenkijos|gynybos|planus pletoti poligonus/i.test(title)) return 'politics';
  if (/aktoriaus mirt|daininink|serial|filmo|muzik/i.test(title)) return 'entertainment';
  if (/gydytojai|sveikat|ligonin/i.test(title)) return 'health';
  return 'world';
}

function classifyYonhapTitle(title: string): NewsSection {
  if (!title) return 'others';
  if (/fighter jet|drone command|terror threat|missile|attack|troops|defense ministry/i.test(title)) return 'conflicts';
  if (/bank loan|lng|shares|electronics|ceo|plant|economy|exports?|tariff|business/i.test(title)) return 'business';
  if (/bts|the boyz|comeback|concert|show|festival/i.test(title)) return 'entertainment';
  if (/biennale|sculpture|art|pavilion/i.test(title)) return 'arts';
  if (/president|prime minister|lawmaker|plenary session|bill|party|opposition|police panel|election/i.test(title)) {
    return 'politics';
  }
  return 'others';
}

function classifyCnaTitle(title: string): NewsSection {
  if (!title) return 'others';
  if (/棒球|籃球|足球|網球|熱身賽|打擊率|球場|中職|投手|觀賽|火腿隊|比賽|賽季/.test(title)) return 'sports';
  if (/金管會|川普|總統|立院|國會|簽證|演習|漢光|縣市/.test(title)) return 'politics';
  if (/保單|投資|資本額|金融|商品創新|市場|企業|公司|經濟|資本|快訊/.test(title)) return 'business';
  if (/AI|OpenClaw|自動化|科技|晶片|半導體|手機|電腦/.test(title)) return 'tech';
  if (/養生|健康|醫療|病|護理師/.test(title)) return 'health';
  if (/韓綜|SJ|朴寶劍|CNBLUE|BLACKPINK|TWICE|粉絲|演唱會|追星|網紅/.test(title)) return 'entertainment';
  if (/地震|震度|碳足跡|永續|淨零/.test(title)) return 'climate';
  if (/建築師|故事|文化|文學/.test(title)) return 'arts';
  if (/旅客出遊|旅遊|出遊|一週大事|早安世界/.test(title)) return 'lifestyle';
  return 'others';
}

function classifyCumhuriyetTitle(title: string): NewsSection {
  if (!title) return 'others';
  if (/savaş|saldırı|füze|ukrayna|israil|iran|ordu|asker/i.test(title)) return 'conflicts';
  if (/bakan|cumhurbaşkanı|secim|seçim|meclis|parti|gazeteci|gözaltı|gozalti|mahkeme/i.test(title)) return 'politics';
  if (/ekonomi|zam|petrol|dolar|faiz|enflasyon|borsa/i.test(title)) return 'business';
  if (/yapay zeka|teknoloji|bilim/i.test(title)) return 'tech';
  if (/oyuncu|şarkı|sarki|dizi|film|konser|müzik|muzik/i.test(title)) return 'entertainment';
  if (/tarifi|burç|burc|astroloji|mutfak|kahve|sofralara|kebap/i.test(title)) return 'lifestyle';
  if (/kitap|sergi|sanat|edebiyat/i.test(title)) return 'arts';
  if (/sağlık|saglik|hastane|doktor/i.test(title)) return 'health';
  return 'others';
}

function classifyVecernjiTitle(title: string): NewsSection {
  if (!title) return 'others';
  if (/rat|napad|dron|projektil|teheran|iran|izrael/i.test(title)) return 'conflicts';
  if (/golob|janša|jansa|državni tajnik|drzavni tajnik|vučić|vucic|izbor|vlada|mandat/i.test(title)) return 'politics';
  if (/ekonomij|cijene|poskupjelo|najbrže rastuću ekonomiju|najbrze rastucu ekonomiju/i.test(title)) return 'business';
  if (/samsung|android|ai|umjetna inteligencija|tehnolog/i.test(title)) return 'tech';
  if (/showbiz|pjevač|pjevac|glum|film|serij/i.test(title)) return 'entertainment';
  if (/odmor|destinacija|sat|vožnji|voznji|auto|ljeto|putovanj/i.test(title)) return 'lifestyle';
  if (/kultura|muzej|izložb|izlozb|knjig/i.test(title)) return 'arts';
  return 'others';
}

function classifyLeFigaroTitle(title: string): NewsSection {
  if (!title) return 'others';
  if (/sénat|senat|loi|élection|election|ministre|président|president|politique/i.test(title)) return 'politics';
  if (/carburants|fiscale|euros|économie|economie|marché|marche|entreprise/i.test(title)) return 'business';
  if (/cinéma|cinema|film|série|serie|musique/i.test(title)) return 'entertainment';
  if (/cheveux|beauté|beaute|lidl|voyage|maison|bricolage/i.test(title)) return 'lifestyle';
  if (/culture|livre|roman|exposition/i.test(title)) return 'arts';
  if (/santé|sante|maladie|hôpital|hopital/i.test(title)) return 'health';
  return 'others';
}

function classifyChinaNewsTitle(title: string): NewsSection {
  if (!title) return 'others';
  if (/袭击|攻势|战|戰|军|軍|警告|封锁|封鎖|导弹|導彈/.test(title)) return 'conflicts';
  if (/国务院|國務院|金正恩|政府|主席|代表团|代表團|选举|選舉/.test(title)) return 'politics';
  if (/经济|經濟|产业|產業|贸易|貿易|企业|企業|市场|市場|港湾|港灣|出海|金融/.test(title)) return 'business';
  if (/科技|脑机接口|腦機接口|人工智能|机器人|機器人|芯片|晶片/.test(title)) return 'tech';
  if (/健康|患者|医疗|醫療|医院|醫院/.test(title)) return 'health';
  if (/文化|诗人|詩人|文旅|剧|劇|电影|電影/.test(title)) return 'arts';
  if (/旅游|旅遊|美食|春味|出游|出遊/.test(title)) return 'lifestyle';
  if (/比赛|比賽|世乒赛|世乒賽|足球|篮球|籃球|羽毛球/.test(title)) return 'sports';
  if (/研究|领域|領域|团队|團隊|实验|實驗/.test(title)) return 'science';
  return 'others';
}

function classifyBntTitle(title: string): NewsSection {
  if (!title) return 'others';
  if (/война|конфликт|дрон|ракет|удар|израел|иран|украйн/i.test(title)) return 'conflicts';
  if (/правителств|президент|министър|парламент|избор/i.test(title)) return 'politics';
  if (/иконом|цен[аи]|пазар|петрол/i.test(title)) return 'business';
  if (/робот|изкуствен интелект|технолог|космос|учен/i.test(title)) return 'tech';
  if (/здрав|болниц|лекар|пациент/i.test(title)) return 'health';
  if (/филм|музик|сериал|актрис|певиц/i.test(title)) return 'entertainment';
  if (/дъжд|вали|време|температур|облачно|сняг|валеж/i.test(title)) return 'climate';
  if (/левски|черно море|мач|футбол|шампион|купа|тенис|волейбол|баскетбол|биатлон|ски/i.test(title)) return 'sports';
  return 'others';
}

function classifyHankyungTitle(title: string): NewsSection {
  if (!title) return 'others';
  if (/전쟁|공습|드론|미사일|우크라|이스라엘|이란|군사|공격/.test(title)) return 'conflicts';
  if (/대통령|총리|국회|정부|장관|선거|여당|야당|구속영장|법원|검찰|헌재|외교|국방/.test(title)) return 'politics';
  if (/증시|주식|코스피|코스닥|환율|금리|기업|실적|부동산|분양|투자|경제|유가/.test(title)) return 'business';
  if (/AI|인공지능|테크|기술|반도체|로봇|플랫폼|스마트폰|배터리/.test(title)) return 'tech';
  if (/건강|의료|병원|질병|백신|뇌염|독감|환자/.test(title)) return 'health';
  if (/HK직캠|연예|배우|가수|아이브|블랙핑크|드라마|영화|콘서트|앨범|뮤지컬/.test(title)) return 'entertainment';
  if (/축구|야구|농구|배구|골프|올림픽|KBO|프로야구|손흥민|경기/.test(title)) return 'sports';
  if (/전시|미술|작가|공연|문화|예술/.test(title)) return 'arts';
  if (/산불|태풍|폭우|폭설|지진|기온/.test(title)) return 'climate';
  return 'others';
}

function classifySozcuTitle(title: string): NewsSection {
  if (!title) return 'others';
  if (/galatasaray|fenerbah[cç]e|be[sş]ikta[sş]|milli takim|futbolcu|gol|judocu|madalya|yari finale|kenan yildiz|sane|takim|idman/i.test(title)) {
    return 'sports';
  }
  if (/suriye|mossad|teror|haseke|aynularap|hamaney|insansiz deniz araci|bayrak gerilimi|sahilde .* bulundu/i.test(title)) {
    return 'conflicts';
  }
  if (/özg[uü]r [öo]zel|ozgur ozel|bah[cç]eli|adalet bakani|akp|mhp|gazeteci|g[oö]zaltina|ocalan|davuto[gğ]lu|trump/i.test(title)) {
    return 'politics';
  }
  if (/zam|akaryakit|asgari [uü]cret|fiyat|ekonomi|para kazandi/i.test(title)) return 'business';
  if (/yapay zeka/i.test(title)) return 'tech';
  if (/ili[sş]ki|ziyaretinde deh[sş]et|balik[cç]i barina[gğ]inda fok|trafi[gğ]i/i.test(title)) return 'world';
  return 'others';
}

function classifyStiripesurseTitle(title: string): NewsSection {
  if (!title) return 'others';
  if (/campionat|inv[iî]nge|gol|fotbal|motogp|triathlon|atlet|mondial|liderul campionatului/i.test(title)) return 'sports';
  if (/atac|rachet|dron|razboi|r[aă]zboi|nuclear|militar|submarine|ormuz|iran|israel|lovit|escorteze navele/i.test(title)) {
    return 'conflicts';
  }
  if (/orban|bruxelles|kiev|alegeri|guvern|cotroceni|comisia europeana|trump|mueller|democratiei europene|washington post/i.test(title)) {
    return 'politics';
  }
  if (/combustibil|gaze|euro|pensi|pret|carburant|acciz|motorina|salari|aviatiei|companiile aeriene/i.test(title)) {
    return 'business';
  }
  if (/avort|spital|avc|fum|sanat|bolnav/i.test(title)) return 'health';
  if (/vacanta|turisti|insule|zodii|post|bunatatile|viata la oras/i.test(title)) return 'lifestyle';
  return 'world';
}

function classifyAjuTitle(title: string): NewsSection {
  if (!title) return 'others';
  if (/전쟁|공습|드론|미사일|군사|공격|이스라엘|이란|우크라|전투기/.test(title)) return 'conflicts';
  if (/대통령|총리|국회|정부|민주당|국민의힘|장관|의원|정치|선거|법안|외교/.test(title)) return 'politics';
  if (/증시|주식|금리|기업|경제|투자|코스피|부동산|유가|배터리|산업/.test(title)) return 'business';
  if (/AI|인공지능|기술|테크|로봇|반도체|플랫폼/.test(title)) return 'tech';
  if (/의료|병원|건강|질병|백신/.test(title)) return 'health';
  if (/우주|과학|연구/.test(title)) return 'science';
  if (/축구|야구|농구|배구|골프|선수|경기|리그|우승|월드컵|올림픽/.test(title)) return 'sports';
  if (/BTS|방탄소년단|가수|배우|영화|드라마|콘서트|컴백|공연|앨범|포토/.test(title)) return 'entertainment';
  if (/테마파크|축제|전시|맛집|여행/.test(title)) return 'lifestyle';
  return 'world';
}

function classifyMirrorMediaTitle(title: string): NewsSection {
  if (!title) return 'others';
  if (/棒球|籃球|足球|球場|晉級|雷霆|NBA|中職|MLB|金牌|奧運|河智媛|樂天/.test(title)) return 'sports';
  if (/綠委|藍白|立委|蔡英文|蔣萬安|川普|國安|民進黨|國民黨|議員|總預算|市府|北檢/.test(title)) return 'politics';
  if (/台積電|財報|股|漲價|櫃買|市場|投資|房價|油價|台股/.test(title)) return 'business';
  if (/女星|周杰倫|TWICE|BTS|婚宴|伴娘|剖腹產|專輯|演唱會|明星|言承旭|阿信|JKF/.test(title)) return 'entertainment';
  if (/營養師|健康|醫師|醫院|癌|病/.test(title)) return 'health';
  if (/氣象署|衛星|AI|科技|磁暴|導航|電力系統/.test(title)) return 'tech';
  if (/水果助消化|日本展|掃墓|百年長崎蛋糕|長崎蛋糕/.test(title)) return 'lifestyle';
  return 'world';
}

function classifyAntaraTitle(title: string): NewsSection {
  if (!title) return 'others';
  if (/klasemen|menang|liga|timnas|futsal|basket|tenis|olahraga|grand prix|borussia|leverkusen|union berlin|muenchen|toulouse/i.test(title)) {
    return 'sports';
  }
  if (/konflik|serangan|jet tempur|perang|rudal|drone|militer|timteng|timur tengah/i.test(title)) return 'conflicts';
  if (/prabowo|jokowi|kpk|dpr|presiden|gubernur|menteri|legislator|kapolri|polri|pemprov|mendagri|wamenkes|komisi/i.test(title)) {
    return 'politics';
  }
  if (/bisnis|remitansi|rupiah|ekonomi|harga|penjualan|maskapai|bri|pertamina|minyak|dolar|investasi|pasar/i.test(title)) {
    return 'business';
  }
  if (/kesehatan|sehat|hormon|ibuprofen|nyeri|autoimun|mikroplastik|wamenkes|penyakit/i.test(title)) return 'health';
  if (/samsung|xiaomi|oppo|apple|macbook|airdrop|quick share|redmi|galaxy|ai/i.test(title)) return 'tech';
  if (/ilmuwan|ilmu tanah|peneliti|riset/i.test(title)) return 'science';
  if (/bts|selebritas|pevita pearce|ivan gunawan|luna maya|maxime|cinta laura|streaming|album|film|artis/i.test(title)) {
    return 'entertainment';
  }
  if (/wisata|tradisi|lebaran|mudik|ziarah|rumah|keluarga/i.test(title)) return 'lifestyle';
  return 'others';
}

function classifySuaraTitle(title: string): NewsSection {
  if (!title) return 'others';
  const antaraSection = classifyAntaraTitle(title);
  if (antaraSection !== 'others') return antaraSection;
  if (/whatsapp|iphone|android|aplikasi|gadget|teknologi|hp rp|redmi|galaxy/i.test(title)) return 'tech';
  if (/anies|prabowo|gus yaqut|kpk|pemerintah|presiden|menteri|tni|asn|istana|kemnaker|dpr|mahkamah|parlemen/i.test(title)) {
    return 'politics';
  }
  if (/baim wong|reza rahadian|sheila on7|duta|fans|artis|aktor|aktris|film|musik|lagu|konser|seleb/i.test(title)) {
    return 'entertainment';
  }
  if (/ramadan|lebaran|mudik|tips|zodiak|horoskop|resep|keluarga|ucapan/i.test(title)) return 'lifestyle';
  return 'others';
}

function classify24sataTitle(title: string): NewsSection {
  if (!title) return 'others';
  if (/izrael|iran|ukrajin|rusij|napad|bomb|raket|vojsk|rat|ormuz|nuklear|dron|udar/i.test(title)) return 'conflicts';
  if (/izbori|vlad|plenkovi[cć]|premijer|predsjed|ministar|sabor|eu\b|ambasador|vu[cč]i[cć]|sindik|mzo\b/i.test(title)) {
    return 'politics';
  }
  if (/milijard|euro|tvrtk|amazon|gubitku|vrijednost|goriva|petrol|ulag|dolar|obnovu|pla[cć]e/i.test(title)) return 'business';
  if (/menopauz|operacij|bolnic|zdrav|virus|pacijentic|ranjen|ozlijed/i.test(title)) return 'health';
  if (/vrijeme|ki[sš]a|snijeg|oluja|po[zž]ar|prolje[cć]|pljusk|potres/i.test(title)) return 'climate';
  return 'others';
}

function classifySapoTitle(title: string): NewsSection {
  if (!title) return 'others';
  if (/f1\b|formula 1|formula e|e-prix|eprix|grande pr[eé]mio|campeonato|liga|futebol|tenis|vencer|corridas?/i.test(title)) {
    return 'sports';
  }
  if (/governo|presidente|ministro|parlamento|elei[cç][aã]o|autarca|trump|lula|abinader/i.test(title)) return 'politics';
  if (/economia|mercado|a[cç][õo]es|empresa|banco|bolsa|invest|neg[oó]cio|lucro|pre[cç]o|trastor/i.test(title)) {
    return 'business';
  }
  if (/openai|chatgpt|intelig[eê]ncia artificial|tecnologia|iphone|android|apple|google|gadget|smartphone/i.test(title)) {
    return 'tech';
  }
  if (/sa[uú]de|hospital|doen[cç]a|m[eé]dico|vacina|v[ií]rus|c[aâ]ncer/i.test(title)) return 'health';
  if (/atriz|ator|cantor|cantora|filme|s[eé]rie|album|celebridade|televis[aã]o|salma hayek|marilyn monroe/i.test(title)) {
    return 'entertainment';
  }
  if (/perfume|fragr[aâ]ncia|unhas|manicure|pele|cabelos|penteados|primavera|beleza|moda|hotel|viagem|receita|decora[cç][aã]o|skincare/i.test(title)) {
    return 'lifestyle';
  }
  return 'others';
}

function classifyBlicTitle(title: string): NewsSection {
  if (!title) return 'others';
  if (/rat|iranu|izrael|napad|raket|operacij|ormuz|ukrajin|bomb|dron/i.test(title)) return 'conflicts';
  if (/izbori|orban|vu[cč]i[cć]|tramp|vlad|ministar|predsed|savet|eu\b/i.test(title)) return 'politics';
  if (/cen[ae]|naft|inflacij|kompanij|biznis|evr|akcij|kamatn|goriv|ekonom/i.test(title)) return 'business';
  if (/oskar|netfliks|glum|serij|muzik|pevac|dokumentar|spajdermen|holivud|bridzerton/i.test(title)) {
    return 'entertainment';
  }
  if (/izlozb|pozori|knjig|roman|umetnost|kultur/i.test(title)) return 'arts';
  if (/zdrav|bolest|opekotin|beba/i.test(title)) return 'health';
  if (/inteligencij|dinosaur|arheolog/i.test(title)) return 'science';
  if (/prvak|sampion|liga|nba|tenis|motogp|atlet|sport|fudbal/i.test(title)) return 'sports';
  return 'others';
}

function classifyDelfiTitle(title: string): NewsSection {
  if (!title) return 'others';
  if (/atak|raket|dron|kar(?:as|o)|front|smog|bomb|iran|izrael|ukrain|rusij|teheran|gaza|persijos ilankos|naikintuv/i.test(title)) {
    return 'conflicts';
  }
  if (/prezident|vyriausyb|seim|ministr|polit|rinkim|sankcij|orbano|trump|mueller|ftb|es ragina/i.test(title)) {
    return 'politics';
  }
  if (/versl|ekonom|naft|duj|rinka|infliac|bank|biudzet|invest|naikos|saugyklu/i.test(title)) return 'business';
  if (/dronai|ai\b|technolog|elektrin|interneta|x verte/i.test(title)) return 'tech';
  if (/sveikat|gastroenterolog|vezi|v[ėe]ž|ligonin|gydyto|menopauz|pesticid|diet|vaisingum/i.test(title)) {
    return 'health';
  }
  if (/aktori|daininink|filmo|serial|muzik|euroviz|influencer|album|oskar/i.test(title)) return 'entertainment';
  if (/futbol|krep[sš]|kreps|nba|eurolyga|f1|sport|olimpin|var\b/i.test(title)) return 'sports';
  if (/moksl|tyrim|kosmos/i.test(title)) return 'science';
  if (/horoskop|namus|restorane|stiliste|kelion|recept|desert|mados|pilva/i.test(title)) return 'lifestyle';
  return 'others';
}

function classifyParapolitikaTitle(title: string): NewsSection {
  if (!title) return 'others';
  if (/πόλεμ|χτύπημα|επίθεσ|πύραυλ|ντρόν|ιράν|ισραήλ|ορμούζ|στρατιω|νεκρ|τραυματ/iu.test(title)) return 'conflicts';
  if (/συριζα|συριζ|δένδια|βαρουφάκ|βουλή|κυβερν|εκλογ|υπουργ|πρωθυπουργ|τασούλα|κακλαμάνη|οπεκεπε/iu.test(title)) {
    return 'politics';
  }
  if (/οικονομ|deals|ευρώ|αγορά|ασφαλισμ|συντάξ|εξαγορ/iu.test(title)) return 'business';
  if (/πυρετ|ραδιενεργ|απολύμανσ|νοσοκομ/iu.test(title)) return 'health';
  if (/καιρ|σεισμ/iu.test(title)) return 'climate';
  if (/μετάλλιο|πρωτάθλημ|στίβου|αθλητ/iu.test(title)) return 'sports';
  if (/τηλεόρασ|μουσείο|πίνακα|γκαλερ|ορθοδοξίας/iu.test(title)) return 'arts';
  return 'others';
}

function classifyEstadaoTitle(title: string): NewsSection {
  if (!title) return 'others';
  const folhaSection = classifyFolhaTitle(title);
  if (folhaSection !== 'others') return folhaSection;
  if (/filme|s[ée]rie|serie|m[uú]sica|musica|ator|atriz|show|tv|lollapalooza/i.test(title)) return 'entertainment';
  if (/arte|artes|livro|livros|teatro|dan[cç]a|museu/i.test(title)) return 'arts';
  if (/receita|restaurante|bares?|vinho|paladar|pet-friendly|sneaker/i.test(title)) return 'lifestyle';
  if (/sa[uú]de|doen[cç]a|hospital|vacina/i.test(title)) return 'health';
  return 'others';
}

function classifyObservadorTitle(title: string): NewsSection {
  if (!title) return 'others';
  const uolSection = classifyUolTitle(title);
  if (uolSection !== 'others') return uolSection;
  const folhaSection = classifyFolhaTitle(title);
  if (folhaSection !== 'others') return folhaSection;
  if (/benfica|porto|sporting|f1\b|uefa|milao-sanremo|pogacar|desporto|futebol|audi no mundial/i.test(title)) return 'sports';
  if (/oscar|ator|atriz|document[aá]rio|cannes|chuck norris|canc[oõ]es|radio/i.test(title)) return 'entertainment';
  if (/inc[eê]ndio|tempestade|cheias|apag[aã]o|frio\b/i.test(title)) return 'climate';
  if (/chatgpt|anthropic|ia\b|tecnologia/i.test(title)) return 'tech';
  if (/museu|arte|teatro|literatura/i.test(title)) return 'arts';
  return 'others';
}

function classifyGlobalEnglishTitle(title: string): NewsSection {
  if (!title) return 'others';
  if (/nhl|nba|nfl|mlb|tennis|football|soccer|curling|bonspiel|shootout|goal|season|championship|grand prix|f1\b|athletes?/i.test(title)) {
    return 'sports';
  }
  if (/election|government|minister|president|prime minister|parliament|trump|policy|senate|congress|un chief|fbi|gop|lawmaker|tsa|protesters?/i.test(title)) {
    return 'politics';
  }
  if (/business|economy|tax|market|bank|prices|tariff|trade|growth|electric vehicles?|gas pumps?|diesel|privatize|company|industry|nuclear power plant/i.test(title)) {
    return 'business';
  }
  if (/health|hospital|prosthetic|disease|virus|vaccine|medical|vet service|diagnosis|headaches/i.test(title)) return 'health';
  if (/3d-printed|ai\b|technology|tech|robot|software|cyber|chatgpt/i.test(title)) return 'tech';
  if (/museum|theatre|theater|exhibition|bookstore|novel|art\b/i.test(title)) return 'arts';
  if (/concert|movie|film|series|tv|television|music|festival/i.test(title)) return 'entertainment';
  if (/home ?& ?garden|reno|renovation|travel|restaurant|recipe|food|garden|dog|cat|pet|adopt|cruise|parents|habits|owner/i.test(title)) {
    return 'lifestyle';
  }
  if (/landslide|storm|wildfire|blackout|heatwave|flood|sewage spill/i.test(title)) return 'climate';
  return 'others';
}

function classifyLaStampaTitle(title: string): NewsSection {
  if (!title) return 'others';
  if (/guerra|attacc|missil|drone|iran|israel|ucrain|bomb|raid|militar/i.test(title)) return 'conflicts';
  if (/governo|ministro|maggioranza|lega|forza italia|fratelli d['’]italia|sindaco|consiglio|elezion/i.test(title)) return 'politics';
  if (/debiti|liquidazione|export|econom|azienda|imprend|tessile|mercato|borsa|lavoro/i.test(title)) return 'business';
  if (/formula 1|campione|gara|milano-sanremo|calcio|tennis|cicl|sport/i.test(title)) return 'sports';
  if (/ospedale|sanit|medic|salute|veterinario/i.test(title)) return 'health';
  if (/cantanti|festival|sanremo|attore|attrice|film|serie|concerto|musica/i.test(title)) return 'entertainment';
  if (/musei|museo|libro|mostra|arte|tributo|cappelle|gioielli/i.test(title)) return 'arts';
  if (/weekend|autonomia|cani|gatti|casa|viaggio|ristorante/i.test(title)) return 'lifestyle';
  return 'others';
}

function classifyMediafaxTitle(title: string): NewsSection {
  if (!title) return 'others';
  if (/r[ăa]zboi|atac|dron|iran|israel|ucraina|submarine|nucleare|bomb|lovit|mijlociu|militar|ormuz/iu.test(title)) {
    return 'conflicts';
  }
  if (/trump|orban|alegeri|prim-ministru|guvern|parlament|ministr|pre[sș]ed|justi[țt]ie|milei/iu.test(title)) {
    return 'politics';
  }
  if (/petrol|energie|banc|economic|infla[țt]ie|pre[țt]|afaceri|compani|financ|euro|salari/iu.test(title)) {
    return 'business';
  }
  if (/s[ăa]n[ăa]tate|boal|spital|avort|beb|nou-n[ăa]scut|oase|cromozom/iu.test(title)) return 'health';
  if (/[șs]tiin|cimitir preistoric|schelete|cromozom/iu.test(title)) return 'science';
  if (/influencer|actor|film|muzic|showbiz/iu.test(title)) return 'entertainment';
  return 'others';
}

function classifyNewsbeastTitle(title: string): NewsSection {
  if (!title) return 'others';
  const parapolitikaSection = classifyParapolitikaTitle(title);
  if (parapolitikaSection !== 'others') return parapolitikaSection;
  if (/j2us|τηλεόρασ|ριάλιτι|ηθοποι|τραγουδ|σειρ|σινεμά|σόου|μουσικ|παρουσιαστ/iu.test(title)) return 'entertainment';
  if (/σπίτι|διακόσμ|μόδα|ομορφιά|ταξίδ|συνταγ|ζώδια|μαγειρ|κατοικ/iu.test(title)) return 'lifestyle';
  if (/τεχνολογ|τεχνητή νοημοσύνη|chatgpt|apple|iphone|android|ai\b/iu.test(title)) return 'tech';
  if (/υγεία|νοσοκομ|χειρουργ|γρίπ|βρέφος|εγκέφαλ|ιατρ/iu.test(title)) return 'health';
  return 'others';
}

function classifyNaftemporikiTitle(title: string): NewsSection {
  if (!title) return 'others';
  const newsbeastSection = classifyNewsbeastTitle(title);
  if (newsbeastSection !== 'others') return newsbeastSection;
  if (/οικονομ|χρηματιστηρ|αγορ|τράπεζ|μετοχ|ευρώ|ενέργει|θεσμικ|επενδ|αξιόχρεο|εταιρ/iu.test(title)) {
    return 'business';
  }
  if (/σειρά|ταιν|σινεμά|μουσικ|φεστιβάλ/iu.test(title)) return 'entertainment';
  if (/θέατρ|μουσε|τέχν|έκθεσ|βιβλί/iu.test(title)) return 'arts';
  return 'others';
}

function classifyFolhaTitle(title: string): NewsSection {
  if (!title) return 'others';
  if (/neymar|copa|jogador|mundial|espn|esporte|bts\b.*show|tost[aã]o/i.test(title)) return 'sports';
  if (/golpe|bolsonaro|lula|haddad|tarc[ií]sio|moraes|stf|pgr|campanha|elei[cç][aã]o|pt\b|ditadura/i.test(title)) {
    return 'politics';
  }
  if (/diesel|selic|combust[ií]vel|petrobras|economia|venda|credito|cr[eé]dito|tesouro direto|barris|neg[oó]cio/i.test(title)) {
    return 'business';
  }
  if (/c[aâ]ncer|hpv|dislexia|gripe|resfriado|sangue|engravidar|doen[cç]as infecciosas/i.test(title)) return 'health';
  if (/bbb|tv|streaming|lollapalooza|ator|atriz|show|filme|s[eé]rie|rapper|globo|musical/i.test(title)) return 'entertainment';
  if (/openai|metaverso|internet|ia\b|intelig[eê]ncia artificial/i.test(title)) return 'tech';
  if (/espa[cç]o|dinossauro|esp[eé]cies/i.test(title)) return 'science';
  if (/astrologia|merc[uú]rio retr[oó]grado|drinques|looksmaxxing/i.test(title)) return 'lifestyle';
  return 'others';
}

function classifyClarinTitle(title: string): NewsSection {
  if (!title) return 'others';
  if (/boca|river|messi|fifa|mundial|copa|f[óo]rmula 1|tenis|rugby|deportes?/i.test(title)) return 'sports';
  if (/d[óo]lar|acciones?|mercado|econom[ií]a|finanzas?|empres|salarios?|reforma laboral/i.test(title)) return 'business';
  if (/c[aá]ncer|acv|dieta|salud|m[eé]dico|arterias/i.test(title)) return 'health';
  if (/oscar|netflix|gran hermano|lollapalooza|serie|pel[ií]cula|actor|cantante|streaming|bts/i.test(title)) return 'entertainment';
  if (/astrolog[ií]a|hor[oó]scopo|receta|cocina|bienestar|hotel|visitar/i.test(title)) return 'lifestyle';
  if (/arquitect|libro|museo|arte|poes[ií]a|fil[óo]sofo/i.test(title)) return 'arts';
  if (/golpe de 1976|uscis|polic[ií]a|francotiradores|dictadura|gobierno|presidente/i.test(title)) return 'politics';
  if (/tormenta|vientos|lluvia/i.test(title)) return 'climate';
  return 'others';
}

function classifyUolTitle(title: string): NewsSection {
  if (!title) return 'others';
  if (/masters 1000|vit[oó]ria|lollapalooza|futebol|t[eê]nis|sports?/i.test(title)) return 'sports';
  if (/diesel|energia|economia|finan[cç]a|setor privado|wi-?fi|OpenAI/i.test(title)) return 'business';
  if (/c[aâ]ncer|sa[uú]de|alimentos|microbiota|tratamento/i.test(title)) return 'health';
  if (/TV|streaming|artistas|teatro|show|Lollapalooza/i.test(title)) return 'entertainment';
  if (/Moraes|Lula|Trump|ICE|STF|den[uú]ncia|r[eé]u/i.test(title)) return 'politics';
  if (/enxurrada|chuvas|tempestade/i.test(title)) return 'climate';
  if (/capivara|mulher|professor|aeroportos|paz|Ucr[aâ]nia|Ir[aã]/i.test(title)) return 'world';
  if (/Mega-Sena|Quina|Lotof[aá]cil/i.test(title)) return 'lifestyle';
  return 'others';
}

function classifySwissinfoEsTitle(title: string): NewsSection {
  if (!title) return 'others';
  if (/m[aá]rquez|sprint|pole|victoria|t[eé]cnico/i.test(title)) return 'sports';
  if (/petrolero|derrames|energ[ií]a|empresa/i.test(title)) return 'business';
  if (/alto el fuego|atacando|violencia|asesinato|frentes/i.test(title)) return 'conflicts';
  if (/presidencia|amnist[ií]a|Casa Blanca|di[aá]logo|Patriarcado|Petro|Orb[aá]n|EEUU|Celac/i.test(title)) return 'politics';
  return 'world';
}

function classifyKyodoTitle(title: string): NewsSection {
  if (!title) return 'others';
  if (/ハーフパイプ|ジャンプ|表彰台|メッツ|開幕|戦|失格|連勝|2位|男子|最終戦/.test(title)) return 'sports';
  if (/天気/.test(title)) return 'climate';
  if (/イラン|ウクライナ|G7|攻撃停止|負傷者|死亡|移民捜査官|空港派遣|トランプ/.test(title)) return 'conflicts';
  if (/内政不干渉|外相声明|交渉条件|警告/.test(title)) return 'politics';
  if (/洗浄剤開発|開発/.test(title)) return 'tech';
  return 'world';
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

function extractRedirectTargetUrl(url: string): string {
  const match = url.match(/\*(https?:\/\/.+)$/i);
  if (match?.[1]) return match[1];
  return url;
}
