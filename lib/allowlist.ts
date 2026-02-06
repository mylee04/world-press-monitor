import { OUTLET_FEEDS } from '@/data/outlets';

export const ALLOWED_DOMAINS = new Set(
  OUTLET_FEEDS
    .flatMap((outlet) => [outlet.rssUrl, outlet.sitemapUrl])
    .filter((value): value is string => Boolean(value))
    .map((urlValue) => {
      try {
        return new URL(urlValue).hostname;
      } catch {
        return '';
      }
    })
    .filter(Boolean)
);

export function isAllowedUrl(urlValue: string): boolean {
  try {
    const parsed = new URL(urlValue);
    return ALLOWED_DOMAINS.has(parsed.hostname);
  } catch {
    return false;
  }
}
