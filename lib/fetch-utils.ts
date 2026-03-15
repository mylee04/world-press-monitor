import { gunzipSync } from 'node:zlib';

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

export type DecodedResponseBody = {
  text: string;
  byteLength: number;
  decodeFailed: boolean;
};

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

function isLikelyGzipPayload(response: Response, bytes: Uint8Array, url = response.url || ''): boolean {
  const contentType = (response.headers.get('content-type') || '').toLowerCase();
  const contentEncoding = (response.headers.get('content-encoding') || '').toLowerCase();
  return (
    url.toLowerCase().endsWith('.gz') ||
    contentType.includes('gzip') ||
    contentEncoding.includes('gzip') ||
    (bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b)
  );
}

function decodeUtf8(bytes: Uint8Array): DecodedResponseBody {
  const byteLength = bytes.byteLength;
  try {
    return {
      text: new TextDecoder('utf-8', { fatal: true }).decode(bytes),
      byteLength,
      decodeFailed: false,
    };
  } catch {
    return {
      text: new TextDecoder('utf-8').decode(bytes),
      byteLength,
      decodeFailed: true,
    };
  }
}

export async function readResponseText(response: Response, url = response.url || ''): Promise<DecodedResponseBody> {
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!isLikelyGzipPayload(response, bytes, url)) {
    return decodeUtf8(bytes);
  }

  try {
    return decodeUtf8(new Uint8Array(gunzipSync(Buffer.from(bytes))));
  } catch {
    return decodeUtf8(bytes);
  }
}
