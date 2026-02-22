export interface ParsedFeedItem {
  title: string;
  description?: string;
  link: string;
  publishedAt: string;
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
  missingTitle: boolean;
  missingSummary: boolean;
  missingLink: boolean;
  missingPublishedAt: boolean;
}

function clean(text: string): string {
  return text.replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1').trim();
}

function parseTag(body: string, tag: string): string {
  const match = body.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return match ? clean(match[1] || '') : '';
}

function stripHtml(value: string): string {
  return (value || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseDescription(body: string): string {
  const candidates = [
    parseTag(body, 'description'),
    parseTag(body, 'summary'),
    parseTag(body, 'content:encoded'),
    parseTag(body, 'content')
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
  const ts = new Date(raw).getTime();
  if (!Number.isFinite(ts)) return '';
  return new Date(ts).toISOString();
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
    parseTag(body, 'published'),
    parseTag(body, 'dc:published'),
    parseTag(body, 'date'),
    parseTag(body, 'updated'),
    parseTag(body, 'dc:date'),
  ];
  for (const candidate of candidates) {
    const normalized = normalizePublishedAt(candidate);
    if (normalized) return normalized;
  }
  return inferPublishedAtFromLink(fallbackLink);
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
    }));
}

export function parseRssOrAtom(xml: string, limit = 10): ParsedFeedItem[] {
  return parseRssOrAtomWithStats(xml, limit).items;
}

export function parseRssOrAtomWithStats(xml: string, limit = 10): ParsedFeedBatch {
  const rows = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)]
    .map((match) => match[1])
    .slice(0, limit)
    .map((body) => {
      const title = parseTag(body, 'title');
      const link = parseTag(body, 'link');
      const description = parseDescription(body);
      const publishedAt = parsePublishedAt(body, link);
      return {
        title,
        description,
        link,
        publishedAt,
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

  const entryRows = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/gi)]
    .map((match) => match[1])
    .slice(0, limit)
    .map((body) => {
      const linkHref = body.match(/<link[^>]+href=["']([^"']+)["']/i)?.[1] || '';
      const title = parseTag(body, 'title');
      const description = parseDescription(body);
      const publishedAt = parsePublishedAt(body, linkHref);
      return {
        title,
        description,
        link: linkHref,
        publishedAt,
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

export function parseSitemapWithStats(xml: string, limit = 12): ParsedFeedBatch {
  const rows = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/gi)]
    .map((match) => match[1])
    .slice(0, limit)
    .map((body) => {
      const link = parseTag(body, 'loc');
      const title = link.split('/').pop()?.replace(/[-_]/g, ' ') || link;
      const publishedAt = normalizePublishedAt(parseTag(body, 'lastmod')) || inferPublishedAtFromLink(link);
      return {
        title,
        description: '',
        link,
        publishedAt,
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
