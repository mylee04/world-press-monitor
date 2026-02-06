import type { NewsItem } from '@/lib/types';

type Hub = {
  name: string;
  country: string;
  lat: number;
  lon: number;
  keywords: string[];
};

const HUBS: Hub[] = [
  { name: 'Washington', country: 'United States', lat: 38.9072, lon: -77.0369, keywords: ['white house', 'washington', 'pentagon', 'congress'] },
  { name: 'New York', country: 'United States', lat: 40.7128, lon: -74.006, keywords: ['new york', 'wall street', 'nyse', 'manhattan'] },
  { name: 'London', country: 'United Kingdom', lat: 51.5072, lon: -0.1276, keywords: ['uk', 'britain', 'london', 'westminster'] },
  { name: 'Brussels', country: 'Belgium', lat: 50.8503, lon: 4.3517, keywords: ['brussels', 'eu', 'european union', 'nato'] },
  { name: 'Paris', country: 'France', lat: 48.8566, lon: 2.3522, keywords: ['france', 'paris', 'elysee'] },
  { name: 'Berlin', country: 'Germany', lat: 52.52, lon: 13.405, keywords: ['germany', 'berlin', 'bundestag'] },
  { name: 'Rome', country: 'Italy', lat: 41.9028, lon: 12.4964, keywords: ['italy', 'rome', 'vatican'] },
  { name: 'Madrid', country: 'Spain', lat: 40.4168, lon: -3.7038, keywords: ['spain', 'madrid'] },
  { name: 'Kyiv', country: 'Ukraine', lat: 50.4501, lon: 30.5234, keywords: ['ukraine', 'kyiv'] },
  { name: 'Moscow', country: 'Russia', lat: 55.7558, lon: 37.6173, keywords: ['russia', 'moscow', 'kremlin'] },
  { name: 'Warsaw', country: 'Poland', lat: 52.2297, lon: 21.0122, keywords: ['poland', 'warsaw'] },
  { name: 'Istanbul', country: 'Turkey', lat: 41.0082, lon: 28.9784, keywords: ['turkey', 'istanbul', 'ankara'] },
  { name: 'Tel Aviv', country: 'Israel', lat: 32.0853, lon: 34.7818, keywords: ['israel', 'tel aviv', 'jerusalem', 'gaza', 'west bank'] },
  { name: 'Riyadh', country: 'Saudi Arabia', lat: 24.7136, lon: 46.6753, keywords: ['saudi', 'riyadh'] },
  { name: 'Tehran', country: 'Iran', lat: 35.6892, lon: 51.389, keywords: ['iran', 'tehran'] },
  { name: 'Doha', country: 'Qatar', lat: 25.2854, lon: 51.531, keywords: ['qatar', 'doha'] },
  { name: 'Cairo', country: 'Egypt', lat: 30.0444, lon: 31.2357, keywords: ['egypt', 'cairo', 'suez'] },
  { name: 'Johannesburg', country: 'South Africa', lat: -26.2041, lon: 28.0473, keywords: ['south africa', 'johannesburg'] },
  { name: 'Lagos', country: 'Nigeria', lat: 6.5244, lon: 3.3792, keywords: ['nigeria', 'lagos'] },
  { name: 'Beijing', country: 'China', lat: 39.9042, lon: 116.4074, keywords: ['china', 'beijing'] },
  { name: 'Shanghai', country: 'China', lat: 31.2304, lon: 121.4737, keywords: ['shanghai'] },
  { name: 'Taipei', country: 'Taiwan', lat: 25.033, lon: 121.5654, keywords: ['taiwan', 'taipei'] },
  { name: 'Seoul', country: 'South Korea', lat: 37.5665, lon: 126.978, keywords: ['korea', 'seoul', 'north korea', 'pyongyang'] },
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
  ['Indonesia', { lat: -0.7893, lon: 113.9213 }]
]);

export function inferGeoFromTitle(
  title: string,
  fallbackCountry?: string
): Pick<NewsItem, 'lat' | 'lon' | 'locationName' | 'country'> {
  const lower = title.toLowerCase();
  for (const hub of HUBS) {
    if (hub.keywords.some((keyword) => lower.includes(keyword))) {
      return { lat: hub.lat, lon: hub.lon, locationName: hub.name, country: hub.country };
    }
  }

  if (fallbackCountry) {
    const centroid = COUNTRY_CENTROIDS.get(fallbackCountry);
    if (centroid) {
      return { lat: centroid.lat, lon: centroid.lon, locationName: fallbackCountry, country: fallbackCountry };
    }
    return { locationName: fallbackCountry, country: fallbackCountry };
  }

  return {};
}
