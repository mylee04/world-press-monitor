import { isKnownNonArticleUrl } from '@/lib/article-url-filters';

const NAMED_HTML_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  laquo: '«',
  raquo: '»',
  middot: '·',
  bull: '•',
  copy: '©',
  reg: '®',
  trade: '™',
  euro: '€',
  pound: '£',
  yen: '¥',
};

const GENERIC_LOW_SIGNAL_TITLE_PATTERNS: ReadonlyArray<RegExp> = [
  /^c\d+\s+\d+(?:\.html)?$/iu,
  /^art[- ]\d+(?:\.html)?$/iu,
  /^\d{6,}$/u,
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
];

const SOURCE_SPECIFIC_SLUG_TITLE_SOURCES: ReadonlyArray<RegExp> = [
  /informer/i,
  /republika/i,
  /tanjug/i,
  /milenio/i,
  /aftonbladet/i,
  /die zeit/i,
  /svenska dagbladet|svd/i,
  /axios/i,
];

function decodeHtmlEntitiesOnce(value: string): string {
  return (value || '').replace(/&(#x?[0-9a-f]+|[a-z][a-z0-9]+);/gi, (match, entity) => {
    if (!entity) return match;
    if (entity.startsWith('#')) {
      const isHex = entity[1]?.toLowerCase() === 'x';
      const rawCodePoint = isHex ? entity.slice(2) : entity.slice(1);
      const codePoint = Number.parseInt(rawCodePoint, isHex ? 16 : 10);
      if (!Number.isFinite(codePoint) || codePoint <= 0 || codePoint > 0x10ffff) {
        return match;
      }
      try {
        return String.fromCodePoint(codePoint);
      } catch {
        return match;
      }
    }

    return NAMED_HTML_ENTITIES[entity.toLowerCase()] ?? match;
  });
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

function titleFromLink(link: string): string {
  if (!link) return '';
  try {
    const parsed = new URL(link);
    const segments = parsed.pathname.split('/').filter(Boolean);
    let candidate = segments[segments.length - 1] || '';
    candidate = safeDecodeURIComponent(candidate)
      .replace(/\.[a-z0-9]{2,6}$/i, '')
      .replace(/(?:^|[-_])nid\d+$/i, '')
      .replace(/[-_]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!candidate || /^\d+$/.test(candidate)) return '';
    return candidate.charAt(0).toUpperCase() + candidate.slice(1);
  } catch {
    return '';
  }
}

export function looksLikeLowSignalArticleTitle(title: string, source = '', link = ''): boolean {
  const normalizedTitle = normalizeHtmlText(title);
  const normalizedLink = decodeHtmlEntities(link || '');
  const fallbackTitle = titleFromLink(normalizedLink);
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
  if (
    fallbackTitle
    && SOURCE_SPECIFIC_SLUG_TITLE_SOURCES.some((pattern) => pattern.test(source))
    && normalizedTitle.toLowerCase() === fallbackTitle.toLowerCase()
    && /^[\p{Ll}\p{N}][\p{Ll}\p{N}\s'’.-]{8,}$/u.test(normalizedTitle)
  ) {
    return true;
  }
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
  const fallbackTitle = titleFromLink(link);
  if (!looksLikeLowSignalArticleTitle(normalizedTitle, source, link)) {
    return normalizedTitle;
  }
  if (fallbackTitle && !looksLikeLowSignalArticleTitle(fallbackTitle, source, link)) {
    return fallbackTitle;
  }
  return '';
}
