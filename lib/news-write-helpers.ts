import type {
  NewsItem,
  NewsSection,
  NewsTitleQuality,
  NewsTitleRepairSource,
  NewsTitleRepairStatus,
} from '@/lib/types';
import {
  decodeHtmlEntities,
  normalizeArticleTitle,
  normalizeHtmlText,
} from '@/lib/html-entities';
import {
  assessNewsTitle,
  newsTitleQualityRank,
  normalizeNewsTitleQuality,
  normalizeNewsTitleRepairStatus,
} from '@/lib/title-quality';
import { normalizeLinkForId } from '@/lib/pipeline';
import { buildArticleTaxonomy, normalizeSourceCategories } from '@/lib/article-taxonomy';

export type NewsArticlePersistable = {
  externalId: string;
  stableId: string | null;
  publicationDatetime: string;
  titleOriginal: string;
  titleQuality: NewsTitleQuality;
  titleQualityReason: string;
  titleQualityCheckedAt: string;
  titleRepairStatus: NewsTitleRepairStatus;
  titleRepairSource: NewsTitleRepairSource | null;
  titleRepairAttemptedAt: string | null;
  titleRepairedAt: string | null;
  snippetOriginal: string | null;
  country: string | null;
  section: string | null;
  primarySection: NewsSection;
  sectionsNormalized: NewsSection[];
  feedCategories: string[];
  primaryTopic: string | null;
  topics: string[];
  url: string;
  source: string;
  language: string | null;
};

export type MissingPublishedAtPersistable = {
  candidateId: string;
  outletId: string;
  source: string;
  country: string;
  method: 'rss' | 'sitemap';
  url: string;
  titleOriginal: string;
  snippetOriginal: string | null;
  language: string | null;
  section: string | null;
  feedCategories: string[];
};

export function sanitizeTextForDatabase(value: string): string {
  if (!value) return '';
  const utf8Safe = new TextDecoder('utf-8').decode(new TextEncoder().encode(value));
  return utf8Safe
    .replace(/\u0000/g, '')
    .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
}

export function sanitizeTitleRepairSource(value: string | null | undefined): NewsTitleRepairSource | null {
  const normalized = sanitizeTextForDatabase(value || '');
  return normalized === 'article_page' || normalized === 'background' ? normalized : null;
}

export function truncatePersistedText(value: string, maxChars: number): string {
  const normalized = sanitizeTextForDatabase(value || '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ' ');
  const codePoints = Array.from(normalized);
  if (codePoints.length <= maxChars) return normalized.trim();
  return codePoints.slice(0, maxChars).join('').trim();
}

export function normalizePublicationDatetimeAgainstIngest(
  publicationDatetimeRaw: string,
  ingestDatetimeRaw: string | number | Date = Date.now()
): string {
  const publicationTs = new Date(publicationDatetimeRaw).getTime();
  const ingestTs =
    ingestDatetimeRaw instanceof Date
      ? ingestDatetimeRaw.getTime()
      : typeof ingestDatetimeRaw === 'string'
        ? new Date(ingestDatetimeRaw).getTime()
        : ingestDatetimeRaw;

  if (!Number.isFinite(ingestTs)) {
    return Number.isFinite(publicationTs)
      ? new Date(publicationTs).toISOString()
      : new Date().toISOString();
  }
  if (!Number.isFinite(publicationTs)) {
    return new Date(ingestTs).toISOString();
  }
  return new Date(Math.min(publicationTs, ingestTs)).toISOString();
}

export function preferPersistedArticleRow(
  current: NewsArticlePersistable,
  incoming: NewsArticlePersistable
): NewsArticlePersistable {
  const currentQualityRank = newsTitleQualityRank(current.titleQuality);
  const incomingQualityRank = newsTitleQualityRank(incoming.titleQuality);
  const currentPublishedAt = new Date(current.publicationDatetime).getTime();
  const incomingPublishedAt = new Date(incoming.publicationDatetime).getTime();

  const preferred =
    incomingQualityRank > currentQualityRank
      ? incoming
      : incomingQualityRank < currentQualityRank
        ? current
        : incomingPublishedAt > currentPublishedAt
          ? incoming
          : current;
  const secondary = preferred === incoming ? current : incoming;
  const preferredIsSuspect = normalizeNewsTitleQuality(preferred.titleQuality) === 'suspect';
  const secondaryHasBetterTitle =
    preferredIsSuspect
    && newsTitleQualityRank(secondary.titleQuality) > newsTitleQualityRank(preferred.titleQuality);

  return {
    ...secondary,
    ...preferred,
    stableId: preferred.stableId || secondary.stableId,
    primarySection: preferred.primarySection || secondary.primarySection,
    sectionsNormalized: [...new Set([...secondary.sectionsNormalized, ...preferred.sectionsNormalized])] as NewsSection[],
    feedCategories: [...new Set([...secondary.feedCategories, ...preferred.feedCategories])],
    topics: [...new Set([...secondary.topics, ...preferred.topics])],
    snippetOriginal: preferred.snippetOriginal || secondary.snippetOriginal,
    titleOriginal: preferredIsSuspect && secondaryHasBetterTitle ? secondary.titleOriginal : preferred.titleOriginal,
    titleQuality: preferredIsSuspect && secondaryHasBetterTitle ? secondary.titleQuality : preferred.titleQuality,
    titleQualityReason: preferredIsSuspect && secondaryHasBetterTitle ? secondary.titleQualityReason : preferred.titleQualityReason,
    titleQualityCheckedAt: preferred.titleQualityCheckedAt || secondary.titleQualityCheckedAt,
    titleRepairStatus:
      preferredIsSuspect
        ? normalizeNewsTitleRepairStatus(preferred.titleRepairStatus || secondary.titleRepairStatus)
        : preferred.titleRepairStatus,
    titleRepairSource: preferred.titleRepairSource || secondary.titleRepairSource,
    titleRepairAttemptedAt: preferred.titleRepairAttemptedAt || secondary.titleRepairAttemptedAt,
    titleRepairedAt: preferred.titleRepairedAt || secondary.titleRepairedAt,
  };
}

export async function toNewsArticlePersistable(
  item: NewsItem,
  options: {
    publicationMaxAgeMs: number;
    storedTitleMaxChars: number;
    storedSnippetMaxChars: number;
    sha256Hex: (value: string) => Promise<string>;
  }
): Promise<NewsArticlePersistable | null> {
  const decodedLink = sanitizeTextForDatabase(decodeHtmlEntities(item.link || ''));
  const linkNorm = normalizeLinkForId(decodedLink);
  if (!linkNorm) return null;
  const ingestedAt = Date.now();
  const publicationTs = new Date(item.publishedAt).getTime();
  if (!Number.isFinite(publicationTs)) return null;
  if (options.publicationMaxAgeMs > 0 && publicationTs < ingestedAt - options.publicationMaxAgeMs) return null;

  const language = item.language ? sanitizeTextForDatabase(item.language) : null;
  const titleAssessment = assessNewsTitle({
    title: item.title || '',
    source: sanitizeTextForDatabase(item.source || ''),
    url: decodedLink,
    repairAttempted: Boolean(item.titleRepairAttemptedAt) || item.titleRepairStatus === 'failed' || item.titleRepairStatus === 'recovered',
    repairSource: sanitizeTitleRepairSource(item.titleRepairSource) || (item.titleQuality === 'recovered' ? 'article_page' : null),
  });
  const titleOriginal = truncatePersistedText(
    sanitizeTextForDatabase(titleAssessment.normalizedTitle || normalizeArticleTitle(item.title || '', decodedLink)),
    options.storedTitleMaxChars
  );
  if (!titleOriginal) return null;
  const rawSnippet = sanitizeTextForDatabase(normalizeHtmlText(item.description || ''));
  const snippetOriginal = rawSnippet ? truncatePersistedText(rawSnippet, options.storedSnippetMaxChars) : null;
  const feedCategories = normalizeSourceCategories(item.sourceCategories).map((entry) => sanitizeTextForDatabase(entry));
  const stableId =
    typeof item.stableId === 'string' && item.stableId.trim()
      ? sanitizeTextForDatabase(item.stableId.trim()).slice(0, 700)
      : null;
  const titleQuality = normalizeNewsTitleQuality(item.titleQuality || titleAssessment.quality);
  const titleQualityReason =
    sanitizeTextForDatabase((item.titleQualityReason || titleAssessment.qualityReason || '').trim()) || 'feed_title_ok';
  const titleQualityCheckedAt = item.titleQualityCheckedAt || new Date().toISOString();
  const titleRepairStatus = normalizeNewsTitleRepairStatus(item.titleRepairStatus || titleAssessment.repairStatus);
  const titleRepairSource = sanitizeTitleRepairSource(item.titleRepairSource || titleAssessment.repairSource || null);
  const titleRepairAttemptedAt =
    item.titleRepairAttemptedAt
    || (titleRepairStatus === 'failed' || titleRepairStatus === 'recovered' ? titleQualityCheckedAt : null);
  const titleRepairedAt =
    item.titleRepairedAt
    || (titleQuality === 'recovered' ? titleQualityCheckedAt : null);
  const taxonomy = buildArticleTaxonomy({
    storedSection: item.section,
    sourceCategories: feedCategories,
    source: item.source,
    url: decodedLink,
    title: titleOriginal,
    snippet: snippetOriginal,
  });

  return {
    externalId: await options.sha256Hex(linkNorm),
    stableId,
    publicationDatetime: normalizePublicationDatetimeAgainstIngest(item.publishedAt, ingestedAt),
    section: item.section ? sanitizeTextForDatabase(item.section) : null,
    primarySection: taxonomy.primarySection,
    sectionsNormalized: taxonomy.sections,
    feedCategories,
    primaryTopic: taxonomy.primaryTopic,
    topics: taxonomy.topics,
    titleOriginal,
    titleQuality,
    titleQualityReason,
    titleQualityCheckedAt,
    titleRepairStatus,
    titleRepairSource,
    titleRepairAttemptedAt,
    titleRepairedAt,
    snippetOriginal,
    country: item.country ? sanitizeTextForDatabase(item.country) : null,
    url: decodedLink,
    source: sanitizeTextForDatabase(item.source),
    language,
  };
}

export async function toMissingPublishedAtPersistable(
  item: {
    outletId: string;
    source: string;
    country: string;
    method: 'rss' | 'sitemap';
    link: string;
    title: string;
    description: string | null;
    language: string | null;
    section: string;
    categories: string[];
  },
  options: {
    storedTitleMaxChars: number;
    storedSnippetMaxChars: number;
    sha256Hex: (value: string) => Promise<string>;
  }
): Promise<MissingPublishedAtPersistable | null> {
  const decodedLink = sanitizeTextForDatabase(decodeHtmlEntities(item.link || ''));
  const linkNorm = normalizeLinkForId(decodedLink);
  if (!linkNorm) return null;
  const titleOriginal = truncatePersistedText(
    sanitizeTextForDatabase(normalizeArticleTitle(item.title || '', decodedLink)),
    options.storedTitleMaxChars
  );
  if (!titleOriginal) return null;
  const rawSnippet = sanitizeTextForDatabase(normalizeHtmlText(item.description || ''));
  const snippetOriginal = rawSnippet ? truncatePersistedText(rawSnippet, options.storedSnippetMaxChars) : null;
  const categories = [
    ...new Set(
      (item.categories || [])
        .map((entry) => sanitizeTextForDatabase(entry.trim()))
        .filter(Boolean)
    ),
  ];
  const idSource = `${item.outletId}|${item.method}|${linkNorm}`;

  return {
    candidateId: await options.sha256Hex(idSource),
    outletId: sanitizeTextForDatabase(item.outletId),
    source: sanitizeTextForDatabase(item.source),
    country: sanitizeTextForDatabase(item.country || 'Global'),
    method: item.method,
    url: decodedLink,
    titleOriginal,
    snippetOriginal,
    language: item.language ? sanitizeTextForDatabase(item.language) : null,
    section: item.section ? sanitizeTextForDatabase(item.section) : null,
    feedCategories: categories,
  };
}
