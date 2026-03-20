#!/usr/bin/env bun

type JsonRecord = Record<string, unknown>;

const portalBaseUrl = (process.env.SMOKE_PORTAL_BASE_URL || 'https://app.worldpressradar.com').trim().replace(/\/+$/, '');
const apiBaseUrl = (process.env.SMOKE_API_BASE_URL || 'https://api.worldpressradar.com').trim().replace(/\/+$/, '');
const token =
  (process.env.SMOKE_CUSTOMER_TOKEN || process.env.CUSTOMER_PORTAL_SMOKE_TOKEN || '').trim();

function buildAuthorizationHeader(value: string): string {
  return /^bearer\s+/i.test(value) ? value : `Bearer ${value}`;
}

async function readJson<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

async function expectStatus(url: string, expectedStatus: number, init?: RequestInit): Promise<Response> {
  const response = await fetch(url, {
    cache: 'no-store',
    redirect: 'follow',
    ...init,
  });

  if (response.status !== expectedStatus) {
    const body = await response.text().catch(() => '');
    throw new Error(`Expected ${expectedStatus} from ${url}, got ${response.status}${body ? `: ${body.slice(0, 200)}` : ''}`);
  }

  return response;
}

async function expectData404(path: string): Promise<void> {
  await expectStatus(`${portalBaseUrl}${path}`, 404);
}

async function main() {
  if (!token) {
    throw new Error('SMOKE_CUSTOMER_TOKEN or CUSTOMER_PORTAL_SMOKE_TOKEN is required.');
  }

  await expectStatus(`${apiBaseUrl}/api/dashboard/summary`, 401);

  const upstreamSummary = await expectStatus(`${apiBaseUrl}/api/dashboard/summary`, 200, {
    headers: {
      Authorization: buildAuthorizationHeader(token),
    },
  });
  const upstreamSummaryPayload = await readJson<JsonRecord>(upstreamSummary);
  if (!upstreamSummaryPayload || typeof upstreamSummaryPayload !== 'object') {
    throw new Error('Authenticated API summary did not return JSON.');
  }

  const sessionResponse = await expectStatus(`${portalBaseUrl}/api/customer-access/`, 200, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ token }),
  });
  const setCookie = sessionResponse.headers.get('set-cookie');
  if (!setCookie) {
    throw new Error('Portal session did not return a session cookie.');
  }

  const cookieHeader = setCookie.split(';', 1)[0];

  await expectStatus(`${portalBaseUrl}/api/customer/news/?limit=1`, 200, {
    headers: {
      Cookie: cookieHeader,
    },
  });

  const filtersResponse = await expectStatus(`${portalBaseUrl}/api/customer/filters/`, 200, {
    headers: {
      Cookie: cookieHeader,
    },
  });
  const filtersPayload = await readJson<JsonRecord>(filtersResponse);
  const filters = filtersPayload?.filters as JsonRecord | undefined;
  if (!filters || !Array.isArray(filters.countries) || !Array.isArray(filters.sections)) {
    throw new Error('Portal filters response is missing expected arrays.');
  }

  const firstCountry = typeof filters.countries[0] === 'string' ? filters.countries[0] : '';
  const queryParams = new URLSearchParams({ limit: '2', offset: '0' });
  if (firstCountry) {
    queryParams.append('country', firstCountry);
  }

  const pagedNewsResponse = await expectStatus(`${portalBaseUrl}/api/customer/news/?${queryParams.toString()}`, 200, {
    headers: {
      Cookie: cookieHeader,
    },
  });
  const pagedNewsPayload = await readJson<JsonRecord>(pagedNewsResponse);
  if (!pagedNewsPayload || !Array.isArray(pagedNewsPayload.items)) {
    throw new Error('Portal news response is missing items.');
  }

  await expectStatus(`${portalBaseUrl}/api/customer/news/?limit=2&offset=2`, 200, {
    headers: {
      Cookie: cookieHeader,
    },
  });

  await expectData404('/data/manifest.json');
  await expectData404('/data%202/manifest.json');

  console.log('[customer-portal-smoke] API anonymous 401 verified.');
  console.log('[customer-portal-smoke] API authenticated 200 verified.');
  console.log('[customer-portal-smoke] Portal session, filters, and paginated news proxy verified.');
  console.log('[customer-portal-smoke] Portal data* routes return 404.');
}

void main().catch((error) => {
  console.error('[customer-portal-smoke] failed');
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
