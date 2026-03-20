import 'server-only';

import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export const CUSTOMER_PORTAL_TOKEN_COOKIE = 'wpr_customer_token';

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

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
  return (
    process.env.WORLDPRESSRADAR_API_BASE_URL ||
    process.env.NEWS_API_BASE_URL ||
    process.env.NEXT_PUBLIC_NEWS_API_BASE_URL ||
    ''
  ).trim().replace(/\/+$/, '');
}

export async function readCustomerPortalSession(): Promise<CustomerPortalSession> {
  const cookieStore = await cookies();
  const token = normalizeToken(cookieStore.get(CUSTOMER_PORTAL_TOKEN_COOKIE)?.value);
  const apiBaseUrl = getCustomerNewsApiBaseUrl();

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
  const apiBaseUrl = getCustomerNewsApiBaseUrl();

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
    const response = await fetch(url, {
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        Authorization: buildAuthorizationHeader(normalizedToken),
      },
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
    upstreamResponse = await fetch(upstreamUrl, {
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        Authorization: buildAuthorizationHeader(session.token),
      },
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
    headers: copyProxyHeaders(upstreamResponse.headers),
  });

  if (upstreamResponse.status === 401 || upstreamResponse.status === 403) {
    clearCustomerPortalSession(response);
  }

  return response;
}
