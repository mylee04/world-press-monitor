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
  autoQueuedFrom?: 'major_watch' | 'social_x' | 'manual_discovery';
  distribution?: DistributionPayload;
}

export const DRAFT_STORAGE_KEY = 'presslab.drafts.v1';

export function nowIso(): string {
  return new Date().toISOString();
}

export function normalizeLinkForId(link: string): string {
  const clean = link.trim().replace(/&amp;/gi, '&');
  if (!clean) return '';

  const dropExactParams = new Set([
    'utm_source',
    'utm_medium',
    'utm_campaign',
    'utm_term',
    'utm_content',
    'utm_id',
    'gclid',
    'fbclid',
    'ocid',
    'cmpid',
    'ref',
    'output'
  ]);

  try {
    let target = clean;
    let redirectPass = 0;
    while (redirectPass < 2) {
      let parsed: URL;
      try {
        parsed = new URL(target);
      } catch {
        break;
      }

      const hostname = parsed.hostname.toLowerCase();
      if (!hostname.endsWith('bing.com') || !parsed.pathname.includes('/news/apiclick.aspx')) break;

      const wrapped = parsed.searchParams.get('url');
      if (!wrapped) break;

      let decoded = wrapped;
      try {
        decoded = decodeURIComponent(decoded);
      } catch {
      }
      if (!decoded || decoded === target) break;
      target = decoded.replace(/&amp;/gi, '&');
      redirectPass += 1;
    }

    const url = new URL(target);
    url.hash = '';

    const keptParams = [...url.searchParams.entries()]
      .filter(([key]) => {
        const lower = key.toLowerCase();
        if (lower.startsWith('utm_')) return false;
        return !dropExactParams.has(lower);
      })
      .sort(([aKey, aValue], [bKey, bValue]) => {
        if (aKey === bKey) return aValue.localeCompare(bValue);
        return aKey.localeCompare(bKey);
      });

    url.search = '';
    for (const [key, value] of keptParams) {
      url.searchParams.append(key, value);
    }

    url.protocol = url.protocol.toLowerCase();
    url.hostname = url.hostname.toLowerCase();
    if ((url.protocol === 'https:' && url.port === '443') || (url.protocol === 'http:' && url.port === '80')) {
      url.port = '';
    }

    if (url.pathname !== '/') {
      url.pathname = url.pathname.replace(/\/+$/, '');
    }

    return url.toString();
  } catch {
    return clean.replace(/\/+$/, '');
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
