import { parseLooseDateMs } from './date-parsing';

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

export function normalizeFeedStableId(value: string): string {
  const clean = value.trim().replace(/&amp;/gi, '&');
  if (!clean) return '';
  if (/^https?:\/\//i.test(clean)) {
    return normalizeLinkForId(clean);
  }
  return clean
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 512);
}

export function buildFeedStableId(value: string, link = ''): string {
  const stableId = normalizeFeedStableId(value);
  if (!stableId) return '';

  const normalizedLink = normalizeLinkForId(link);
  const candidate = normalizedLink || link;
  try {
    const hostname = new URL(candidate).hostname.toLowerCase();
    return hostname ? `feed:${hostname}:${stableId}` : `feed:${stableId}`;
  } catch {
    return `feed:${stableId}`;
  }
}

export function deriveUrlArticleStableId(link: string): string {
  const normalizedLink = normalizeLinkForId(link);
  if (!normalizedLink) return '';
  try {
    const parsed = new URL(normalizedLink);
    const hostname = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname.replace(/\/+$/, '');
    const tail = pathname.split('/').filter(Boolean).pop() || '';
    if (!tail) return '';

    if (hostname.endsWith('ligeher.nu') && /^\d+$/.test(tail)) {
      return `article:${hostname}:${tail}`;
    }

    return '';
  } catch {
    return '';
  }
}

export function draftIdFromLink(link: string): string {
  const normalized = normalizeLinkForId(link);
  return normalized || `draft-${Math.random().toString(36).slice(2, 10)}`;
}

export function parseDateSafe(value: string): number {
  return parseLooseDateMs(value) ?? 0;
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
