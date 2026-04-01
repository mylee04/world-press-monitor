import { buildDisplaySourceName } from '@/lib/source-display';

export type PublisherConfidence = 'high' | 'medium' | 'low';
type PublisherMatchType = 'exact' | 'prefix' | 'contains' | 'fallback';

type PublisherRule = {
  publisher: string;
  countries?: string[];
  exact?: string[];
  prefixes?: string[];
  contains?: string[];
  confidence?: PublisherConfidence;
};

export type ResolvedPublisher = {
  publisher: string;
  confidence: PublisherConfidence;
  matchedBy: PublisherMatchType;
};

function normalize(value: string): string {
  return buildDisplaySourceName(value || '').trim().toLowerCase();
}

const PUBLISHER_RULES: PublisherRule[] = [
  { publisher: 'Yahoo', prefixes: ['Yahoo '] },
  { publisher: 'BBC', prefixes: ['BBC '] },
  { publisher: 'Associated Press', exact: ['Associated Press', 'AP News'] },
  { publisher: 'Reuters', prefixes: ['Reuters'] },
  { publisher: 'Mediacorp', prefixes: ['CNA', 'TODAY'], countries: ['Singapore'] },
  { publisher: 'SPH Media', prefixes: ['The Straits Times', 'The Business Times', 'Lianhe Zaobao'], countries: ['Singapore'] },

  {
    publisher: 'Nine Entertainment',
    countries: ['Australia'],
    exact: ['The Sydney Morning Herald', 'The Age', 'Brisbane Times', 'WAtoday', 'AFR', 'Australian Financial Review'],
    prefixes: ['SMH', 'The Age', 'Brisbane Times', 'WAtoday', 'AFR -', 'Sydney Morning Herald'],
  },
  {
    publisher: 'News Corp Australia',
    countries: ['Australia'],
    prefixes: [
      'News.com.au',
      'The Australian',
      'Herald Sun',
      'Daily Telegraph Australia',
      'Courier Mail',
      'AdelaideNow',
      'Townsville Bulletin',
      'Gold Coast Bulletin',
      'NT News',
      'The Mercury',
      'Geelong Advertiser',
      'Cairns Post',
      'The Daily Telegraph',
    ],
  },
  {
    publisher: 'Seven West Media',
    countries: ['Australia'],
    prefixes: ['7news', 'The West Australian', 'PerthNow', 'The Nightly'],
  },
  {
    publisher: 'Australian Broadcasting Corporation',
    countries: ['Australia'],
    prefixes: ['ABC News', 'ABC -', 'ABC '],
  },
  { publisher: 'SBS', countries: ['Australia'], prefixes: ['SBS'] },
  { publisher: 'AAP', countries: ['Australia'], prefixes: ['AAP'] },
  { publisher: 'DMG Media', countries: ['Australia', 'United Kingdom'], prefixes: ['Daily Mail'] },
  { publisher: 'The Independent', countries: ['United Kingdom'], prefixes: ['The Independent'] },
  { publisher: 'Reach', countries: ['United Kingdom'], prefixes: ['Mirror', 'Daily Express', 'Manchester Evening News'] },
  { publisher: 'News UK', countries: ['United Kingdom'], prefixes: ['The Sun', 'The Times'] },
  { publisher: 'DMG Media', countries: ['United Kingdom'], prefixes: ['Daily Mail', 'Metro'] },
  { publisher: 'Mediahuis Ireland', countries: ['Ireland'], prefixes: ['Independent.ie', 'Sunday World'] },
  { publisher: 'BBC', countries: ['United Kingdom'], prefixes: ['BBC News'] },

  { publisher: 'Korean Broadcasting System', countries: ['South Korea'], exact: ['KBS News'], prefixes: ['KBS -'] },
  { publisher: 'Yonhap News Agency', countries: ['South Korea'], prefixes: ['Yonhap'] },
  { publisher: 'Seoul Broadcasting System', countries: ['South Korea'], prefixes: ['SBS -'] },
  { publisher: 'JoongAng Group', countries: ['South Korea'], prefixes: ['JTBC -', 'JoongAng -'] },
  { publisher: 'Chosun Ilbo', countries: ['South Korea'], prefixes: ['조선닷컴', 'Chosun'] },
  { publisher: 'Newsis', countries: ['South Korea'], exact: ['Newsis'] },
  { publisher: 'Dong-A Ilbo', countries: ['South Korea'], prefixes: ['Donga Ilbo'] },
  { publisher: 'The Korea Herald', countries: ['South Korea'], prefixes: ['Korea Herald'] },
  { publisher: 'The Korea Times', countries: ['South Korea'], prefixes: ['Korea Times'] },
  { publisher: 'Hankyoreh', countries: ['South Korea'], prefixes: ['한겨레'] },
  { publisher: 'Maeil Business Newspaper', countries: ['South Korea'], prefixes: ['매일경제 -'] },
  { publisher: 'The Korea Economic Daily', countries: ['South Korea'], prefixes: ['한국경제 -'] },

  { publisher: 'NHK', countries: ['Japan'], prefixes: ['NHK News', 'NHK News Web -'] },
  { publisher: 'Nippon Television', countries: ['Japan'], exact: ['NTV'] },
  { publisher: 'Nikkei', countries: ['Japan'], exact: ['Nikkei'] },
  { publisher: 'Jiji Press', countries: ['Japan'], exact: ['Jiji Press'] },
  { publisher: 'Kyodo News', countries: ['Japan'], exact: ['Kyodo News'] },
  { publisher: 'Yomiuri Shimbun', countries: ['Japan'], exact: ['Yomiuri'] },
  { publisher: 'Asahi Shimbun', countries: ['Japan'], exact: ['Asahi Shimbun'] },
  { publisher: 'Mainichi Shimbun', countries: ['Japan'], exact: ['Mainichi'] },
  { publisher: 'The Japan Times', countries: ['Japan'], exact: ['The Japan Times'] },
  { publisher: 'Sponichi', countries: ['Japan'], exact: ['Sponichi'] },
  { publisher: 'Abema', countries: ['Japan'], prefixes: ['Abema'] },

  { publisher: 'Yle', countries: ['Finland'], prefixes: ['Yle'] },
  { publisher: 'Business AM', countries: ['Belgium'], prefixes: ['Business AM'] },
  { publisher: 'Mediahuis', countries: ['Belgium', 'Netherlands'], prefixes: ['De Standaard', 'Nieuwsblad', 'Gazet van Antwerpen'] },
];

function resolveRuleMatch(source: string, country: string, rule: PublisherRule): PublisherMatchType | null {
  const normalizedSource = normalize(source);
  if (rule.countries && rule.countries.length > 0 && !rule.countries.includes(country)) {
    return null;
  }
  if (rule.exact?.some((value) => normalize(value) === normalizedSource)) return 'exact';
  if (rule.prefixes?.some((value) => normalizedSource.startsWith(normalize(value)))) return 'prefix';
  if (rule.contains?.some((value) => normalizedSource.includes(normalize(value)))) return 'contains';
  return null;
}

function confidenceForMatch(rule: PublisherRule, matchType: PublisherMatchType): PublisherConfidence {
  if (rule.confidence) return rule.confidence;
  switch (matchType) {
    case 'exact':
      return 'high';
    case 'prefix':
      return 'medium';
    case 'contains':
    case 'fallback':
      return 'low';
  }
}

export function resolvePublisherInfo(source: string, country: string): ResolvedPublisher {
  for (const rule of PUBLISHER_RULES) {
    const matchType = resolveRuleMatch(source, country, rule);
    if (matchType) {
      return {
        publisher: rule.publisher,
        confidence: confidenceForMatch(rule, matchType),
        matchedBy: matchType,
      };
    }
  }

  return {
    publisher: buildDisplaySourceName(source),
    confidence: 'low',
    matchedBy: 'fallback',
  };
}

export function resolvePublisherName(source: string, country: string): string {
  return resolvePublisherInfo(source, country).publisher;
}
