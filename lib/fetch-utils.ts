type RetryStatusCheck = (status: number) => boolean;

export type RetryFetchOptions = {
  timeoutMs?: number;
  attempts?: number;
  fetchOptions?: Omit<RequestInit, 'signal'>;
  isRetryableStatus?: RetryStatusCheck;
  backoffMs?: (attempt: number) => number;
};

const DEFAULT_TIMEOUT_MS = 12000;
const DEFAULT_ATTEMPTS = 1;

export function isSearchAggregatorUrl(url: string): boolean {
  return url.includes('news.google.com/rss/search') || url.includes('www.bing.com/news/search');
}

export function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 503 || status === 504;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchWithRetry(url: string, options: RetryFetchOptions = {}): Promise<Response> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const attempts = Math.max(1, options.attempts ?? DEFAULT_ATTEMPTS);
  const retryable = options.isRetryableStatus ?? isRetryableStatus;
  const backoffMs = options.backoffMs ?? (() => 250);
  const fetchOptions = options.fetchOptions || {};

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...fetchOptions,
        signal: controller.signal,
      });

      if (!retryable(response.status) || attempt === attempts - 1) {
        return response;
      }
    } catch (error) {
      if (attempt === attempts - 1) throw error;
    } finally {
      clearTimeout(timeout);
    }

    await sleep(backoffMs(attempt));
  }

  // Defensive fallback; loop should return/throw before this point.
  throw new Error('fetch_with_retry_exhausted');
}

