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

const SECTION_META_KEYS = new Set(['article:section', 'article:section2', 'og:section', 'section']);
const KEYWORD_META_KEYS = new Set(['news_keywords', 'keywords']);

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
  const normalizedSource = source.toLowerCase();

  if (normalizedSource.includes('people.cn')) {
    const routeMatch = html.match(/<div\b[^>]*id=["']rwb_navpath["'][^>]*>([\s\S]*?)<\/div>/i);
    const anchors = extractAnchorTexts(routeMatch?.[1] || '');
    const lastAnchor = anchors.at(-1);
    if (lastAnchor) {
      const resolved = resolveSectionFromCandidates([lastAnchor], 'breadcrumb');
      if (resolved) return resolved;
    }
  }

  if (normalizedSource.includes('kbs')) {
    const candidates = [
      ...[...html.matchAll(/<a\b[^>]*class=["'][^"']*category-name[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi)].map((match) => cleanSignalText(stripHtmlTags(match[1]))),
      ...[...html.matchAll(/<span\b[^>]*class=["'][^"']*program_name[^"']*["'][^>]*>([\s\S]*?)<\/span>/gi)].map((match) => cleanSignalText(stripHtmlTags(match[1]))),
    ].filter(Boolean);
    if (candidates.length > 0) {
      const resolved = resolveSectionFromCandidates(candidates, 'article_section');
      if (resolved) return resolved;
    }
  }

  if (normalizedSource.includes('kronen zeitung')) {
    const candidates = [
      ...extractMetaContents(html, 'cXenseParse:krz-category'),
      ...extractMetaContents(html, 'cXenseParse:krz-classifications'),
      ...extractMetaContents(html, 'krn-content-context'),
      ...extractMetaContents(html, 'krn-ressort-slug_hierarchical'),
      ...extractMetaContents(html, 'krn-ressort-slug'),
      ...extractMetaContents(html, 'cXenseParse:krz-ressort_name'),
    ].filter(Boolean);
    if (candidates.length > 0) {
      const resolved = resolveSectionFromCandidates(candidates, 'article_section');
      if (resolved) return resolved;
      return {
        section: 'world',
        source: 'article_section',
        signals: candidates,
      };
    }
  }

  if (normalizedSource.includes('le télégramme') || normalizedSource.includes('le telegr')) {
    const candidates = [
      ...extractMetaContents(html, 'article:section'),
      ...extractMetaContents(html, 'news_keywords'),
      ...extractMetaContents(html, 'keywords'),
    ].filter(Boolean);
    if (candidates.length > 0) {
      const resolved = resolveSectionFromCandidates(candidates, 'article_section');
      if (resolved) return resolved;
      return {
        section: 'world',
        source: 'article_section',
        signals: candidates,
      };
    }
  }

  return null;
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

function parseJsonLd(scriptText: string): unknown[] {
  const parsed: unknown[] = [];
  try {
    parsed.push(JSON.parse(scriptText));
    return parsed;
  } catch {
    return parsed;
  }
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
