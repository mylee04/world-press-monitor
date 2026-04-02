import { readFileSync } from 'node:fs';
import path from 'node:path';
import { buildDisplaySourceName } from '@/lib/source-display';

export type PublisherHeadquartersRecord = {
  country: string;
  publisher: string;
  city: string;
  region: string;
  lat: number;
  lon: number;
  label: string;
};

export type ResolvedPublisherHeadquarters = {
  city: string;
  region: string;
  lat: number;
  lon: number;
  label: string;
};

function normalizePublisher(value: string): string {
  return buildDisplaySourceName(value || '').trim().toLowerCase();
}

export const PUBLISHER_HEADQUARTERS: PublisherHeadquartersRecord[] = [
  {
    country: 'Australia',
    publisher: 'Nine Entertainment',
    city: 'Sydney',
    region: 'North Sydney',
    lat: -33.8382,
    lon: 151.2082,
    label: 'Nine Entertainment HQ',
  },
  {
    country: 'Australia',
    publisher: 'News Corp Australia',
    city: 'Sydney',
    region: 'Surry Hills',
    lat: -33.885,
    lon: 151.2093,
    label: 'News Corp Australia HQ',
  },
  {
    country: 'Ireland',
    publisher: 'Mediahuis Ireland',
    city: 'Dublin',
    region: 'Dublin 1',
    lat: 53.3511,
    lon: -6.2521,
    label: 'Mediahuis Ireland HQ',
  },
  {
    country: 'Italy',
    publisher: 'ANSA',
    city: 'Rome',
    region: 'Rome',
    lat: 41.9028,
    lon: 12.4964,
    label: 'ANSA HQ',
  },
  {
    country: 'Italy',
    publisher: 'Corriere della Sera',
    city: 'Milan',
    region: 'Milan',
    lat: 45.4642,
    lon: 9.19,
    label: 'Corriere della Sera HQ',
  },
  {
    country: 'Italy',
    publisher: 'la Repubblica',
    city: 'Rome',
    region: 'Rome',
    lat: 41.9028,
    lon: 12.4964,
    label: 'la Repubblica HQ',
  },
  {
    country: 'Italy',
    publisher: 'La Stampa',
    city: 'Turin',
    region: 'Turin',
    lat: 45.0703,
    lon: 7.6869,
    label: 'La Stampa HQ',
  },
  {
    country: 'Italy',
    publisher: 'Il Sole 24 Ore',
    city: 'Milan',
    region: 'Milan',
    lat: 45.4642,
    lon: 9.19,
    label: 'Il Sole 24 Ore HQ',
  },
  {
    country: 'Italy',
    publisher: 'RaiNews',
    city: 'Rome',
    region: 'Rome',
    lat: 41.9028,
    lon: 12.4964,
    label: 'RaiNews HQ',
  },
  {
    country: 'Italy',
    publisher: 'TgCom24',
    city: 'Milan',
    region: 'Milan',
    lat: 45.4642,
    lon: 9.19,
    label: 'TgCom24 HQ',
  },
  {
    country: 'Italy',
    publisher: 'Adnkronos',
    city: 'Rome',
    region: 'Rome',
    lat: 41.9028,
    lon: 12.4964,
    label: 'Adnkronos HQ',
  },
  {
    country: 'Italy',
    publisher: 'AGI',
    city: 'Rome',
    region: 'Rome',
    lat: 41.9028,
    lon: 12.4964,
    label: 'AGI HQ',
  },
  {
    country: 'Italy',
    publisher: 'Il Messaggero',
    city: 'Rome',
    region: 'Rome',
    lat: 41.9028,
    lon: 12.4964,
    label: 'Il Messaggero HQ',
  },
  {
    country: 'Italy',
    publisher: 'Il Giornale',
    city: 'Milan',
    region: 'Milan',
    lat: 45.4642,
    lon: 9.19,
    label: 'Il Giornale HQ',
  },
  {
    country: 'Russia',
    publisher: 'TASS',
    city: 'Moscow',
    region: 'Moscow',
    lat: 55.7558,
    lon: 37.6173,
    label: 'TASS HQ',
  },
  {
    country: 'Russia',
    publisher: 'RIA Novosti',
    city: 'Moscow',
    region: 'Moscow',
    lat: 55.7558,
    lon: 37.6173,
    label: 'RIA Novosti HQ',
  },
  {
    country: 'Russia',
    publisher: 'RT',
    city: 'Moscow',
    region: 'Moscow',
    lat: 55.7558,
    lon: 37.6173,
    label: 'RT HQ',
  },
  {
    country: 'Russia',
    publisher: 'Interfax',
    city: 'Moscow',
    region: 'Moscow',
    lat: 55.7558,
    lon: 37.6173,
    label: 'Interfax HQ',
  },
  {
    country: 'Russia',
    publisher: 'Kommersant',
    city: 'Moscow',
    region: 'Moscow',
    lat: 55.7558,
    lon: 37.6173,
    label: 'Kommersant HQ',
  },
  {
    country: 'Russia',
    publisher: 'RBC',
    city: 'Moscow',
    region: 'Moscow',
    lat: 55.7558,
    lon: 37.6173,
    label: 'RBC HQ',
  },
  {
    country: 'Russia',
    publisher: 'Vedomosti',
    city: 'Moscow',
    region: 'Moscow',
    lat: 55.7558,
    lon: 37.6173,
    label: 'Vedomosti HQ',
  },
  {
    country: 'Russia',
    publisher: 'Gazeta.ru',
    city: 'Moscow',
    region: 'Moscow',
    lat: 55.7558,
    lon: 37.6173,
    label: 'Gazeta.ru HQ',
  },
  {
    country: 'Russia',
    publisher: 'Lenta.ru',
    city: 'Moscow',
    region: 'Moscow',
    lat: 55.7558,
    lon: 37.6173,
    label: 'Lenta.ru HQ',
  },
  {
    country: 'Russia',
    publisher: 'Rossiyskaya Gazeta',
    city: 'Moscow',
    region: 'Moscow',
    lat: 55.7558,
    lon: 37.6173,
    label: 'Rossiyskaya Gazeta HQ',
  },
  {
    country: 'Russia',
    publisher: 'Expert.ru',
    city: 'Moscow',
    region: 'Moscow',
    lat: 55.7558,
    lon: 37.6173,
    label: 'Expert.ru HQ',
  },
  {
    country: 'Russia',
    publisher: 'Rambler',
    city: 'Moscow',
    region: 'Moscow',
    lat: 55.7558,
    lon: 37.6173,
    label: 'Rambler HQ',
  },
  {
    country: 'Indonesia',
    publisher: 'MetroTV News',
    city: 'Jakarta',
    region: 'Kedoya',
    lat: -6.1644,
    lon: 106.763,
    label: 'MetroTV News HQ',
  },
  {
    country: 'Germany',
    publisher: 'Der Spiegel',
    city: 'Hamburg',
    region: 'HafenCity',
    lat: 53.5459,
    lon: 10.0037,
    label: 'Der Spiegel HQ',
  },
  {
    country: 'Germany',
    publisher: 'Handelsblatt',
    city: 'Dusseldorf',
    region: 'Pempelfort',
    lat: 51.236,
    lon: 6.7955,
    label: 'Handelsblatt HQ',
  },
  {
    country: 'Chile',
    publisher: 'Emol',
    city: 'Santiago',
    region: 'Vitacura',
    lat: -33.3823,
    lon: -70.5943,
    label: 'Emol HQ',
  },
  {
    country: 'Netherlands',
    publisher: 'NRC',
    city: 'Amsterdam',
    region: 'Centrum',
    lat: 52.3711,
    lon: 4.8934,
    label: 'NRC HQ',
  },
  {
    country: 'Netherlands',
    publisher: 'Hart van Nederland',
    city: 'Hilversum',
    region: 'Bergweg',
    lat: 52.2251,
    lon: 5.1587,
    label: 'Hart van Nederland HQ',
  },
  {
    country: 'Belgium',
    publisher: 'La Libre',
    city: 'Brussels',
    region: 'Etterbeek',
    lat: 50.8372,
    lon: 4.3996,
    label: 'La Libre HQ',
  },
  {
    country: 'Belgium',
    publisher: 'Mediahuis',
    city: 'Antwerp',
    region: 'Linkeroever',
    lat: 51.2192,
    lon: 4.3589,
    label: 'Mediahuis HQ',
  },
  {
    country: 'Thailand',
    publisher: 'Nation TV',
    city: 'Bangkok',
    region: 'Bang Na',
    lat: 13.6636,
    lon: 100.6517,
    label: 'Nation TV HQ',
  },
  {
    country: 'Norway',
    publisher: 'E24',
    city: 'Oslo',
    region: 'Sentrum',
    lat: 59.9116,
    lon: 10.7546,
    label: 'E24 HQ',
  },
  {
    country: 'South Korea',
    publisher: 'The Korea Economic Daily',
    city: 'Seoul',
    region: 'Jung-gu',
    lat: 37.564,
    lon: 126.998,
    label: 'The Korea Economic Daily HQ',
  },
  {
    country: 'South Korea',
    publisher: 'Seoul Broadcasting System',
    city: 'Seoul',
    region: 'Yangcheon-gu',
    lat: 37.517,
    lon: 126.8666,
    label: 'Seoul Broadcasting System HQ',
  },
  {
    country: 'South Korea',
    publisher: 'Hankyoreh',
    city: 'Seoul',
    region: 'Mapo-gu',
    lat: 37.5637,
    lon: 126.9084,
    label: 'Hankyoreh HQ',
  },
  {
    country: 'South Korea',
    publisher: 'Yonhap News Agency',
    city: 'Seoul',
    region: 'Jongno-gu',
    lat: 37.5735,
    lon: 126.979,
    label: 'Yonhap News Agency HQ',
  },
  {
    country: 'South Korea',
    publisher: 'Maeil Business Newspaper',
    city: 'Seoul',
    region: 'Jung-gu',
    lat: 37.564,
    lon: 126.998,
    label: 'Maeil Business Newspaper HQ',
  },
  {
    country: 'United Kingdom',
    publisher: 'Reach',
    city: 'London',
    region: 'Canary Wharf',
    lat: 51.5049,
    lon: -0.0195,
    label: 'Reach HQ',
  },
  {
    country: 'United Kingdom',
    publisher: 'DMG Media',
    city: 'London',
    region: 'Kensington',
    lat: 51.5012,
    lon: -0.1913,
    label: 'DMG Media HQ',
  },
  {
    country: 'United Kingdom',
    publisher: 'News UK',
    city: 'London',
    region: 'Southwark',
    lat: 51.5051,
    lon: -0.0872,
    label: 'News UK HQ',
  },
  {
    country: 'France',
    publisher: 'CNEWS',
    city: 'Paris',
    region: 'Issy-les-Moulineaux',
    lat: 48.8311,
    lon: 2.266,
    label: 'CNEWS HQ',
  },
  {
    country: 'France',
    publisher: 'BFM TV',
    city: 'Paris',
    region: '9th arrondissement',
    lat: 48.876,
    lon: 2.3374,
    label: 'BFM TV HQ',
  },
  {
    country: 'France',
    publisher: 'Le Monde',
    city: 'Paris',
    region: '13th arrondissement',
    lat: 48.8408,
    lon: 2.3677,
    label: 'Le Monde HQ',
  },
  {
    country: 'France',
    publisher: 'France Info',
    city: 'Paris',
    region: '15th arrondissement',
    lat: 48.8388,
    lon: 2.2713,
    label: 'France Info HQ',
  },
  {
    country: 'Spain',
    publisher: '20 Minutos',
    city: 'Madrid',
    region: 'Arganzuela',
    lat: 40.4018,
    lon: -3.6897,
    label: '20 Minutos HQ',
  },
  {
    country: 'Australia',
    publisher: 'Seven West Media',
    city: 'Perth',
    region: 'Osborne Park',
    lat: -31.9121,
    lon: 115.8121,
    label: 'Seven West Media HQ',
  },
  {
    country: 'Austria',
    publisher: 'Der Standard',
    city: 'Vienna',
    region: 'Landstrasse',
    lat: 48.2072,
    lon: 16.3835,
    label: 'Der Standard HQ',
  },
  {
    country: 'Austria',
    publisher: 'Nachrichten.at',
    city: 'Linz',
    region: 'Innere Stadt',
    lat: 48.3031,
    lon: 14.2853,
    label: 'Nachrichten.at HQ',
  },
  {
    country: 'Czech Republic',
    publisher: 'Sport.cz',
    city: 'Prague',
    region: 'Smichov',
    lat: 50.0711,
    lon: 14.4009,
    label: 'Sport.cz HQ',
  },
  {
    country: 'Czech Republic',
    publisher: 'Blesk',
    city: 'Prague',
    region: 'Strasnice',
    lat: 50.0782,
    lon: 14.4801,
    label: 'Blesk HQ',
  },
  {
    country: 'Czech Republic',
    publisher: 'TN Nova',
    city: 'Prague',
    region: 'Hlubocepy',
    lat: 50.0301,
    lon: 14.3922,
    label: 'TN Nova HQ',
  },
  {
    country: 'Bulgaria',
    publisher: 'Vesti',
    city: 'Sofia',
    region: 'Iskar',
    lat: 42.6738,
    lon: 23.4024,
    label: 'Vesti HQ',
  },
  {
    country: 'Turkey',
    publisher: 'TRT Haber',
    city: 'Ankara',
    region: 'Or-An',
    lat: 39.8707,
    lon: 32.8606,
    label: 'TRT Haber HQ',
  },
  {
    country: 'Switzerland',
    publisher: 'Watson',
    city: 'Aarau',
    region: 'Rohr',
    lat: 47.3977,
    lon: 8.0659,
    label: 'Watson HQ',
  },
  {
    country: 'Norway',
    publisher: 'TV2',
    city: 'Bergen',
    region: 'Nygard',
    lat: 60.3855,
    lon: 5.3328,
    label: 'TV2 HQ',
  },
  {
    country: 'Lithuania',
    publisher: 'Delfi Lithuania',
    city: 'Vilnius',
    region: 'Gynėjų g.',
    lat: 54.6997,
    lon: 25.2588,
    label: 'Delfi Lithuania HQ',
  },
  {
    country: 'Lithuania',
    publisher: 'TV3 Lithuania',
    city: 'Vilnius',
    region: 'Zirmunai',
    lat: 54.7119,
    lon: 25.2978,
    label: 'TV3 Lithuania HQ',
  },
  {
    country: 'Singapore',
    publisher: 'Mediacorp',
    city: 'Singapore',
    region: 'Mediacorp Campus',
    lat: 1.2954,
    lon: 103.7923,
    label: 'Mediacorp HQ',
  },
];

let generatedPublisherHeadquartersCache: PublisherHeadquartersRecord[] | null = null;

function getGeneratedPublisherHeadquartersPath(): string {
  return path.join(process.cwd(), 'data', 'publisher-headquarters.generated.json');
}

function loadGeneratedPublisherHeadquarters(): PublisherHeadquartersRecord[] {
  if (generatedPublisherHeadquartersCache) return generatedPublisherHeadquartersCache;
  try {
    const raw = readFileSync(getGeneratedPublisherHeadquartersPath(), 'utf8');
    const parsed = JSON.parse(raw) as PublisherHeadquartersRecord[];
    generatedPublisherHeadquartersCache = Array.isArray(parsed) ? parsed : [];
  } catch {
    generatedPublisherHeadquartersCache = [];
  }
  return generatedPublisherHeadquartersCache;
}

function getAllPublisherHeadquarters(): PublisherHeadquartersRecord[] {
  return [...PUBLISHER_HEADQUARTERS, ...loadGeneratedPublisherHeadquarters()];
}

export function resolvePublisherHeadquarters(
  publisher: string | null | undefined,
  country: string
): ResolvedPublisherHeadquarters | null {
  if (!publisher) return null;
  const normalizedPublisher = normalizePublisher(publisher);
  const record = getAllPublisherHeadquarters().find(
    (entry) => entry.country === country && normalizePublisher(entry.publisher) === normalizedPublisher
  );
  if (!record) return null;
  return {
    city: record.city,
    region: record.region,
    lat: record.lat,
    lon: record.lon,
    label: record.label,
  };
}
