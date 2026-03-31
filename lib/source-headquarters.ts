import { buildDisplaySourceName } from '@/lib/source-display';

export type SourceHeadquartersMatch = {
  exact?: string[];
  prefixes?: string[];
  contains?: string[];
};

export type SourceHeadquartersRecord = {
  country: string;
  city: string;
  region: string;
  lat: number;
  lon: number;
  label: string;
  match: SourceHeadquartersMatch;
};

export type ResolvedSourceHeadquarters = {
  city: string;
  region: string;
  lat: number;
  lon: number;
  label: string;
};

function normalizeSourceMatch(value: string): string {
  return buildDisplaySourceName(value || '').trim().toLowerCase();
}

const SOURCE_HEADQUARTERS: SourceHeadquartersRecord[] = [
  {
    country: 'South Korea',
    city: 'Seoul',
    region: 'Jung-gu',
    lat: 37.5642,
    lon: 126.9769,
    label: 'Chosun Ilbo HQ',
    match: {
      prefixes: ['조선닷컴', 'Chosun'],
    },
  },
  {
    country: 'South Korea',
    city: 'Seoul',
    region: 'Yeongdeungpo-gu',
    lat: 37.5254,
    lon: 126.9164,
    label: 'KBS HQ',
    match: {
      exact: ['KBS News'],
      prefixes: ['KBS -'],
    },
  },
  {
    country: 'South Korea',
    city: 'Seoul',
    region: 'Jung-gu',
    lat: 37.5669,
    lon: 126.9767,
    label: 'Newsis HQ',
    match: {
      exact: ['Newsis'],
    },
  },
  {
    country: 'South Korea',
    city: 'Seoul',
    region: 'Jongno-gu',
    lat: 37.5745,
    lon: 126.9803,
    label: 'Yonhap News HQ',
    match: {
      prefixes: ['Yonhap'],
    },
  },
  {
    country: 'South Korea',
    city: 'Seoul',
    region: 'Jung-gu',
    lat: 37.5608,
    lon: 126.9922,
    label: 'Maeil Business HQ',
    match: {
      prefixes: ['매일경제 -'],
    },
  },
  {
    country: 'South Korea',
    city: 'Seoul',
    region: 'Jung-gu',
    lat: 37.5665,
    lon: 126.9711,
    label: 'Kyunghyang Shinmun HQ',
    match: {
      prefixes: ['경향신문 -'],
    },
  },
  {
    country: 'South Korea',
    city: 'Seoul',
    region: 'Jung-gu',
    lat: 37.5587,
    lon: 126.9734,
    label: 'The Korea Times HQ',
    match: {
      prefixes: ['Korea Times'],
    },
  },
  {
    country: 'South Korea',
    city: 'Seoul',
    region: 'Jung-gu',
    lat: 37.5612,
    lon: 126.9676,
    label: 'Korea Economic Daily HQ',
    match: {
      prefixes: ['한국경제 -'],
    },
  },
  {
    country: 'South Korea',
    city: 'Seoul',
    region: 'Jung-gu',
    lat: 37.5636,
    lon: 126.9764,
    label: 'Aju News HQ',
    match: {
      exact: ['Aju News'],
    },
  },
  {
    country: 'South Korea',
    city: 'Seoul',
    region: 'Jongno-gu',
    lat: 37.5687,
    lon: 126.9932,
    label: 'Donga Ilbo HQ',
    match: {
      prefixes: ['Donga Ilbo'],
    },
  },
  {
    country: 'South Korea',
    city: 'Seoul',
    region: 'Mapo-gu',
    lat: 37.5771,
    lon: 126.8901,
    label: 'JTBC HQ',
    match: {
      prefixes: ['JTBC -'],
    },
  },
  {
    country: 'South Korea',
    city: 'Seoul',
    region: 'Mapo-gu',
    lat: 37.5771,
    lon: 126.8901,
    label: 'JoongAng HQ',
    match: {
      prefixes: ['JoongAng -'],
    },
  },
  {
    country: 'South Korea',
    city: 'Seoul',
    region: 'Jung-gu',
    lat: 37.5674,
    lon: 126.9779,
    label: 'Seoul Newspaper HQ',
    match: {
      exact: ['Seoul Newspaper'],
    },
  },
  {
    country: 'South Korea',
    city: 'Seoul',
    region: 'Yangcheon-gu',
    lat: 37.5289,
    lon: 126.8738,
    label: 'SBS HQ',
    match: {
      prefixes: ['SBS -'],
    },
  },
  {
    country: 'South Korea',
    city: 'Seoul',
    region: 'Yongsan-gu',
    lat: 37.5475,
    lon: 126.98,
    label: 'Korea Herald HQ',
    match: {
      prefixes: ['Korea Herald'],
    },
  },
  {
    country: 'South Korea',
    city: 'Seoul',
    region: 'Mapo-gu',
    lat: 37.547,
    lon: 126.9588,
    label: 'Hankyoreh HQ',
    match: {
      prefixes: ['한겨레'],
    },
  },
  {
    country: 'South Korea',
    city: 'Seoul',
    region: 'Jung-gu',
    lat: 37.5696,
    lon: 127.0142,
    label: 'Daily NK HQ',
    match: {
      prefixes: ['Daily NK'],
    },
  },
  {
    country: 'Japan',
    city: 'Tokyo',
    region: 'Minato City',
    lat: 35.6644,
    lon: 139.7596,
    label: 'NTV HQ',
    match: {
      exact: ['NTV'],
    },
  },
  {
    country: 'Japan',
    city: 'Tokyo',
    region: 'Shibuya City',
    lat: 35.6656,
    lon: 139.699,
    label: 'NHK HQ',
    match: {
      prefixes: ['NHK News', 'NHK News Web -'],
    },
  },
  {
    country: 'Japan',
    city: 'Tokyo',
    region: 'Chiyoda City',
    lat: 35.6868,
    lon: 139.7661,
    label: 'Nikkei HQ',
    match: {
      exact: ['Nikkei'],
    },
  },
  {
    country: 'Japan',
    city: 'Tokyo',
    region: 'Chiyoda City',
    lat: 35.6868,
    lon: 139.7661,
    label: 'Yomiuri HQ',
    match: {
      exact: ['Yomiuri'],
    },
  },
  {
    country: 'Japan',
    city: 'Tokyo',
    region: 'Chiyoda City',
    lat: 35.6868,
    lon: 139.7661,
    label: 'Sankei HQ',
    match: {
      exact: ['Sankei'],
    },
  },
  {
    country: 'Japan',
    city: 'Tokyo',
    region: 'Chuo City',
    lat: 35.6651,
    lon: 139.7708,
    label: 'Asahi Shimbun HQ',
    match: {
      exact: ['Asahi Shimbun'],
    },
  },
  {
    country: 'Japan',
    city: 'Tokyo',
    region: 'Minato City',
    lat: 35.6656,
    lon: 139.7594,
    label: 'Kyodo News HQ',
    match: {
      exact: ['Kyodo News'],
    },
  },
  {
    country: 'Japan',
    city: 'Tokyo',
    region: 'Chuo City',
    lat: 35.668,
    lon: 139.7672,
    label: 'Jiji Press HQ',
    match: {
      exact: ['Jiji Press'],
    },
  },
  {
    country: 'Japan',
    city: 'Tokyo',
    region: 'Shibuya City',
    lat: 35.6625,
    lon: 139.6965,
    label: 'Abema HQ',
    match: {
      prefixes: ['Abema Times'],
    },
  },
  {
    country: 'Japan',
    city: 'Tokyo',
    region: 'Minato City',
    lat: 35.6401,
    lon: 139.7471,
    label: 'The Japan Times HQ',
    match: {
      exact: ['The Japan Times'],
    },
  },
];

function matchesSource(record: SourceHeadquartersRecord, source: string): boolean {
  const normalized = normalizeSourceMatch(source);
  const exact = (record.match.exact || []).map(normalizeSourceMatch);
  if (exact.includes(normalized)) return true;

  const prefixes = (record.match.prefixes || []).map(normalizeSourceMatch);
  if (prefixes.some((prefix) => normalized.startsWith(prefix))) return true;

  const contains = (record.match.contains || []).map(normalizeSourceMatch);
  if (contains.some((fragment) => normalized.includes(fragment))) return true;

  return false;
}

export function resolveSourceHeadquarters(source: string, country: string): ResolvedSourceHeadquarters | null {
  const record = SOURCE_HEADQUARTERS.find((entry) => entry.country === country && matchesSource(entry, source));
  if (!record) return null;
  return {
    city: record.city,
    region: record.region,
    lat: record.lat,
    lon: record.lon,
    label: record.label,
  };
}
