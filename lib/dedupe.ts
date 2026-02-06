import type { ParsedFeedItem } from './parsers';

const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'for', 'to', 'of', 'in', 'on', 'at', 'by', 'from', 'with',
  'de', 'la', 'el', 'los', 'las', 'y', 'en', 'por', 'para', 'con', 'del', 'un', 'una',
]);

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/&[#a-z0-9]+;/gi, ' ')
    .replace(/[^a-z0-9\u00c0-\u024f\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenizeTitle(title: string): string[] {
  return normalizeTitle(title)
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !STOPWORDS.has(token));
}

function canonicalizeUrl(input: string): string {
  if (!input) return '';
  try {
    const parsed = new URL(input);
    parsed.hash = '';
    const drop = [
      'utm_source',
      'utm_medium',
      'utm_campaign',
      'utm_term',
      'utm_content',
      'utm_id',
      'gclid',
      'fbclid',
      'ref',
      'output',
    ];
    for (const key of drop) parsed.searchParams.delete(key);
    const keep = new URLSearchParams();
    for (const [k, v] of parsed.searchParams.entries()) {
      if (!k.toLowerCase().startsWith('utm_')) keep.append(k, v);
    }
    parsed.search = keep.toString() ? `?${keep.toString()}` : '';
    let normalized = parsed.toString();
    normalized = normalized.replace(/\/+$/, '');
    return normalized.toLowerCase();
  } catch {
    return input.trim().toLowerCase().replace(/\/+$/, '');
  }
}

export function makeHardKey(item: ParsedFeedItem): string {
  const canonicalUrl = canonicalizeUrl(item.link);
  if (canonicalUrl) return canonicalUrl;
  return normalizeTitle(item.title);
}

export function makeSoftKey(title: string): string {
  const tokens = tokenizeTitle(title);
  if (tokens.length === 0) return '';
  const sliced = tokens.slice(0, 10);
  return [...new Set(sliced)].sort().join(' ');
}

export function dedupeItems(items: ParsedFeedItem[]): ParsedFeedItem[] {
  const seenHard = new Set<string>();
  const seenSoft = new Set<string>();
  const unique: ParsedFeedItem[] = [];

  for (const item of items) {
    const hard = makeHardKey(item);
    const soft = makeSoftKey(item.title);
    if (hard && seenHard.has(hard)) continue;
    if (!hard && soft && seenSoft.has(soft)) continue;
    if (hard) seenHard.add(hard);
    if (soft) seenSoft.add(soft);
    unique.push(item);
  }

  return unique;
}
