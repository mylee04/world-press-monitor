import type { NewsItem } from '@/lib/types';

type Hub = {
  name: string;
  country: string;
  lat: number;
  lon: number;
  keywords: string[];
};

type CountryAlias = {
  country: string;
  keywords: string[];
};

type GeoInference = Pick<NewsItem, 'lat' | 'lon' | 'locationName' | 'country'>;

type SourceUrlCountryHint = GeoInference & {
  suppressFallback?: boolean;
};

const HUBS: Hub[] = [
  { name: 'Washington', country: 'United States', lat: 38.9072, lon: -77.0369, keywords: ['white house', 'washington', 'pentagon'] },
  { name: 'New York', country: 'United States', lat: 40.7128, lon: -74.006, keywords: ['new york', 'wall street', 'nyse', 'manhattan'] },
  { name: 'London', country: 'United Kingdom', lat: 51.5072, lon: -0.1276, keywords: ['britain', 'london', 'westminster'] },
  { name: 'Brussels', country: 'Belgium', lat: 50.8503, lon: 4.3517, keywords: ['brussels', 'bruxelles', 'brussel'] },
  { name: 'Paris', country: 'France', lat: 48.8566, lon: 2.3522, keywords: ['france', 'paris', 'elysee'] },
  { name: 'Berlin', country: 'Germany', lat: 52.52, lon: 13.405, keywords: ['germany', 'berlin', 'bundestag'] },
  { name: 'Rome', country: 'Italy', lat: 41.9028, lon: 12.4964, keywords: ['italy', 'rome', 'vatican'] },
  { name: 'Madrid', country: 'Spain', lat: 40.4168, lon: -3.7038, keywords: ['spain', 'madrid'] },
  { name: 'Kyiv', country: 'Ukraine', lat: 50.4501, lon: 30.5234, keywords: ['ukraine', 'kyiv'] },
  { name: 'Moscow', country: 'Russia', lat: 55.7558, lon: 37.6173, keywords: ['russia', 'moscow', 'kremlin'] },
  { name: 'Warsaw', country: 'Poland', lat: 52.2297, lon: 21.0122, keywords: ['poland', 'warsaw'] },
  { name: 'Istanbul', country: 'Turkey', lat: 41.0082, lon: 28.9784, keywords: ['turkey', 'istanbul', 'ankara'] },
  { name: 'Tel Aviv', country: 'Israel', lat: 32.0853, lon: 34.7818, keywords: ['israel', 'tel aviv', 'jerusalem'] },
  { name: 'Riyadh', country: 'Saudi Arabia', lat: 24.7136, lon: 46.6753, keywords: ['saudi', 'riyadh'] },
  { name: 'Tehran', country: 'Iran', lat: 35.6892, lon: 51.389, keywords: ['iran', 'tehran'] },
  { name: 'Doha', country: 'Qatar', lat: 25.2854, lon: 51.531, keywords: ['qatar', 'doha'] },
  { name: 'Cairo', country: 'Egypt', lat: 30.0444, lon: 31.2357, keywords: ['egypt', 'cairo', 'suez'] },
  { name: 'Johannesburg', country: 'South Africa', lat: -26.2041, lon: 28.0473, keywords: ['south africa', 'johannesburg'] },
  { name: 'Lagos', country: 'Nigeria', lat: 6.5244, lon: 3.3792, keywords: ['nigeria', 'lagos'] },
  { name: 'Beijing', country: 'China', lat: 39.9042, lon: 116.4074, keywords: ['china', 'beijing'] },
  { name: 'Shanghai', country: 'China', lat: 31.2304, lon: 121.4737, keywords: ['shanghai'] },
  { name: 'Taipei', country: 'Taiwan', lat: 25.033, lon: 121.5654, keywords: ['taiwan', 'taipei'] },
  { name: 'Seoul', country: 'South Korea', lat: 37.5665, lon: 126.978, keywords: ['south korea', 'seoul'] },
  { name: 'Tokyo', country: 'Japan', lat: 35.6762, lon: 139.6503, keywords: ['japan', 'tokyo'] },
  { name: 'Singapore', country: 'Singapore', lat: 1.3521, lon: 103.8198, keywords: ['singapore'] },
  { name: 'Hong Kong', country: 'China', lat: 22.3193, lon: 114.1694, keywords: ['hong kong'] },
  { name: 'New Delhi', country: 'India', lat: 28.6139, lon: 77.209, keywords: ['india', 'new delhi', 'delhi'] },
  { name: 'Mumbai', country: 'India', lat: 19.076, lon: 72.8777, keywords: ['mumbai'] },
  { name: 'Jakarta', country: 'Indonesia', lat: -6.2088, lon: 106.8456, keywords: ['indonesia', 'jakarta'] },
  { name: 'Sydney', country: 'Australia', lat: -33.8688, lon: 151.2093, keywords: ['australia', 'sydney'] },
  { name: 'Ottawa', country: 'Canada', lat: 45.4215, lon: -75.6972, keywords: ['canada', 'ottawa'] },
  { name: 'Toronto', country: 'Canada', lat: 43.6532, lon: -79.3832, keywords: ['toronto'] },
  { name: 'Mexico City', country: 'Mexico', lat: 19.4326, lon: -99.1332, keywords: ['mexico', 'mexico city'] },
  { name: 'Sao Paulo', country: 'Brazil', lat: -23.5505, lon: -46.6333, keywords: ['brazil', 'sao paulo'] },
  { name: 'Buenos Aires', country: 'Argentina', lat: -34.6037, lon: -58.3816, keywords: ['argentina', 'buenos aires'] },
  { name: 'Santiago', country: 'Chile', lat: -33.4489, lon: -70.6693, keywords: ['chile', 'santiago'] },
  { name: 'Montevideo', country: 'Uruguay', lat: -34.9011, lon: -56.1645, keywords: ['uruguay', 'montevideo'] }
];

const COUNTRY_CENTROIDS = new Map<string, { lat: number; lon: number }>([
  ['United States', { lat: 39.8283, lon: -98.5795 }],
  ['United Kingdom', { lat: 55.3781, lon: -3.436 }],
  ['France', { lat: 46.2276, lon: 2.2137 }],
  ['Germany', { lat: 51.1657, lon: 10.4515 }],
  ['Italy', { lat: 41.8719, lon: 12.5674 }],
  ['Spain', { lat: 40.4637, lon: -3.7492 }],
  ['Canada', { lat: 56.1304, lon: -106.3468 }],
  ['Mexico', { lat: 23.6345, lon: -102.5528 }],
  ['Brazil', { lat: -14.235, lon: -51.9253 }],
  ['Argentina', { lat: -38.4161, lon: -63.6167 }],
  ['Chile', { lat: -35.6751, lon: -71.543 }],
  ['Uruguay', { lat: -32.5228, lon: -55.7658 }],
  ['Japan', { lat: 36.2048, lon: 138.2529 }],
  ['South Korea', { lat: 35.9078, lon: 127.7669 }],
  ['China', { lat: 35.8617, lon: 104.1954 }],
  ['Taiwan', { lat: 23.6978, lon: 120.9605 }],
  ['India', { lat: 20.5937, lon: 78.9629 }],
  ['Australia', { lat: -25.2744, lon: 133.7751 }],
  ['Belgium', { lat: 50.5039, lon: 4.4699 }],
  ['Ukraine', { lat: 48.3794, lon: 31.1656 }],
  ['Russia', { lat: 61.524, lon: 105.3188 }],
  ['Turkey', { lat: 38.9637, lon: 35.2433 }],
  ['Israel', { lat: 31.0461, lon: 34.8516 }],
  ['Saudi Arabia', { lat: 23.8859, lon: 45.0792 }],
  ['Iran', { lat: 32.4279, lon: 53.688 }],
  ['Qatar', { lat: 25.3548, lon: 51.1839 }],
  ['Egypt', { lat: 26.8206, lon: 30.8025 }],
  ['South Africa', { lat: -30.5595, lon: 22.9375 }],
  ['Nigeria', { lat: 9.082, lon: 8.6753 }],
  ['Singapore', { lat: 1.3521, lon: 103.8198 }],
  ['Indonesia', { lat: -0.7893, lon: 113.9213 }],
  ['Malaysia', { lat: 4.2105, lon: 101.9758 }],
  ['Thailand', { lat: 15.87, lon: 100.9925 }],
  ['Philippines', { lat: 12.8797, lon: 121.774 }],
  ['Switzerland', { lat: 46.8182, lon: 8.2275 }],
  ['Netherlands', { lat: 52.1326, lon: 5.2913 }],
  ['Portugal', { lat: 39.3999, lon: -8.2245 }],
  ['Greece', { lat: 39.0742, lon: 21.8243 }],
  ['Austria', { lat: 47.5162, lon: 14.5501 }],
  ['Denmark', { lat: 56.2639, lon: 9.5018 }],
  ['Norway', { lat: 60.472, lon: 8.4689 }],
  ['Sweden', { lat: 60.1282, lon: 18.6435 }],
  ['Finland', { lat: 61.9241, lon: 25.7482 }],
  ['Romania', { lat: 45.9432, lon: 24.9668 }],
  ['Bulgaria', { lat: 42.7339, lon: 25.4858 }],
  ['Czech Republic', { lat: 49.8175, lon: 15.473 }],
  ['Slovakia', { lat: 48.669, lon: 19.699 }],
  ['Hungary', { lat: 47.1625, lon: 19.5033 }],
  ['Croatia', { lat: 45.1, lon: 15.2 }],
  ['Estonia', { lat: 58.5953, lon: 25.0136 }],
  ['Latvia', { lat: 56.8796, lon: 24.6032 }],
  ['Lithuania', { lat: 55.1694, lon: 23.8813 }],
  ['Ireland', { lat: 53.1424, lon: -7.6921 }],
  ['Poland', { lat: 51.9194, lon: 19.1451 }],
  ['Serbia', { lat: 44.0165, lon: 21.0059 }],
  ['Vietnam', { lat: 14.0583, lon: 108.2772 }],
  ['Dominican Republic', { lat: 18.7357, lon: -70.1627 }],
  ['Colombia', { lat: 4.5709, lon: -74.2973 }],
  ['Slovenia', { lat: 46.1512, lon: 14.9955 }],
  ['Jordan', { lat: 30.5852, lon: 36.2384 }],
  ['United Arab Emirates', { lat: 23.4241, lon: 53.8478 }],
  ['Kuwait', { lat: 29.3117, lon: 47.4818 }],
  ['Iceland', { lat: 64.9631, lon: -19.0208 }],
  ['Bahrain', { lat: 25.9304, lon: 50.6378 }],
  ['Luxembourg', { lat: 49.8153, lon: 6.1296 }],
  ['Ecuador', { lat: -1.8312, lon: -78.1834 }],
  ['Oman', { lat: 21.5126, lon: 55.9233 }],
  ['Albania', { lat: 41.1533, lon: 20.1683 }],
  ['Armenia', { lat: 40.0691, lon: 45.0382 }],
  ['Azerbaijan', { lat: 40.1431, lon: 47.5769 }],
  ['Belarus', { lat: 53.7098, lon: 27.9534 }],
  ['Bosnia and Herzegovina', { lat: 43.9159, lon: 17.6791 }],
  ['Cyprus', { lat: 35.1264, lon: 33.4299 }],
  ['Georgia', { lat: 42.3154, lon: 43.3569 }],
  ['Iraq', { lat: 33.2232, lon: 43.6793 }],
  ['Kazakhstan', { lat: 48.0196, lon: 66.9237 }],
  ['Kyrgyzstan', { lat: 41.2044, lon: 74.7661 }],
  ['Lebanon', { lat: 33.8547, lon: 35.8623 }],
  ['Libya', { lat: 26.3351, lon: 17.2283 }],
  ['Mongolia', { lat: 46.8625, lon: 103.8467 }],
  ['Myanmar', { lat: 21.9162, lon: 95.956 }],
  ['Nepal', { lat: 28.3949, lon: 84.124 }],
  ['New Zealand', { lat: -40.9006, lon: 174.886 }],
  ['Pakistan', { lat: 30.3753, lon: 69.3451 }],
  ['Cambodia', { lat: 12.5657, lon: 104.991 }],
  ['Tajikistan', { lat: 38.861, lon: 71.2761 }],
  ['Turkmenistan', { lat: 38.9697, lon: 59.5563 }],
  ['Uzbekistan', { lat: 41.3775, lon: 64.5853 }]
]);

const COUNTRY_ALIASES: ReadonlyArray<CountryAlias> = [
  { country: 'Singapore', keywords: ['singapore', '新加坡', '狮城'] },
  { country: 'China', keywords: ['china', '中国', '中国大陆', '大陆'] },
  { country: 'Taiwan', keywords: ['taiwan', '台湾'] },
  { country: 'South Korea', keywords: ['south korea', 'korea', '韩国', '南韩'] },
  { country: 'Japan', keywords: ['japan', '日本'] },
  { country: 'United States', keywords: ['united states', 'america', '美国'] },
  { country: 'United Kingdom', keywords: ['united kingdom', 'britain', 'uk', '英国'] },
  { country: 'Russia', keywords: ['russia', '俄罗斯'] },
  { country: 'Ukraine', keywords: ['ukraine', '乌克兰'] },
  { country: 'Iran', keywords: ['iran', '伊朗'] },
  { country: 'Israel', keywords: ['israel', '以色列'] },
  { country: 'Saudi Arabia', keywords: ['saudi arabia', 'saudi', '沙特', '沙特阿拉伯'] },
  { country: 'India', keywords: ['india', '印度'] },
  { country: 'Indonesia', keywords: ['indonesia', '印尼', '印度尼西亚'] },
  { country: 'Malaysia', keywords: ['malaysia', '马来西亚', '马国'] },
  { country: 'Thailand', keywords: ['thailand', '泰国'] },
  { country: 'Philippines', keywords: ['philippines', '菲律宾'] },
  { country: 'Switzerland', keywords: ['switzerland', '瑞士'] },
  { country: 'France', keywords: ['france', '法国'] },
  { country: 'Germany', keywords: ['germany', '德国'] },
  { country: 'Italy', keywords: ['italy', '意大利'] },
  { country: 'Spain', keywords: ['spain', '西班牙'] },
  { country: 'Canada', keywords: ['canada', '加拿大'] },
  { country: 'Australia', keywords: ['australia', 'australian', '澳大利亚', '澳洲'] },
  { country: 'Brazil', keywords: ['brazil', '巴西'] },
  { country: 'Argentina', keywords: ['argentina', '阿根廷'] },
  { country: 'Chile', keywords: ['chile', '智利'] },
  { country: 'Mexico', keywords: ['mexico', '墨西哥'] },
  { country: 'Belgium', keywords: ['belgium', '比利时'] },
  { country: 'Netherlands', keywords: ['netherlands', 'holland', '荷兰'] },
  { country: 'Portugal', keywords: ['portugal', '葡萄牙'] },
  { country: 'Greece', keywords: ['greece', '希腊'] },
  { country: 'Egypt', keywords: ['egypt', '埃及'] },
  { country: 'Nigeria', keywords: ['nigeria', '尼日利亚'] },
  { country: 'South Africa', keywords: ['south africa', '南非'] },
  { country: 'Poland', keywords: ['poland', '波兰'] },
  { country: 'Turkey', keywords: ['turkey', '土耳其'] },
  { country: 'Qatar', keywords: ['qatar', '卡塔尔'] },
  { country: 'Austria', keywords: ['austria', '奥地利'] },
  { country: 'Denmark', keywords: ['denmark', '丹麦'] },
  { country: 'Norway', keywords: ['norway', '挪威'] },
  { country: 'Sweden', keywords: ['sweden', '瑞典'] },
  { country: 'Finland', keywords: ['finland', '芬兰'] },
  { country: 'Romania', keywords: ['romania', '罗马尼亚'] },
  { country: 'Bulgaria', keywords: ['bulgaria', '保加利亚'] },
  { country: 'Czech Republic', keywords: ['czech republic', 'czechia', '捷克'] },
  { country: 'Slovakia', keywords: ['slovakia', '斯洛伐克'] },
  { country: 'Hungary', keywords: ['hungary', '匈牙利'] },
  { country: 'Croatia', keywords: ['croatia', '克罗地亚'] },
  { country: 'Estonia', keywords: ['estonia', '爱沙尼亚'] },
  { country: 'Latvia', keywords: ['latvia', '拉脱维亚'] },
  { country: 'Lithuania', keywords: ['lithuania', '立陶宛'] },
  { country: 'Ireland', keywords: ['ireland', '爱尔兰'] },
  { country: 'Uruguay', keywords: ['uruguay', '乌拉圭'] }
];

const ZAOBAO_DIRECT_SEGMENT_COUNTRIES = new Map<string, string>([
  ['china', 'China'],
  ['singapore', 'Singapore']
]);

const ZAOBAO_NON_LOCAL_SEGMENTS = new Set([
  'world',
  'sea',
  'sports'
]);

export function inferGeoFromTitle(
  title: string,
  fallbackCountry?: string
): GeoInference {
  const normalizedTitle = normalizeGeoText(title);
  const hubMatch = inferHubFromNormalizedTitle(normalizedTitle);
  if (hubMatch) return hubMatch;

  const countryMatch = inferCountryFromNormalizedTitle(normalizedTitle);
  if (countryMatch) return buildCountryGeo(countryMatch);

  return buildFallbackCountryGeo(fallbackCountry);
}

export function inferGeoFromCountry(country: string): GeoInference {
  return buildCountryGeo(country);
}

export function inferGeoFromArticleSignals(params: {
  title: string;
  source?: string;
  url?: string;
  fallbackCountry?: string;
}): GeoInference {
  const { title, source, url, fallbackCountry } = params;
  const normalizedTitle = normalizeGeoText(title);
  const hubMatch = inferHubFromNormalizedTitle(normalizedTitle);
  if (hubMatch) return hubMatch;

  const countryMatch = inferCountryFromNormalizedTitle(normalizedTitle);
  if (countryMatch) return buildCountryGeo(countryMatch);

  const sourceUrlHint = inferCountryFromSourceUrl(source || '', url || '');
  if (sourceUrlHint?.country) {
    return {
      ...sourceUrlHint,
      locationName: sourceUrlHint.locationName || sourceUrlHint.country,
    };
  }
  if (sourceUrlHint?.suppressFallback) {
    return {};
  }

  return buildFallbackCountryGeo(fallbackCountry);
}

function inferHubFromNormalizedTitle(normalizedTitle: string): GeoInference | null {
  if (!normalizedTitle) return null;
  for (const hub of HUBS) {
    if (hub.keywords.some((keyword) => titleContainsGeoKeyword(normalizedTitle, keyword))) {
      return {
        lat: hub.lat,
        lon: hub.lon,
        locationName: hub.name,
        country: hub.country,
      };
    }
  }
  return null;
}

function inferCountryFromNormalizedTitle(normalizedTitle: string): string | null {
  if (!normalizedTitle) return null;
  for (const alias of COUNTRY_ALIASES) {
    if (alias.keywords.some((keyword) => titleContainsGeoKeyword(normalizedTitle, keyword))) {
      return alias.country;
    }
  }
  return null;
}

function buildFallbackCountryGeo(fallbackCountry?: string): GeoInference {
  if (!fallbackCountry) return {};
  return buildCountryGeo(fallbackCountry);
}

function buildCountryGeo(country: string): GeoInference {
  const centroid = COUNTRY_CENTROIDS.get(country);
  if (centroid) {
    return { lat: centroid.lat, lon: centroid.lon, locationName: country, country };
  }
  const hub = HUBS.find((item) => item.country === country);
  if (hub) {
    return { lat: hub.lat, lon: hub.lon, locationName: country, country };
  }
  return { locationName: country, country };
}

function inferCountryFromSourceUrl(source: string, url: string): SourceUrlCountryHint | null {
  if (!source || !url) return null;
  if (/zaobao/i.test(source)) {
    return inferZaobaoCountryFromUrl(url);
  }
  return null;
}

function inferZaobaoCountryFromUrl(url: string): SourceUrlCountryHint | null {
  let pathname = '';
  try {
    pathname = new URL(url).pathname;
  } catch {
    return null;
  }

  const segments = pathname.split('/').filter(Boolean).map((segment) => normalizeGeoText(segment));
  if (segments.length === 0) return null;

  const topLevel = segments[0] || '';
  const section = segments[1] || '';
  const directCountry = ZAOBAO_DIRECT_SEGMENT_COUNTRIES.get(section);
  if (directCountry) {
    return buildCountryGeo(directCountry);
  }

  if ((topLevel === 'news' || topLevel === 'finance') && ZAOBAO_NON_LOCAL_SEGMENTS.has(section)) {
    return { suppressFallback: true };
  }

  return null;
}

function titleContainsGeoKeyword(normalizedTitle: string, keyword: string): boolean {
  const normalizedKeyword = normalizeGeoText(keyword);
  if (!normalizedTitle || !normalizedKeyword) return false;
  if (/^[\p{Script=Latin}\p{N}\s]+$/u.test(normalizedKeyword)) {
    return ` ${normalizedTitle} `.includes(` ${normalizedKeyword} `);
  }
  return normalizedTitle.includes(normalizedKeyword);
}

function normalizeGeoText(value: string): string {
  return (value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
