import { normalizeHtmlText } from './html-entities';
import { normalizeLooseDateToIso } from './date-parsing';

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

function inferTitleFromLink(link: string): string {
  const raw = (link || '').trim();
  if (!raw) return '';
  const normalizeSegment = (value: string) => {
    const normalized = normalizeHtmlText(value.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ')).trim();
    if (!normalized) return '';
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
  };
  try {
    const parsed = new URL(raw);
    const segment = parsed.pathname.split('/').filter(Boolean).pop() || '';
    if (!segment) return raw;
    return normalizeSegment(decodeURIComponent(segment)) || raw;
  } catch {
    const segment = raw.split('/').filter(Boolean).pop() || raw;
    return normalizeSegment(segment) || raw;
  }
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
  return normalizeLooseDateToIso(raw);
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
  const underscorePattern = url.match(/(20\d{2})_(0[1-9]|1[0-2])_([0-2]\d|3[01])/);
  if (underscorePattern) {
    return normalizePublishedAt(`${underscorePattern[1]}-${underscorePattern[2]}-${underscorePattern[3]}T00:00:00Z`);
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

function parseJsonLdBlocks(html: string): unknown[] {
  const blocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  const values: unknown[] = [];
  for (const match of blocks) {
    const raw = clean(match[1] || '').trim();
    if (!raw) continue;
    const candidates = [
      raw,
      raw
        .replace(/&quot;/g, '"')
        .replace(/&#34;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&#39;/g, '\'')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
    ];
    for (const candidate of candidates) {
      try {
        values.push(JSON.parse(candidate));
        break;
      } catch {
        // Continue trying the next normalized variant.
      }
    }
  }
  return values;
}

function normalizeJsonLdType(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap((entry) => normalizeJsonLdType(entry));
  if (typeof value !== 'string') return [];
  return [value.trim().toLowerCase()];
}

function looksLikeJsonLdCollection(node: Record<string, unknown>): boolean {
  const types = normalizeJsonLdType(node['@type']);
  return types.includes('collectionpage') || types.includes('itemlist');
}

function extractJsonLdListEntries(node: unknown, bucket: Array<Record<string, unknown>>): void {
  if (Array.isArray(node)) {
    for (const entry of node) {
      extractJsonLdListEntries(entry, bucket);
    }
    return;
  }
  if (!node || typeof node !== 'object') return;

  const record = node as Record<string, unknown>;
  const listEntries = Array.isArray(record.itemListElement)
    ? record.itemListElement.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object')
    : [];
  if (looksLikeJsonLdCollection(record) && listEntries.length > 0) {
    bucket.push(...listEntries);
  }

  for (const key of ['mainEntity', 'item', 'hasPart']) {
    if (key in record) {
      extractJsonLdListEntries(record[key], bucket);
    }
  }
}

function extractHtmlCollectionField(entry: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const direct = entry[key];
    if (typeof direct === 'string' && direct.trim()) return normalizeHtmlText(direct.trim());
  }

  const nested = entry.item;
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    return extractHtmlCollectionField(nested as Record<string, unknown>, keys);
  }

  return '';
}

function decodeJsQuotedString(value: string): string {
  const trimmed = (value || '').trim();
  if (!trimmed) return '';
  try {
    return normalizeHtmlText(JSON.parse(`"${trimmed}"`));
  } catch {
    return normalizeHtmlText(trimmed.replace(/\\"/g, '"').replace(/\\\\/g, '\\'));
  }
}

function parseMhmHtmlCollectionWithStats(html: string, limit = 12, baseUrl?: string): ParsedFeedBatch {
  const rows = [...html.matchAll(/\{uuid:"([0-9a-fA-F-]{36})",articleType:"[^"]*",headline:\{plain:"((?:\\.|[^"\\])*)",styled:"(?:\\.|[^"\\])*"\}[\s\S]*?publishedAt:"([^"]+)"/g)]
    .map((match) => {
      const uuid = (match[1] || '').trim();
      const title = decodeJsQuotedString(match[2] || '') || inferTitleFromLink(uuid ? `/artikel/${uuid}` : '');
      const link = resolveFeedLink(uuid ? `/artikel/${uuid}` : '', baseUrl);
      const publishedAt = normalizePublishedAt(match[3] || '') || inferPublishedAtFromLink(link);
      return {
        title,
        description: '',
        link,
        publishedAt,
        categories: [],
        stableId: uuid || link,
        missingTitle: !title,
        missingLink: !link,
        missingSummary: true,
        missingPublishedAt: !publishedAt,
        sortPublishedAtMs: publishedAt ? Date.parse(publishedAt) : Number.NaN,
      };
    })
    .filter((row, index, all) => row.link && all.findIndex((candidate) => candidate.link === row.link) === index)
    .sort((left, right) => {
      const leftMs = Number.isFinite(left.sortPublishedAtMs) ? left.sortPublishedAtMs : Number.NEGATIVE_INFINITY;
      const rightMs = Number.isFinite(right.sortPublishedAtMs) ? right.sortPublishedAtMs : Number.NEGATIVE_INFINITY;
      return rightMs - leftMs;
    })
    .slice(0, limit);

  return {
    items: toItems(rows.map(({ sortPublishedAtMs: _sortPublishedAtMs, ...row }) => row)),
    stats: summarizeStats(rows.map(({ sortPublishedAtMs: _sortPublishedAtMs, ...row }) => row)),
  };
}

function parseNuxtDataPayload(html: string): unknown[] {
  const match = html.match(/<script[^>]+type=["']application\/json["'][^>]*data-nuxt-data[^>]*id=["']__NUXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!match) return [];
  try {
    const parsed = JSON.parse(clean(match[1] || '').trim());
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseJsonScriptBlock(html: string, id: string): unknown {
  const escapedId = escapeRegExp(id);
  const match = html.match(new RegExp(`<script[^>]+id=["']${escapedId}["'][^>]+type=["']application/json["'][^>]*>([\\s\\S]*?)<\\/script>`, 'i'));
  if (!match) return null;
  try {
    return JSON.parse(clean(match[1] || '').trim());
  } catch {
    return null;
  }
}

function parseYicaiHtmlCollectionWithStats(html: string, limit = 12, baseUrl?: string): ParsedFeedBatch {
  let parsedUrl: URL | null = null;
  try {
    parsedUrl = baseUrl ? new URL(baseUrl) : null;
  } catch {
    parsedUrl = null;
  }
  if (!parsedUrl || parsedUrl.hostname !== 'www.yicai.com' || !parsedUrl.pathname.startsWith('/news')) {
    return { items: [], stats: summarizeStats([]) };
  }

  const match = html.match(/firstlist\s*=\s*(\[[\s\S]*?\])\s*[,;]\s*(?:newsId|var|window|<\/script>)/i);
  if (!match) return { items: [], stats: summarizeStats([]) };

  let payload: unknown = null;
  try {
    payload = JSON.parse(match[1] || '[]');
  } catch {
    return { items: [], stats: summarizeStats([]) };
  }
  if (!Array.isArray(payload)) {
    return { items: [], stats: summarizeStats([]) };
  }

  const rows = payload
    .flatMap((entry): ParsedFeedItemWithMissing[] => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
      const record = entry as Record<string, unknown>;
      const link = resolveFeedLink(extractHtmlCollectionField(record, ['url', 'NewsUrl', 'ShareUrl']), baseUrl);
      if (!/\/news\/\d+\.html(?:$|[?#])/.test(link)) return [];
      const title = extractHtmlCollectionField(record, ['NewsTitle', 'title']) || inferTitleFromLink(link) || link;
      const description = stripHtml(extractHtmlCollectionField(record, ['Summary', 'SummaryPlain', 'NewsSummary', 'brief'])).slice(0, 1600);
      const publishedAt =
        normalizePublishedAt(extractHtmlCollectionField(record, ['CreateDate', 'pubDate', 'LastDate', 'EntityPublishDate']))
        || inferPublishedAtFromLink(link);
      const category = extractHtmlCollectionField(record, ['ChannelName']);
      return [{
        title,
        description,
        link,
        publishedAt,
        categories: category ? [category] : [],
        stableId: extractHtmlCollectionField(record, ['NewsID']) || link,
        missingTitle: !title,
        missingLink: !link,
        missingSummary: !description,
        missingPublishedAt: !publishedAt,
      }];
    })
    .filter((row, index, all) => row.link && all.findIndex((candidate) => candidate.link === row.link) === index)
    .sort((left, right) => {
      const leftMs = left.publishedAt ? Date.parse(left.publishedAt) : Number.NEGATIVE_INFINITY;
      const rightMs = right.publishedAt ? Date.parse(right.publishedAt) : Number.NEGATIVE_INFINITY;
      return rightMs - leftMs;
    })
    .slice(0, limit);

  return {
    items: toItems(rows),
    stats: summarizeStats(rows),
  };
}

function parseClsHtmlCollectionWithStats(html: string, limit = 12, baseUrl?: string): ParsedFeedBatch {
  let parsedUrl: URL | null = null;
  try {
    parsedUrl = baseUrl ? new URL(baseUrl) : null;
  } catch {
    parsedUrl = null;
  }
  if (!parsedUrl || parsedUrl.hostname !== 'www.cls.cn' || !parsedUrl.pathname.startsWith('/telegraph')) {
    return { items: [], stats: summarizeStats([]) };
  }

  const payload = parseJsonScriptBlock(html, '__NEXT_DATA__');
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { items: [], stats: summarizeStats([]) };
  }

  const telegraphList = ((((payload as Record<string, unknown>).props as Record<string, unknown> | undefined)?.initialState as Record<string, unknown> | undefined)?.telegraph as Record<string, unknown> | undefined)?.telegraphList;
  if (!Array.isArray(telegraphList)) {
    return { items: [], stats: summarizeStats([]) };
  }

  const rows = telegraphList
    .flatMap((entry): ParsedFeedItemWithMissing[] => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
      const record = entry as Record<string, unknown>;
      const id = typeof record.id === 'number' || typeof record.id === 'string' ? String(record.id) : '';
      const link = resolveFeedLink(id ? `/detail/${id}` : extractHtmlCollectionField(record, ['shareurl', 'assocArticleUrl']), baseUrl);
      const description = stripHtml(extractHtmlCollectionField(record, ['brief', 'content'])).slice(0, 1600);
      const title = extractHtmlCollectionField(record, ['title']) || description.slice(0, 80) || inferTitleFromLink(link) || link;
      const ctime = record.ctime;
      const publishedAt =
        (typeof ctime === 'number' && Number.isFinite(ctime) ? new Date(ctime * 1000).toISOString() : '')
        || normalizePublishedAt(extractHtmlCollectionField(record, ['modified_time']))
        || inferPublishedAtFromLink(link);
      return [{
        title,
        description,
        link,
        publishedAt,
        categories: ['telegraph'],
        stableId: id ? `cls:${id}` : link,
        missingTitle: !title,
        missingLink: !link,
        missingSummary: !description,
        missingPublishedAt: !publishedAt,
      }];
    })
    .filter((row, index, all) => row.link && all.findIndex((candidate) => candidate.link === row.link) === index)
    .sort((left, right) => {
      const leftMs = left.publishedAt ? Date.parse(left.publishedAt) : Number.NEGATIVE_INFINITY;
      const rightMs = right.publishedAt ? Date.parse(right.publishedAt) : Number.NEGATIVE_INFINITY;
      return rightMs - leftMs;
    })
    .slice(0, limit);

  return {
    items: toItems(rows),
    stats: summarizeStats(rows),
  };
}

function parseGuanchaHtmlCollectionWithStats(html: string, limit = 12, baseUrl?: string): ParsedFeedBatch {
  let parsedUrl: URL | null = null;
  try {
    parsedUrl = baseUrl ? new URL(baseUrl) : null;
  } catch {
    parsedUrl = null;
  }
  if (!parsedUrl || parsedUrl.hostname !== 'www.guancha.cn' || !parsedUrl.pathname.startsWith('/economy')) {
    return { items: [], stats: summarizeStats([]) };
  }

  const primaryMatches = [...html.matchAll(/<h4[^>]*>\s*<a[^>]+href=["']((?:https?:\/\/(?:www\.)?guancha\.cn)?\/[a-z-]+\/20\d{2}_\d{2}_\d{2}_[^"']+\.shtml)["'][^>]*>([\s\S]*?)<\/a>/gi)];
  const secondaryMatches = [...html.matchAll(/<a[^>]+href=["']((?:https?:\/\/(?:www\.)?guancha\.cn)?\/[a-z-]+\/20\d{2}_\d{2}_\d{2}_[^"']+\.shtml)["'][^>]+title=["']([^"']+)["']/gi)];

  const rows = [...primaryMatches, ...secondaryMatches]
    .map((match) => {
      const link = resolveFeedLink(match[1] || '', baseUrl);
      const title = stripHtml(match[2] || '') || inferTitleFromLink(link) || link;
      const publishedAt = inferPublishedAtFromLink(link);
      return {
        title,
        description: '',
        link,
        publishedAt,
        categories: ['economy'],
        stableId: link,
        missingTitle: !title,
        missingLink: !link,
        missingSummary: true,
        missingPublishedAt: !publishedAt,
      };
    })
    .filter((row, index, all) => row.link && all.findIndex((candidate) => candidate.link === row.link) === index)
    .sort((left, right) => {
      const leftMs = left.publishedAt ? Date.parse(left.publishedAt) : Number.NEGATIVE_INFINITY;
      const rightMs = right.publishedAt ? Date.parse(right.publishedAt) : Number.NEGATIVE_INFINITY;
      return rightMs - leftMs;
    })
    .slice(0, limit);

  return {
    items: toItems(rows),
    stats: summarizeStats(rows),
  };
}

function readNuxtPrimitive(payload: unknown[], ref: unknown): unknown {
  if (typeof ref === 'number' && Number.isInteger(ref) && ref >= 0 && ref < payload.length) {
    const resolved = payload[ref];
    if (
      typeof resolved === 'string'
      || typeof resolved === 'number'
      || typeof resolved === 'boolean'
      || resolved === null
    ) {
      return resolved;
    }
  }
  return ref;
}

function readNuxtString(payload: unknown[], ref: unknown): string {
  const resolved = readNuxtPrimitive(payload, ref);
  return typeof resolved === 'string' ? normalizeHtmlText(resolved.trim()) : '';
}

function readNuxtPublishedAt(payload: unknown[], ref: unknown): string {
  const resolved = readNuxtPrimitive(payload, ref);
  return typeof resolved === 'string' ? normalizePublishedAt(resolved) || '' : '';
}

function parseAltingetHtmlCollectionWithStats(html: string, limit = 12, baseUrl?: string): ParsedFeedBatch {
  let parsedUrl: URL | null = null;
  try {
    parsedUrl = baseUrl ? new URL(baseUrl) : null;
  } catch {
    parsedUrl = null;
  }
  if (!parsedUrl || parsedUrl.hostname !== 'www.altinget.dk') {
    return { items: [], stats: summarizeStats([]) };
  }

  const payload = parseNuxtDataPayload(html);
  if (payload.length === 0) {
    return { items: [], stats: summarizeStats([]) };
  }

  const hrefs = [...html.matchAll(/href="(\/artikel\/[^"#?]+)"/g)]
    .map((match) => clean(match[1] || '').trim())
    .filter((href) => href && !href.startsWith('/artikel/om-altinget-') && href !== '/artikel/altingetdks-formaal-maalgruppe');
  const hrefSet = new Set(hrefs);
  if (hrefSet.size === 0) {
    return { items: [], stats: summarizeStats([]) };
  }

  const publishedAtByArticleRef = new Map<number, string>();
  for (const entry of payload) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const record = entry as Record<string, unknown>;
    if (typeof record.articleId !== 'number') continue;
    const publishedAt = readNuxtPublishedAt(payload, record.publishingDate);
    if (!publishedAt) continue;
    const existing = publishedAtByArticleRef.get(record.articleId);
    if (!existing || Date.parse(publishedAt) > Date.parse(existing)) {
      publishedAtByArticleRef.set(record.articleId, publishedAt);
    }
  }

  const rows = payload
    .flatMap((entry): ParsedFeedItemWithMissing[] => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
      const record = entry as Record<string, unknown>;
      if (typeof record.id !== 'number') return [];
      const urlKey = readNuxtString(payload, record.urlKey);
      if (!urlKey) return [];
      const href = urlKey.startsWith('/artikel/') ? urlKey : `/artikel/${urlKey}`;
      if (!hrefSet.has(href)) return [];
      const link = resolveFeedLink(href, baseUrl);
      const publishedAt = publishedAtByArticleRef.get(record.id) || inferPublishedAtFromLink(link);
      const title = readNuxtString(payload, record.headline) || inferTitleFromLink(link) || link;
      const description = readNuxtString(payload, record.mainTeaser);
      return [{
        title,
        description,
        link,
        publishedAt,
        categories: [],
        stableId: `altinget:${urlKey}`,
        missingTitle: !title,
        missingLink: !link,
        missingSummary: !description,
        missingPublishedAt: !publishedAt,
      }];
    })
    .filter((row, index, all) => row.link && all.findIndex((candidate) => candidate.link === row.link) === index)
    .sort((left, right) => {
      const leftMs = left.publishedAt ? Date.parse(left.publishedAt) : Number.NEGATIVE_INFINITY;
      const rightMs = right.publishedAt ? Date.parse(right.publishedAt) : Number.NEGATIVE_INFINITY;
      return rightMs - leftMs;
    })
    .slice(0, limit);

  return {
    items: toItems(rows),
    stats: summarizeStats(rows),
  };
}

export function parseHtmlCollectionWithStats(html: string, limit = 12, baseUrl?: string): ParsedFeedBatch {
  const rawEntries: Array<Record<string, unknown>> = [];
  for (const block of parseJsonLdBlocks(html)) {
    extractJsonLdListEntries(block, rawEntries);
  }

  const deduped = new Map<string, ParsedFeedItemWithMissing>();
  for (const entry of rawEntries) {
    const link = resolveFeedLink(
      extractHtmlCollectionField(entry, ['url', '@id', 'mainEntityOfPage']),
      baseUrl
    );
    const title =
      extractHtmlCollectionField(entry, ['name', 'headline', 'title'])
      || inferTitleFromLink(link)
      || link;
    const publishedAt =
      normalizePublishedAt(extractHtmlCollectionField(entry, ['datePublished', 'dateCreated', 'dateModified']))
      || inferPublishedAtFromLink(link);
    const key = link || `${title}|${publishedAt}`;
    if (!key || deduped.has(key)) continue;
    deduped.set(key, {
      title,
      description: '',
      link,
      publishedAt,
      categories: [],
      stableId: link,
      missingTitle: !title,
      missingLink: !link,
      missingSummary: true,
      missingPublishedAt: !publishedAt,
    });
  }

  const rows = [...deduped.values()].slice(0, limit);
  const jsonLdResult = {
    items: toItems(rows),
    stats: summarizeStats(rows),
  };
  if (jsonLdResult.items.length > 0 || jsonLdResult.stats.totalCandidates > 0) {
    return jsonLdResult;
  }

  const altingetResult = parseAltingetHtmlCollectionWithStats(html, limit, baseUrl);
  if (altingetResult.items.length > 0 || altingetResult.stats.totalCandidates > 0) {
    return altingetResult;
  }

  const yicaiResult = parseYicaiHtmlCollectionWithStats(html, limit, baseUrl);
  if (yicaiResult.items.length > 0 || yicaiResult.stats.totalCandidates > 0) {
    return yicaiResult;
  }

  const clsResult = parseClsHtmlCollectionWithStats(html, limit, baseUrl);
  if (clsResult.items.length > 0 || clsResult.stats.totalCandidates > 0) {
    return clsResult;
  }

  const guanchaResult = parseGuanchaHtmlCollectionWithStats(html, limit, baseUrl);
  if (guanchaResult.items.length > 0 || guanchaResult.stats.totalCandidates > 0) {
    return guanchaResult;
  }

  return parseMhmHtmlCollectionWithStats(html, limit, baseUrl);
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
      const link = resolveFeedLink(parseTag(body, 'link'));
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
  if (link.startsWith('//')) return `https:${link}`;
  if (!baseUrl) return link;
  try {
    return new URL(link, baseUrl).toString();
  } catch {
    return link;
  }
}

function normalizeHostForSitemapFilter(value: string): string {
  return value.trim().toLowerCase().replace(/^www\./, '');
}

function isSameHostOrSubdomain(candidateHost: string, baseHost: string): boolean {
  return (
    candidateHost === baseHost
    || candidateHost.endsWith(`.${baseHost}`)
    || baseHost.endsWith(`.${candidateHost}`)
  );
}

function shouldKeepSitemapLink(link: string, baseUrl?: string): boolean {
  if (!link || !baseUrl) return true;
  try {
    const linkHost = normalizeHostForSitemapFilter(new URL(link).hostname);
    const baseHost = normalizeHostForSitemapFilter(new URL(baseUrl).hostname);
    if (!linkHost || !baseHost) return true;
    return isSameHostOrSubdomain(linkHost, baseHost);
  } catch {
    return true;
  }
}

export function parseSitemapWithStats(xml: string, limit = 12, baseUrl?: string): ParsedFeedBatch {
  const rows = [...xml.matchAll(/<(?:[\w.-]+:)?url\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?url>/gi)]
    .map((match) => match[1])
    .map((body, index) => {
      const link = resolveFeedLink(parseTagByLocalName(body, 'loc'), baseUrl);
      const title =
        parseTag(body, 'news:title')
        || parseTag(body, 'title')
        || inferTitleFromLink(link)
        || link;
      const publishedAt =
        normalizePublishedAt(parseTag(body, 'news:publication_date'))
        || normalizePublishedAt(parseTagByLocalName(body, 'publication_date'))
        || normalizePublishedAt(parseTagByLocalName(body, 'lastmod'))
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
        sortPublishedAtMs: publishedAt ? Date.parse(publishedAt) : Number.NaN,
        sortIndex: index,
      };
    })
    .filter((row) => shouldKeepSitemapLink(row.link, baseUrl))
    .sort((left, right) => {
      const leftMs = Number.isFinite(left.sortPublishedAtMs) ? left.sortPublishedAtMs : Number.NEGATIVE_INFINITY;
      const rightMs = Number.isFinite(right.sortPublishedAtMs) ? right.sortPublishedAtMs : Number.NEGATIVE_INFINITY;
      if (rightMs !== leftMs) return rightMs - leftMs;
      return left.sortIndex - right.sortIndex;
    })
    .slice(0, limit);

  return {
    items: toItems(rows.map(({ sortPublishedAtMs: _sortPublishedAtMs, sortIndex: _sortIndex, ...row }) => row)),
    stats: summarizeStats(rows.map(({ sortPublishedAtMs: _sortPublishedAtMs, sortIndex: _sortIndex, ...row }) => row)),
  };
}
