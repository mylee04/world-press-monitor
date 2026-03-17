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

export function normalizeArticleTitle(title: string, link = ''): string {
  const normalizedTitle = normalizeHtmlText(title);
  const normalizedLink = decodeHtmlEntities(link || '');
  if (!normalizedTitle) return titleFromLink(normalizedLink);
  if (normalizedTitle === normalizedLink || /^https?:\/\//i.test(normalizedTitle)) {
    return titleFromLink(normalizedLink) || normalizedTitle;
  }
  return normalizedTitle;
}
