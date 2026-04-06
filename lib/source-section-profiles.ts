import type { NewsSection } from '@/lib/types';

type SourceSectionProfileInput = {
  source: string;
  url: string;
  title?: string | null;
  sourceCategories?: ReadonlyArray<string> | null;
};

type SourceSectionProfile = {
  sourcePattern: RegExp;
  categoryRules?: Array<{ pattern: RegExp; section: NewsSection }>;
  pathRules?: Array<{ pattern: RegExp; section: NewsSection }>;
  titleRules?: Array<{ pattern: RegExp; section: NewsSection }>;
};

function normalizeCategory(value: string): string {
  return value.trim().toLowerCase();
}

function getPathname(url: string): string {
  try {
    return new URL(url).pathname.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

const SOURCE_SECTION_PROFILES: SourceSectionProfile[] = [
  {
    sourcePattern: /yahoo taiwan/,
    categoryRules: [
      { pattern: /政治|政壇|選舉|立院|內閣|市政|外交/, section: 'politics' },
      { pattern: /健康|醫療|養生|保健|疾病|醫藥/, section: 'health' },
      { pattern: /娛樂|娛樂影劇|娛樂星聞|星聞|電影|影集|綜藝|偶像|音樂/, section: 'entertainment' },
      { pattern: /藝術|展覽|文學|畫展|美術館|文化|設計|表演/, section: 'arts' },
      { pattern: /體育|体育|運動|运动|棒球|籃球|足球|網球|高爾夫/, section: 'sports' },
      { pattern: /財經|財經新聞|經濟|经济|股市|證券|证券|金融|理財|房產|房市/, section: 'business' },
      { pattern: /科技|晶片|半導體|ai|人工智慧|手機|筆電|電動車|網路/, section: 'tech' },
      { pattern: /氣象|天氣|天气|空品|空氣品質|氣候|颱風|暴雨|高溫/, section: 'climate' },
    ],
    titleRules: [
      { pattern: /縣長|市長|總統|立委|議員|政院|立院|選戰|選舉|法規|政策|卓揆|內閣|藍營|綠營/, section: 'politics' },
      { pattern: /護理|醫療|醫院|病患|疫苗|疾病|健康|長照|醫學|養生|肝|豬瘟/, section: 'health' },
      { pattern: /影劇|電影|戲劇|歌手|演唱會|專輯|綜藝|偶像|藝人|星聞|翻唱|拖延症/, section: 'entertainment' },
      { pattern: /文資|文化部|展覽|畫展|藝文|文學|神父辭世|美術館/, section: 'arts' },
      { pattern: /棒球|籃球|足球|網球|高爾夫|球員|教練|賽事|季後賽/, section: 'sports' },
      { pattern: /財運|抽獎|股市|台糖|產業|房市|房產|企業|外銷|豬肉可以外銷|景氣|經濟/, section: 'business' },
      { pattern: /ai|人工智慧|半導體|晶片|電資|手機|筆電|科技|數位平權|網路/, section: 'tech' },
      { pattern: /豪雨|暴雨|高溫|低溫|颱風|氣象|空污|空品|淨土|天氣/, section: 'climate' },
      { pattern: /郵輪|旅客|暢遊|媽祖進香|觀光|旅遊|菊島/, section: 'lifestyle' },
      { pattern: /砂石車|行人慘死|工地|車禍|失控撞|便道|地方工程|警曝/, section: 'others' },
    ],
  },
  {
    sourcePattern: /infobae/,
    pathRules: [
      { pattern: /(?:^|\/)tecno(?:\/|$)/, section: 'tech' },
      { pattern: /(?:^|\/)(?:economia|negocios)(?:\/|$)/, section: 'business' },
      { pattern: /(?:^|\/)politica(?:\/|$)/, section: 'politics' },
      { pattern: /(?:^|\/)(?:deportes?|copa-america|mundial-de-clubes)(?:\/|$)/, section: 'sports' },
      { pattern: /(?:^|\/)teleshow(?:\/|$)/, section: 'entertainment' },
      { pattern: /(?:^|\/)cultura(?:\/|$)/, section: 'arts' },
      { pattern: /(?:^|\/)salud(?:\/|$)/, section: 'health' },
      { pattern: /(?:^|\/)(?:clima|medio-ambiente)(?:\/|$)/, section: 'climate' },
    ],
  },
  {
    sourcePattern: /tass/,
    pathRules: [
      { pattern: /^\/mezhdunarodnaya-panorama\//, section: 'world' },
      { pattern: /^\/politika\//, section: 'politics' },
      { pattern: /^\/ekonomika\//, section: 'business' },
      { pattern: /^\/sport\//, section: 'sports' },
      { pattern: /^\/armiya-i-opk\//, section: 'conflicts' },
      { pattern: /^\/(?:proisshestviya|obschestvo)\//, section: 'others' },
    ],
  },
  {
    sourcePattern: /people\.cn|people\.cn - news sitemap index/,
    categoryRules: [
      { pattern: /时政|政治|地方领导|人事|法治|党建|理论/, section: 'politics' },
      { pattern: /财经|经济|金融|股票|证券|房产|消费/, section: 'business' },
      { pattern: /科技|互联网|人工智能|ai|通信|汽车科技/, section: 'tech' },
      { pattern: /军事|国防|武器|台海|冲突|战争/, section: 'conflicts' },
      { pattern: /体育|足球|篮球|综合体育|奥运/, section: 'sports' },
      { pattern: /娱乐|文旅|文化|影视|综艺|明星/, section: 'entertainment' },
      { pattern: /健康|医药|医疗|养生/, section: 'health' },
      { pattern: /生态|环境|气候|天气|减排/, section: 'climate' },
      { pattern: /国际|环球/, section: 'world' },
      { pattern: /社会|地方|民生/, section: 'others' },
    ],
    titleRules: [
      { pattern: /总书记|国务院|中央|两会|人大|政协|外交部|政府|省委|书记|市长|选举|政治/, section: 'politics' },
      { pattern: /经济|财经|企业|金融|市场|股市|贸易|关税|投资|房产|消费/, section: 'business' },
      { pattern: /科技|人工智能|ai|芯片|半导体|互联网|数字|数据中心|手机|新能源车/, section: 'tech' },
      { pattern: /军事|国防|导弹|空袭|军演|冲突|战争|台海|武器/, section: 'conflicts' },
      { pattern: /健康|医院|医生|医疗|疫苗|疾病|手术|患者|养生|药/, section: 'health' },
      { pattern: /体育|比赛|联赛|篮球|足球|网球|球员|教练|奥运/, section: 'sports' },
      { pattern: /娱乐|电影|电视剧|明星|演出|综艺|歌手|演员|票房|音乐/, section: 'entertainment' },
      { pattern: /文化|文物|博物馆|展览|阅读|出版|艺术|戏剧/, section: 'arts' },
      { pattern: /气候|天气|暴雨|高温|污染|生态|减排|台风/, section: 'climate' },
      { pattern: /社会|民生|事故|火灾|通报|地方/, section: 'others' },
    ],
  },
  {
    sourcePattern: /newsis/,
    categoryRules: [
      { pattern: /정치|국회|대선|총선/, section: 'politics' },
      { pattern: /경제|증권|금융|산업|부동산/, section: 'business' },
      { pattern: /it|과학|기술|반도체|ai/, section: 'tech' },
      { pattern: /국제|외교/, section: 'world' },
      { pattern: /사회|지방|사건|사고/, section: 'others' },
      { pattern: /문화|연예|방송|영화/, section: 'entertainment' },
      { pattern: /스포츠|야구|축구|농구/, section: 'sports' },
      { pattern: /건강|의료|질병/, section: 'health' },
      { pattern: /기후|환경|날씨/, section: 'climate' },
    ],
    titleRules: [
      { pattern: /대통령|총리|국회|정부|여야|선거|장관|외교부|헌재|법안|정당|의회/, section: 'politics' },
      { pattern: /증시|주가|코스피|코스닥|환율|금리|기업|실적|경제|무역|관세|부동산|산업/, section: 'business' },
      { pattern: /ai|인공지능|반도체|칩|배터리|스마트폰|플랫폼|데이터센터|우주|로봇/, section: 'tech' },
      { pattern: /건강|의료|병원|환자|백신|질환|감염|치료|의사|수술/, section: 'health' },
      { pattern: /배우|가수|영화|드라마|예능|앨범|공연|팬미팅|방송|연예/, section: 'entertainment' },
      { pattern: /축구|야구|농구|배구|골프|테니스|올림픽|선수|감독|리그/, section: 'sports' },
      { pattern: /폭염|호우|태풍|미세먼지|대기질|산불|폭설|날씨/, section: 'climate' },
      { pattern: /화재|사고|체포|기소|사망|실종|흉기|교통사고|추락|붕괴/, section: 'others' },
    ],
  },
  {
    sourcePattern: /bbc news - sitemap index|bbc/,
    pathRules: [
      { pattern: /^\/sport\//, section: 'sports' },
      { pattern: /^\/news\/(?:business|business-\d+)/, section: 'business' },
      { pattern: /^\/news\/(?:technology|technology-\d+)/, section: 'tech' },
      { pattern: /^\/news\/(?:entertainment_and_arts|entertainment-and-arts|entertainment-\d+)/, section: 'entertainment' },
      { pattern: /^\/news\/(?:health|health-\d+)/, section: 'health' },
      { pattern: /^\/news\/(?:science-environment|science_and_environment|science-\d+|environment-\d+)/, section: 'climate' },
      { pattern: /^\/travel\//, section: 'lifestyle' },
      { pattern: /^\/news\/(?:uk-politics|politics|election-\d+)/, section: 'politics' },
      { pattern: /^\/news\/(?:world|world-\d+)/, section: 'world' },
    ],
    titleRules: [
      { pattern: /football|cricket|wembley|ipl|league|match|final|tournament|கேகேஆர்/i, section: 'sports' },
      { pattern: /weather|storm|flood|rain|wind|heatwave|шторм|замороз/i, section: 'climate' },
      { pattern: /crude oil|dollar|economy|steel|company|companies|trade|فولادی/i, section: 'business' },
      { pattern: /metro|council|local|city/i, section: 'others' },
    ],
  },
  {
    sourcePattern: /mirror media/,
    categoryRules: [
      { pattern: /政治|選舉|立院|外交|罷免|兩岸/, section: 'politics' },
      { pattern: /財經|股市|金融|房產|產業/, section: 'business' },
      { pattern: /科技|ai|半導體|3c|手機/, section: 'tech' },
      { pattern: /娛樂|影劇|明星|音樂|綜藝/, section: 'entertainment' },
      { pattern: /文化|藝術|設計|展覽|閱讀/, section: 'arts' },
      { pattern: /健康|醫療|養生|疾病/, section: 'health' },
      { pattern: /體育|運動|棒球|籃球|足球/, section: 'sports' },
      { pattern: /氣候|環境|天氣|污染|永續/, section: 'climate' },
      { pattern: /社會|地方|生活|民生/, section: 'others' },
    ],
  },
  {
    sourcePattern: /welt/,
    pathRules: [
      { pattern: /^\/politik\//, section: 'politics' },
      { pattern: /^\/wirtschaft\//, section: 'business' },
      { pattern: /^\/sport\//, section: 'sports' },
      { pattern: /^\/kultur\//, section: 'arts' },
      { pattern: /^\/unterhaltung\//, section: 'entertainment' },
      { pattern: /^\/gesundheit\//, section: 'health' },
      { pattern: /^\/(?:wissenschaft|technik)\//, section: 'tech' },
      { pattern: /^\/vermischtes\//, section: 'others' },
      { pattern: /^\/(?:politik\/ausland|ausland)\//, section: 'world' },
    ],
  },
];

export function classifySectionBySourceProfile(input: SourceSectionProfileInput): NewsSection | null {
  const source = (input.source || '').trim().toLowerCase();
  if (!source) return null;
  const pathname = getPathname(input.url || '');
  const title = (input.title || '').trim().toLowerCase();
  const categories = (input.sourceCategories || []).map(normalizeCategory).filter(Boolean);

  for (const profile of SOURCE_SECTION_PROFILES) {
    if (!profile.sourcePattern.test(source)) continue;

    for (const rule of profile.pathRules || []) {
      if (rule.pattern.test(pathname)) {
        return rule.section;
      }
    }

    for (const category of categories) {
      for (const rule of profile.categoryRules || []) {
        if (rule.pattern.test(category)) {
          return rule.section;
        }
      }
    }

    if (title) {
      for (const rule of profile.titleRules || []) {
        if (rule.pattern.test(title)) {
          return rule.section;
        }
      }
    }

    return null;
  }

  return null;
}
