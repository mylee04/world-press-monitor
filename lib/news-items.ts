import { classifyBeatByKeyword } from '@/lib/keyword-classifier';
import { inferGeoFromTitle } from '@/lib/geo';
import { normalizeLinkForId } from '@/lib/pipeline';
import type { NewsItem, OutletFeed } from '@/lib/types';

const DAY_MS = 24 * 60 * 60 * 1000;

const COUNTRY_CODE_TO_NAME: Record<string, string> = {
  US: 'United States',
  UK: 'United Kingdom',
  QA: 'Qatar',
  SA: 'Saudi Arabia',
  UA: 'Ukraine',
  RU: 'Russia',
  ZA: 'South Africa',
  HK: 'China',
  SG: 'Singapore',
  IN: 'India',
  FR: 'France',
  ES: 'Spain',
  IT: 'Italy',
  JP: 'Japan',
  KR: 'South Korea'
};

const LATAM_COUNTRIES = new Set(['LATAM', 'Argentina', 'Chile', 'Uruguay']);

const LATAM_ENTITY_TERMS = [
  'argentina',
  'argentine',
  'buenos aires',
  'chile',
  'chilean',
  'santiago',
  'uruguay',
  'uruguayan',
  'montevideo',
  'mercosur',
  'patagonia',
  'rio de la plata',
  'southern cone',
  'latam',
  'latin america',
  'latinoamerica',
  'america latina',
];

const BREAKING_TERMS = [
  'breaking',
  'urgent',
  'developing',
  'just in',
  'ultima hora',
  'última hora',
  'urgente',
  'en vivo',
  'ahora',
  'flash'
];

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function normalizeForDedupe(value: string): string {
  return normalizeText(value || '')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function dedupeTimeBucket(value: string): string {
  const ts = new Date(value).getTime();
  if (!Number.isFinite(ts)) return 'invalid_time';
  return String(Math.floor(ts / 60000));
}

function buildDedupeSignature(item: NewsItem): string | null {
  const source = (item.source || '').trim().toLowerCase();
  if (!source) return null;

  const titleNorm = normalizeForDedupe(item.title);
  const summaryNorm = normalizeForDedupe(item.description || '');
  const bucket = dedupeTimeBucket(item.publishedAt);

  if (titleNorm) {
    return `story|${source}|${bucket}|${titleNorm}|${summaryNorm}`;
  }

  const linkNorm = normalizeLinkForId(item.link || '');
  if (linkNorm) {
    return `url|${source}|${linkNorm}`;
  }

  return `link|${source}|${item.link || ''}`;
}

function isPreferredDuplicate(candidate: NewsItem, existing: NewsItem): boolean {
  const candidatePublicationMeta = candidate.publicationSource === 'article_meta';
  const existingPublicationMeta = existing.publicationSource === 'article_meta';
  if (candidatePublicationMeta !== existingPublicationMeta) return candidatePublicationMeta;

  const candidateSummaryMeta = candidate.summarySource === 'article_meta';
  const existingSummaryMeta = existing.summarySource === 'article_meta';
  if (candidateSummaryMeta !== existingSummaryMeta) return candidateSummaryMeta;

  const candidateSummaryLen = (candidate.description || '').trim().length;
  const existingSummaryLen = (existing.description || '').trim().length;
  if (candidateSummaryLen !== existingSummaryLen) return candidateSummaryLen > existingSummaryLen;

  const candidatePublished = new Date(candidate.publishedAt).getTime();
  const existingPublished = new Date(existing.publishedAt).getTime();
  if (candidatePublished !== existingPublished) return candidatePublished > existingPublished;

  return candidate.title.length > existing.title.length;
}

function isLikelyBreakingText(text: string): boolean {
  const normalized = normalizeText(text);
  return BREAKING_TERMS.some((term) => normalized.includes(term));
}

function detectLatamFromTitle(title: string, locationName?: string): boolean {
  const normalized = normalizeText(`${title} ${locationName || ''}`);
  return LATAM_ENTITY_TERMS.some((term) => normalized.includes(term));
}

function isLatamCountry(country?: string): boolean {
  if (!country) return false;
  return LATAM_COUNTRIES.has(country);
}

export function normalizeCountryName(country: string): string {
  return COUNTRY_CODE_TO_NAME[country] || country;
}

export function annotateWorldLatam(item: NewsItem): NewsItem {
  const latamByCountry = isLatamCountry(item.country);
  const latamByEntity = detectLatamFromTitle(item.title, item.locationName);
  const worldLatam = latamByCountry || latamByEntity;
  const breaking = isLikelyBreakingText(`${item.title} ${item.classificationReason || ''}`);
  const tags = [...new Set([...(item.tags || []), ...(worldLatam ? ['world_latam'] : []), ...(breaking ? ['breaking'] : [])])];
  return {
    ...item,
    worldLatam,
    tags
  };
}

export function mapParsedOutletItemToNewsItem(
  outlet: OutletFeed,
  item: { title: string; description?: string; link: string; publishedAt: string }
): NewsItem {
  const classification = classifyBeatByKeyword(item.title, outlet.beat);
  const normalizedCountry = normalizeCountryName(outlet.country);
  const geo = inferGeoFromTitle(item.title, normalizedCountry);
  return annotateWorldLatam({
    id: item.link,
    outletId: outlet.id,
    title: item.title,
    description: item.description || '',
    link: item.link,
    source: outlet.name,
    language: outlet.language || 'en',
    sourceType: outlet.sourceType || 'global',
    tier: outlet.tier,
    publishedAt: item.publishedAt,
    beat: classification.beat,
    confidence: classification.confidence,
    classificationSource: classification.source,
    classificationReason: classification.reason,
    publicationSource: 'feed' as const,
    summarySource: item.description ? 'feed' as const : undefined,
    ...geo
  } satisfies NewsItem);
}

export function countRecent24h(items: Array<{ publishedAt: string }>): number {
  const cutoff = Date.now() - DAY_MS;
  return items.filter((item) => {
    const ts = new Date(item.publishedAt).getTime();
    return Number.isFinite(ts) && ts >= cutoff;
  }).length;
}

export function inferCountryFromText(text: string): string {
  const normalized = normalizeText(text);
  if (normalized.includes('argentina') || normalized.includes('buenos aires')) return 'Argentina';
  if (normalized.includes('chile') || normalized.includes('santiago')) return 'Chile';
  if (normalized.includes('uruguay') || normalized.includes('montevideo')) return 'Uruguay';
  if (normalized.includes('mexico')) return 'Mexico';
  if (normalized.includes('united states') || normalized.includes(' usa ') || normalized.includes(' us ')) return 'United States';
  if (normalized.includes('latam') || normalized.includes('latin america') || normalized.includes('latinoamerica')) return 'LATAM';
  return 'Global';
}

function inferCountryFromLink(link: string): string | null {
  const host = (() => {
    try {
      return new URL(link).hostname.toLowerCase();
    } catch {
      return '';
    }
  })();
  if (!host) return null;
  if (host.endsWith('.ar')) return 'Argentina';
  if (host.endsWith('.cl')) return 'Chile';
  if (host.endsWith('.uy')) return 'Uruguay';
  if (host.endsWith('.mx')) return 'Mexico';
  if (host.endsWith('.us')) return 'United States';
  return null;
}

function normalizeLanguageCode(value?: string): string | undefined {
  const v = (value || '').trim().toLowerCase();
  if (!v) return undefined;
  if (v === 'es' || v.startsWith('es-')) return 'es';
  if (v === 'en' || v.startsWith('en-')) return 'en';
  if (v === 'pt' || v.startsWith('pt-')) return 'pt';
  if (v === 'fr' || v.startsWith('fr-')) return 'fr';
  return v.slice(0, 2);
}

function inferLanguageFromText(text: string, country?: string): string {
  const normalized = normalizeText(text);
  const hasSpanishHints = /[áéíóúñü¿¡]/i.test(text)
    || normalized.includes(' el ')
    || normalized.includes(' la ')
    || normalized.includes(' de ')
    || normalized.includes(' en vivo')
    || normalized.includes('ultima hora')
    || normalized.includes('última hora');
  if (hasSpanishHints) return 'es';
  const c = (country || '').toLowerCase();
  if (c === 'argentina' || c === 'chile' || c === 'uruguay' || c === 'mexico' || c === 'latam') return 'es';
  if (c === 'united states') return 'en';
  return 'en';
}

export function applyLocaleDetection(item: NewsItem): NewsItem {
  const countryFromLink = inferCountryFromLink(item.link);
  const countryFromText = inferCountryFromText(`${item.title} ${item.description || ''} ${item.link}`);
  const country =
    item.country && item.country !== 'Global'
      ? item.country
      : countryFromLink || (countryFromText !== 'Global' ? countryFromText : item.country || 'Global');

  const language = normalizeLanguageCode(item.language)
    || inferLanguageFromText(`${item.title} ${item.description || ''}`, country);

  return {
    ...item,
    country,
    language
  };
}

export function dedupeAndSort(items: NewsItem[]): NewsItem[] {
  const map = new Map<string, NewsItem>();

  for (const item of items) {
    const signature = buildDedupeSignature(item);
    if (!signature) continue;

    const existing = map.get(signature);
    if (!existing || isPreferredDuplicate(item, existing)) {
      map.set(signature, item);
    }
  }
  return [...map.values()].sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
}

function normalizeTitle(value: string): string {
  return value
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenSet(value: string): Set<string> {
  const tokens = normalizeTitle(value).split(' ').filter((token) => token.length >= 3);
  return new Set(tokens);
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection += 1;
  }
  const union = a.size + b.size - intersection;
  if (union === 0) return 0;
  return intersection / union;
}

function minutesBetween(a: string, b: string): number {
  const aMs = new Date(a).getTime();
  const bMs = new Date(b).getTime();
  if (!Number.isFinite(aMs) || !Number.isFinite(bMs)) return Number.MAX_SAFE_INTEGER;
  return Math.abs(aMs - bMs) / 60000;
}

export function buildStoryClusters(items: NewsItem[]): NewsItem[] {
  const sorted = [...items].sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
  const clusterRep: Array<{ id: string; item: NewsItem; tokens: Set<string> }> = [];
  let clusterSeq = 1;

  const withClusters = sorted.map((item) => {
    const tokens = tokenSet(item.title);
    const matched = clusterRep.find((rep) => {
      const sameCountry = (item.country || 'Unknown') === (rep.item.country || 'Unknown');
      if (!sameCountry) return false;
      if (item.beat !== rep.item.beat) return false;

      const mins = minutesBetween(item.publishedAt, rep.item.publishedAt);
      if (mins > 360) return false;

      const similarity = jaccard(tokens, rep.tokens);
      if (similarity >= 0.58) return true;

      const differentLanguage = (item.language || 'en') !== (rep.item.language || 'en');
      const sameLocation = Boolean(item.locationName) && item.locationName === rep.item.locationName;
      if (differentLanguage && sameLocation && mins <= 120) return true;

      return false;
    });

    if (matched) {
      return { ...item, clusterId: matched.id };
    }

    const clusterId = `cluster-${clusterSeq++}`;
    clusterRep.push({ id: clusterId, item, tokens });
    return { ...item, clusterId };
  });

  const clusterCounts = new Map<string, number>();
  for (const item of withClusters) {
    if (!item.clusterId) continue;
    clusterCounts.set(item.clusterId, (clusterCounts.get(item.clusterId) ?? 0) + 1);
  }

  return withClusters.map((item) => ({
    ...item,
    clusterSize: item.clusterId ? clusterCounts.get(item.clusterId) ?? 1 : 1
  }));
}

export function filterReasonablePublishedAt(items: NewsItem[]): NewsItem[] {
  const now = Date.now();
  const maxFutureSkewMs = 2 * 60 * 60 * 1000;
  const maxAgeMs = 90 * DAY_MS;
  return items.filter((item) => {
    const ts = new Date(item.publishedAt).getTime();
    if (!Number.isFinite(ts)) return false;
    if (ts > now + maxFutureSkewMs) return false;
    if (ts < now - maxAgeMs) return false;
    return true;
  });
}
