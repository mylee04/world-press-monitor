type ForeignOperatedRule = {
  marketCountry: string;
  exact?: string[];
  prefixes?: string[];
  publishers?: string[];
  corporateCountry: string;
  corporateCity: string;
  corporateRegion: string | null;
  corporateLat: number;
  corporateLon: number;
  label: string;
};

export type ResolvedForeignOperated = {
  corporateCountry: string;
  corporateCity: string;
  corporateRegion: string | null;
  corporateLat: number;
  corporateLon: number;
  label: string;
};

const FOREIGN_OPERATED_RULES: ForeignOperatedRule[] = [
  {
    marketCountry: 'Australia',
    publishers: ['DMG Media'],
    corporateCountry: 'United Kingdom',
    corporateCity: 'London',
    corporateRegion: 'England',
    corporateLat: 51.5072,
    corporateLon: -0.1276,
    label: 'DMG Media HQ',
  },
  {
    marketCountry: 'United States',
    exact: ['Financial Times'],
    corporateCountry: 'United Kingdom',
    corporateCity: 'London',
    corporateRegion: 'England',
    corporateLat: 51.5072,
    corporateLon: -0.1276,
    label: 'Financial Times HQ',
  },
  {
    marketCountry: 'Germany',
    exact: ['Financial Times Germany'],
    corporateCountry: 'United Kingdom',
    corporateCity: 'London',
    corporateRegion: 'England',
    corporateLat: 51.5072,
    corporateLon: -0.1276,
    label: 'Financial Times HQ',
  },
  {
    marketCountry: 'France',
    exact: ['Yahoo Actualités'],
    corporateCountry: 'United States',
    corporateCity: 'Sunnyvale',
    corporateRegion: 'California',
    corporateLat: 37.3688,
    corporateLon: -122.0363,
    label: 'Yahoo HQ',
  },
  {
    marketCountry: 'Ireland',
    exact: ['Irish Post'],
    corporateCountry: 'United Kingdom',
    corporateCity: 'London',
    corporateRegion: 'England',
    corporateLat: 51.5072,
    corporateLon: -0.1276,
    label: 'Irish Post HQ',
  },
  {
    marketCountry: 'Ireland',
    exact: ['IrishCentral'],
    corporateCountry: 'United States',
    corporateCity: 'New York',
    corporateRegion: 'New York',
    corporateLat: 40.7128,
    corporateLon: -74.006,
    label: 'IrishCentral HQ',
  },
  {
    marketCountry: 'China',
    exact: ['Initium'],
    corporateCountry: 'Singapore',
    corporateCity: 'Singapore',
    corporateRegion: 'Singapore',
    corporateLat: 1.3521,
    corporateLon: 103.8198,
    label: 'Initium HQ',
  },
  {
    marketCountry: 'China',
    exact: ['Liberty Times'],
    corporateCountry: 'Taiwan',
    corporateCity: 'Taipei',
    corporateRegion: 'Taipei',
    corporateLat: 25.033,
    corporateLon: 121.5654,
    label: 'Liberty Times HQ',
  },
  {
    marketCountry: 'China',
    exact: ['FT Chinese'],
    corporateCountry: 'United Kingdom',
    corporateCity: 'London',
    corporateRegion: 'England',
    corporateLat: 51.5072,
    corporateLon: -0.1276,
    label: 'Financial Times HQ',
  },
  {
    marketCountry: 'China',
    exact: ['Zaobao (realtime)'],
    corporateCountry: 'Singapore',
    corporateCity: 'Singapore',
    corporateRegion: 'Singapore',
    corporateLat: 1.3521,
    corporateLon: 103.8198,
    label: 'SPH Media HQ',
  },
  {
    marketCountry: 'Argentina',
    exact: ['MercoPress'],
    corporateCountry: 'Uruguay',
    corporateCity: 'Montevideo',
    corporateRegion: 'Montevideo',
    corporateLat: -34.9011,
    corporateLon: -56.1645,
    label: 'MercoPress HQ',
  },
  {
    marketCountry: 'Turkey',
    exact: ['BBC', 'BBC Türkçe'],
    corporateCountry: 'United Kingdom',
    corporateCity: 'London',
    corporateRegion: 'England',
    corporateLat: 51.5072,
    corporateLon: -0.1276,
    label: 'BBC HQ',
  },
  {
    marketCountry: 'Switzerland',
    exact: ['NDR'],
    corporateCountry: 'Germany',
    corporateCity: 'Hamburg',
    corporateRegion: 'Hamburg',
    corporateLat: 53.5511,
    corporateLon: 9.9937,
    label: 'NDR HQ',
  },
  {
    marketCountry: 'Uruguay',
    exact: ['El Bocón'],
    corporateCountry: 'Peru',
    corporateCity: 'Lima',
    corporateRegion: 'Lima Province',
    corporateLat: -12.0464,
    corporateLon: -77.0428,
    label: 'El Bocón HQ',
  },
];

function normalize(value: string | null | undefined): string {
  return (value || '').trim().toLowerCase();
}

function matchesRule(rule: ForeignOperatedRule, source: string, publisher?: string | null): boolean {
  const normalizedSource = normalize(source);
  const normalizedPublisher = normalize(publisher);

  if (rule.exact?.some((value) => normalize(value) === normalizedSource)) return true;
  if (rule.prefixes?.some((value) => normalizedSource.startsWith(normalize(value)))) return true;
  if (rule.publishers?.some((value) => normalize(value) === normalizedPublisher)) return true;
  return false;
}

export function resolveForeignOperatedSource(
  source: string,
  marketCountry: string,
  publisher?: string | null
): ResolvedForeignOperated | null {
  const match = FOREIGN_OPERATED_RULES.find(
    (rule) => rule.marketCountry === marketCountry && matchesRule(rule, source, publisher)
  );
  if (!match) return null;
  return {
    corporateCountry: match.corporateCountry,
    corporateCity: match.corporateCity,
    corporateRegion: match.corporateRegion,
    corporateLat: match.corporateLat,
    corporateLon: match.corporateLon,
    label: match.label,
  };
}
