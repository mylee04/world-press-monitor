import type { NewsSection } from '@/lib/types';

export type SourceTaxonomyOverrideContext = {
  source: string;
  title: string;
  url: string;
  hintText: string;
  hostname: string;
  pathname: string;
  search: string;
};

type SourceSectionOverride = {
  section: NewsSection;
  sourcePattern?: RegExp;
  hostnamePattern?: RegExp;
  pathnamePattern?: RegExp;
  titlePattern?: RegExp;
  hintPattern?: RegExp;
};

const SOURCE_SECTION_OVERRIDES: readonly SourceSectionOverride[] = [
  { section: 'world', sourcePattern: /bbc news - sitemap index/, pathnamePattern: /^\/news\// },
  { section: 'science', sourcePattern: /bbc news - sitemap index/, titlePattern: /science|scientists?|research|study finds|telescope|astronomy|fossil/ },
  { section: 'health', sourcePattern: /bbc news - sitemap index/, titlePattern: /health|doctor|hospital|disease|nhs|medical|medicine/ },
  { section: 'arts', sourcePattern: /bbc news - sitemap index/, titlePattern: /art|artist|museum|exhibition|novel|book|literature/ },
  { section: 'entertainment', sourcePattern: /bbc news - sitemap index/, titlePattern: /film|tv|actor|actress|music|album|concert|showbiz/ },

  { section: 'world', sourcePattern: /daily mail/, pathnamePattern: /^\/news\// },
  { section: 'tech', sourcePattern: /daily mail/, pathnamePattern: /^\/sciencetech\// },
  { section: 'sports', sourcePattern: /daily mail/, pathnamePattern: /^\/sport\// },
  { section: 'entertainment', sourcePattern: /daily mail/, pathnamePattern: /^\/tvshowbiz\// },
  { section: 'health', sourcePattern: /daily mail/, pathnamePattern: /^\/health\// },
  { section: 'business', sourcePattern: /daily mail/, pathnamePattern: /^\/money\// },
  { section: 'lifestyle', sourcePattern: /daily mail/, pathnamePattern: /^\/(?:femail|travel|property|home)\// },

  { section: 'world', sourcePattern: /ansa - sitemap index|^ansa\b/, pathnamePattern: /^\/sito\/notizie\/mondo\// },
  { section: 'world', sourcePattern: /ansa - sitemap index|^ansa\b/, pathnamePattern: /^\/english\/news\// },
  { section: 'world', sourcePattern: /ansa - sitemap index|^ansa\b/, pathnamePattern: /^\/(?:europa|china)\// },
  { section: 'business', sourcePattern: /ansa - sitemap index|^ansa\b/, pathnamePattern: /^\/sito\/notizie\/economia\// },
  { section: 'business', sourcePattern: /ansa - sitemap index|^ansa\b/, pathnamePattern: /^\/canale_motori\/notizie\// },
  { section: 'tech', sourcePattern: /ansa - sitemap index|^ansa\b/, pathnamePattern: /^\/sito\/notizie\/tecnologia\// },
  { section: 'arts', sourcePattern: /ansa - sitemap index|^ansa\b/, pathnamePattern: /^\/sito\/notizie\/cultura\// },
  { section: 'sports', sourcePattern: /ansa - sitemap index|^ansa\b/, pathnamePattern: /^\/sito\/notizie\/sport\// },
  { section: 'politics', sourcePattern: /ansa - sitemap index|^ansa\b/, pathnamePattern: /^\/sito\/notizie\/politica\// },
  { section: 'others', sourcePattern: /ansa - sitemap index|^ansa\b/, pathnamePattern: /^\/sito\/notizie\/cronaca\// },
  { section: 'others', sourcePattern: /ansa - sitemap index|^ansa\b/, pathnamePattern: /^\/(?:[a-z-]+)\/notizie\// },

  { section: 'politics', sourcePattern: /il resto del carlino/, pathnamePattern: /^\/[^/]+\/politica\// },
  { section: 'business', sourcePattern: /il resto del carlino/, pathnamePattern: /^\/[^/]+\/economia\// },
  { section: 'sports', sourcePattern: /il resto del carlino/, pathnamePattern: /^\/[^/]+\/sport\// },
  { section: 'climate', sourcePattern: /il resto del carlino/, pathnamePattern: /^\/[^/]+\/meteo\// },
  { section: 'lifestyle', sourcePattern: /il resto del carlino/, pathnamePattern: /^\/[^/]+\/cosa-fare\// },
  { section: 'sports', sourcePattern: /il resto del carlino/, titlePattern: /bologna|fortitudo|virtus|serie a|serie b|calcio|basket|motori|rossi|cremonese/ },
  { section: 'others', sourcePattern: /il resto del carlino/, pathnamePattern: /^\/[^/]+\/cronaca\// },

  { section: 'sports', sourcePattern: /times of india/, pathnamePattern: /^\/sports\// },
  { section: 'business', sourcePattern: /times of india/, pathnamePattern: /^\/business\// },
  { section: 'tech', sourcePattern: /times of india/, pathnamePattern: /^\/technology\// },
  { section: 'health', sourcePattern: /times of india/, pathnamePattern: /^\/health\// },
  { section: 'entertainment', sourcePattern: /times of india/, pathnamePattern: /^\/tv\// },
  { section: 'entertainment', sourcePattern: /times of india/, pathnamePattern: /^\/entertainment\// },
  { section: 'lifestyle', sourcePattern: /times of india/, pathnamePattern: /^\/(?:astrology|life-style)\// },
  { section: 'others', sourcePattern: /times of india/, pathnamePattern: /^\/(?:city|education)\// },
  { section: 'world', sourcePattern: /times of india/, pathnamePattern: /^\/(?:india|world)\// },
  { section: 'others', sourcePattern: /times of india/ },

  { section: 'tech', sourcePattern: /the indian express/, pathnamePattern: /^\/article\/technology\// },
  { section: 'business', sourcePattern: /the indian express/, pathnamePattern: /^\/article\/business\// },
  { section: 'sports', sourcePattern: /the indian express/, pathnamePattern: /^\/article\/sports\// },
  { section: 'entertainment', sourcePattern: /the indian express/, pathnamePattern: /^\/article\/entertainment\// },
  { section: 'lifestyle', sourcePattern: /the indian express/, pathnamePattern: /^\/article\/lifestyle\// },
  { section: 'politics', sourcePattern: /the indian express/, pathnamePattern: /^\/article\/legal-news\// },
  { section: 'others', sourcePattern: /the indian express/, pathnamePattern: /^\/article\/(?:cities|city|education|mumbai|pune|delhi|chandigarh)\// },
  { section: 'world', sourcePattern: /the indian express/, pathnamePattern: /^\/article\/india\// },

  {
    section: 'politics',
    sourcePattern: /yahoo taiwan/,
    titlePattern: /選舉|候選|立委|立法院|總統|競辦|民進黨|國民黨|民眾黨|罷免|議員|市長|執政|在野|內閣|政院/,
  },
  {
    section: 'climate',
    sourcePattern: /yahoo taiwan/,
    titlePattern: /氣象|雷雨|豪雨|大雨|高溫|低溫|颱風|天氣|氣溫|冷氣團|地震|空品|空氣品質/,
  },
  {
    section: 'business',
    sourcePattern: /yahoo taiwan/,
    titlePattern: /公司|財報|股價|股票|品牌|更名|市場|經濟|台積電|央行|漲價|出口|進口|關稅|投資/,
  },
  {
    section: 'tech',
    sourcePattern: /yahoo taiwan/,
    titlePattern: /iphone|android|ai|人工智慧|科技|晶片|半導體|手機|google|openai|nvidia|輝達|特斯拉|tesla/,
  },
  {
    section: 'entertainment',
    sourcePattern: /yahoo taiwan/,
    titlePattern: /電影|影集|演員|歌手|專輯|演唱會|戲劇|韓劇|台劇|綜藝|偶像|票房/,
  },
  {
    section: 'arts',
    sourcePattern: /yahoo taiwan/,
    titlePattern: /藝術|展出|展覽|畫作|畫展|博物館|美術館|攝影展|作家|文學/,
  },
  {
    section: 'sports',
    sourcePattern: /yahoo taiwan/,
    titlePattern: /棒球|籃球|足球|中職|日職|MLB|NBA|球員|教練|冠軍|聯賽|大谷/,
  },
  {
    section: 'others',
    sourcePattern: /yahoo taiwan/,
  },

  {
    section: 'politics',
    sourcePattern: /newsis/,
    titlePattern: /국힘|민주당|후보|대선|총선|대통령|국회|시당|구청장|선거|당대표|국민의힘|더불어민주당/,
  },
  {
    section: 'climate',
    sourcePattern: /newsis/,
    titlePattern: /기상청|기상|폭염|폭우|대설|태풍|호우|강풍|미세먼지|한파/,
  },
  {
    section: 'business',
    sourcePattern: /newsis/,
    titlePattern: /산업|주가|증시|코스피|코스닥|기업|반도체|배터리|수출|경제|금융/,
  },
  {
    section: 'others',
    sourcePattern: /newsis/,
    titlePattern: /화재|사고|완진|병원|선로|역서|공원|지연|교통|구조|실종/,
  },
  {
    section: 'others',
    sourcePattern: /newsis/,
  },

  {
    section: 'politics',
    sourcePattern: /kbs news/,
    titlePattern: /대선|총선|국회|대통령|장관|총리|정당|여당|야당|정치|특별시|선거/,
  },
  {
    section: 'business',
    sourcePattern: /kbs news/,
    titlePattern: /경제|증시|주가|반도체|수출|수입|산업|기업|방산|원달러|환율|금융/,
  },
  {
    section: 'climate',
    sourcePattern: /kbs news/,
    titlePattern: /지진|태풍|폭우|호우|강풍|폭염|한파|기상|기상청|산불|미세먼지/,
  },
  {
    section: 'entertainment',
    sourcePattern: /kbs news/,
    titlePattern: /재계약|드라마|영화|가수|세븐틴|앨범|예능|공연|콘서트|배우/,
  },
  {
    section: 'sports',
    sourcePattern: /kbs news/,
    titlePattern: /프로야구|축구|농구|배구|선수|감독|챔피언|우승|경기|월드컵/,
  },
  {
    section: 'others',
    sourcePattern: /kbs news/,
  },

  {
    section: 'sports',
    sourcePattern: /antara/,
    titlePattern: /hoki|piala dunia|atlet|kejuaraan|liga|semifinal|final four|paralimpiade|pemanah|panahan|sepak bola|voli|basket/,
  },
  {
    section: 'business',
    sourcePattern: /antara/,
    titlePattern: /ekonomi|pasar|rupiah|saham|investasi|industri|perdagangan|bank|perbankan|inflasi/,
  },
  {
    section: 'climate',
    sourcePattern: /antara/,
    titlePattern: /banjir|gempa|cuaca|hujan|longsor|gunung api|asap|kebakaran/,
  },
  {
    section: 'tech',
    sourcePattern: /antara/,
    titlePattern: /teknologi|digital|ai\\b|kecerdasan buatan|aplikasi|perangkat|gawai|startup/,
  },
  {
    section: 'others',
    sourcePattern: /antara/,
  },

  { section: 'tech', sourcePattern: /sapo - article sitemap/, hostnamePattern: /(?:^|\.)(?:tek|pplware)\.sapo\.pt$/ },
  { section: 'business', sourcePattern: /sapo - article sitemap/, hostnamePattern: /(?:^|\.)(?:executivedigest|jornaleconomico|eco|marketeer|hrportugal)\.sapo\.pt$/ },
  { section: 'lifestyle', sourcePattern: /sapo - article sitemap/, hostnamePattern: /(?:^|\.)travelmagg\.sapo\.pt$/ },
  { section: 'entertainment', sourcePattern: /sapo - article sitemap/, hostnamePattern: /(?:^|\.)magg\.sapo\.pt$/, pathnamePattern: /^\/(?:celebridades|televisao)\// },
  { section: 'health', sourcePattern: /sapo - article sitemap/, hostnamePattern: /(?:^|\.)magg\.sapo\.pt$/, pathnamePattern: /^\/saude\// },
  { section: 'lifestyle', sourcePattern: /sapo - article sitemap/, hostnamePattern: /(?:^|\.)magg\.sapo\.pt$/, pathnamePattern: /^\/(?:beleza|moda|relacoes|comida|decoracao|cultura-lifestyle)\// },
  { section: 'science', sourcePattern: /sapo - article sitemap/, pathnamePattern: /^\/noticias\/ciencia\// },
  { section: 'business', sourcePattern: /sapo - article sitemap/, pathnamePattern: /^\/noticias\/negocios\// },
  { section: 'politics', sourcePattern: /sapo - article sitemap/, pathnamePattern: /^\/opiniao\// },
  { section: 'tech', sourcePattern: /sapo - article sitemap/, pathnamePattern: /^\/mobile\// },
  { section: 'entertainment', sourcePattern: /sapo - article sitemap/, pathnamePattern: /^\/(?:celebridades|televisao)\// },
  { section: 'health', sourcePattern: /sapo - article sitemap/, pathnamePattern: /^\/vida-saudavel\// },
  { section: 'lifestyle', sourcePattern: /sapo - article sitemap/, pathnamePattern: /^\/(?:moda|beleza|comida|hoteis|o-melhor-de-portugal|top10)\// },

  {
    section: 'conflicts',
    sourcePattern: /(?:hmetro|bharian)/,
    hintPattern: /iran|israel|gaza|tehran|kuwait|asia barat|konflik asia barat|middle east|medio oriente|perjanjian damai|jet f 15|juruterbang|petrokimia|serangan|saldiri|trump says iran|military leaders killed/,
  },
  {
    section: 'sports',
    sourcePattern: /(?:hmetro|bharian)/,
    hintPattern: /\bepl\b|liga|bola|badminton|sukan|formula 1|motogp|tenis|pemain/,
  },
  {
    section: 'entertainment',
    sourcePattern: /(?:hmetro|bharian)/,
    hintPattern: /hiburan|artis|selebriti|filem|drama|muzik|konsert|album|penyanyi/,
  },

  {
    section: 'lifestyle',
    sourcePattern: /cebu daily news/,
    titlePattern: /beach|summer escape|vacation|travel|touris|park beach|resort/,
  },
];

function matches(pattern: RegExp | undefined, value: string): boolean {
  return pattern ? pattern.test(value) : true;
}

export function classifySectionBySourceOverride(context: SourceTaxonomyOverrideContext): NewsSection | null {
  for (const override of SOURCE_SECTION_OVERRIDES) {
    if (!matches(override.sourcePattern, context.source)) continue;
    if (!matches(override.hostnamePattern, context.hostname)) continue;
    if (!matches(override.pathnamePattern, context.pathname)) continue;
    if (!matches(override.titlePattern, context.title)) continue;
    if (!matches(override.hintPattern, context.hintText)) continue;
    return override.section;
  }
  return null;
}
