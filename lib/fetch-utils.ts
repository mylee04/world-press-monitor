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

const CHARSET_ALIASES: Record<string, string> = {
  'utf8': 'utf-8',
  'utf-8': 'utf-8',
  'us-ascii': 'utf-8',
  'ascii': 'utf-8',
  'shift_jis': 'shift_jis',
  'shift-jis': 'shift_jis',
  'sjis': 'shift_jis',
  'windows-31j': 'shift_jis',
  'ms932': 'shift_jis',
  'cp932': 'shift_jis',
  'x-sjis': 'shift_jis',
  'euc-jp': 'euc-jp',
  'iso-2022-jp': 'iso-2022-jp',
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

function normalizeCharsetLabel(charset: string | null | undefined): string | null {
  const trimmed = (charset || '').trim().replace(/^["']|["']$/g, '').toLowerCase();
  if (!trimmed) return null;
  return CHARSET_ALIASES[trimmed] || trimmed;
}

function extractCharsetFromContentType(contentType: string | null): string | null {
  const value = (contentType || '').trim();
  if (!value) return null;
  const match = value.match(/charset\s*=\s*("?)([^;"'\s]+)\1/i);
  return normalizeCharsetLabel(match?.[2]);
}

function sniffHtmlCharset(bytes: Uint8Array): string | null {
  if (bytes.length === 0) return null;
  const head = Buffer.from(bytes.subarray(0, Math.min(bytes.length, 4096))).toString('latin1');
  const direct = head.match(/<meta[^>]+charset\s*=\s*["']?\s*([^"'>\s]+)/i);
  if (direct?.[1]) return normalizeCharsetLabel(direct[1]);
  const equiv = head.match(/<meta[^>]+content\s*=\s*["'][^"']*charset\s*=\s*([^"'>\s;]+)/i);
  if (equiv?.[1]) return normalizeCharsetLabel(equiv[1]);
  return null;
}

function decodeWithCharset(bytes: Uint8Array, charset: string): DecodedResponseBody | null {
  try {
    return {
      text: new TextDecoder(charset, { fatal: true }).decode(bytes),
      byteLength: bytes.byteLength,
      decodeFailed: false,
    };
  } catch {
    try {
      return {
        text: new TextDecoder(charset).decode(bytes),
        byteLength: bytes.byteLength,
        decodeFailed: true,
      };
    } catch {
      return null;
    }
  }
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

function decodeResponseBytes(response: Response, bytes: Uint8Array): DecodedResponseBody {
  const charsets = [
    extractCharsetFromContentType(response.headers.get('content-type')),
    sniffHtmlCharset(bytes),
  ].filter((value, index, array): value is string => Boolean(value) && array.indexOf(value) === index);

  for (const charset of charsets) {
    if (charset === 'utf-8') break;
    const decoded = decodeWithCharset(bytes, charset);
    if (decoded) return decoded;
  }

  return decodeUtf8(bytes);
}

export async function readResponseText(response: Response, url = response.url || ''): Promise<DecodedResponseBody> {
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!isLikelyGzipPayload(response, bytes, url)) {
    return decodeResponseBytes(response, bytes);
  }

  try {
    return decodeResponseBytes(response, new Uint8Array(gunzipSync(Buffer.from(bytes))));
  } catch {
    return decodeResponseBytes(response, bytes);
  }
}
