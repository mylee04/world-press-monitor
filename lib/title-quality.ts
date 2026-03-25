import {
  looksLikeLowSignalArticleTitle,
  normalizeArticleTitle,
  normalizeReadableArticleTitle,
} from '@/lib/html-entities';
import type {
  NewsTitleQuality,
  NewsTitleRepairSource,
  NewsTitleRepairStatus,
} from '@/lib/types';

export type AssessedNewsTitle = {
  normalizedTitle: string;
  readableTitle: string;
  quality: NewsTitleQuality;
  qualityReason: string;
  repairStatus: NewsTitleRepairStatus;
  repairSource: NewsTitleRepairSource | null;
};

const TITLE_QUALITY_RANK: Record<NewsTitleQuality, number> = {
  suspect: 0,
  ok: 1,
  recovered: 2,
};

export function normalizeNewsTitleQuality(value: string | null | undefined): NewsTitleQuality {
  return value === 'suspect' || value === 'recovered' ? value : 'ok';
}

export function normalizeNewsTitleRepairStatus(value: string | null | undefined): NewsTitleRepairStatus {
  return value === 'pending' || value === 'recovered' || value === 'failed' ? value : 'not_needed';
}

export function newsTitleQualityRank(value: NewsTitleQuality | string | null | undefined): number {
  return TITLE_QUALITY_RANK[normalizeNewsTitleQuality(value)];
}

export function isVisibleNewsTitleQuality(value: NewsTitleQuality | string | null | undefined): boolean {
  return normalizeNewsTitleQuality(value) !== 'suspect';
}

export function assessNewsTitle(params: {
  title: string;
  source?: string;
  url?: string;
  repairAttempted?: boolean;
  repairSource?: NewsTitleRepairSource | null;
}): AssessedNewsTitle {
  const source = params.source || '';
  const url = params.url || '';
  const normalizedTitle = normalizeArticleTitle(params.title || '', url);
  const readableTitle = normalizeReadableArticleTitle(params.title || '', url, source);
  const repairAttempted = Boolean(params.repairAttempted);
  const repairSource = params.repairSource || null;

  if (!normalizedTitle) {
    return {
      normalizedTitle: '',
      readableTitle: '',
      quality: 'suspect',
      qualityReason: 'missing_title',
      repairStatus: repairAttempted ? 'failed' : 'pending',
      repairSource,
    };
  }

  if (!looksLikeLowSignalArticleTitle(normalizedTitle, source, url) && readableTitle) {
    if (repairSource) {
      return {
        normalizedTitle,
        readableTitle,
        quality: 'recovered',
        qualityReason: repairSource === 'background' ? 'recovered_in_background' : 'recovered_from_article_page',
        repairStatus: 'recovered',
        repairSource,
      };
    }

    return {
      normalizedTitle,
      readableTitle,
      quality: 'ok',
      qualityReason: 'feed_title_ok',
      repairStatus: 'not_needed',
      repairSource: null,
    };
  }

  return {
    normalizedTitle,
    readableTitle: '',
    quality: 'suspect',
    qualityReason: 'low_signal_title',
    repairStatus: repairAttempted ? 'failed' : 'pending',
    repairSource,
  };
}
