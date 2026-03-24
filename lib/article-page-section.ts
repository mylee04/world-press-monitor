import { normalizeHtmlText } from '@/lib/html-entities';
import { deriveSectionFromContext, mapFeedCategoryToSection } from '@/lib/article-section-context';
import { classifySectionByKeyword } from '@/lib/keyword-classifier';
import type { NewsSection } from '@/lib/types';

type SectionSignalSource = 'meta' | 'article_section' | 'breadcrumb' | 'keywords' | 'context' | 'none';

export type ArticlePageSectionResult = {
  section: NewsSection;
  source: SectionSignalSource;
  signals: string[];
  reason: string;
};

type SectionSignalBuckets = {
  meta: string[];
  articleSection: string[];
  breadcrumb: string[];
  keywords: string[];
};

const SECTION_META_KEYS = new Set(['article:section', 'article:section2', 'articlesection', 'og:section', 'section']);
const KEYWORD_META_KEYS = new Set(['article:tag', 'news_keywords', 'keywords']);
const SOURCE_CATEGORY_NOISE = new Set([
  'home',
  'homepage',
  'news',
  'latest news',
  'breaking news',
  'article',
  'articles',
  'story',
  'stories',
  'default',
  'general',
]);

export function extractSourceCategoriesFromArticlePage(input: {
  source: string;
  html: string;
}): string[] {
  const buckets = extractSectionSignalBuckets(input.source, input.html);
  const values: string[] = [];

  for (const candidate of [
    ...extractSourceSpecificCategoryCandidates(input.source, input.html),
    ...buckets.meta,
    ...buckets.articleSection,
    ...buckets.breadcrumb,
    ...buckets.keywords,
  ]) {
    for (const exploded of explodeSourceCategorySignal(candidate)) {
      const cleaned = cleanSourceCategorySignal(exploded);
      if (!cleaned) continue;
      pushUnique(values, cleaned);
      if (values.length >= 24) {
        return values;
      }
    }
  }

  return values;
}

export function deriveSectionFromArticlePage(input: {
  source: string;
  url: string;
  title?: string;
  html: string;
}): ArticlePageSectionResult {
  const directSourceSignal = resolveSourceSpecificSectionSignal(input.source, input.html);
  if (directSourceSignal) {
    return {
      section: directSourceSignal.section,
      source: directSourceSignal.source,
      signals: directSourceSignal.signals,
      reason: 'Resolved from source-specific article page signal',
    };
  }

  const buckets = extractSectionSignalBuckets(input.source, input.html);
  const explicitCandidates = [...buckets.meta, ...buckets.articleSection];

  const metaSection = resolveSectionFromCandidates(explicitCandidates);
  if (metaSection) {
    return {
      section: metaSection.section,
      source: metaSection.source,
      signals: metaSection.signals,
      reason: 'Resolved from article page section metadata',
    };
  }

  const breadcrumbSection = resolveSectionFromCandidates(buckets.breadcrumb, 'breadcrumb');
  if (breadcrumbSection) {
    return {
      section: breadcrumbSection.section,
      source: breadcrumbSection.source,
      signals: breadcrumbSection.signals,
      reason: 'Resolved from article page breadcrumb metadata',
    };
  }

  const keywordSection = resolveSectionFromCandidates(buckets.keywords, 'keywords');
  if (keywordSection) {
    return {
      section: keywordSection.section,
      source: keywordSection.source,
      signals: keywordSection.signals,
      reason: 'Resolved from article page keyword metadata',
    };
  }

  const contextSection = deriveSectionFromContext({
    source: input.source,
    url: input.url,
    title: input.title,
  });
  if (contextSection !== 'others') {
    return {
      section: contextSection,
      source: 'context',
      signals: [],
      reason: 'Resolved from trusted source/url context',
    };
  }

  return {
    section: 'others',
    source: 'none',
    signals: [],
    reason: 'No article page section signal found',
  };
}

function resolveSectionFromCandidates(
  candidates: string[],
  preferredSource: Exclude<SectionSignalSource, 'context' | 'none'> = 'meta',
): { section: NewsSection; source: Exclude<SectionSignalSource, 'context' | 'none'>; signals: string[] } | null {
  for (const candidate of candidates) {
    const mapped = mapFeedCategoryToSection(candidate);
    if (mapped && mapped !== 'others') {
      return { section: mapped, source: preferredSource, signals: [candidate] };
    }

    const keywordMatch = classifySectionByKeyword(candidate, 'others').section;
    if (keywordMatch !== 'others') {
      return { section: keywordMatch, source: preferredSource, signals: [candidate] };
    }
  }

  return null;
}

function resolveSourceSpecificSectionSignal(
  source: string,
  html: string,
): { section: NewsSection; source: Exclude<SectionSignalSource, 'context' | 'none'>; signals: string[] } | null {
  const candidates = extractSourceSpecificCategoryCandidates(source, html);
  if (candidates.length > 0) {
    const resolved = resolveSectionFromCandidates(candidates, 'article_section');
    if (resolved) return resolved;
    return {
      section: 'world',
      source: 'article_section',
      signals: candidates,
    };
  }

  return null;
}

function extractSourceSpecificCategoryCandidates(source: string, html: string): string[] {
  const normalizedSource = source.toLowerCase();

  if (normalizedSource.includes('people.cn')) {
    const routeMatch = html.match(/<div\b[^>]*id=["']rwb_navpath["'][^>]*>([\s\S]*?)<\/div>/i);
    return [extractAnchorTexts(routeMatch?.[1] || '').at(-1)].filter(Boolean) as string[];
  }

  if (normalizedSource.includes('kbs')) {
    return [
      ...[...html.matchAll(/<a\b[^>]*class=["'][^"']*category-name[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi)].map((match) => cleanSignalText(stripHtmlTags(match[1]))),
      ...[...html.matchAll(/<span\b[^>]*class=["'][^"']*program_name[^"']*["'][^>]*>([\s\S]*?)<\/span>/gi)].map((match) => cleanSignalText(stripHtmlTags(match[1]))),
    ].filter(Boolean);
  }

  if (normalizedSource.includes('kronen zeitung')) {
    return [
      ...extractMetaContents(html, 'cXenseParse:krz-category'),
      ...extractMetaContents(html, 'cXenseParse:krz-classifications'),
      ...extractMetaContents(html, 'krn-content-context'),
      ...extractMetaContents(html, 'krn-ressort-slug_hierarchical'),
      ...extractMetaContents(html, 'krn-ressort-slug'),
      ...extractMetaContents(html, 'cXenseParse:krz-ressort_name'),
    ].filter(Boolean);
  }

  if (normalizedSource.includes('le télégramme') || normalizedSource.includes('le telegr')) {
    return [
      ...extractMetaContents(html, 'article:section'),
      ...extractMetaContents(html, 'news_keywords'),
      ...extractMetaContents(html, 'keywords'),
    ].filter(Boolean);
  }

  if (normalizedSource.includes('cgtn')) {
    return [
      ...[...html.matchAll(/<span\b[^>]*class=["'][^"']*\bsection\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/gi)].map((match) =>
        cleanSignalText(stripHtmlTags(match[1]))
      ),
      ...[...html.matchAll(/<div\b[^>]*class=["'][^"']*\bhotkeywords\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi)].flatMap((match) =>
        extractAnchorTexts(match[1] || '')
      ),
    ].filter(Boolean);
  }

  if (normalizedSource.includes('sözcü') || normalizedSource.includes('sozcu')) {
    return [
      ...[...html.matchAll(/content_category_name\s*=\s*['"]([^'"]+)['"]/gi)].map((match) =>
        cleanSignalText(match[1])
      ),
      ...[...html.matchAll(/content_category_slug\s*=\s*['"]([^'"]+)['"]/gi)].map((match) =>
        cleanSignalText(match[1])
      ),
    ].filter(Boolean);
  }

  if (normalizedSource.includes('tv4')) {
    const candidates: string[] = [];
    for (const scriptText of extractEmbeddedJsonScripts(html)) {
      for (const parsed of parseEmbeddedJson(scriptText)) {
        if (!parsed || typeof parsed !== 'object') continue;
        const root = parsed as Record<string, unknown>;
        const query = root.query && typeof root.query === 'object' ? (root.query as Record<string, unknown>) : null;
        const queryId = typeof query?.id === 'string' ? query.id : '';
        const props = root.props && typeof root.props === 'object' ? (root.props as Record<string, unknown>) : null;
        const pageProps = props?.pageProps && typeof props.pageProps === 'object'
          ? (props.pageProps as Record<string, unknown>)
          : null;
        const apolloState = pageProps?.__APOLLO_STATE__ && typeof pageProps.__APOLLO_STATE__ === 'object'
          ? (pageProps.__APOLLO_STATE__ as Record<string, unknown>)
          : null;
        if (!queryId || !apolloState) continue;

        const article = apolloState[`Article:${queryId}`];
        if (!article || typeof article !== 'object') continue;
        const articleRecord = article as Record<string, unknown>;

        pushMixedValue(candidates, articleRecord.section);
        pushMixedValue(candidates, articleRecord.category);

        if (Array.isArray(articleRecord.feedOrigins)) {
          for (const item of articleRecord.feedOrigins) {
            if (!item || typeof item !== 'object') continue;
            const ref = (item as Record<string, unknown>).__ref;
            if (typeof ref !== 'string') continue;
            const feedOrigin = apolloState[ref];
            if (!feedOrigin || typeof feedOrigin !== 'object') continue;
            const feedOriginRecord = feedOrigin as Record<string, unknown>;
            if (typeof feedOriginRecord.title === 'string') {
              pushUnique(candidates, cleanSignalText(feedOriginRecord.title));
            }
            if (typeof feedOriginRecord.slug === 'string') {
              pushUnique(candidates, cleanSignalText(String(feedOriginRecord.slug).replace(/\//g, ' ')));
            }
          }
        }
      }
    }
    return candidates.filter(Boolean);
  }

  if (html.includes('YAHOO.JP.templa') || html.includes('news.yahoo.co.jp')) {
    return [...html.matchAll(/"categoryId":"([^"]+)"/gi)]
      .map((match) => cleanSignalText(match[1]))
      .filter(Boolean);
  }

  return [];
}

function extractSectionSignalBuckets(source: string, html: string): SectionSignalBuckets {
  const buckets: SectionSignalBuckets = {
    meta: [],
    articleSection: [],
    breadcrumb: [],
    keywords: [],
  };

  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    const attrs = parseHtmlAttributes(tag);
    const key = normalizeHtmlText(attrs.property || attrs.name || '').toLowerCase();
    const content = cleanSignalText(attrs.content);
    if (!key || !content) continue;
    if (SECTION_META_KEYS.has(key)) {
      pushUnique(buckets.meta, content);
    } else if (KEYWORD_META_KEYS.has(key)) {
      pushUnique(buckets.keywords, content);
    }
  }

  for (const rawScript of html.match(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi) || []) {
    const contentMatch = rawScript.match(/<script\b[^>]*>([\s\S]*?)<\/script>/i);
    const scriptText = cleanJsonLd(contentMatch?.[1] || '');
    if (!scriptText) continue;

    for (const parsed of parseJsonLd(scriptText)) {
      collectJsonLdSignals(parsed, buckets);
    }

    for (const matched of scriptText.matchAll(/"articleSection"\s*:\s*"([^"]+)"/gi)) {
      pushUnique(buckets.articleSection, cleanSignalText(matched[1]));
    }
  }

  for (const scriptText of extractEmbeddedJsonScripts(html)) {
    for (const parsed of parseEmbeddedJson(scriptText)) {
      collectEmbeddedArticleSignals(parsed, buckets);
    }
  }

  extractSourceSpecificSignals(source, html, buckets);

  return buckets;
}

function extractSourceSpecificSignals(source: string, html: string, buckets: SectionSignalBuckets): void {
  const normalizedSource = source.toLowerCase();

  if (normalizedSource.includes('people.cn')) {
    const routeMatch = html.match(/<div\b[^>]*id=["']rwb_navpath["'][^>]*>([\s\S]*?)<\/div>/i);
    const anchors = extractAnchorTexts(routeMatch?.[1] || '');
    if (anchors.length > 0) {
      pushUnique(buckets.breadcrumb, anchors[anchors.length - 1]);
    }
  }

  if (normalizedSource.includes('kbs')) {
    for (const match of html.matchAll(/<a\b[^>]*class=["'][^"']*category-name[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi)) {
      pushUnique(buckets.articleSection, cleanSignalText(stripHtmlTags(match[1])));
    }
    for (const match of html.matchAll(/<span\b[^>]*class=["'][^"']*program_name[^"']*["'][^>]*>([\s\S]*?)<\/span>/gi)) {
      pushUnique(buckets.articleSection, cleanSignalText(stripHtmlTags(match[1])));
    }
  }

  if (normalizedSource.includes('kronen zeitung')) {
    for (const value of extractMetaContents(html, 'cXenseParse:krz-category')) {
      pushUnique(buckets.articleSection, value);
    }
    for (const value of extractMetaContents(html, 'cXenseParse:krz-classifications')) {
      pushUnique(buckets.articleSection, value);
    }
    for (const value of extractMetaContents(html, 'krn-content-context')) {
      pushUnique(buckets.keywords, value);
    }
    for (const value of extractMetaContents(html, 'krn-ressort-slug_hierarchical')) {
      pushUnique(buckets.articleSection, value);
    }
    for (const value of extractMetaContents(html, 'krn-ressort-slug')) {
      pushUnique(buckets.articleSection, value);
    }
  }
}

function collectJsonLdSignals(value: unknown, buckets: SectionSignalBuckets, depth = 0): void {
  if (depth > 8 || value === null || value === undefined) return;

  if (Array.isArray(value)) {
    for (const item of value) {
      collectJsonLdSignals(item, buckets, depth + 1);
    }
    return;
  }

  if (typeof value !== 'object') return;
  const record = value as Record<string, unknown>;

  pushMixedValue(buckets.articleSection, record.articleSection);
  pushMixedValue(buckets.keywords, record.keywords);
  pushMixedValue(buckets.meta, record.section);
  pushMixedValue(buckets.meta, record.contentSection);

  if (hasJsonLdType(record, 'BreadcrumbList')) {
    for (const breadcrumb of extractBreadcrumbNames(record)) {
      pushUnique(buckets.breadcrumb, breadcrumb);
    }
  }

  for (const child of Object.values(record)) {
    collectJsonLdSignals(child, buckets, depth + 1);
  }
}

function collectEmbeddedArticleSignals(value: unknown, buckets: SectionSignalBuckets, depth = 0): void {
  if (depth > 12 || value === null || value === undefined) return;

  if (Array.isArray(value)) {
    for (const item of value) {
      collectEmbeddedArticleSignals(item, buckets, depth + 1);
    }
    return;
  }

  if (typeof value !== 'object') return;
  const record = value as Record<string, unknown>;

  if (looksLikeArticlePayload(record)) {
    pushNamedValues(buckets.keywords, record.tags);
    pushNamedValues(buckets.keywords, record.tags_algo);
    pushMixedValue(buckets.keywords, record.keywords);
    pushMixedValue(buckets.articleSection, record.articleSection);
    pushMixedValue(buckets.meta, record.section);
    pushMixedValue(buckets.meta, record.category);
  }

  for (const child of Object.values(record)) {
    collectEmbeddedArticleSignals(child, buckets, depth + 1);
  }
}

function hasJsonLdType(record: Record<string, unknown>, expected: string): boolean {
  const typeValue = record['@type'];
  if (typeof typeValue === 'string') {
    return typeValue.toLowerCase() === expected.toLowerCase();
  }
  if (Array.isArray(typeValue)) {
    return typeValue.some((item) => String(item || '').toLowerCase() === expected.toLowerCase());
  }
  return false;
}

function extractBreadcrumbNames(record: Record<string, unknown>): string[] {
  const list = Array.isArray(record.itemListElement) ? record.itemListElement : [];
  const names = list
    .map((item) => {
      if (!item || typeof item !== 'object') return '';
      const candidate = item as Record<string, unknown>;
      if (typeof candidate.name === 'string') return cleanSignalText(candidate.name);
      const nestedItem = candidate.item;
      if (nestedItem && typeof nestedItem === 'object' && typeof (nestedItem as Record<string, unknown>).name === 'string') {
        return cleanSignalText((nestedItem as Record<string, unknown>).name as string);
      }
      return '';
    })
    .filter(Boolean);

  if (names.length >= 3) return names.slice(1, -1);
  if (names.length === 2) return names.slice(1);
  return [];
}

function extractMetaContents(html: string, key: string): string[] {
  const values: string[] = [];
  const matcher = new RegExp(`<meta\\b[^>]*(?:name|property)=["']${escapeRegExp(key)}["'][^>]*content=["']([^"']+)["'][^>]*>`, 'gi');
  for (const match of html.matchAll(matcher)) {
    pushUnique(values, cleanSignalText(match[1]));
  }
  return values;
}

function pushMixedValue(target: string[], value: unknown): void {
  if (typeof value === 'string') {
    pushUnique(target, cleanSignalText(value));
    return;
  }
  if (!Array.isArray(value)) return;
  for (const item of value) {
    if (typeof item === 'string') {
      pushUnique(target, cleanSignalText(item));
    }
  }
}

function pushNamedValues(target: string[], value: unknown): void {
  if (!Array.isArray(value)) return;
  for (const item of value) {
    if (typeof item === 'string') {
      pushUnique(target, cleanSignalText(item));
      continue;
    }
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    if (typeof record.name === 'string') {
      pushUnique(target, cleanSignalText(record.name));
    }
  }
}

function parseJsonLd(scriptText: string): unknown[] {
  const parsed: unknown[] = [];
  try {
    parsed.push(JSON.parse(scriptText));
    return parsed;
  } catch {
    return parsed;
  }
}

function parseEmbeddedJson(scriptText: string): unknown[] {
  const parsed: unknown[] = [];
  try {
    parsed.push(JSON.parse(scriptText));
  } catch {
    return parsed;
  }
  return parsed;
}

function extractEmbeddedJsonScripts(html: string): string[] {
  const values: string[] = [];
  for (const match of html.matchAll(/<script\b[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    const content = cleanJsonLd(match[1] || '');
    if (content) values.push(content);
  }
  return values;
}

function cleanJsonLd(value: string): string {
  return (value || '')
    .replace(/^\s*<!--/, '')
    .replace(/-->\s*$/, '')
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cleanSignalText(value: string | null | undefined): string {
  const cleaned = normalizeHtmlText(String(value || ''))
    .replace(/\s+/g, ' ')
    .replace(/^[-|/>\s]+|[-|/>\s]+$/g, '')
    .trim();
  return cleaned.slice(0, 160);
}

function looksLikeArticlePayload(record: Record<string, unknown>): boolean {
  if (typeof record.title !== 'string' || !record.title.trim()) return false;
  return (
    typeof record.slug === 'string' ||
    typeof record.url === 'string' ||
    typeof record.publishedDate === 'string' ||
    typeof record.datePublished === 'string' ||
    typeof record.publishedAt === 'string'
  );
}

function explodeSourceCategorySignal(value: string): string[] {
  const normalized = cleanSignalText(value);
  if (!normalized) return [];

  const pieces = normalized
    .split(/\s*(?:,|;|\||>|›|»)\s*/g)
    .map((item) => cleanSignalText(item))
    .filter(Boolean);

  if (pieces.length >= 2 && pieces.length <= 12) {
    return pieces;
  }

  return [normalized];
}

function cleanSourceCategorySignal(value: string): string {
  const cleaned = cleanSignalText(value)
    .replace(/^#/, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return '';

  const lower = cleaned.toLowerCase();
  if (SOURCE_CATEGORY_NOISE.has(lower)) return '';
  if (/^https?:\/\//i.test(cleaned)) return '';
  if (/^[\d\s./:-]+$/.test(cleaned)) return '';
  if (cleaned.length < 2 || cleaned.length > 80) return '';
  return cleaned;
}

function extractAnchorTexts(fragment: string): string[] {
  const values: string[] = [];
  for (const match of fragment.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)) {
    const text = cleanSignalText(stripHtmlTags(match[1]));
    if (text) values.push(text);
  }
  return values;
}

function stripHtmlTags(value: string): string {
  return String(value || '').replace(/<[^>]+>/g, ' ');
}

function parseHtmlAttributes(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const match of tag.matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(["'])([\s\S]*?)\2/g)) {
    attrs[match[1].toLowerCase()] = normalizeHtmlText(match[3] || '');
  }
  return attrs;
}

function pushUnique(target: string[], value: string): void {
  if (!value) return;
  if (!target.includes(value)) {
    target.push(value);
  }
}
