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
