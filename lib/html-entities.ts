import { decode as decodeNamedHtmlEntities } from 'html-entities';
import { isKnownNonArticleUrl } from '@/lib/article-url-filters';

const GENERIC_LOW_SIGNAL_TITLE_PATTERNS: ReadonlyArray<RegExp> = [
  /^c\d+\s+\d+(?:\.html)?$/iu,
  /^art[- ]\d+(?:\.html)?$/iu,
  /^audio\s+\d+(?:\.html)?$/iu,
  /^a\d{6,}(?:\.html)?$/iu,
  /^\d{6,}$/u,
  /^[a-f0-9]{32}$/iu,
  /^cision[0-9a-z]+$/iu,
  /^catalog(?:\.aspx)?(?:\?.+)?$/iu,
  /^[\p{L}\p{N}\s'’.-]{3,}\.html$/u,
  /^[\p{L}\p{N}_\s'’.-]{3,}\.(?:jpg|jpeg|png|gif|webp)$/iu,
  /^https?%3a%2f%2f/iu,
  /^(?:news|latest|domestic|international|photo|video)$/iu,
];

const SOURCE_SPECIFIC_LOW_SIGNAL_TITLE_PATTERNS: ReadonlyArray<{
  source: RegExp;
  title: RegExp;
}> = [
  { source: /oricon/i, title: /^(?:full|news|anime|comic|voiceactor)$/iu },
  { source: /abema times/i, title: /^(?:full|news|anime)$/iu },
  { source: /tanjug/i, title: /^vest$/iu },
  { source: /die zeit/i, title: /^index$/iu },
  { source: /parapolitika/i, title: /^[\p{Ll}\p{N}_-]{4,180}$/u },
];

const LOW_SIGNAL_URL_SEGMENTS = new Set([
  'aapreleases',
  'article',
  'articles',
  'bilder',
  'category',
  'categories',
  'de',
  'eng',
  'en',
  'es',
  'fr',
  'gazo',
  'it',
  'ja',
  'jp',
  'kiji',
  'latest',
  'live-coverage',
  'news',
  'nl',
  'news-story',
  'page',
  'photo',
  'photos',
  'pt',
  'ro',
  'rus',
  'story',
  'stories',
  'ua',
  'uk',
  'vest',
  'video',
]);

function decodeHtmlEntitiesOnce(value: string): string {
  return decodeNamedHtmlEntities(value || '');
}

export function decodeHtmlEntities(value: string): string {
  let current = value || '';
  for (let index = 0; index < 3; index += 1) {
    const decoded = decodeHtmlEntitiesOnce(current);
    if (decoded === current) break;
    current = decoded;
  }
  return current;
}

export function normalizeHtmlText(value: string): string {
  return decodeHtmlEntities(value)
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function lastPathSegment(link: string): string {
  if (!link) return '';
  try {
    const parsed = new URL(link);
    const segments = parsed.pathname.split('/').filter(Boolean);
    return safeDecodeURIComponent(segments[segments.length - 1] || '').toLowerCase();
  } catch {
    return '';
  }
}

function normalizeUrlSegmentCandidate(value: string): string {
  return safeDecodeURIComponent(value || '')
    .replace(/\.[a-z0-9]{2,6}$/i, '')
    .replace(/(?:^|[-_])(?:nid|id)\d+$/i, '')
    .trim();
}

function isLowSignalUrlSegment(value: string): boolean {
  const normalized = (value || '').trim().toLowerCase();
  if (!normalized) return true;
  if (LOW_SIGNAL_URL_SEGMENTS.has(normalized)) return true;
  return (
    /^(?:19|20)\d{2}$/.test(normalized)
    || /^(?:0?[1-9]|1[0-2])$/.test(normalized)
    || /^(?:0?[1-9]|[12]\d|3[01])$/.test(normalized)
    || /^\d+$/.test(normalized)
    || /^a\d{6,}$/.test(normalized)
    || /^art[- ]?\d+$/.test(normalized)
    || /^audio[- ]?\d+$/.test(normalized)
    || /^[a-f0-9]{32}$/.test(normalized)
    || /^cision[0-9a-z]+$/.test(normalized)
    || /^catalog(?:\.aspx)?$/.test(normalized)
  );
}

function titleFromLink(link: string, source = ''): string {
  if (!link) return '';
  try {
    const parsed = new URL(link);
    const segments = parsed.pathname.split('/').filter(Boolean);
    for (let index = segments.length - 1; index >= 0; index -= 1) {
      const rawCandidate = normalizeUrlSegmentCandidate(segments[index] || '');
      if (!rawCandidate || isLowSignalUrlSegment(rawCandidate)) continue;
      const candidate = rawCandidate
        .replace(/[-_]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (!candidate) continue;
      const titleCandidate = candidate.charAt(0).toUpperCase() + candidate.slice(1);
      if (looksLikeLowSignalArticleTitle(titleCandidate, source, link)) continue;
      return titleCandidate;
    }
    return '';
  } catch {
    return '';
  }
}

export function looksLikeLowSignalArticleTitle(title: string, source = '', link = ''): boolean {
  const normalizedTitle = normalizeHtmlText(title);
  const normalizedLink = decodeHtmlEntities(link || '');
  if (!normalizedTitle) return true;
  if (isKnownNonArticleUrl(source, normalizedLink)) return true;
  if (normalizedTitle === normalizedLink || /^https?:\/\//i.test(normalizedTitle)) return true;
  if (/idnes/i.test(source) && /^bg\d{8}$/i.test(normalizedTitle)) return true;
  if (/ajel/i.test(source) && /^[a-z0-9]{8,12}$/i.test(normalizedTitle)) {
    const linkSlug = lastPathSegment(normalizedLink);
    if (linkSlug && normalizedTitle.toLowerCase() === linkSlug) {
      return true;
    }
  }
  if (GENERIC_LOW_SIGNAL_TITLE_PATTERNS.some((pattern) => pattern.test(normalizedTitle))) return true;
  return SOURCE_SPECIFIC_LOW_SIGNAL_TITLE_PATTERNS.some(
    ({ source: sourcePattern, title: titlePattern }) =>
      sourcePattern.test(source) && titlePattern.test(normalizedTitle)
  );
}

export function normalizeArticleTitle(title: string, link = ''): string {
  const normalizedTitle = normalizeHtmlText(title);
  const normalizedLink = decodeHtmlEntities(link || '');
  if (!normalizedTitle) return titleFromLink(normalizedLink);
  if (normalizedTitle === normalizedLink || /^https?:\/\//i.test(normalizedTitle)) {
    return titleFromLink(normalizedLink) || normalizedTitle;
  }
  return normalizedTitle;
}

export function normalizeReadableArticleTitle(title: string, link = '', source = ''): string {
  const normalizedTitle = normalizeArticleTitle(title, link);
  if (!normalizedTitle) return '';
  const fallbackTitle = titleFromLink(link, source);
  if (!looksLikeLowSignalArticleTitle(normalizedTitle, source, link)) {
    return normalizedTitle;
  }
  if (fallbackTitle && !looksLikeLowSignalArticleTitle(fallbackTitle, source, link)) {
    return fallbackTitle;
  }
  return '';
}
