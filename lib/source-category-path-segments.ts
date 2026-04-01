import { mapFeedCategoryToSection } from '@/lib/article-section-context';
import { normalizeSourceCategories } from '@/lib/article-taxonomy';
import { classifySectionByKeyword } from '@/lib/keyword-classifier';

const GLOBAL_STOP_SEGMENTS = new Set([
  '',
  'news',
  'article',
  'artikel',
  'articles',
  'story',
  'stories',
  'latest',
  'breakingnews',
  'video',
  'videos',
  'multimedia',
  'amp',
  'amphtml',
  'view',
  'index',
  'sitemap',
  'rss',
  'content',
  'tag',
  'tags',
  'topic',
  'topics',
  'author',
  'authors',
  'podcast',
  'podcasts',
  'p',
  'id',
]);

const SOURCE_STOP_SEGMENTS = new Map<string, Set<string>>([
  ['24Horas - Sitemap 202603', new Set(['programas'])],
  ['Blic', new Set(['vesti'])],
  ['El Watan - News Sitemap', new Set(['details'])],
  ['JV - Sitemap', new Set(['annoncoerbetaltindhold'])],
  ["L'Avenir - News Sitemap", new Set(['regions'])],
  ['SE.pl - News Sitemap', new Set(['wiadomosci'])],
  ['Stiften - Sitemap', new Set(['annoncoerbetaltindhold'])],
  ['The Standard - News Sitemap', new Set(['article'])],
]);

const SOURCE_SEGMENT_CATEGORY_OVERRIDES = new Map<string, Map<string, string[]>>([
  [
    'JV - Sitemap',
    new Map<string, string[]>([
      ['aabenraa', ['local']],
      ['billund', ['local']],
      ['debat', ['politics']],
      ['efb', ['sports']],
      ['erhverv', ['business']],
      ['esbjerg', ['local']],
      ['haderslev', ['local']],
      ['kiffodbold', ['sports']],
      ['kolding', ['local']],
      ['navne', ['local']],
      ['ribe esbjerg hh', ['sports']],
      ['soenderborg', ['local']],
      ['soenderjyskefodbold', ['sports']],
      ['sport', ['sports']],
      ['sydjylland', ['local']],
      ['team esbjerg', ['sports']],
      ['toender', ['local']],
      ['varde', ['local']],
      ['vejen', ['local']],
    ]),
  ],
  [
    'Stiften - Sitemap',
    new Map<string, string[]>([
      ['aarhus', ['local']],
      ['agf', ['sports']],
      ['alarm112', ['world']],
      ['bolig', ['lifestyle']],
      ['bolighandler', ['business']],
      ['byliv', ['local']],
      ['debat', ['politics']],
      ['erhverv', ['business']],
      ['folketingsvalg', ['politics']],
      ['fv', ['politics']],
      ['kultur', ['arts']],
      ['mad', ['lifestyle']],
      ['politik', ['politics']],
      ['samfund', ['world']],
      ['shopping', ['lifestyle']],
      ['sport', ['sports']],
      ['sundhed', ['health']],
      ['trafik', ['world']],
    ]),
  ],
]);

function parseArticleUrl(rawUrl: string): URL | null {
  const value = (rawUrl || '').trim();
  if (!value) return null;
  try {
    return new URL(value);
  } catch {
    try {
      return new URL(decodeURIComponent(value));
    } catch {
      return null;
    }
  }
}

export function normalizePathSegment(value: string): string {
  return decodeURIComponent(value || '')
    .trim()
    .toLowerCase()
    .replace(/^[-_]+|[-_]+$/g, '')
    .replace(/[-_]+/g, ' ');
}

export function isMeaningfulSourcePathSegment(source: string, segment: string): boolean {
  if (!segment) return false;
  if (GLOBAL_STOP_SEGMENTS.has(segment)) return false;
  if (/^\d+$/.test(segment)) return false;
  if (/^\d{4,}$/.test(segment)) return false;
  if (/^\d{1,2}\s+\d{1,2}$/.test(segment)) return false;
  if (/^\d{4}(?:\s+\d{1,2}){1,2}$/.test(segment)) return false;
  if (segment.length < 2) return false;
  if (/^(?=.*[a-z])(?=.*\d)[a-z0-9]{5,}$/i.test(segment)) return false;
  if (/^[a-f0-9]{12,}$/i.test(segment)) return false;
  const sourceStops = SOURCE_STOP_SEGMENTS.get((source || '').trim());
  if (sourceStops?.has(segment)) return false;
  return true;
}

export function extractSourcePathSegments(source: string, url: string, maxDepth = 3): string[] {
  const parsed = parseArticleUrl(url);
  if (!parsed) return [];
  return parsed.pathname
    .split('/')
    .map(normalizePathSegment)
    .map((segment) => segment.replace(/^\d+\s+/g, ''))
    .filter((segment) => isMeaningfulSourcePathSegment(source, segment))
    .slice(0, maxDepth);
}

export function hasExplicitSourcePathCategoryOverride(source: string, segment: string): boolean {
  return SOURCE_SEGMENT_CATEGORY_OVERRIDES.get((source || '').trim())?.has(segment) || false;
}

export function resolveSourcePathSegmentCategories(source: string, segment: string): string[] {
  const sourceOverrides = SOURCE_SEGMENT_CATEGORY_OVERRIDES.get((source || '').trim());
  const override = sourceOverrides?.get(segment);
  if (override?.length) {
    return normalizeSourceCategories(override);
  }

  if (mapFeedCategoryToSection(segment)) {
    return [segment];
  }

  if (classifySectionByKeyword(segment, 'others').section !== 'others') {
    return [segment];
  }

  return [];
}

export function inferSourceCategoriesFromUrlPath(input: {
  source: string;
  url: string;
  maxDepth?: number;
}): string[] {
  const picked: string[] = [];
  for (const segment of extractSourcePathSegments(input.source, input.url, input.maxDepth ?? 3)) {
    for (const category of resolveSourcePathSegmentCategories(input.source, segment)) {
      picked.push(category);
    }
  }
  return normalizeSourceCategories(picked);
}
