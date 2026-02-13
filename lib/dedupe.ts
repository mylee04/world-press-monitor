import type { ParsedFeedItem } from './parsers';
import { normalizeLinkForId } from './pipeline';

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
  return normalizeLinkForId(input);
}

export function extractDomain(input: string): string {
  const canonical = canonicalizeUrl(input);
  if (!canonical) return '';
  try {
    const url = new URL(canonical);
    return url.hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
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
