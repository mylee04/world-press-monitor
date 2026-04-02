import fs from 'node:fs/promises';
import path from 'node:path';
import { resolvePublisherInfo } from '@/lib/publisher-groups';

type AtlasFeed = {
  name?: string;
  url?: string | null;
  sitemapUrl?: string | null;
};

type AtlasCountry = {
  name?: string;
  feeds?: AtlasFeed[];
};

type AtlasFile = {
  countries?: AtlasCountry[];
};

type PublisherPair = {
  country: string;
  publisher: string;
  feedCount: number;
  sources: string[];
  urls: string[];
};

type WikidataSearchResult = {
  id?: string;
  label?: string;
  description?: string;
};

type WikidataEntity = {
  id: string;
  label: string | null;
  description: string | null;
  officialWebsites: string[];
  headquartersIds: string[];
  countryIds: string[];
  instanceOfIds: string[];
  parentIds: string[];
  coordinate: { lat: number; lon: number } | null;
};

type EnrichedPublisherHeadquarters = {
  country: string;
  publisher: string;
  city: string;
  region: string;
  lat: number;
  lon: number;
  label: string;
  confidence: 'high' | 'medium';
  wikidataEntityId: string;
  wikidataEntityLabel: string | null;
  matchedWebsite: string | null;
  matchedDomain: string | null;
  searchScore: number;
  headquartersLabel: string | null;
  headquartersItemId: string | null;
  headquartersChain: string[];
};

const USER_AGENT = 'world-press-monitor/1.0 (publisher HQ enrichment)';
const DEFAULT_LIMIT = 50;
const SEARCH_LIMIT = 5;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseArgs(argv: string[]): {
  limit: number;
  country: string | null;
  writeJson: boolean;
  outPath: string;
  cachePath: string;
} {
  let limit = DEFAULT_LIMIT;
  let country: string | null = null;
  let writeJson = false;
  let outPath = path.join(process.cwd(), 'output', 'publisher-headquarters-candidates.json');
  let cachePath = path.join(process.cwd(), 'output', 'publisher-headquarters-wikidata-cache.json');

  for (const arg of argv) {
    if (arg.startsWith('--limit=')) {
      const value = Number(arg.slice('--limit='.length));
      if (Number.isFinite(value) && value > 0) limit = value;
    } else if (arg.startsWith('--country=')) {
      const value = arg.slice('--country='.length).trim();
      country = value || null;
    } else if (arg === '--write-json') {
      writeJson = true;
    } else if (arg.startsWith('--out=')) {
      const value = arg.slice('--out='.length).trim();
      if (value) outPath = path.resolve(process.cwd(), value);
    } else if (arg.startsWith('--cache=')) {
      const value = arg.slice('--cache='.length).trim();
      if (value) cachePath = path.resolve(process.cwd(), value);
    }
  }

  return { limit, country, writeJson, outPath, cachePath };
}

function normalize(value: string): string {
  return (value || '').trim().toLowerCase();
}

function normalizeHost(value: string): string | null {
  try {
    const url = new URL(value);
    return url.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

function registrableDomain(host: string): string {
  const parts = host.split('.').filter(Boolean);
  if (parts.length <= 2) return host;
  const joinedLastThree = parts.slice(-3).join('.');
  const multiLevelTlds = [
    'com.au',
    'net.au',
    'org.au',
    'co.uk',
    'org.uk',
    'gov.uk',
    'co.jp',
    'or.jp',
    'com.br',
    'com.mx',
    'com.tr',
    'co.id',
    'co.kr',
    'co.th',
    'com.sg',
    'com.tw',
    'com.vn',
    'com.ar',
    'com.ph',
  ];
  if (multiLevelTlds.some((suffix) => joinedLastThree.endsWith(suffix))) {
    return joinedLastThree;
  }
  return parts.slice(-2).join('.');
}

function scoreDomainMatch(urls: string[], candidateUrls: string[]): { score: number; matchedWebsite: string | null; matchedDomain: string | null } {
  const atlasDomains = new Set(
    urls
      .map(normalizeHost)
      .filter((value): value is string => Boolean(value))
      .map(registrableDomain)
  );

  for (const website of candidateUrls) {
    const host = normalizeHost(website);
    if (!host) continue;
    const domain = registrableDomain(host);
    if (atlasDomains.has(domain)) {
      return {
        score: 120,
        matchedWebsite: website,
        matchedDomain: domain,
      };
    }
  }

  return {
    score: 0,
    matchedWebsite: null,
    matchedDomain: null,
  };
}

async function readAtlas(): Promise<AtlasFile> {
  const raw = await fs.readFile(path.join(process.cwd(), 'data', 'rss-atlas.json'), 'utf8');
  return JSON.parse(raw) as AtlasFile;
}

async function readJsonCache(cachePath: string): Promise<Map<string, unknown>> {
  try {
    const raw = await fs.readFile(cachePath, 'utf8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return new Map(Object.entries(parsed));
  } catch {
    return new Map();
  }
}

async function writeJsonCache(cachePath: string, cache: Map<string, unknown>): Promise<void> {
  await fs.mkdir(path.dirname(cachePath), { recursive: true });
  await fs.writeFile(cachePath, JSON.stringify(Object.fromEntries(cache), null, 2));
}

function aggregatePublisherPairs(atlas: AtlasFile): PublisherPair[] {
  const pairs = new Map<string, { country: string; publisher: string; feedCount: number; sources: Set<string>; urls: Set<string> }>();

  for (const country of atlas.countries || []) {
    const countryName = (country.name || '').trim();
    if (!countryName) continue;

    for (const feed of country.feeds || []) {
      const source = (feed.name || '').trim();
      if (!source) continue;

      const publisher = resolvePublisherInfo(source, countryName).publisher;
      const key = `${normalize(countryName)}::${normalize(publisher)}`;

      const current =
        pairs.get(key) || { country: countryName, publisher, feedCount: 0, sources: new Set<string>(), urls: new Set<string>() };
      current.feedCount += 1;
      current.sources.add(source);
      if (feed.url) current.urls.add(feed.url);
      if (feed.sitemapUrl) current.urls.add(feed.sitemapUrl);
      pairs.set(key, current);
    }
  }

  return [...pairs.values()]
    .map((row) => ({
      country: row.country,
      publisher: row.publisher,
      feedCount: row.feedCount,
      sources: [...row.sources].sort(),
      urls: [...row.urls].sort(),
    }))
    .sort((a, b) => b.feedCount - a.feedCount || a.country.localeCompare(b.country) || a.publisher.localeCompare(b.publisher));
}

async function fetchJson<T>(url: string, cache: Map<string, unknown>, cachePath: string): Promise<T> {
  if (cache.has(url)) return cache.get(url) as T;

  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
      },
    });

    if (response.ok) {
      const payload = (await response.json()) as T;
      cache.set(url, payload as unknown);
      await writeJsonCache(cachePath, cache);
      return payload;
    }

    if (response.status === 429) {
      const retryAfter = Number(response.headers.get('retry-after') || '0');
      const delayMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1500 * (attempt + 1);
      await sleep(delayMs);
      continue;
    }

    lastError = new Error(`HTTP ${response.status} for ${url}`);
    break;
  }

  throw lastError || new Error(`Failed to fetch ${url}`);
}

async function searchWikidataEntities(query: string, cache: Map<string, unknown>, cachePath: string): Promise<WikidataSearchResult[]> {
  const url = new URL('https://www.wikidata.org/w/api.php');
  url.searchParams.set('action', 'wbsearchentities');
  url.searchParams.set('format', 'json');
  url.searchParams.set('language', 'en');
  url.searchParams.set('type', 'item');
  url.searchParams.set('limit', String(SEARCH_LIMIT));
  url.searchParams.set('search', query);
  const payload = await fetchJson<{ search?: WikidataSearchResult[] }>(url.toString(), cache, cachePath);
  return payload.search || [];
}

async function resolveCountryEntityId(country: string, cache: Map<string, unknown>, cachePath: string): Promise<string | null> {
  const cacheKey = `country-entity::${normalize(country)}`;
  if (cache.has(cacheKey)) {
    const value = cache.get(cacheKey);
    return typeof value === 'string' ? value : null;
  }

  const results = await searchWikidataEntities(country, cache, cachePath);
  const exact = results.find((row) => normalize(row.label || '') === normalize(country));
  const selected = exact || results[0];
  const entityId = selected?.id || null;
  cache.set(cacheKey, entityId);
  await writeJsonCache(cachePath, cache);
  return entityId;
}

function getStringClaimValues(entity: Record<string, unknown>, property: string): string[] {
  const claims = (entity.claims as Record<string, Array<Record<string, unknown>>> | undefined)?.[property] || [];
  return claims
    .map((claim) => {
      const mainsnak = claim.mainsnak as Record<string, unknown> | undefined;
      const datavalue = mainsnak?.datavalue as Record<string, unknown> | undefined;
      return typeof datavalue?.value === 'string' ? datavalue.value : null;
    })
    .filter((value): value is string => Boolean(value));
}

function getEntityIdClaimValues(entity: Record<string, unknown>, property: string): string[] {
  const claims = (entity.claims as Record<string, Array<Record<string, unknown>>> | undefined)?.[property] || [];
  return claims
    .map((claim) => {
      const mainsnak = claim.mainsnak as Record<string, unknown> | undefined;
      const datavalue = mainsnak?.datavalue as Record<string, unknown> | undefined;
      const value = datavalue?.value as Record<string, unknown> | undefined;
      return typeof value?.id === 'string' ? value.id : null;
    })
    .filter((value): value is string => Boolean(value));
}

function getCoordinateClaim(entity: Record<string, unknown>, property: string): { lat: number; lon: number } | null {
  const claims = (entity.claims as Record<string, Array<Record<string, unknown>>> | undefined)?.[property] || [];
  for (const claim of claims) {
    const mainsnak = claim.mainsnak as Record<string, unknown> | undefined;
    const datavalue = mainsnak?.datavalue as Record<string, unknown> | undefined;
    const value = datavalue?.value as Record<string, unknown> | undefined;
    if (typeof value?.latitude === 'number' && typeof value?.longitude === 'number') {
      return {
        lat: value.latitude,
        lon: value.longitude,
      };
    }
  }
  return null;
}

const CITYISH_INSTANCE_IDS = new Set([
  'Q515',
  'Q5119',
  'Q15284',
  'Q1549591',
  'Q486972',
  'Q1093829',
  'Q7930989',
]);

const DISTRICTISH_INSTANCE_IDS = new Set([
  'Q149621',
  'Q79007',
  'Q123705',
  'Q253019',
  'Q2983893',
  'Q817477',
  'Q857477',
  'Q188509',
]);

function looksAdministrativeArea(label: string | null): boolean {
  return /\b(county|district|province|prefecture|region|governorate|oblast|voivodeship|municipality)\b/i.test(
    label || ''
  );
}

function stripAdministrativeSuffix(label: string | null): string | null {
  if (!label) return null;
  const cleaned = label
    .replace(/\b(county|district|province|prefecture|region|governorate|oblast|voivodeship|municipality)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || label;
}

function looksVenueLike(label: string | null): boolean {
  return /(tower|square|center|centre|campus|building|plaza|avenue|street|studio|studios|house|media)/i.test(
    label || ''
  );
}

async function selectPreferredParentId(
  parentIds: string[],
  cache: Map<string, unknown>,
  cachePath: string
): Promise<string | null> {
  if (parentIds.length === 0) return null;
  if (parentIds.length === 1) return parentIds[0] || null;

  const parents: WikidataEntity[] = [];
  for (const parentId of parentIds) {
    parents.push(await fetchWikidataEntity(parentId, cache, cachePath));
    await sleep(80);
  }

  const ranked = [...parents].sort((a, b) => {
    const score = (entity: WikidataEntity): number => {
      if (entity.instanceOfIds.some((id) => CITYISH_INSTANCE_IDS.has(id))) return 100;
      if (entity.instanceOfIds.some((id) => DISTRICTISH_INSTANCE_IDS.has(id))) return 80;
      if (entity.coordinate) return 60;
      if (entity.countryIds.length > 0) return 40;
      return 0;
    };
    return score(b) - score(a);
  });

  return ranked[0]?.id || parentIds[0] || null;
}

async function fetchWikidataEntity(qid: string, cache: Map<string, unknown>, cachePath: string): Promise<WikidataEntity> {
  const url = `https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`;
  const payload = await fetchJson<{ entities: Record<string, Record<string, unknown>> }>(url, cache, cachePath);
  const entity = payload.entities[qid];
  return {
    id: qid,
    label: (entity.labels as Record<string, { value?: string }> | undefined)?.en?.value || null,
    description: (entity.descriptions as Record<string, { value?: string }> | undefined)?.en?.value || null,
    officialWebsites: getStringClaimValues(entity, 'P856'),
    headquartersIds: getEntityIdClaimValues(entity, 'P159'),
    countryIds: getEntityIdClaimValues(entity, 'P17'),
    instanceOfIds: getEntityIdClaimValues(entity, 'P31'),
    parentIds: getEntityIdClaimValues(entity, 'P131'),
    coordinate: getCoordinateClaim(entity, 'P625'),
  };
}

async function resolveLocationHierarchy(
  startQid: string,
  cache: Map<string, unknown>,
  cachePath: string
): Promise<{
  city: string | null;
  region: string | null;
  coordinate: { lat: number; lon: number } | null;
  chain: string[];
  headquartersLabel: string | null;
  countryIds: string[];
}> {
  const visited = new Set<string>();
  const chain: Array<{
    id: string;
    label: string | null;
    instanceOfIds: string[];
    countryIds: string[];
    coordinate: { lat: number; lon: number } | null;
  }> = [];
  let currentId: string | null = startQid;

  while (currentId && !visited.has(currentId) && chain.length < 6) {
    visited.add(currentId);
    const entity = await fetchWikidataEntity(currentId, cache, cachePath);
    chain.push({
      id: entity.id,
      label: entity.label,
      instanceOfIds: entity.instanceOfIds,
      countryIds: entity.countryIds,
      coordinate: entity.coordinate,
    });
    currentId = await selectPreferredParentId(entity.parentIds, cache, cachePath);
    await sleep(120);
  }

  const headquartersLabel = chain[0]?.label || null;
  const region = chain[0]?.label || null;

  let city = chain[0]?.label || null;
  let foundCityish = false;
  for (const item of chain) {
    if (item.instanceOfIds.some((id) => CITYISH_INSTANCE_IDS.has(id))) {
      city = item.label;
      foundCityish = true;
      break;
    }
  }

  if (chain[0]?.instanceOfIds.some((id) => DISTRICTISH_INSTANCE_IDS.has(id))) {
    const parentCandidate = chain.find((item, index) => index > 0 && item.label);
    if (parentCandidate?.label) city = parentCandidate.label;
  }

  if (chain.length >= 2 && city === chain[0]?.label) {
    const outerCandidate = chain.find(
      (item, index) => index > 0 && item.label && item.instanceOfIds.some((id) => CITYISH_INSTANCE_IDS.has(id))
    );
    if (outerCandidate?.label) city = outerCandidate.label;
  }

  if (!foundCityish) {
    const first = chain[0];
    const second = chain[1];
    const third = chain[2];

    if (first?.label && looksVenueLike(first.label) && second?.label) {
      city = stripAdministrativeSuffix(second.label) || second.label;
    } else if (
      first?.label &&
      (first.instanceOfIds.some((id) => DISTRICTISH_INSTANCE_IDS.has(id)) || looksAdministrativeArea(first.label))
    ) {
      city = stripAdministrativeSuffix(first.label) || first.label;
      if (city === first.label && second?.label) {
        city = stripAdministrativeSuffix(second.label) || second.label;
      }
    } else if (first?.label) {
      city = first.label;
    }

    if (second?.label && normalize(city || '') === normalize(second.label) && third?.label) {
      city = stripAdministrativeSuffix(second.label) || second.label;
    }
  }

  const coordinate = chain.find((item) => item.coordinate)?.coordinate || null;
  const countryIds = [...new Set(chain.flatMap((item) => item.countryIds))];
  return {
    city,
    region,
    coordinate,
    chain: chain.map((item) => item.label || item.id),
    headquartersLabel,
    countryIds,
  };
}

function scoreEntity(pair: PublisherPair, entity: WikidataEntity, matchedWebsiteScore: number): number {
  let score = matchedWebsiteScore;
  if (normalize(entity.label || '') === normalize(pair.publisher)) score += 25;
  if (normalize(entity.label || '').includes(normalize(pair.publisher))) score += 10;
  if ((entity.description || '').toLowerCase().includes(pair.country.toLowerCase())) score += 10;
  if (entity.headquartersIds.length > 0) score += 15;
  else if (entity.coordinate) score += 8;
  return score;
}

async function resolvePublisherPair(
  pair: PublisherPair,
  cache: Map<string, unknown>,
  cachePath: string
): Promise<EnrichedPublisherHeadquarters | null> {
  const countryEntityId = await resolveCountryEntityId(pair.country, cache, cachePath);
  const queries = [`${pair.publisher} ${pair.country}`, pair.publisher];
  const seen = new Set<string>();
  const candidates: WikidataEntity[] = [];

  for (const query of queries) {
    const results = await searchWikidataEntities(query, cache, cachePath);
    for (const result of results) {
      if (!result.id || seen.has(result.id)) continue;
      seen.add(result.id);
      candidates.push(await fetchWikidataEntity(result.id, cache, cachePath));
      await sleep(120);
    }
  }

  let best: EnrichedPublisherHeadquarters | null = null;

  for (const entity of candidates) {
    const domainMatch = scoreDomainMatch(pair.urls, entity.officialWebsites);
    const score = scoreEntity(pair, entity, domainMatch.score);
    if (score < 40) continue;

    let coordinate: { lat: number; lon: number } | null = null;
    let city: string | null = null;
    let region: string | null = null;
    let headquartersLabel: string | null = null;
    let headquartersChain: string[] = [];
    let headquartersItemId: string | null = null;
    let headquartersCountryIds: string[] = [];

    for (const locationId of entity.headquartersIds) {
      const locationEntity = await resolveLocationHierarchy(locationId, cache, cachePath);
      const locationCountryMatch = countryEntityId
        ? locationEntity.countryIds.includes(countryEntityId)
        : locationEntity.chain.some((label) => normalize(label).includes(normalize(pair.country)));
      if (locationEntity.coordinate && locationEntity.city && locationCountryMatch) {
        city = locationEntity.city;
        region = locationEntity.region || locationEntity.city;
        headquartersLabel = locationEntity.headquartersLabel;
        headquartersChain = locationEntity.chain;
        headquartersItemId = locationId;
        headquartersCountryIds = locationEntity.countryIds;
        coordinate = locationEntity.coordinate;
        break;
      }
      await sleep(120);
    }

    if (!coordinate && entity.coordinate) {
      coordinate = entity.coordinate;
      city = entity.label;
      region = entity.label;
      headquartersLabel = entity.label;
      headquartersItemId = entity.id;
      headquartersChain = entity.label ? [entity.label] : [];
      headquartersCountryIds = entity.countryIds;
    }

    if (!coordinate || !city) continue;

    const normalizedCountry = normalize(pair.country);
    const countryMatchByClaim = countryEntityId
      ? headquartersCountryIds.includes(countryEntityId) || entity.countryIds.includes(countryEntityId)
      : false;
    const countryMatchByChain = headquartersChain.some((label) => normalize(label).includes(normalizedCountry));
    const countryMatchByDescription = normalize(entity.description || '').includes(normalizedCountry);
    if (!countryMatchByClaim && !countryMatchByChain && !countryMatchByDescription) continue;

    const candidate: EnrichedPublisherHeadquarters = {
      country: pair.country,
      publisher: pair.publisher,
      city,
      region: region || city,
      lat: Number(coordinate.lat.toFixed(4)),
      lon: Number(coordinate.lon.toFixed(4)),
      label: `${pair.publisher} HQ`,
      confidence: domainMatch.score >= 120 ? 'high' : 'medium',
      wikidataEntityId: entity.id,
      wikidataEntityLabel: entity.label,
      matchedWebsite: domainMatch.matchedWebsite,
      matchedDomain: domainMatch.matchedDomain,
      searchScore: score,
      headquartersLabel,
      headquartersItemId,
      headquartersChain,
    };

    if (!best || candidate.searchScore > best.searchScore) best = candidate;
  }

  return best;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const atlas = await readAtlas();
  const cache = await readJsonCache(args.cachePath);
  const pairs = aggregatePublisherPairs(atlas)
    .filter((pair) => !args.country || pair.country === args.country)
    .slice(0, args.limit);

  const results: EnrichedPublisherHeadquarters[] = [];
  const unresolved: Array<{ country: string; publisher: string; feedCount: number }> = [];

  for (const [index, pair] of pairs.entries()) {
    console.log(`[${index + 1}/${pairs.length}] ${pair.country} :: ${pair.publisher}`);
    try {
      const result = await resolvePublisherPair(pair, cache, args.cachePath);
      if (result) {
        results.push(result);
        console.log(`  -> ${result.city} (${result.confidence}, score ${result.searchScore})`);
      } else {
        unresolved.push({ country: pair.country, publisher: pair.publisher, feedCount: pair.feedCount });
        console.log('  -> unresolved');
      }
    } catch (error) {
      unresolved.push({ country: pair.country, publisher: pair.publisher, feedCount: pair.feedCount });
      console.log(`  -> error: ${error instanceof Error ? error.message : String(error)}`);
    }
    await sleep(180);
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    scannedPairs: pairs.length,
    matched: results.length,
    unresolvedCount: unresolved.length,
    records: results,
    unresolved,
  };

  if (args.writeJson) {
    await fs.mkdir(path.dirname(args.outPath), { recursive: true });
    await fs.writeFile(args.outPath, JSON.stringify(payload, null, 2));
    console.log(`Wrote ${results.length} candidate HQ records to ${args.outPath}`);
    return;
  }

  console.log(JSON.stringify(payload, null, 2));
}

await main();
