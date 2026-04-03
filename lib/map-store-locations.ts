import { createHash } from 'node:crypto';
import { inferGeoFromTitle, inferGeoFromCountry } from '@/lib/geo';
import { resolvePublisherHeadquarters } from '@/lib/publisher-headquarters';
import { resolveSourceHeadquarters } from '@/lib/source-headquarters';

function hashNumber(value: string): number {
  const hex = createHash('md5').update(value).digest('hex').slice(0, 8);
  return Number.parseInt(hex, 16);
}

type JitterProfile = {
  minRadius: number;
  maxRadius: number;
};

const COUNTRY_JITTER: JitterProfile = {
  minRadius: 0.2,
  maxRadius: 1.05,
};

const CITY_JITTER: JitterProfile = {
  minRadius: 0.01,
  maxRadius: 0.075,
};

const HEADQUARTERS_JITTER: JitterProfile = {
  minRadius: 0.0015,
  maxRadius: 0.012,
};

const PRIMARY_MEDIA_HUBS = new Map<string, { name: string; lat: number; lon: number }>([
  ['South Korea', { name: 'Seoul', lat: 37.5665, lon: 126.978 }],
  ['Japan', { name: 'Tokyo', lat: 35.6762, lon: 139.6503 }],
  ['Taiwan', { name: 'Taipei', lat: 25.033, lon: 121.5654 }],
  ['Vietnam', { name: 'Hanoi', lat: 21.0278, lon: 105.8342 }],
  ['Singapore', { name: 'Singapore', lat: 1.3521, lon: 103.8198 }],
  ['Italy', { name: 'Rome', lat: 41.9028, lon: 12.4964 }],
  ['Russia', { name: 'Moscow', lat: 55.7558, lon: 37.6173 }],
  ['United Kingdom', { name: 'London', lat: 51.5072, lon: -0.1276 }],
  ['France', { name: 'Paris', lat: 48.8566, lon: 2.3522 }],
  ['Belgium', { name: 'Brussels', lat: 50.8503, lon: 4.3517 }],
  ['Ireland', { name: 'Dublin', lat: 53.3498, lon: -6.2603 }],
  ['Norway', { name: 'Oslo', lat: 59.9139, lon: 10.7522 }],
  ['Denmark', { name: 'Copenhagen', lat: 55.6761, lon: 12.5683 }],
  ['Finland', { name: 'Helsinki', lat: 60.1699, lon: 24.9384 }],
  ['Estonia', { name: 'Tallinn', lat: 59.437, lon: 24.7536 }],
  ['Latvia', { name: 'Riga', lat: 56.9496, lon: 24.1052 }],
  ['Lithuania', { name: 'Vilnius', lat: 54.6872, lon: 25.2797 }],
  ['Czech Republic', { name: 'Prague', lat: 50.0755, lon: 14.4378 }],
  ['Slovakia', { name: 'Bratislava', lat: 48.1486, lon: 17.1077 }],
  ['Croatia', { name: 'Zagreb', lat: 45.815, lon: 15.9819 }],
  ['Serbia', { name: 'Belgrade', lat: 44.7866, lon: 20.4489 }],
]);

function withStableJitter(
  lat: number,
  lon: number,
  seed: string,
  profile: JitterProfile = COUNTRY_JITTER
): { lat: number; lon: number } {
  const hash = hashNumber(seed);
  const angle = (hash % 360) * (Math.PI / 180);
  const radius = profile.minRadius + (((hash >> 8) % 100) / 100) * (profile.maxRadius - profile.minRadius);
  const latOffset = Math.sin(angle) * radius;
  const lonOffset = Math.cos(angle) * radius * Math.max(0.35, Math.cos((lat * Math.PI) / 180));
  return {
    lat: Number((lat + latOffset).toFixed(4)),
    lon: Number((lon + lonOffset).toFixed(4)),
  };
}

export function inferSourceCoordinate(
  source: string,
  country: string,
  options?: { publisher?: string | null }
): {
  lat: number;
  lon: number;
  city: string | null;
  region: string | null;
  locationKind: 'headquarters' | 'inferred-city' | 'hub' | 'country-fallback';
} {
  const headquarters = resolveSourceHeadquarters(source, country);
  if (headquarters) {
    const jittered = withStableJitter(headquarters.lat, headquarters.lon, `hq:${country}:${source}`, HEADQUARTERS_JITTER);
    return {
      lat: jittered.lat,
      lon: jittered.lon,
      city: headquarters.city,
      region: headquarters.region,
      locationKind: 'headquarters',
    };
  }

  const publisherHeadquarters = resolvePublisherHeadquarters(options?.publisher, country);
  if (publisherHeadquarters) {
    const jittered = withStableJitter(
      publisherHeadquarters.lat,
      publisherHeadquarters.lon,
      `publisher-hq:${country}:${options?.publisher}:${source}`,
      HEADQUARTERS_JITTER
    );
    return {
      lat: jittered.lat,
      lon: jittered.lon,
      city: publisherHeadquarters.city,
      region: publisherHeadquarters.region,
      locationKind: 'headquarters',
    };
  }

  const inferred = inferGeoFromTitle(source, country);
  if (typeof inferred.lat === 'number' && typeof inferred.lon === 'number') {
    const usedCountryFallback = !inferred.locationName || inferred.locationName === country;
    if (usedCountryFallback) {
      const hub = PRIMARY_MEDIA_HUBS.get(country);
      if (hub) {
        const jittered = withStableJitter(hub.lat, hub.lon, `${country}:${source}`, CITY_JITTER);
        return { ...jittered, city: hub.name, region: hub.name, locationKind: 'hub' };
      }
      const jittered = withStableJitter(inferred.lat, inferred.lon, `${country}:${source}`, COUNTRY_JITTER);
      return { ...jittered, city: null, region: null, locationKind: 'country-fallback' };
    }
    const jittered = withStableJitter(inferred.lat, inferred.lon, `${country}:${source}`, CITY_JITTER);
    return {
      lat: jittered.lat,
      lon: jittered.lon,
      city: inferred.locationName || null,
      region: inferred.locationName || null,
      locationKind: 'inferred-city',
    };
  }

  const fallback = inferGeoFromCountry(country);
  const hub = PRIMARY_MEDIA_HUBS.get(country);
  if (hub) {
    const jittered = withStableJitter(hub.lat, hub.lon, `${country}:${source}`, CITY_JITTER);
    return { ...jittered, city: hub.name, region: hub.name, locationKind: 'hub' };
  }
  const jittered = withStableJitter(fallback.lat || 0, fallback.lon || 0, `${country}:${source}`, COUNTRY_JITTER);
  return { ...jittered, city: null, region: null, locationKind: 'country-fallback' };
}

export function rankTopCounts(items: Array<{ name: string; count: number }>, limit = 8): Array<{ name: string; count: number }> {
  const byName = new Map<string, number>();
  for (const item of items) {
    byName.set(item.name, (byName.get(item.name) || 0) + item.count);
  }

  return [...byName.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, limit);
}

export function rankTopRegions(
  items: Array<{ name: string; count: number; sources?: number; unmapped?: boolean }>,
  limit = 8
): Array<{ name: string; count: number; sources: number }> {
  const byName = new Map<string, { count: number; sources: number; unmapped: boolean }>();
  for (const item of items) {
    const current = byName.get(item.name) || { count: 0, sources: 0, unmapped: false };
    current.count += item.count;
    current.sources += item.sources || 0;
    current.unmapped = current.unmapped || Boolean(item.unmapped);
    byName.set(item.name, current);
  }

  return [...byName.entries()]
    .map(([name, value]) => ({ name, count: value.count, sources: value.sources, unmapped: value.unmapped }))
    .sort((a, b) => Number(a.unmapped) - Number(b.unmapped) || b.count - a.count || b.sources - a.sources || a.name.localeCompare(b.name))
    .slice(0, limit)
    .map(({ name, count, sources }) => ({ name, count, sources }));
}

export function buildAreaLabel(value: { city: string | null; region: string | null; country: string }): string {
  return value.city || value.region || value.country;
}
