import type { NewsSection } from '@/lib/types';
import {
  buildArticleHintText,
  classifyExplicitSourceOverride,
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
  sectionCandidates: ArticleTaxonomySectionCandidate[];
  topicCandidates: ArticleTaxonomyTopicCandidate[];
  taxonomyVersion: string;
};

export type ArticleTaxonomySectionCandidate = {
  label: NewsSection;
  score: number;
  reasons: string[];
};

export type ArticleTaxonomyTopicCandidate = {
  section: NewsSection;
  label: string;
  score: number;
  reasons: string[];
};

type TopicRule = {
  topic: string;
  patterns: readonly RegExp[];
};

const rx = (pattern: string): RegExp => new RegExp(pattern, 'iu');

const SECTION_TOPIC_RULES: Partial<Record<NewsSection, readonly TopicRule[]>> = {
  world: [
    { topic: 'border disputes', patterns: [rx('border dispute|territorial dispute|maritime dispute|sovereignty claim|demarcation|island dispute')] },
    { topic: 'sanctions / trade', patterns: [rx('sanctions?|tariffs?|trade war|export control|export ban|embargo|blacklist')] },
    { topic: 'humanitarian aid', patterns: [rx('humanitarian|aid convoy|relief effort|food aid|medical aid|rescue mission|evacuation')] },
    { topic: 'international courts', patterns: [rx('icc\\b|icj\\b|international court|tribunal|arbitration court|human rights court')] },
    { topic: 'espionage / sabotage', patterns: [rx('espionage|spy ring|counterintelligence|sabotage|intelligence service')] },
    { topic: 'maritime security', patterns: [rx('tanker|shipping lane|strait of|canal traffic|merchant vessel|coast guard')] },
    { topic: 'regional tensions', patterns: [rx('iran|israel|gaza|tehran|kuwait|ukraine|middle east|asia barat|medio oriente|medioriente|piloto americano|american pilot|invasor')] },
    { topic: 'diplomacy', patterns: [rx('diplomac|summit|treaty|embassy|foreign minister|bilateral|delegation|consul')] },
    { topic: 'migration', patterns: [rx('migration|migrant|refugee|asylum|border crossing|deportation|diaspora')] },
    { topic: 'disasters', patterns: [rx('earthquake|flood|wildfire|storm|hurricane|typhoon|landslide|disaster|eruption')] },
    { topic: 'aviation / transport', patterns: [rx('aviation|airline|airport|flight|railway|train crash|shipping|ferry|port')] },
    { topic: 'crime / security', patterns: [rx('kidnap|murder|police raid|organized crime|smuggling|terror alert|security alert')] },
    { topic: 'international affairs', patterns: [rx('\\bworld\\b|international|internacional|mundo|dunya|gundem|nyheter|в мире|мир\\b|國際|国际|world news|global affairs')] },
  ],
  politics: [
    { topic: 'political news', patterns: [rx('politics|politica|politik|politique|politika|polityka|politische|政治|политика|정치|سياسة|chinh tri')] },
    { topic: 'legislation', patterns: [rx('bill\\b|draft law|lawmakers?|parliament vote|senate vote|house vote|legislation')] },
    { topic: 'budget / taxes', patterns: [rx('budget|spending bill|appropriation|tax reform|tax cut|tax hike|fiscal package')] },
    { topic: 'cabinet / appointments', patterns: [rx('cabinet reshuffle|nominee|confirmed by senate|appointed as|minister designate|chief of staff')] },
    { topic: 'corruption / ethics', patterns: [rx('corruption|bribery|graft|ethics probe|conflict of interest|embezzlement')] },
    { topic: 'constitutional reform', patterns: [rx('constitution|constitutional reform|constitutional amendment|term limits|charter reform')] },
    { topic: 'immigration policy', patterns: [rx('immigration policy|border policy|asylum policy|visa rules|deportation policy')] },
    { topic: 'local government', patterns: [rx('mayor\\b|city council|governor\\b|state legislature|provincial government|municipal')] },
    { topic: 'executive power', patterns: [rx('executive order|presidential decree|prime minister office|presidency|white house')] },
    { topic: 'elections', patterns: [rx('election|ballot|polls?\\b|campaign|primary race|runoff|vote count|referendum')] },
    { topic: 'government policy', patterns: [rx('cabinet|parliament|congress|senate|minister|ministry|bill\\b|lawmakers?|executive order|regulation|president|prime minister|government|administration|quoc hoi|國會|국회')] },
    { topic: 'courts / justice', patterns: [rx('court|judge|lawsuit|trial|verdict|prosecutor|supreme court|indictment|appeal')] },
    { topic: 'diplomacy', patterns: [rx('summit|treaty|foreign policy|embassy|diplomat|sanctions|peace talks')] },
    { topic: 'protests', patterns: [rx('protest|demonstration|march\\b|rally\\b|strike\\b|sit-in|activists?')] },
  ],
  conflicts: [
    { topic: 'military exercises', patterns: [rx('military exercise|war games|live fire drill|drills?\\b|joint exercise')] },
    { topic: 'military incidents', patterns: [rx('fighter jet|f-15|pilot|crew member|search operation|rescue operation|downed aircraft|military crash')] },
    { topic: 'naval operations', patterns: [rx('warship|frigate|destroyer|submarine|carrier strike|naval patrol|navy\\b')] },
    { topic: 'cyber warfare', patterns: [rx('cyberattack|cyber war|electronic warfare|jamming|hacked military')] },
    { topic: 'militias / insurgency', patterns: [rx('militia|insurgent|rebel group|guerrilla|paramilitary')] },
    { topic: 'civilian casualties', patterns: [rx('civilian deaths|civilian casualties|wounded civilians|children killed|aid workers killed')] },
    { topic: 'occupied territories', patterns: [rx('occupation|occupied territory|checkpoint|settlement expansion|buffer zone|demilitarized zone')] },
    { topic: 'airstrikes / missiles', patterns: [rx('airstrike|missile|rocket fire|drone strike|bombing|shelling|bombarde|ataque|attack|saldiri|serangan|misseis|drones?')] },
    { topic: 'ground operations', patterns: [rx('troops?|offensive|frontline|artillery|incursion|clashes?|battlefield')] },
    { topic: 'ceasefire / talks', patterns: [rx('ceasefire|truce|peace talks|negotiation|mediat|de-escalation')] },
    { topic: 'hostages / prisoners', patterns: [rx('hostage|detainee|prisoner exchange|captives?|release talks')] },
    { topic: 'war / tensions', patterns: [rx('war\\b|guerra|conflict|konflik|middle east|medio oriente|asia barat|iran|israel|gaza|tehran|ukraine|войн|конфликт|военн|спецоперац|армия|боевые действия|обстрел')] },
    { topic: 'defense / weapons', patterns: [rx('defense|military aid|weapons?|arms deal|warplane|navy|munitions')] },
  ],
  business: [
    { topic: 'trade / tariffs', patterns: [rx('trade deal|trade talks|trade surplus|trade deficit|tariffs?|export ban|imports?\\b|exports?\\b')] },
    { topic: 'supply chains', patterns: [rx('supply chain|container rates|shipping costs|inventory glut|logistics bottleneck')] },
    { topic: 'labor / employment', patterns: [rx('layoffs?|job cuts|wages?\\b|labor union|hiring spree|employment data|payrolls?')] },
    { topic: 'manufacturing', patterns: [rx('factory|manufacturing|industrial output|plant closure|production line|industrial production')] },
    { topic: 'commodities', patterns: [rx('commodity|copper|gold\\b|silver\\b|wheat|corn|soybeans|iron ore|nickel|lithium')] },
    { topic: 'tourism / hospitality', patterns: [rx('tourism|hotel occupancy|resort|hospitality|travel demand|visitor arrivals')] },
    { topic: 'agriculture / agribusiness', patterns: [rx('harvest|crop yields|agribusiness|farmer protests|livestock|grain exports')] },
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
    { topic: 'general technology', patterns: [rx('technology|tech\\b|high tech|tecnologia|tecnología|teknologi|digitale|digitales|digitais|digital\\b|科技|technology news|innovacion digital|innovazione digitale|tecnologia digital')] },
    { topic: 'robotics / automation', patterns: [rx('robotics|robot\\b|automation|industrial robot|humanoid robot')] },
    { topic: 'mobility tech', patterns: [rx('head up display|\\bhud\\b|dashcam|driver assist|connected car|vehicle safety|traffic signal|automotive tech|car tech|radar da psp|radares|sinais h46|sinais h47')] },
    { topic: 'developer tools', patterns: [rx('developer tool|open source|github\\b|programming language|framework|api platform')] },
    { topic: 'internet policy', patterns: [rx('content moderation|net neutrality|digital services act|platform regulation|privacy law|antitrust probe')] },
    { topic: 'ar / vr', patterns: [rx('virtual reality|augmented reality|mixed reality|vr headset|ar glasses|spatial computing')] },
    { topic: 'autonomous vehicles', patterns: [rx('self driving|autonomous vehicle|driverless|robotaxi|autopilot')] },
    { topic: 'quantum', patterns: [rx('quantum computing|qubit|quantum processor|quantum network')] },
    { topic: 'data centers', patterns: [rx('data center|server farm|compute cluster|cloud region|gpu cluster')] },
    { topic: 'ai', patterns: [rx('\\bai\\b|\\bia\\b|artificial intelligence|inteligencia artificial|machine learning|llm\\b|chatbot|generative ai|openai|anthropic|인공지능')] },
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
    { topic: 'rugby', patterns: [rx('rugby|six nations|super rugby|rugby championship')] },
    { topic: 'athletics / track', patterns: [rx('athletics|track and field|sprinter|marathon|diamond league')] },
    { topic: 'cycling', patterns: [rx('cycling|cyclist|tour de france|giro d italia|vuelta')] },
    { topic: 'swimming', patterns: [rx('swimming|swimmer|freestyle final|backstroke|butterfly')] },
  ],
  health: [
    { topic: 'infectious disease', patterns: [rx('outbreak|virus|flu\\b|measles|cholera|dengue|tuberculosis|infection rates')] },
    { topic: 'health policy', patterns: [rx('health ministry|health funding|insurance reform|medicaid|nhs\\b|public health agency')] },
    { topic: 'reproductive health', patterns: [rx('abortion|maternal health|fertility|ivf\\b|contraception|prenatal')] },
    { topic: 'medical research', patterns: [rx('medical research|journal study|trial results|peer reviewed|researchers found')] },
    { topic: 'aging / seniors', patterns: [rx('aging population|elder care|nursing home|alzheimer|dementia|senior care')] },
    { topic: 'disability / rehab', patterns: [rx('disability|rehabilitation|physical therapy|assistive technology|prosthetic')] },
    { topic: 'public health', patterns: [rx('outbreak|pandemic|epidemic|vaccin|virus|disease control|who\\b|cdc\\b|infection')] },
    { topic: 'healthcare', patterns: [rx('hospital|clinic|healthcare|medical care|nursing|medicare|insurance plan|surgery')] },
    { topic: 'mental health', patterns: [rx('mental health|depression|anxiety|suicide prevention|therapy|addiction')] },
    { topic: 'pharma / biotech', patterns: [rx('pharma|biotech|drugmaker|clinical trial|fda\\b|therapeutic|vaccine maker')] },
    { topic: 'nutrition / fitness', patterns: [rx('nutrition|diet\\b|obesity|fitness|exercise|wellness|protein\\b')] },
  ],
  entertainment: [
    { topic: 'streaming', patterns: [rx('streaming service|streamer\\b|disney\\+|hbo max|prime video|binge watching')] },
    { topic: 'animation / anime', patterns: [rx('anime|animation|animated film|animated series|manga adaptation')] },
    { topic: 'festivals / live events', patterns: [rx('festival|fan convention|comic con|premiere event|live show')] },
    { topic: 'radio / podcasts', patterns: [rx('podcast|radio show|audio series|broadcast host')] },
    { topic: 'film / tv', patterns: [rx('film\\b|movie|cinema|television|tv series|streaming|netflix|box office')] },
    { topic: 'music', patterns: [rx('music|album|single\\b|concert|tour dates|festival|billboard charts')] },
    { topic: 'celebrities', patterns: [rx('celebrit|actor|actress|star couple|influencer|royal family')] },
    { topic: 'awards', patterns: [rx('oscars?|emmys?|grammys?|bafta|cannes|golden globes')] },
  ],
  lifestyle: [
    { topic: 'parenting', patterns: [rx('parenting|childcare|co parenting|school run|raising children')] },
    { topic: 'pets / animals', patterns: [rx('pets?\\b|dog show|cat\\b|veterinary|animal care|pet adoption')] },
    { topic: 'careers / worklife', patterns: [rx('remote work|work life balance|office culture|career advice|burnout')] },
    { topic: 'outdoors / adventure', patterns: [rx('camping|hiking|outdoor adventure|backpacking|trail guide|surf trip')] },
    { topic: 'fashion / beauty', patterns: [rx('fashion|beauty|makeup|skincare|jewelry|runway|designer')] },
    { topic: 'travel', patterns: [rx('travel|tourism|vacation|holiday guide|hotel|destination|cruise')] },
    { topic: 'food / drink', patterns: [rx('food\\b|recipe|restaurant|chef\\b|wine\\b|coffee\\b|cocktail')] },
    { topic: 'home / design', patterns: [rx('interior|decor|home design|garden|furniture|renovation')] },
    { topic: 'relationships / family', patterns: [rx('dating|wedding|marriage|parenting|family life|relationships?')] },
  ],
  arts: [
    { topic: 'photography', patterns: [rx('photography|photographer|photo exhibit|photojournalism')] },
    { topic: 'heritage / preservation', patterns: [rx('heritage site|restoration project|unesco\\b|preservation effort')] },
    { topic: 'auctions / collectibles', patterns: [rx('auction house|collectible|memorabilia|record sale|rare manuscript')] },
    { topic: 'comics / manga', patterns: [rx('comic book|graphic novel|manga\\b|comic con')] },
    { topic: 'visual art', patterns: [rx('gallery|museum|exhibit|exhibition|painting|sculpture|art fair')] },
    { topic: 'books / literature', patterns: [rx('book\\b|novel|literature|author\\b|poetry|publishing')] },
    { topic: 'theater / dance', patterns: [rx('theatre|theater|stage play|ballet|opera|dance company')] },
    { topic: 'architecture / design', patterns: [rx('architecture|architect|design week|urban design')] },
  ],
  science: [
    { topic: 'climate science', patterns: [rx('climate study|atmospheric research|ice core|weather model|warming trend')] },
    { topic: 'earth science', patterns: [rx('geology|earth science|seismic study|tectonic|volcanology')] },
    { topic: 'neuroscience', patterns: [rx('neuroscience|brain study|neural pathway|cognitive science')] },
    { topic: 'chemistry / materials', patterns: [rx('chemistry|material science|battery chemistry|polymer|catalyst')] },
    { topic: 'ocean science', patterns: [rx('oceanography|marine science|deep sea|coral reef study|ocean current')] },
    { topic: 'space / astronomy', patterns: [rx('space\\b|astronomy|telescope|planet|galaxy|asteroid|astronaut')] },
    { topic: 'biology / medicine', patterns: [rx('genetic|genome|biology|species\\b|cell study|medical research')] },
    { topic: 'archaeology / history', patterns: [rx('archaeolog|fossil|ancient|excavation|artifact|paleontolog')] },
    { topic: 'physics / energy', patterns: [rx('physics|quantum|particle|fusion\\b|nuclear research|material science')] },
  ],
  climate: [
    { topic: 'weather / forecasts', patterns: [rx('weather|forecast|pronostico|meteo|meteorolog|clima|heavy rain|strong winds|rain warning|lluvias?|พยากรณ์อากาศ|ฝนตกหนัก')] },
    { topic: 'fires / smoke', patterns: [rx('fire\\b|incendi|wildfire|yangin|smoke|blaze|burning building')] },
    { topic: 'pollution / air quality', patterns: [rx('pollution|air quality|smog|toxic spill|microplastics|contamination|คุณภาพอากาศ')] },
    { topic: 'water scarcity', patterns: [rx('water scarcity|water shortage|reservoir levels|desalination|drought restrictions')] },
    { topic: 'biodiversity / wildlife', patterns: [rx('wildlife|species loss|endangered|habitat loss|poaching|ecosystem')] },
    { topic: 'waste / recycling', patterns: [rx('recycling|landfill|waste management|plastic waste|circular economy')] },
    { topic: 'climate finance', patterns: [rx('carbon market|green finance|adaptation finance|loss and damage|sustainability bond')] },
    { topic: 'food systems', patterns: [rx('food system|regenerative agriculture|soil health|methane from cattle|sustainable farming')] },
    { topic: 'extreme weather', patterns: [rx('heatwave|wildfire|flood|storm|hurricane|typhoon|drought|extreme weather|weather warning|strong wind|downpour')] },
    { topic: 'energy transition', patterns: [rx('renewable|solar|wind\\b|battery|electric vehicle|energy transition|grid\\b')] },
    { topic: 'emissions / policy', patterns: [rx('carbon|emissions?|net zero|climate policy|cop\\d+|decarbon')] },
    { topic: 'conservation', patterns: [rx('conservation|biodiversity|deforestation|marine life|forest protection|oceans?')] },
  ],
};

const TAXONOMY_VERSION = 'candidates-v4';

const OTHERS_RECOVERY_THRESHOLDS: Partial<Record<NewsSection, number>> = {
  tech: 0.7,
  business: 0.65,
  conflicts: 0.65,
  sports: 0.65,
};

const RECOVERED_SECTION_TOPIC_FALLBACKS: Partial<Record<NewsSection, string>> = {
  tech: 'general technology',
  business: 'general business',
  conflicts: 'war / tensions',
  sports: 'general sports',
};

export function isTopicAllowedForSection(section: string | null | undefined, topic: string | null | undefined): boolean {
  const normalizedTopic = (topic || '').trim().toLowerCase();
  if (!normalizedTopic) return false;
  const normalizedSection = normalizeNewsSection(section);
  if (RECOVERED_SECTION_TOPIC_FALLBACKS[normalizedSection] === normalizedTopic) {
    return true;
  }
  const rules = SECTION_TOPIC_RULES[normalizedSection] || [];
  return rules.some((rule) => rule.topic === normalizedTopic);
}

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
  const explicitSourceOverrideSection = source || url ? classifyExplicitSourceOverride({ source, url, title }) : null;
  const structuredHintSection = source || url ? classifySectionByStructuredHints(source, url) : 'others';
  const sourceFallbackSection = source || url ? classifySectionBySourceFallback({ source, url, title }) : 'others';
  const contextSection = source || url ? deriveSectionFromContext({ source, url, title }) : 'others';
  const sectionCandidates = buildSectionCandidates({
    storedSection,
    explicitSourceOverrideSection,
    feedCategorySections,
    titleSection,
    textSection,
    structuredHintSection,
    hintKeywordSection,
    sourceFallbackSection,
    contextSection,
  });
  const recoveredSectionFromOthers = explicitSourceOverrideSection === 'others'
    ? pickRecoveredSectionFromOthers(sectionCandidates)
    : null;
  const derivedSection = pickFirstMeaningfulSection([
    ...feedCategorySections,
    titleSection,
    textSection,
    structuredHintSection,
    hintKeywordSection,
    sourceFallbackSection,
    contextSection,
  ]);

  let primarySection = explicitSourceOverrideSection || pickFirstMeaningfulSection(feedCategorySections);
  if (recoveredSectionFromOthers) {
    primarySection = recoveredSectionFromOthers;
  } else {
    if (!explicitSourceOverrideSection && primarySection === 'others' && derivedSection !== 'others') {
      primarySection = derivedSection;
    }
    if (!explicitSourceOverrideSection && primarySection === 'others' && storedSection !== 'others') {
      primarySection = storedSection;
    }
    if (
      !explicitSourceOverrideSection &&
      primarySection !== derivedSection &&
      derivedSection !== 'others' &&
      (primarySection === 'arts' || primarySection === 'entertainment' || primarySection === 'lifestyle' || primarySection === 'others')
    ) {
      primarySection = derivedSection;
    }
  }

  const sections: NewsSection[] = [];
  pushSection(sections, primarySection);
  for (const section of [
    ...feedCategorySections,
    titleSection,
    textSection,
    explicitSourceOverrideSection || 'others',
    structuredHintSection,
    hintKeywordSection,
    sourceFallbackSection,
    contextSection,
  ]) {
    pushSection(sections, section);
  }

  if (sections.length > 1 && primarySection !== 'others') {
    const othersIndex = sections.indexOf('others');
    if (othersIndex >= 0) sections.splice(othersIndex, 1);
  }

  if (!sections.length) {
    sections.push('others');
  }

  const topicSection = recoveredSectionFromOthers
    ? recoveredSectionFromOthers
    : explicitSourceOverrideSection === 'others'
    ? 'others'
    : primarySection === 'others'
    ? pickFirstMeaningfulSection(sections)
    : primarySection;
  const topicSignalText = buildTopicSignalText([
    ...sourceCategories,
    title,
    snippet,
    url,
  ]);
  let topicCandidates = topicSection === 'others'
    ? []
    : classifyDetailedTopicCandidates(topicSection, topicSignalText);
  if (recoveredSectionFromOthers && topicCandidates.length === 0) {
    topicCandidates = buildRecoveredTopicFallbackCandidates(recoveredSectionFromOthers);
  }
  const topics = topicCandidates.map((candidate) => candidate.label);

  return {
    primarySection,
    sections,
    sourceCategories,
    primaryTopic: topics[0] || null,
    topics,
    sectionCandidates,
    topicCandidates,
    taxonomyVersion: TAXONOMY_VERSION,
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

function buildSectionCandidates(input: {
  storedSection: NewsSection;
  explicitSourceOverrideSection: NewsSection | null;
  feedCategorySections: NewsSection[];
  titleSection: NewsSection;
  textSection: NewsSection;
  structuredHintSection: NewsSection;
  hintKeywordSection: NewsSection;
  sourceFallbackSection: NewsSection;
  contextSection: NewsSection;
}): ArticleTaxonomySectionCandidate[] {
  const candidates = new Map<NewsSection, { score: number; reasons: Set<string> }>();

  const add = (label: NewsSection, score: number, reason: string) => {
    if (!label) return;
    if (label === 'others' && reason !== 'source_override') return;
    const current = candidates.get(label) || { score: 0, reasons: new Set<string>() };
    current.score = Math.min(1, Number((current.score + score).toFixed(3)));
    if (reason) current.reasons.add(reason);
    candidates.set(label, current);
  };

  if (input.explicitSourceOverrideSection) {
    add(input.explicitSourceOverrideSection, 0.95, 'source_override');
  }

  for (const section of input.feedCategorySections) {
    add(section, 0.55, 'feed_category');
  }

  add(input.titleSection, 0.35, 'title_keyword');
  add(input.textSection, 0.2, 'snippet_keyword');
  add(input.structuredHintSection, 0.45, 'structured_hint');
  add(input.hintKeywordSection, 0.25, 'hint_keyword');
  add(input.sourceFallbackSection, 0.5, 'source_fallback');
  add(input.contextSection, 0.3, 'context');
  add(input.storedSection, 0.1, 'stored_section');

  const rows = [...candidates.entries()]
    .map(([label, entry]) => ({
      label,
      score: Number(entry.score.toFixed(2)),
      reasons: [...entry.reasons].sort(),
    }))
    .sort((left, right) => right.score - left.score || NEWS_SECTION_ORDER.indexOf(left.label) - NEWS_SECTION_ORDER.indexOf(right.label));

  if (rows.length > 0) {
    return rows;
  }

  return [
    {
      label: 'others',
      score: 1,
      reasons: ['fallback:others'],
    },
  ];
}

function pickRecoveredSectionFromOthers(
  candidates: ReadonlyArray<ArticleTaxonomySectionCandidate>
): NewsSection | null {
  for (const candidate of candidates) {
    if (candidate.label === 'others') continue;
    const threshold = OTHERS_RECOVERY_THRESHOLDS[candidate.label];
    if (threshold == null) continue;
    if (candidate.score >= threshold) {
      return candidate.label;
    }
  }
  return null;
}

function buildRecoveredTopicFallbackCandidates(section: NewsSection): ArticleTaxonomyTopicCandidate[] {
  const fallback = RECOVERED_SECTION_TOPIC_FALLBACKS[section];
  if (!fallback) return [];
  return [
    {
      section,
      label: fallback,
      score: 0.55,
      reasons: ['recovered_section_fallback'],
    },
  ];
}

function classifyDetailedTopicCandidates(section: NewsSection, signalText: string): ArticleTaxonomyTopicCandidate[] {
  if (!signalText) return [];
  const rules = SECTION_TOPIC_RULES[section] || [];
  const topics: ArticleTaxonomyTopicCandidate[] = [];

  for (const rule of rules) {
    const matchedCount = rule.patterns.reduce((count, pattern) => (pattern.test(signalText) ? count + 1 : count), 0);
    if (matchedCount <= 0) continue;
    topics.push({
      section,
      label: rule.topic,
      score: Math.min(1, Number((0.6 + Math.max(0, matchedCount - 1) * 0.15).toFixed(2))),
      reasons: ['topic_rule_match'],
    });
  }

  return topics.sort((left, right) => right.score - left.score || left.label.localeCompare(right.label));
}
