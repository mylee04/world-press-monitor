import type { NewsSection } from '@/lib/types';
import {
  buildArticleHintText,
  classifySectionBySourceFallback,
  classifySectionByStructuredHints,
  deriveSectionFromContext,
  mapFeedCategoryToSection,
} from '@/lib/article-section-context';
import { looksLikeLowSignalArticleTitle, normalizeArticleTitle } from '@/lib/html-entities';
import { classifySectionByKeyword } from '@/lib/keyword-classifier';

const VALID_NEWS_SECTIONS: ReadonlySet<NewsSection> = new Set<NewsSection>([
  'world',
  'politics',
  'conflicts',
  'business',
  'tech',
  'sports',
  'health',
  'entertainment',
  'lifestyle',
  'arts',
  'science',
  'climate',
  'others',
]);

type ArticleTaxonomyInput = {
  storedSection?: string | null;
  sourceCategories?: ReadonlyArray<string> | null;
  source: string;
  url: string;
  title: string;
  snippet?: string | null;
};

export type ArticleTaxonomy = {
  primarySection: NewsSection;
  sections: NewsSection[];
  sourceCategories: string[];
};

export function normalizeNewsSection(value: string | null | undefined): NewsSection {
  const normalized = (value || '').trim().toLowerCase();
  if (VALID_NEWS_SECTIONS.has(normalized as NewsSection)) {
    return normalized as NewsSection;
  }
  return 'others';
}

export function normalizeSourceCategories(values: ReadonlyArray<string> | null | undefined): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const value of values || []) {
    const trimmed = value.replace(/\s+/g, ' ').trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(trimmed);
  }

  return normalized;
}

export function buildArticleTaxonomy(input: ArticleTaxonomyInput): ArticleTaxonomy {
  const title = (input.title || '').trim();
  const snippet = (input.snippet || '').trim();
  const source = (input.source || '').trim();
  const url = (input.url || '').trim();
  const sourceCategories = normalizeSourceCategories(input.sourceCategories);
  const storedSection = normalizeNewsSection(input.storedSection);
  const genericTitle = looksLikeGenericTitle(title, url);
  const hintText = source || url ? buildArticleHintText(source, url) : '';

  const feedCategorySections = sourceCategories
    .map((category) => classifySourceCategorySection(category))
    .filter((section): section is NewsSection => section !== 'others');
  const titleSection = genericTitle ? 'others' : classifySectionByKeyword(title, 'others').section;
  const textSection = !genericTitle && snippet
    ? classifySectionByKeyword(`${title} ${snippet}`, 'others').section
    : 'others';
  const hintKeywordSection = hintText ? classifySectionByKeyword(hintText, 'others').section : 'others';
  const structuredHintSection = source || url ? classifySectionByStructuredHints(source, url) : 'others';
  const sourceFallbackSection = source || url ? classifySectionBySourceFallback({ source, url, title }) : 'others';
  const contextSection = source || url ? deriveSectionFromContext({ source, url, title }) : 'others';
  const derivedSection = pickFirstMeaningfulSection([
    titleSection,
    textSection,
    structuredHintSection,
    hintKeywordSection,
    sourceFallbackSection,
    contextSection,
    ...feedCategorySections,
  ]);

  let primarySection = storedSection;
  if (primarySection === 'others') {
    primarySection = derivedSection;
  } else if (
    (primarySection === 'arts' || primarySection === 'entertainment' || primarySection === 'lifestyle')
    && derivedSection !== 'others'
  ) {
    primarySection = derivedSection;
  }

  const sections: NewsSection[] = [];
  pushSection(sections, primarySection);
  for (const section of [
    ...feedCategorySections,
    titleSection,
    textSection,
    structuredHintSection,
    hintKeywordSection,
    sourceFallbackSection,
    contextSection,
  ]) {
    pushSection(sections, section);
  }

  if (sections.length > 1) {
    const othersIndex = sections.indexOf('others');
    if (othersIndex >= 0) sections.splice(othersIndex, 1);
  }

  if (!sections.length) {
    sections.push('others');
  }

  return {
    primarySection,
    sections,
    sourceCategories,
  };
}

function classifySourceCategorySection(value: string): NewsSection {
  return mapFeedCategoryToSection(value) || classifySectionByKeyword(value, 'others').section;
}

function looksLikeGenericTitle(title: string, url: string): boolean {
  const normalized = normalizeArticleTitle(title || '', url || '');
  if (!normalized) return true;
  return looksLikeLowSignalArticleTitle(normalized);
}

function pickFirstMeaningfulSection(sections: ReadonlyArray<NewsSection>): NewsSection {
  return sections.find((section) => section && section !== 'others') || 'others';
}

function pushSection(target: NewsSection[], candidate: NewsSection): void {
  if (!candidate) return;
  if (target.includes(candidate)) return;
  target.push(candidate);
}
