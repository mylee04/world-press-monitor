import { normalizeHtmlText } from './html-entities';

export interface ParsedFeedItem {
  title: string;
  description?: string;
  link: string;
  publishedAt: string;
  categories?: string[];
  stableId?: string;
}

export interface ParsedFeedStats {
  totalCandidates: number;
  validCount: number;
  missingTitleCount: number;
  missingSummaryCount: number;
  missingPublishedAtCount: number;
  missingLinkCount: number;
}

export interface ParsedFeedBatch {
  items: ParsedFeedItem[];
  stats: ParsedFeedStats;
}

interface ParsedFeedItemWithMissing {
  title: string;
  description: string;
  link: string;
  publishedAt: string;
  categories: string[];
  stableId: string;
  missingTitle: boolean;
  missingSummary: boolean;
  missingLink: boolean;
  missingPublishedAt: boolean;
}

function clean(text: string): string {
  return text.replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1').trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const DATE_TIMEZONE_OFFSETS: Record<string, string> = {
  BST: '+0100',
  CET: '+0100',
  CEST: '+0200',
  EET: '+0200',
  EEST: '+0300',
  MSD: '+0400',
  MSK: '+0300',
  WEST: '+0100',
  WET: '+0000',
};

function parseTag(body: string, tag: string): string {
  const match = body.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return match ? normalizeHtmlText(clean(match[1] || '')) : '';
}

function parseTagByLocalName(body: string, localName: string): string {
  const tag = escapeRegExp(localName);
  const match = body.match(new RegExp(`<(?:[\\w.-]+:)?${tag}[^>]*>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?${tag}>`, 'i'));
  return match ? normalizeHtmlText(clean(match[1] || '')) : '';
}

function parseTags(body: string, tag: string): string[] {
  return [...body.matchAll(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi'))]
    .map((match) => normalizeHtmlText(clean(match[1] || '')))
    .filter(Boolean);
}

function parseTagsByLocalName(body: string, localName: string): string[] {
  const tag = escapeRegExp(localName);
  return [...body.matchAll(new RegExp(`<(?:[\\w.-]+:)?${tag}[^>]*>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?${tag}>`, 'gi'))]
    .map((match) => normalizeHtmlText(clean(match[1] || '')))
    .filter(Boolean);
}

function parseAtomCategoryTerms(body: string): string[] {
  return [...body.matchAll(/<category[^>]*\bterm=["']([^"']+)["'][^>]*>/gi)]
    .map((match) => normalizeHtmlText(clean(match[1] || '')))
    .filter(Boolean);
}

function parseCategories(body: string, atomMode = false): string[] {
  const raw = atomMode
    ? [...parseAtomCategoryTerms(body), ...parseTagsByLocalName(body, 'category')]
    : [...parseTagsByLocalName(body, 'category'), ...parseTagsByLocalName(body, 'subject')];
  const normalized = raw
    .map((value) => stripHtml(value).slice(0, 140))
    .map((value) => value.trim())
    .filter(Boolean);
  return [...new Set(normalized)].slice(0, 10);
}

function stripHtml(value: string): string {
  return normalizeHtmlText((value || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
  );
}

function parseDescription(body: string): string {
  const candidates = [
    parseTagByLocalName(body, 'description'),
    parseTagByLocalName(body, 'summary'),
    parseTag(body, 'content:encoded'),
    parseTagByLocalName(body, 'encoded'),
    parseTagByLocalName(body, 'content')
  ];
  for (const candidate of candidates) {
    const stripped = stripHtml(candidate);
    if (stripped) return stripped.slice(0, 1600);
  }
  return '';
}

function normalizePublishedAt(value: string): string {
  const raw = (value || '').trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return new Date(`${raw}T12:00:00Z`).toISOString();
  }
  const directTs = new Date(raw).getTime();
  if (Number.isFinite(directTs)) return new Date(directTs).toISOString();

  const timezoneMatch = raw.match(/^(.*\s)([A-Z]{2,5})$/);
  if (timezoneMatch) {
    const normalizedTz = DATE_TIMEZONE_OFFSETS[timezoneMatch[2]];
    if (normalizedTz) {
      const tzTs = new Date(`${timezoneMatch[1]}${normalizedTz}`).getTime();
      if (Number.isFinite(tzTs)) return new Date(tzTs).toISOString();
    }
  }

  return '';
}

function inferPublishedAtFromLink(link: string): string {
  const url = (link || '').toLowerCase();
  if (!url) return '';
  const slashPattern = url.match(/(20\d{2})\/(0[1-9]|1[0-2])\/([0-2]\d|3[01])/);
  if (slashPattern) {
    return normalizePublishedAt(`${slashPattern[1]}-${slashPattern[2]}-${slashPattern[3]}T00:00:00Z`);
  }
  const dashPattern = url.match(/(20\d{2})-(0[1-9]|1[0-2])-([0-2]\d|3[01])/);
  if (dashPattern) {
    return normalizePublishedAt(`${dashPattern[1]}-${dashPattern[2]}-${dashPattern[3]}T00:00:00Z`);
  }
  return '';
}

function parsePublishedAt(body: string, fallbackLink = ''): string {
  const candidates = [
    parseTag(body, 'pubDate'),
    parseTagByLocalName(body, 'published'),
    parseTag(body, 'dc:published'),
    parseTagByLocalName(body, 'date'),
    parseTagByLocalName(body, 'updated'),
    parseTag(body, 'dc:date'),
  ];
  for (const candidate of candidates) {
    const normalized = normalizePublishedAt(candidate);
    if (normalized) return normalized;
  }
  return inferPublishedAtFromLink(fallbackLink);
}

function parseStableId(body: string, atomMode = false): string {
  if (atomMode) {
    return parseTagByLocalName(body, 'id') || parseTagByLocalName(body, 'guid');
  }
  return parseTagByLocalName(body, 'guid') || parseTagByLocalName(body, 'id');
}

function summarizeStats(rows: ParsedFeedItemWithMissing[]): ParsedFeedStats {
  return {
    totalCandidates: rows.length,
    validCount: rows.filter((row) => !row.missingTitle && !row.missingLink).length,
    missingTitleCount: rows.filter((row) => row.missingTitle).length,
    missingSummaryCount: rows.filter((row) => row.missingSummary).length,
    missingPublishedAtCount: rows.filter((row) => row.missingPublishedAt).length,
    missingLinkCount: rows.filter((row) => row.missingLink).length
  };
}

function toItems(rows: ParsedFeedItemWithMissing[]): ParsedFeedItem[] {
  return rows
    .filter((row) => !row.missingTitle && !row.missingLink)
    .map((row) => ({
      title: row.title,
      description: row.description,
      link: row.link,
      publishedAt: row.publishedAt,
      categories: row.categories,
      stableId: row.stableId || undefined,
    }));
}

export function parseRssOrAtom(xml: string, limit = 10): ParsedFeedItem[] {
  return parseRssOrAtomWithStats(xml, limit).items;
}

export function parseRssOrAtomWithStats(xml: string, limit = 10): ParsedFeedBatch {
  const rows = [...xml.matchAll(/<(?:[\w.-]+:)?item\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?item>/gi)]
    .map((match) => match[1])
    .slice(0, limit)
    .map((body) => {
      const title = parseTag(body, 'title');
      const link = parseTag(body, 'link');
      const description = parseDescription(body);
      const publishedAt = parsePublishedAt(body, link);
      const categories = parseCategories(body);
      const stableId = parseStableId(body);
      return {
        title,
        description,
        link,
        publishedAt,
        categories,
        stableId,
        missingTitle: !title,
        missingLink: !link,
        missingSummary: !description,
        missingPublishedAt: !publishedAt,
      };
    });

  if (rows.length > 0) {
    return {
      items: toItems(rows),
      stats: summarizeStats(rows),
    };
  }

  const entryRows = [...xml.matchAll(/<(?:[\w.-]+:)?entry\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?entry>/gi)]
    .map((match) => match[1])
    .slice(0, limit)
    .map((body) => {
      const linkHref = body.match(/<link[^>]+href=["']([^"']+)["']/i)?.[1] || '';
      const title = parseTag(body, 'title');
      const description = parseDescription(body);
      const publishedAt = parsePublishedAt(body, linkHref);
      const categories = parseCategories(body, true);
      const stableId = parseStableId(body, true);
      return {
        title,
        description,
        link: linkHref,
        publishedAt,
        categories,
        stableId,
        missingTitle: !title,
        missingLink: !linkHref,
        missingSummary: !description,
        missingPublishedAt: !publishedAt,
      };
    });

  return {
    items: toItems(entryRows),
    stats: summarizeStats(entryRows)
  };
}

export function parseSitemap(xml: string, limit = 12): ParsedFeedItem[] {
  return parseSitemapWithStats(xml, limit).items;
}

function resolveFeedLink(link: string, baseUrl?: string): string {
  if (!link) return '';
  if (!baseUrl) return link;
  try {
    return new URL(link, baseUrl).toString();
  } catch {
    return link;
  }
}

export function parseSitemapWithStats(xml: string, limit = 12, baseUrl?: string): ParsedFeedBatch {
  const rows = [...xml.matchAll(/<(?:[\w.-]+:)?url\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?url>/gi)]
    .map((match) => match[1])
    .slice(0, limit)
    .map((body) => {
      const link = resolveFeedLink(parseTagByLocalName(body, 'loc'), baseUrl);
      const title =
        parseTagByLocalName(body, 'title')
        || link.split('/').pop()?.replace(/[-_]/g, ' ')
        || link;
      const publishedAt =
        normalizePublishedAt(parseTagByLocalName(body, 'publication_date'))
        || normalizePublishedAt(parseTagByLocalName(body, 'lastmod'))
        || normalizePublishedAt(parseTagByLocalName(body, 'priority'))
        || inferPublishedAtFromLink(link);
      return {
        title,
        description: '',
        link,
        publishedAt,
        categories: [],
        stableId: '',
        missingTitle: !title,
        missingLink: !link,
        missingSummary: true,
        missingPublishedAt: !publishedAt,
      };
    });

  return {
    items: toItems(rows),
    stats: summarizeStats(rows),
  };
}
