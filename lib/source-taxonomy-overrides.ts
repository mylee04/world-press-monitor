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
  { section: 'world', sourcePattern: /bbc news - sitemap index/, pathnamePattern: /^\/news\/world\// },
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
    section: 'health',
    sourcePattern: /yahoo taiwan/,
    titlePattern: /健康|醫療|醫院|醫師|新生兒|血液|血型|飲食|減重|癌症|病患|疫苗/,
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
    section: 'tech',
    sourcePattern: /newsis/,
    titlePattern: /ai|인공지능|데이터센터|클라우드|플랫폼|앱|모바일|마이크로소프트|ms와|디지털|테크|생성형/,
  },
  {
    section: 'health',
    sourcePattern: /newsis/,
    titlePattern: /건강|의료|병원|환자|백신|질환|감염|치료|의사|수술/,
  },
  {
    section: 'entertainment',
    sourcePattern: /newsis/,
    titlePattern: /배우|가수|영화|드라마|예능|앨범|공연|팬미팅|방송|연예/,
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
  {
    section: 'tech',
    sourcePattern: /infobae/,
    pathnamePattern: /^\/tecno\//,
  },
  {
    section: 'business',
    sourcePattern: /infobae/,
    pathnamePattern: /^\/(?:economia|negocios)\//,
  },
  {
    section: 'politics',
    sourcePattern: /infobae/,
    pathnamePattern: /^\/politica\//,
  },
  {
    section: 'sports',
    sourcePattern: /infobae/,
    pathnamePattern: /^\/(?:deportes?|copa-america|mundial-de-clubes)\//,
  },
  {
    section: 'entertainment',
    sourcePattern: /infobae/,
    pathnamePattern: /^\/teleshow\//,
  },
  {
    section: 'arts',
    sourcePattern: /infobae/,
    pathnamePattern: /^\/cultura\//,
  },
  {
    section: 'health',
    sourcePattern: /infobae/,
    pathnamePattern: /^\/salud\//,
  },
  {
    section: 'politics',
    sourcePattern: /infobae/,
    titlePattern: /president|presidenta|senado|congreso|ministro|gobierno|elecciones|alcalde|diputad|fiscal|onpe|constitucion|parlamento/,
  },
  {
    section: 'business',
    sourcePattern: /infobae/,
    titlePattern: /economia|economica|inflacion|impuestos|inversion|mercado|bolsa|dolar|banco|empresa|vivienda|financier|tarifas/,
  },
  {
    section: 'conflicts',
    sourcePattern: /infobae/,
    titlePattern: /iran|israel|gaza|ataque|bombardeo|misil|drone|ejercito|militar|guerra|explosion|helicopteros/,
  },
  {
    section: 'health',
    sourcePattern: /infobae/,
    titlePattern: /salud|hospital|medic|enfermedad|transfusion|recien nacido|cucarachas|nutric|vacuna|sangre/,
  },
  {
    section: 'others',
    sourcePattern: /infobae/,
  },
  {
    section: 'politics',
    sourcePattern: /people\.cn/,
    titlePattern: /总书记|国务院|中央|两会|人大|政协|外交部|政府|省委|书记|市长|选举|政治/,
  },
  {
    section: 'business',
    sourcePattern: /people\.cn/,
    titlePattern: /经济|财经|企业|金融|市场|股市|贸易|关税|投资/,
  },
  {
    section: 'tech',
    sourcePattern: /people\.cn/,
    titlePattern: /科技|人工智能|AI|芯片|半导体|互联网|数字|数据中心/,
  },
  {
    section: 'health',
    sourcePattern: /people\.cn/,
    titlePattern: /健康|医院|医生|医疗|疫苗|疾病|手术|患者/,
  },
  {
    section: 'sports',
    sourcePattern: /people\.cn/,
    titlePattern: /体育|比赛|联赛|篮球|足球|网球|球员|教练/,
  },
  {
    section: 'entertainment',
    sourcePattern: /people\.cn/,
    titlePattern: /娱乐|电影|电视剧|明星|演出|综艺|歌手|演员/,
  },
  {
    section: 'others',
    sourcePattern: /people\.cn/,
  },
  {
    section: 'others',
    sourcePattern: /bbc news - sitemap index/,
    pathnamePattern: /^\/news\/articles\//,
  },
  {
    section: 'tech',
    sourcePattern: /bbc news - sitemap index/,
    titlePattern: /ai|artificial intelligence|technology|tech|digital|robot|chip|semiconductor|software|data center|cyber/,
  },
  {
    section: 'conflicts',
    sourcePattern: /bbc news - sitemap index/,
    titlePattern: /iran|israel|gaza|missile|drone|airstrike|war|troops|military|ceasefire/,
  },
  {
    section: 'business',
    sourcePattern: /bbc news - sitemap index/,
    titlePattern: /economy|business|markets|stocks|inflation|trade|tariff|bank|housing|mortgage/,
  },
  {
    section: 'politics',
    sourcePattern: /bbc news - sitemap index/,
    titlePattern: /president|prime minister|parliament|election|government|minister|policy|court/,
  },
  {
    section: 'others',
    sourcePattern: /bbc news - sitemap index/,
    pathnamePattern: /^\/news\/videos\//,
  },
  {
    section: 'others',
    sourcePattern: /bbc news - sitemap index/,
    pathnamePattern: /^\/(?:arabic|serbian|tamil|hindi|urdu|gujarati|ukrainian|marathi|somali|hausa|persian|japanese|mundo|afrique)\//,
  },
  {
    section: 'world',
    sourcePattern: /tass/,
    pathnamePattern: /^\/mezhdunarodnaya-panorama\//,
  },
  {
    section: 'politics',
    sourcePattern: /tass/,
    pathnamePattern: /^\/politika\//,
  },
  {
    section: 'business',
    sourcePattern: /tass/,
    pathnamePattern: /^\/ekonomika\//,
  },
  {
    section: 'sports',
    sourcePattern: /tass/,
    pathnamePattern: /^\/sport\//,
  },
  {
    section: 'conflicts',
    sourcePattern: /tass/,
    pathnamePattern: /^\/armiya-i-opk\//,
  },
  {
    section: 'others',
    sourcePattern: /tass/,
    pathnamePattern: /^\/(?:proisshestviya|obschestvo)\//,
  },
  {
    section: 'others',
    sourcePattern: /tass/,
  },
  {
    section: 'others',
    sourcePattern: /liberty times 地方/,
  },
  {
    section: 'business',
    sourcePattern: /la stampa/,
    pathnamePattern: /^motori\//,
  },
  {
    section: 'world',
    sourcePattern: /la stampa/,
    pathnamePattern: /^esteri\//,
  },
  {
    section: 'others',
    sourcePattern: /la stampa/,
  },
  {
    section: 'sports',
    sourcePattern: /il messaggero/,
    pathnamePattern: /^sport\//,
  },
  {
    section: 'entertainment',
    sourcePattern: /il messaggero/,
    pathnamePattern: /^persone\//,
  },
  {
    section: 'lifestyle',
    sourcePattern: /il messaggero/,
    pathnamePattern: /^alimentazione\//,
  },
  {
    section: 'others',
    sourcePattern: /il messaggero/,
    pathnamePattern: /^(video|fotogallery|roma)\//,
  },
  {
    section: 'others',
    sourcePattern: /il messaggero/,
  },
  {
    section: 'others',
    sourcePattern: /rainews/,
    pathnamePattern: /^\/(?:video|tgr|articoli)\//,
  },
  {
    section: 'others',
    sourcePattern: /rainews/,
    titlePattern: /sintesi della partita|campo della|serie c|serie b|nel centro storico|morto lo scrittore/,
  },
  {
    section: 'business',
    sourcePattern: /mirror media - externals news sitemap/,
    titlePattern: /台股|股市|財報|投資|經濟|房市|央行|關稅|ETF|市場/,
  },
  {
    section: 'entertainment',
    sourcePattern: /mirror media - externals news sitemap/,
    titlePattern: /演唱會|影集|電影|歌手|藝人|票房|綜藝|偶像/,
  },
  {
    section: 'health',
    sourcePattern: /mirror media - externals news sitemap/,
    titlePattern: /健康|醫療|醫院|醫師|新生兒|血液|病患|疫苗/,
  },
  {
    section: 'climate',
    sourcePattern: /mirror media - externals news sitemap/,
    titlePattern: /颱風|地震|暴雨|高溫|天氣|豪雨|空氣品質|空品/,
  },
  {
    section: 'politics',
    sourcePattern: /mirror media - externals news sitemap/,
    titlePattern: /總統|立院|立法院|政院|選舉|罷免|國民黨|民進黨|民眾黨|市長/,
  },
  {
    section: 'others',
    sourcePattern: /mirror media - externals news sitemap/,
    pathnamePattern: /^\/external\//,
  },
  {
    section: 'business',
    sourcePattern: /welt/,
    pathnamePattern: /^\/finanzen\//,
  },
  {
    section: 'politics',
    sourcePattern: /welt/,
    pathnamePattern: /^\/politik\//,
  },
  {
    section: 'arts',
    sourcePattern: /welt/,
    pathnamePattern: /^\/feuilleton\//,
  },
  {
    section: 'sports',
    sourcePattern: /welt/,
    pathnamePattern: /^\/sport\//,
  },
  {
    section: 'others',
    sourcePattern: /welt/,
    pathnamePattern: /^\/(?:regionales|newsticker)\//,
  },
  {
    section: 'others',
    sourcePattern: /welt/,
  },
  {
    section: 'sports',
    sourcePattern: /nownews/,
    titlePattern: /勇士|雷霆|洋基|MLB|NBA|季後賽|西區第一|中鋒|阻攻王|村上宗隆|棒球|籃球|足球|球員|教練|聯盟/,
  },
  {
    section: 'entertainment',
    sourcePattern: /nownews/,
    titlePattern: /高雄吃辦桌|粉絲|演唱會|影集|電影|戲劇|歌手|藝人|綜藝/,
  },
  {
    section: 'business',
    sourcePattern: /nownews/,
    titlePattern: /ETF|股價|台股|財報|投資|市場|經濟|央行/,
  },
  {
    section: 'others',
    sourcePattern: /nownews/,
  },
  {
    section: 'politics',
    sourcePattern: /die zeit/,
    pathnamePattern: /^\/politik\//,
  },
  {
    section: 'business',
    sourcePattern: /die zeit/,
    pathnamePattern: /^\/wirtschaft\//,
  },
  {
    section: 'arts',
    sourcePattern: /die zeit/,
    pathnamePattern: /^\/feuilleton\//,
  },
  {
    section: 'others',
    sourcePattern: /die zeit/,
    pathnamePattern: /^\/(?:news|gesellschaft|zeit-magazin)\//,
  },
  {
    section: 'others',
    sourcePattern: /die zeit/,
  },
  {
    section: 'conflicts',
    sourcePattern: /ria novosti/,
    titlePattern: /армия|беспилот|дрон|удар|всу|атака|ракет|военн|пво|фронт/,
  },
  {
    section: 'business',
    sourcePattern: /ria novosti/,
    titlePattern: /экономик|нефт|газ|рубл|банк|рынк|инвестиц/,
  },
  {
    section: 'sports',
    sourcePattern: /ria novosti/,
    titlePattern: /алкарас|барселона|матч|футбол|хоккей|теннис|лига/,
  },
  {
    section: 'politics',
    sourcePattern: /ria novosti/,
    titlePattern: /мид|правительств|президент|министр|парламент|госдум|совфед|переговор|дипломат/,
  },
  {
    section: 'health',
    sourcePattern: /ria novosti/,
    titlePattern: /здоров|болезн|врач|медицин|больниц|вакцин|пациент/,
  },
  {
    section: 'others',
    sourcePattern: /ria novosti/,
  },
  {
    section: 'conflicts',
    sourcePattern: /ukrainska pravda/,
    pathnamePattern: /^\/(?:eng\/|rus\/)?news\//,
    titlePattern: /attack|missile|drone|strike|front|war|air raid|росія|рф|обстріл|дрон|ракет|війн|фронт/,
  },
  {
    section: 'politics',
    sourcePattern: /ukrainska pravda/,
    pathnamePattern: /^\/(?:eng\/|rus\/)?news\//,
    titlePattern: /government|parliament|cabinet|president|rada|уряд|рада|президент|кабмін/,
  },
  {
    section: 'others',
    sourcePattern: /ukrainska pravda/,
    pathnamePattern: /^\/(?:eng\/|rus\/)?(?:news|articles|columns|projects)\//,
  },
  {
    section: 'tech',
    sourcePattern: /abc\.es/,
    pathnamePattern: /^\/favorito\/electronica\//,
  },
  {
    section: 'business',
    sourcePattern: /abc\.es/,
    pathnamePattern: /^\/motor\//,
  },
  {
    section: 'health',
    sourcePattern: /abc\.es/,
    pathnamePattern: /^\/salud\//,
  },
  {
    section: 'lifestyle',
    sourcePattern: /abc\.es/,
    pathnamePattern: /^\/viajar\//,
  },
  {
    section: 'others',
    sourcePattern: /abc\.es/,
    pathnamePattern: /^\/(?:espana|sevilla|queplan|favorito\/hogar)\//,
  },
  {
    section: 'others',
    sourcePattern: /abc\.es/,
  },
  {
    section: 'entertainment',
    sourcePattern: /조선닷컴/,
    pathnamePattern: /^\/english\/kpop-culture-en\//,
  },
  {
    section: 'business',
    sourcePattern: /조선닷컴/,
    pathnamePattern: /^\/english\/(?:industry-en|market-money-en)\//,
  },
  {
    section: 'world',
    sourcePattern: /조선닷컴/,
    pathnamePattern: /^\/english\/world-en\//,
  },
  {
    section: 'others',
    sourcePattern: /조선닷컴/,
    pathnamePattern: /^\/english\/national-en\//,
  },
  {
    section: 'business',
    sourcePattern: /조선닷컴/,
    pathnamePattern: /^\/economy\/(?:industry-company|economy_general|stock-finance|smb-venture)\//,
  },
  {
    section: 'science',
    sourcePattern: /조선닷컴/,
    pathnamePattern: /^\/economy\/science\//,
  },
  {
    section: 'others',
    sourcePattern: /조선닷컴/,
    pathnamePattern: /^\/special\//,
  },
  {
    section: 'world',
    sourcePattern: /toronto star/,
    pathnamePattern: /^\/news\/world\//,
  },
  {
    section: 'sports',
    sourcePattern: /toronto star/,
    pathnamePattern: /^\/sports\//,
  },
  {
    section: 'entertainment',
    sourcePattern: /toronto star/,
    pathnamePattern: /^\/entertainment\//,
  },
  {
    section: 'lifestyle',
    sourcePattern: /toronto star/,
    pathnamePattern: /^\/life\//,
  },
  {
    section: 'others',
    sourcePattern: /toronto star/,
    pathnamePattern: /^\/news\/gta\//,
  },
  {
    section: 'world',
    sourcePattern: /noticias ao minuto - país/,
    pathnamePattern: /^\/mundo\//,
  },
  {
    section: 'business',
    sourcePattern: /noticias ao minuto - país/,
    pathnamePattern: /^\/economia\//,
  },
  {
    section: 'sports',
    sourcePattern: /noticias ao minuto - país/,
    pathnamePattern: /^\/desporto\//,
  },
  {
    section: 'others',
    sourcePattern: /noticias ao minuto - país/,
    pathnamePattern: /^\/pais\//,
  },
  {
    section: 'world',
    sourcePattern: /lrytas/,
    pathnamePattern: /^\/pasaulis\//,
  },
  {
    section: 'conflicts',
    sourcePattern: /lrytas/,
    pathnamePattern: /^\/pasaulis\/konfliktai-ir-saugumas\//,
  },
  {
    section: 'sports',
    sourcePattern: /lrytas/,
    pathnamePattern: /^\/sportas\//,
  },
  {
    section: 'business',
    sourcePattern: /lrytas/,
    pathnamePattern: /^\/verslas\//,
  },
  {
    section: 'health',
    sourcePattern: /lrytas/,
    pathnamePattern: /^\/sveikata\//,
  },
  {
    section: 'entertainment',
    sourcePattern: /lrytas/,
    pathnamePattern: /^\/zmones\//,
  },
  {
    section: 'lifestyle',
    sourcePattern: /lrytas/,
    pathnamePattern: /^\/gyvenimo-budas\//,
  },
  {
    section: 'others',
    sourcePattern: /lrytas/,
    pathnamePattern: /^\/lietuvosdiena\//,
  },
  {
    section: 'entertainment',
    sourcePattern: /tgcom24/,
    pathnamePattern: /^\/televisione\//,
  },
  {
    section: 'lifestyle',
    sourcePattern: /tgcom24/,
    pathnamePattern: /^\/lifestyle\//,
  },
  {
    section: 'entertainment',
    sourcePattern: /tgcom24/,
    pathnamePattern: /^\/people\//,
  },
  {
    section: 'others',
    sourcePattern: /tgcom24/,
    pathnamePattern: /^\/(?:video|cronaca|tgcomlab|speciale)\//,
  },
  {
    section: 'others',
    sourcePattern: /tgcom24/,
  },
  {
    section: 'sports',
    sourcePattern: /abema times/,
    titlePattern: /サッカー|日本代表|w杯|world cup|mlb|nba|ボクシング|格闘技|jリーグ|野球|バルサ|鈴木彩艶/,
  },
  {
    section: 'entertainment',
    sourcePattern: /abema times/,
    titlePattern: /恋愛|元AKB|女優|ドラマ|映画|歌手|芸能|アイドル|結婚/,
  },
  {
    section: 'others',
    sourcePattern: /abema times/,
  },
  {
    section: 'climate',
    sourcePattern: /setn/,
    titlePattern: /颱風|熱帶擾動|豪雨|大雨|天氣|氣象|地震/,
  },
  {
    section: 'sports',
    sourcePattern: /setn/,
    titlePattern: /MLB|NBA|道奇|傷兵名單|球員|季後賽|勇士|雷霆|洋基|棒球|籃球/,
  },
  {
    section: 'politics',
    sourcePattern: /setn/,
    titlePattern: /白營|國民黨|民眾黨|高虹安|李貞秀|政治|安全感|內鬥|立委|總統/,
  },
  {
    section: 'entertainment',
    sourcePattern: /setn/,
    titlePattern: /人設崩壞|停更5年|藝人|歌手|戲劇|演員|粉絲/,
  },
  {
    section: 'lifestyle',
    sourcePattern: /setn/,
    titlePattern: /連假怎麼過|成人行程|旅遊|美食|戀愛/,
  },
  {
    section: 'others',
    sourcePattern: /setn/,
  },
  {
    section: 'climate',
    sourcePattern: /yonhap \(en\)/,
    titlePattern: /날씨|최저기온|맑음|폭염|호우|태풍|weather|temperature/,
  },
  {
    section: 'conflicts',
    sourcePattern: /yonhap \(en\)/,
    titlePattern: /군용 항공기|유해 찾기|military|aircraft|유해|한미|북한|missile|drone/,
  },
  {
    section: 'politics',
    sourcePattern: /yonhap \(en\)/,
    titlePattern: /인권|시행계획|정부|장관|대통령|국회|정책/,
  },
  {
    section: 'health',
    sourcePattern: /yonhap \(en\)/,
    titlePattern: /건강법|심장|보건|의료|병원|health/,
  },
  {
    section: 'others',
    sourcePattern: /yonhap \(en\)/,
  },
  {
    section: 'others',
    sourcePattern: /yomiuri/,
    pathnamePattern: /^\/local\//,
  },
  {
    section: 'politics',
    sourcePattern: /yomiuri/,
    pathnamePattern: /^\/column\//,
  },
  {
    section: 'others',
    sourcePattern: /yomiuri/,
    pathnamePattern: /^\/kyoiku\//,
  },
  {
    section: 'others',
    sourcePattern: /actu\.fr/,
  },
  {
    section: 'politics',
    sourcePattern: /actu\.fr/,
    titlePattern: /municipales|élection|politique|maire|gouvernement|assemblée|sénat|député|préfet/,
  },
  {
    section: 'health',
    sourcePattern: /actu\.fr/,
    titlePattern: /santé|hôpital|médecin|maladie|virus|grippe|vaccin|soins/,
  },
  {
    section: 'others',
    sourcePattern: /n-tv/,
    pathnamePattern: /^\/regionales\//,
  },
  {
    section: 'politics',
    sourcePattern: /sankei/,
    titlePattern: /首相|政府|与党|野党|衆院|参院|選挙|知事|市長|官房長官/,
  },
  {
    section: 'business',
    sourcePattern: /sankei/,
    titlePattern: /決算|株価|市場|日経平均|企業|円相場|経済|関税/,
  },
  {
    section: 'entertainment',
    sourcePattern: /sankei/,
    titlePattern: /映画|ドラマ|俳優|女優|歌手|芸能|テレビ|ライブ/,
  },
  {
    section: 'health',
    sourcePattern: /sankei/,
    titlePattern: /病院|健康|医療|ワクチン|感染|医師|患者/,
  },
  {
    section: 'others',
    sourcePattern: /sankei/,
  },
  {
    section: 'politics',
    sourcePattern: /rossiyskaya gazeta/,
    titlePattern: /президент|правительств|министр|госдум|совфед|мид|губернатор/,
  },
  {
    section: 'business',
    sourcePattern: /rossiyskaya gazeta/,
    titlePattern: /эконом|нефт|газ|рынк|банк|деньг|производств/,
  },
  {
    section: 'health',
    sourcePattern: /rossiyskaya gazeta/,
    titlePattern: /аллерг|пыльц|здоров|болезн|поллиноз/,
  },
  {
    section: 'climate',
    sourcePattern: /rossiyskaya gazeta/,
    titlePattern: /заморозк|погод|заповедник|природ|томатов|огород|теплиц/,
  },
  {
    section: 'others',
    sourcePattern: /rossiyskaya gazeta/,
  },
  {
    section: 'health',
    sourcePattern: /ansa - sitemap index|^ansa\b/,
    pathnamePattern: /^\/canale_saluteebenessere\//,
  },
  {
    section: 'lifestyle',
    sourcePattern: /ansa - sitemap index|^ansa\b/,
    pathnamePattern: /^\/canale_terraegusto\//,
  },
  {
    section: 'climate',
    sourcePattern: /ansa - sitemap index|^ansa\b/,
    pathnamePattern: /^\/ansa2030\//,
  },
  {
    section: 'politics',
    sourcePattern: /ansa - sitemap index|^ansa\b/,
    pathnamePattern: /^\/canale_legalita_scuola\//,
  },
  {
    section: 'others',
    sourcePattern: /ansa - sitemap index|^ansa\b/,
    pathnamePattern: /^\/sito\/videogallery\//,
  },
  {
    section: 'world',
    sourcePattern: /ansa - sitemap index|^ansa\b/,
    pathnamePattern: /^\/(?:ansamed|ansamednew|nuova_europa)\//,
  },
  {
    section: 'lifestyle',
    sourcePattern: /ansa - sitemap index|^ansa\b/,
    pathnamePattern: /^\/canale_viaggi\//,
  },
  {
    section: 'sports',
    sourcePattern: /le télégramme/,
    pathnamePattern: /^\/sports\//,
  },
  {
    section: 'politics',
    sourcePattern: /le télégramme/,
    titlePattern: /politique|élection|maire|gouvernement|assemblée|sénat|député|municipales/,
  },
  {
    section: 'others',
    sourcePattern: /le télégramme/,
  },
  {
    section: 'others',
    sourcePattern: /il giorno/,
    pathnamePattern: /^\/[^/]+\/cronaca\//,
  },
  {
    section: 'politics',
    sourcePattern: /il giorno/,
    pathnamePattern: /^\/editoriale\//,
  },
  {
    section: 'entertainment',
    sourcePattern: /kapanlagi/,
    pathnamePattern: /^\/(?:foto\/berita-foto|showbiz)\//,
  },
  {
    section: 'lifestyle',
    sourcePattern: /kapanlagi/,
    titlePattern: /lebaran|parfum|olahraga|meal prep|rumah|hangat|sopan|libur/,
  },
  {
    section: 'others',
    sourcePattern: /irish examiner/,
    pathnamePattern: /^\/news\/(?:munster|courtandcrime)\//,
  },
  {
    section: 'conflicts',
    sourcePattern: /irish examiner/,
    titlePattern: /maritime security|naval|warship|drone|missile/,
  },
  {
    section: 'sports',
    sourcePattern: /irish examiner/,
    pathnamePattern: /^\/sport\//,
  },
  {
    section: 'arts',
    sourcePattern: /irish examiner/,
    pathnamePattern: /^\/lifestyle\/artsandculture\//,
  },
  {
    section: 'business',
    sourcePattern: /irish examiner/,
    pathnamePattern: /^\/business\//,
  },
  {
    section: 'politics',
    sourcePattern: /irish examiner/,
    pathnamePattern: /^\/news\/politics\//,
  },
  {
    section: 'world',
    sourcePattern: /the hindu/,
    pathnamePattern: /^\/news\/international\//,
  },
  {
    section: 'science',
    sourcePattern: /the hindu/,
    pathnamePattern: /^\/sci-tech\/science\//,
  },
  {
    section: 'others',
    sourcePattern: /the hindu/,
    pathnamePattern: /^\/news\/(?:cities|national)\//,
  },
  {
    section: 'politics',
    sourcePattern: /the hindu/,
    pathnamePattern: /^\/(?:opinion|elections)\//,
  },
  {
    section: 'health',
    sourcePattern: /the hindu/,
    pathnamePattern: /^\/videos\//,
  },
  {
    section: 'others',
    sourcePattern: /blue news/,
    pathnamePattern: /^\/it\/attualita\//,
  },
  {
    section: 'sports',
    sourcePattern: /blue news/,
    pathnamePattern: /^\/it\/sport/,
  },
  {
    section: 'entertainment',
    sourcePattern: /blue news/,
    pathnamePattern: /^\/it\/spettacolo\//,
  },
  {
    section: 'tech',
    sourcePattern: /blue news/,
    pathnamePattern: /^\/it\/digitale-lifestyle\//,
  },
  {
    section: 'others',
    sourcePattern: /blue news/,
    pathnamePattern: /^\/it\/index/,
  },
  {
    section: 'others',
    sourcePattern: /la repubblica/,
    pathnamePattern: /^\/cronaca\//,
  },
  {
    section: 'world',
    sourcePattern: /la repubblica/,
    pathnamePattern: /^\/esteri\//,
  },
  {
    section: 'sports',
    sourcePattern: /la repubblica/,
    pathnamePattern: /^\/sport\//,
  },
  {
    section: 'business',
    sourcePattern: /la repubblica/,
    pathnamePattern: /^\/motori\//,
  },
  {
    section: 'politics',
    sourcePattern: /la repubblica/,
    pathnamePattern: /^\/commenti\//,
  },
  {
    section: 'arts',
    sourcePattern: /la repubblica/,
    pathnamePattern: /^\/cultura\//,
  },
  {
    section: 'entertainment',
    sourcePattern: /la repubblica/,
    pathnamePattern: /^\/spettacoli\//,
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
