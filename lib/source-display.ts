function normalizeWhitespace(value: string): string {
  return (value || '').replace(/\s+/g, ' ').trim();
}

export function buildDisplaySourceName(source: string): string {
  const normalized = normalizeWhitespace(source);
  if (!normalized) return '';

  const segments = normalized.split(/\s+-\s+/);
  if (segments.length <= 1) return normalized;

  for (let index = 1; index < segments.length; index += 1) {
    const suffix = segments.slice(index).join(' - ');
    if (!/\bsitemap\b/i.test(suffix)) continue;
    const cleaned = normalizeWhitespace(segments.slice(0, index).join(' - '));
    return cleaned || normalized;
  }

  return normalized;
}
