export type DraftStatus = 'draft' | 'approved' | 'published';
export type DistributionPlatform = 'twitter' | 'instagram' | 'linkedin' | 'tiktok' | 'newsletter';

export interface DistributionPayload {
  twitter: string;
  instagram: string;
  linkedin: string;
  tiktok: string;
  newsletter: string;
}

export interface DraftRecord {
  id: string;
  sourceArticleId: string;
  source: string;
  sourceLink: string;
  sourceTitle: string;
  sourcePublishedAt: string;
  status: DraftStatus;
  headlineEs: string;
  bodyEs: string;
  createdAt: string;
  updatedAt: string;
  approvedAt?: string;
  publishedAt?: string;
  distribution?: DistributionPayload;
}

export const DRAFT_STORAGE_KEY = 'presslab.drafts.v1';

export function nowIso(): string {
  return new Date().toISOString();
}

export function normalizeLinkForId(link: string): string {
  const clean = link.trim();
  if (!clean) return '';
  try {
    const url = new URL(clean);
    url.hash = '';
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'ocid', 'cmpid'].forEach((param) => {
      url.searchParams.delete(param);
    });
    return url.toString();
  } catch {
    return clean;
  }
}

export function draftIdFromLink(link: string): string {
  const normalized = normalizeLinkForId(link);
  return normalized || `draft-${Math.random().toString(36).slice(2, 10)}`;
}

export function parseDateSafe(value: string): number {
  const ts = new Date(value).getTime();
  return Number.isFinite(ts) ? ts : 0;
}

export function isLikelyBreakingTitle(title: string): boolean {
  const text = title.toLowerCase();
  return [
    'breaking',
    'urgent',
    'developing',
    'just in',
    'ultima hora',
    'última hora',
    'urgente',
    'en vivo',
    'alert',
    'flash'
  ].some((term) => text.includes(term));
}
