function normalizeOutletIdText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function makeOutletId(countryName: string, sourceName: string, feedUrl: string): string {
  const safe = normalizeOutletIdText(`${countryName} ${sourceName}`)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-')
    .slice(0, 120);

  let hash = 2166136261;
  for (let index = 0; index < feedUrl.length; index += 1) {
    hash ^= feedUrl.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return `${safe || 'source'}-${(hash >>> 0).toString(36)}`;
}
