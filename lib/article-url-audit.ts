export type SuspiciousReason =
  | 'redirected_to_homepage'
  | 'redirected_to_section_landing'
  | 'final_path_too_shallow'
  | 'http_error'
  | 'network_error'
  | 'title_mismatch_on_shallow_path';

export type ArticleUrlAuditInput = {
  source: string;
  country: string;
  publicationDatetime: string | null;
  createdAt: string;
  url: string;
  title: string;
  timeoutMs: number;
};

export type ArticleUrlAuditResult = {
  source: string;
  country: string;
  publicationDatetime: string | null;
  createdAt: string;
  url: string;
  title: string;
  status: number | null;
  finalUrl: string | null;
  pageTitle: string;
  overlapScore: number;
  suspicious: boolean;
  reasons: SuspiciousReason[];
  error: string | null;
};

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36';
const HOME_PATHS = new Set(['', '/', '/home', '/home/', '/index.html']);
const LANDING_PATHS = new Set([
  '',
  '/',
  '/news',
  '/news/',
  '/latest',
  '/latest/',
  '/world',
  '/world/',
  '/en',
  '/en/',
  '/fr',
  '/fr/'
]);

export async function auditArticleUrl(input: ArticleUrlAuditInput): Promise<ArticleUrlAuditResult> {
  const base: ArticleUrlAuditResult = {
    source: input.source,
    country: input.country,
    publicationDatetime: input.publicationDatetime,
    createdAt: input.createdAt,
    url: input.url,
    title: input.title,
    status: null,
    finalUrl: null,
    pageTitle: '',
    overlapScore: 0,
    suspicious: false,
    reasons: [],
    error: null
  };

  try {
    const response = await fetch(input.url, {
      redirect: 'follow',
      headers: {
        'user-agent': DEFAULT_USER_AGENT,
        'accept-language': 'en-US,en;q=0.9'
      },
      signal: AbortSignal.timeout(input.timeoutMs)
    });

    const finalUrl = response.url || input.url;
    const contentType = response.headers.get('content-type') || '';
    const html = contentType.includes('text/html') ? await response.text() : '';
    const pageTitle = extractPageTitle(html.slice(0, 100_000));
    const overlapScore = titleOverlapScore(input.title, pageTitle);
    const reasons = classifyResult(input.url, finalUrl, response.status, overlapScore);

    return {
      ...base,
      status: response.status,
      finalUrl,
      pageTitle,
      overlapScore,
      suspicious: reasons.length > 0,
      reasons
    };
  } catch (error) {
    return {
      ...base,
      suspicious: true,
      reasons: ['network_error'],
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

export function isSafeLandingPruneCandidate(result: ArticleUrlAuditResult): boolean {
  if (result.error || result.status === null || result.status >= 400 || !result.finalUrl) {
    return false;
  }

  const reasonSet = new Set(result.reasons);
  if (reasonSet.has('http_error') || reasonSet.has('network_error')) {
    return false;
  }

  if (!sameSiteHost(result.url, result.finalUrl)) {
    return false;
  }

  if (reasonSet.has('redirected_to_homepage') || reasonSet.has('redirected_to_section_landing')) {
    return true;
  }

  return reasonSet.has('final_path_too_shallow') && reasonSet.has('title_mismatch_on_shallow_path');
}

function classifyResult(
  originalUrl: string,
  finalUrl: string,
  status: number,
  overlapScore: number
): SuspiciousReason[] {
  const reasons: SuspiciousReason[] = [];

  if (status >= 400) {
    reasons.push('http_error');
  }

  let original: URL;
  let landed: URL;
  try {
    original = new URL(originalUrl);
    landed = new URL(finalUrl);
  } catch {
    return reasons;
  }

  const originalDepth = pathDepth(original.pathname);
  const finalDepth = pathDepth(landed.pathname);
  const finalPath = landed.pathname.toLowerCase();

  if (original.hostname === landed.hostname && originalDepth >= 2 && HOME_PATHS.has(finalPath)) {
    reasons.push('redirected_to_homepage');
  } else if (originalDepth >= 2 && LANDING_PATHS.has(finalPath)) {
    reasons.push('redirected_to_section_landing');
  } else if (originalDepth >= 3 && finalDepth <= 1) {
    reasons.push('final_path_too_shallow');
  }

  if (finalDepth <= 1 && overlapScore === 0) {
    reasons.push('title_mismatch_on_shallow_path');
  }

  return [...new Set(reasons)];
}

function sameSiteHost(leftUrl: string, rightUrl: string): boolean {
  try {
    const left = new URL(leftUrl);
    const right = new URL(rightUrl);
    return normalizeHostname(left.hostname) === normalizeHostname(right.hostname);
  } catch {
    return false;
  }
}

function normalizeHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, '');
}

function pathDepth(pathname: string): number {
  return pathname.split('/').filter(Boolean).length;
}

function extractPageTitle(html: string): string {
  const ogTitle = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1];
  if (ogTitle) return decodeHtmlEntities(ogTitle);

  const metaTitle = html.match(/<meta[^>]+name=["']title["'][^>]+content=["']([^"']+)["']/i)?.[1];
  if (metaTitle) return decodeHtmlEntities(metaTitle);

  const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1];
  return title ? decodeHtmlEntities(title) : '';
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function normalizeTitle(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&[^;]+;/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function titleOverlapScore(articleTitle: string, pageTitle: string): number {
  const articleWords = new Set(normalizeTitle(articleTitle).split(/\s+/).filter((word) => word.length >= 4));
  const pageWords = new Set(normalizeTitle(pageTitle).split(/\s+/).filter((word) => word.length >= 4));
  if (!articleWords.size || !pageWords.size) return 0;

  let matches = 0;
  for (const word of articleWords) {
    if (pageWords.has(word)) matches += 1;
  }

  return Number((matches / Math.max(3, Math.min(articleWords.size, 8))).toFixed(2));
}
