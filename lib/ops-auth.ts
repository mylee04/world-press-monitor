import { createHash, timingSafeEqual } from 'node:crypto';

export const OPS_SESSION_COOKIE = 'wpr_ops_session';
export const OPS_DEFAULT_PATH = '/ops/';
export const OPS_LOGIN_PATH = '/ops/login/';

function toDigest(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

export function getOpsAccessSecret(): string {
  return (
    process.env.WPR_OPS_PASSWORD ||
    process.env.WPR_OPS_ACCESS_TOKEN ||
    process.env.WORLDPRESSRADAR_OPS_PASSWORD ||
    process.env.WORLDPRESSRADAR_API_TOKEN ||
    process.env.NEWS_API_TOKEN ||
    ''
  ).trim();
}

export function isOpsConfigured(): boolean {
  return getOpsAccessSecret().length > 0;
}

export function buildOpsSessionValue(secret = getOpsAccessSecret()): string {
  if (!secret) return '';
  return createHash('sha256').update(`wpr-ops:${secret}`).digest('hex');
}

export function isValidOpsPassword(password: string): boolean {
  const secret = getOpsAccessSecret();
  if (!secret) return false;
  const left = toDigest(password || '');
  const right = toDigest(secret);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function isValidOpsSessionToken(token: string | undefined | null): boolean {
  const expected = buildOpsSessionValue();
  if (!expected || !token) return false;
  const left = toDigest(token);
  const right = toDigest(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function normalizeOpsRedirectPath(value: string | undefined | null): string {
  if (!value) return OPS_DEFAULT_PATH;
  return value.startsWith('/ops') ? value : OPS_DEFAULT_PATH;
}
