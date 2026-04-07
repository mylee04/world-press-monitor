import 'server-only';

import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export const CUSTOMER_PORTAL_TOKEN_COOKIE = 'wpr_customer_token';

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const PORTAL_PROXY_TIMEOUT_MS = (() => {
  const raw = process.env.WPR_UPSTREAM_TIMEOUT_MS || process.env.NEWS_API_TIMEOUT_MS || '';
  const parsed = Number.parseInt(raw, 10);
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.max(3_000, Math.min(30_000, parsed));
  }
  return 10_000;
})();

type CustomerPortalSession = {
  apiBaseUrl: string;
  apiConfigured: boolean;
  token: string | null;
  hasToken: boolean;
};

function normalizeToken(value: string | null | undefined): string | null {
  const normalized = (value || '').trim();
  return normalized.length > 0 ? normalized : null;
}

function buildAuthorizationHeader(token: string): string {
  return /^bearer\s+/i.test(token) ? token : `Bearer ${token}`;
}

function normalizeHostValue(value: string): string {
  const normalized = value.trim().replace(/\/+$/, '');
  return normalized || '';
}

function resolveExplicitApiBaseUrl(...values: Array<string | null | undefined>): string {
  for (const value of values) {
    const normalized = normalizeHostValue(value || '');
    if (normalized) {
      return normalized;
    }
  }
  return '';
}

function resolveApiBaseUrlFromHostEnv(hostValue: string, portValue: string): string {
  const newsApiHost = normalizeHostValue(hostValue);
  if (!newsApiHost) {
    return '';
  }

  const newsApiPort = portValue.trim();
  const hostWithPort = newsApiPort
    ? `${newsApiHost.includes(':') ? newsApiHost : `${newsApiHost}:${newsApiPort}`}`
    : newsApiHost;
  const normalizedHost = hostWithPort === '0.0.0.0' || hostWithPort.startsWith('0.0.0.0:')
    ? hostWithPort.replace(/^0\.0\.0\.0/, '127.0.0.1')
    : hostWithPort;
  if (/^https?:\/\//i.test(normalizedHost)) {
    return normalizedHost.replace(/\/+$/, '');
  }
  return `http://${normalizedHost}`.replace(/\/+$/, '');
}

function getPortalServerApiToken(): string {
  return (
    process.env.WORLDPRESSRADAR_API_TOKEN ||
    process.env.NEWS_API_TOKEN ||
    ''
  ).trim();
}

function buildPortalUpstreamHeaders(token: string): HeadersInit {
  return {
    Accept: 'application/json',
    Authorization: buildAuthorizationHeader(token),
    // Cloudflare blocks some server-originated requests without a browser-like user agent.
    'User-Agent': 'WorldPressRadarPortal/1.0 (+https://app.worldpressradar.com)',
  };
}

function buildPortalTimeoutMessage(timeoutMs: number): string {
  return `Upstream request timed out after ${Math.round(timeoutMs / 1000)}s.`;
}

function logPortalServerProxy(
  level: 'info' | 'warn' | 'error',
  details: {
    portalPath: string;
    upstreamPath: string;
    upstreamOrigin: string;
    timeoutMs: number;
    durationMs?: number;
    status?: number;
    ok?: boolean;
    error?: string;
  }
) {
  const logger = level === 'error' ? console.error : level === 'warn' ? console.warn : console.info;
  logger('[portal-proxy] upstream request', details);
}

async function fetchPortalUpstream(input: string | URL, init: RequestInit, timeoutMs = PORTAL_PROXY_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(buildPortalTimeoutMessage(timeoutMs));
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function getCookieOptions(maxAge = SESSION_MAX_AGE_SECONDS) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge,
  };
}

export function getCustomerNewsApiBaseUrl(): string {
  const explicitBaseUrl = resolveExplicitApiBaseUrl(
    process.env.WORLDPRESSRADAR_API_BASE_URL ||
    process.env.NEWS_API_BASE_URL,
    process.env.NEXT_PUBLIC_NEWS_API_BASE_URL
  );
  if (explicitBaseUrl) {
    return explicitBaseUrl;
  }

  return resolveApiBaseUrlFromHostEnv(
    process.env.NEWS_API_HOST || process.env.HOST || process.env.NEXT_PUBLIC_NEWS_API_HOST || '',
    process.env.NEWS_API_PORT || process.env.NEXT_PUBLIC_NEWS_API_PORT || ''
  );
}

export function getPortalServerApiBaseUrl(): string {
  const internalBaseUrl = resolveExplicitApiBaseUrl(
    process.env.WPR_INTERNAL_API_BASE_URL,
    process.env.WORLDPRESSRADAR_INTERNAL_API_BASE_URL,
    process.env.NEWS_API_INTERNAL_BASE_URL
  );
  if (internalBaseUrl) {
    return internalBaseUrl;
  }

  return getCustomerNewsApiBaseUrl();
}

const PORTAL_CONFIG_ERROR_MESSAGES = new Set(
  [
    'Customer API base URL is not configured on the portal server.',
    'Internal API token is not configured on the portal server.',
  ].map((message) => message.trim().toLowerCase())
);

export function hasPortalServerApiProxyConfig(): boolean {
  return Boolean(getPortalServerApiBaseUrl() && getPortalServerApiToken());
}

export function isPortalConfigErrorMessage(message: string): boolean {
  return PORTAL_CONFIG_ERROR_MESSAGES.has(message.trim().toLowerCase());
}

export async function shouldUseLocalFallbackForPortalResponse(response: NextResponse): Promise<boolean> {
  if (response.status === 404) {
    return false;
  }

  const isRetryableStatus =
    response.status >= 500 || response.status === 401 || response.status === 403 || response.status === 502 || response.status === 503;

  if (!isRetryableStatus) {
    return false;
  }

  const clone = response.clone();
  let rawPayload = '';
  try {
    rawPayload = await clone.text();
  } catch {
    return true;
  }

  if (!rawPayload) {
    return true;
  }

  const normalizedPayload = rawPayload.trim();
  try {
    const parsed = JSON.parse(normalizedPayload) as
      | {
          message?: string;
          error?: string;
        }
      | string
      | unknown;

    if (typeof parsed === 'string') {
      return isPortalConfigErrorMessage(parsed);
    }

    if (parsed && typeof parsed === 'object') {
      const payloadMessage = typeof (parsed as { message?: unknown }).message === 'string'
        ? ((parsed as { message?: string }).message ?? '')
        : '';
      const payloadError = typeof (parsed as { error?: unknown }).error === 'string'
        ? ((parsed as { error?: string }).error ?? '')
        : '';
      if (isPortalConfigErrorMessage(payloadMessage) || isPortalConfigErrorMessage(payloadError)) {
        return true;
      }
    }
  } catch {
    if (isPortalConfigErrorMessage(normalizedPayload)) {
      return true;
    }
  }

  return true;
}

export async function readCustomerPortalSession(): Promise<CustomerPortalSession> {
  const cookieStore = await cookies();
  const token = normalizeToken(cookieStore.get(CUSTOMER_PORTAL_TOKEN_COOKIE)?.value);
  const apiBaseUrl = getPortalServerApiBaseUrl();

  return {
    apiBaseUrl,
    apiConfigured: apiBaseUrl.length > 0,
    token,
    hasToken: Boolean(token),
  };
}

function copyProxyHeaders(sourceHeaders: Headers): Headers {
  const headers = new Headers();
  const passthrough = [
    'content-type',
    'cache-control',
    'cdn-cache-control',
    'vercel-cdn-cache-control',
    'x-ratelimit-limit',
    'x-ratelimit-remaining',
    'retry-after',
  ];

  for (const key of passthrough) {
    const value = sourceHeaders.get(key);
    if (value) {
      headers.set(key, value);
    }
  }

  headers.set('cache-control', 'no-store');
  return headers;
}

function buildPortalProxyHeaders(sourceHeaders: Headers, headerOverrides?: Record<string, string>): Headers {
  const headers = copyProxyHeaders(sourceHeaders);
  for (const [key, value] of Object.entries(headerOverrides || {})) {
    headers.set(key, value);
  }
  return headers;
}

export function clearCustomerPortalSession(response: NextResponse): NextResponse {
  response.cookies.set(CUSTOMER_PORTAL_TOKEN_COOKIE, '', getCookieOptions(0));
  return response;
}

export function attachCustomerPortalSession(response: NextResponse, token: string): NextResponse {
  response.cookies.set(CUSTOMER_PORTAL_TOKEN_COOKIE, token, getCookieOptions());
  return response;
}

export async function validateCustomerPortalToken(token: string): Promise<{
  ok: boolean;
  status: number;
  message?: string;
}> {
  const normalizedToken = normalizeToken(token);
  const apiBaseUrl = getPortalServerApiBaseUrl();

  if (!apiBaseUrl) {
    return {
      ok: false,
      status: 503,
      message: 'Customer API base URL is not configured on the portal server.',
    };
  }

  if (!normalizedToken) {
    return {
      ok: false,
      status: 400,
      message: 'A customer token is required.',
    };
  }

  const url = new URL('/api/news', apiBaseUrl);
  url.searchParams.set('limit', '1');

  try {
    const response = await fetchPortalUpstream(url, {
      cache: 'no-store',
      headers: buildPortalUpstreamHeaders(normalizedToken),
    });

    if (response.ok) {
      return { ok: true, status: 200 };
    }

    if (response.status === 401 || response.status === 403) {
      return {
        ok: false,
        status: 401,
        message: 'Customer token was rejected by the upstream API.',
      };
    }

    const body = await response.text().catch(() => '');
    return {
      ok: false,
      status: 502,
      message: `Upstream validation failed with ${response.status}${body ? `: ${body.slice(0, 160)}` : ''}`,
    };
  } catch (error: unknown) {
    return {
      ok: false,
      status: 502,
      message: error instanceof Error ? error.message : 'Upstream validation failed.',
    };
  }
}

export async function proxyCustomerApiRequest(
  request: NextRequest,
  upstreamPath: string
): Promise<NextResponse> {
  const session = await readCustomerPortalSession();

  if (!session.apiConfigured) {
    return NextResponse.json(
      {
        error: 'portal_misconfigured',
        message: 'Customer API base URL is not configured on the portal server.',
      },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  if (!session.token) {
    return clearCustomerPortalSession(
      NextResponse.json(
        {
          error: 'unauthorized',
          message: 'A valid customer session is required.',
        },
        { status: 401, headers: { 'Cache-Control': 'no-store' } }
      )
    );
  }

  const upstreamUrl = new URL(upstreamPath, session.apiBaseUrl);
  upstreamUrl.search = request.nextUrl.searchParams.toString();

  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetchPortalUpstream(upstreamUrl, {
      cache: 'no-store',
      headers: buildPortalUpstreamHeaders(session.token),
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error: 'upstream_unavailable',
        message: error instanceof Error ? error.message : 'Upstream request failed.',
      },
      { status: 502, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const response = new NextResponse(upstreamResponse.body, {
    status: upstreamResponse.status,
    headers: buildPortalProxyHeaders(upstreamResponse.headers),
  });

  if (upstreamResponse.status === 401 || upstreamResponse.status === 403) {
    clearCustomerPortalSession(response);
  }

  return response;
}

export async function proxyPortalServerApiRequest(
  request: NextRequest,
  upstreamPath: string,
  options?: {
    cacheControl?: string;
    responseHeaders?: Record<string, string>;
    timeoutMs?: number;
  }
): Promise<NextResponse> {
  const apiBaseUrl = getPortalServerApiBaseUrl();
  const token = getPortalServerApiToken();

  if (!apiBaseUrl) {
    return NextResponse.json(
      {
        error: 'portal_misconfigured',
        message: 'Customer API base URL is not configured on the portal server.',
      },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  if (!token) {
    return NextResponse.json(
      {
        error: 'portal_misconfigured',
        message: 'Internal API token is not configured on the portal server.',
      },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const upstreamUrl = new URL(upstreamPath, apiBaseUrl);
  upstreamUrl.search = request.nextUrl.searchParams.toString();
  const timeoutMs = options?.timeoutMs ?? PORTAL_PROXY_TIMEOUT_MS;
  const requestStartedAt = Date.now();

  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetchPortalUpstream(upstreamUrl, {
      cache: 'no-store',
      headers: buildPortalUpstreamHeaders(token),
    },
    timeoutMs
    );
  } catch (error: unknown) {
    logPortalServerProxy('error', {
      portalPath: request.nextUrl.pathname,
      upstreamPath: upstreamUrl.pathname,
      upstreamOrigin: upstreamUrl.origin,
      timeoutMs,
      durationMs: Date.now() - requestStartedAt,
      error: error instanceof Error ? error.message : 'Upstream request failed.',
    });
    return NextResponse.json(
      {
        error: 'upstream_unavailable',
        message: error instanceof Error ? error.message : 'Upstream request failed.',
      },
      { status: 502, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const durationMs = Date.now() - requestStartedAt;
  const shouldWarn = !upstreamResponse.ok || durationMs >= Math.min(timeoutMs, 5_000);
  logPortalServerProxy(shouldWarn ? 'warn' : 'info', {
    portalPath: request.nextUrl.pathname,
    upstreamPath: upstreamUrl.pathname,
    upstreamOrigin: upstreamUrl.origin,
    timeoutMs,
    durationMs,
    status: upstreamResponse.status,
    ok: upstreamResponse.ok,
  });

  return new NextResponse(upstreamResponse.body, {
    status: upstreamResponse.status,
    headers: buildPortalProxyHeaders(
      upstreamResponse.headers,
      options?.responseHeaders || (options?.cacheControl ? { 'Cache-Control': options.cacheControl } : undefined)
    ),
  });
}
