export type SocialPlatform = 'instagram';

export type SocialAccountType =
  | 'business'
  | 'creator'
  | 'personal'
  | 'private'
  | 'unknown';

export type SocialVerificationStatus =
  | 'verified'
  | 'probable'
  | 'unverified';

export type SocialTrackingStatus =
  | 'trackable_via_api'
  | 'manual_only'
  | 'not_trackable'
  | 'no_account_found';

export type SocialSnapshotSourceMethod =
  | 'instagram_business_discovery'
  | 'instagram_public_web'
  | 'manual_capture';

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function extractInstagramHandleFromUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (!/instagram\.com$/i.test(url.hostname) && !/instagram\.com$/i.test(url.hostname.replace(/^www\./i, ''))) {
      return null;
    }
    const pathParts = url.pathname.split('/').map((part) => part.trim()).filter(Boolean);
    if (pathParts.length === 0) return null;
    const handle = pathParts[0];
    if (handle.startsWith('p') || handle.startsWith('reel') || handle.startsWith('stories')) return null;
    return handle;
  } catch {
    return null;
  }
}

export function normalizeInstagramHandle(value: string): string {
  const trimmed = normalizeWhitespace(value);
  if (!trimmed) return '';
  const fromUrl = extractInstagramHandleFromUrl(trimmed);
  const handle = fromUrl || trimmed;
  return handle
    .replace(/^@+/, '')
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\/+$/g, '')
    .replace(/\?.*$/g, '')
    .replace(/#.*$/g, '')
    .trim()
    .toLowerCase();
}

export function normalizeSocialHandle(platform: SocialPlatform, value: string): string {
  if (platform === 'instagram') return normalizeInstagramHandle(value);
  return normalizeWhitespace(value).toLowerCase();
}

export function buildSocialProfileUrl(platform: SocialPlatform, handle: string): string | null {
  const normalizedHandle = normalizeSocialHandle(platform, handle);
  if (!normalizedHandle) return null;
  if (platform === 'instagram') {
    return `https://www.instagram.com/${normalizedHandle}/`;
  }
  return null;
}

export function toSocialPlatform(value: string | null | undefined): SocialPlatform | null {
  const normalized = normalizeWhitespace(value || '').toLowerCase();
  return normalized === 'instagram' ? 'instagram' : null;
}

export function toSocialAccountType(value: string | null | undefined): SocialAccountType {
  const normalized = normalizeWhitespace(value || '').toLowerCase();
  if (normalized === 'business' || normalized === 'creator' || normalized === 'personal' || normalized === 'private') {
    return normalized;
  }
  return 'unknown';
}

export function toSocialVerificationStatus(value: string | null | undefined): SocialVerificationStatus {
  const normalized = normalizeWhitespace(value || '').toLowerCase();
  if (normalized === 'verified' || normalized === 'probable') return normalized;
  return 'unverified';
}

export function toSocialTrackingStatus(value: string | null | undefined): SocialTrackingStatus {
  const normalized = normalizeWhitespace(value || '').toLowerCase();
  if (
    normalized === 'trackable_via_api'
    || normalized === 'manual_only'
    || normalized === 'not_trackable'
    || normalized === 'no_account_found'
  ) {
    return normalized;
  }
  return 'manual_only';
}

export function isInstagramApiTrackableAccount(
  accountType: SocialAccountType,
  trackingStatus: SocialTrackingStatus
): boolean {
  return trackingStatus === 'trackable_via_api' && (accountType === 'business' || accountType === 'creator');
}
