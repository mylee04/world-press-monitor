import {
  readNewsArticlesForApi,
  type NewsApiItem
} from '@/lib/ingestion-store';

type NewsApiResponse = {
  storage: 'postgres' | 'disabled';
  generatedAt: string | null;
  params: {
    limit: number;
    offset: number;
    hours?: number;
    from?: string | null;
    to?: string | null;
    sources: string[];
    countries: string[];
    sections: string[];
  };
  items: Array<NewsApiItem & { createdAt: string; updatedAt: string; publicationDatetime: string }>;
  reason?: string;
};

type HealthResponse = {
  status: 'ok' | 'degraded';
  checkedAt: string;
  storage: 'postgres' | 'disabled';
  reason?: string;
};

type ApiError = {
  error: string;
  message: string;
};

function parseIntParam(value: string | null, fallback: number, min: number, max: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function parseDateParam(value: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    throw new Error('invalid-date');
  }
  return parsed.toISOString();
}

function parseListParam(value: string | null): string[] {
  if (!value) return [];
  return [...new Set(
    value
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0)
  )];
}

function getQueryList(searchParams: URLSearchParams, key: string): string[] {
  const values = searchParams.getAll(key);
  return [...new Set(values.flatMap((value) => parseListParam(value)))];
}

function corsHeaders(origin: string | null): Record<string, string> {
  const configured = process.env.NEWS_API_CORS_ORIGINS || '';
  if (!configured) return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'authorization,content-type'
  };

  const allowed = configured.split(',').map((candidate) => candidate.trim()).filter(Boolean);
  const allowAny = allowed.includes('*');
  const normalizedOrigin = origin?.trim();
  if (allowAny || (normalizedOrigin && allowed.includes(normalizedOrigin))) {
    return {
      'Access-Control-Allow-Origin': normalizedOrigin || '*',
      'Access-Control-Allow-Methods': 'GET,OPTIONS',
      'Access-Control-Allow-Headers': 'authorization,content-type'
    };
  }

  return {
    'Access-Control-Allow-Origin': 'null',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'authorization,content-type'
  };
}

function jsonResponse(payload: unknown, status = 200, origin: string | null = null): Response {
  const headers = {
    ...corsHeaders(origin),
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  };
  return new Response(JSON.stringify(payload), { status, headers });
}

function unauthorizedResponse(origin: string | null): Response {
  return jsonResponse(
    {
      error: 'unauthorized',
      message: 'Missing or invalid NEWS_API_TOKEN'
    },
    401,
    origin
  );
}

function isAuthorized(req: Request): boolean {
  const token = process.env.NEWS_API_TOKEN?.trim() || '';
  const authHeader = req.headers.get('authorization') || '';
  return authHeader === `Bearer ${token}` || authHeader === token;
}

const port = Number(process.env.NEWS_API_PORT || '4100');
const host = process.env.NEWS_API_HOST || '0.0.0.0';
const requiredApiToken = process.env.NEWS_API_TOKEN?.trim() || '';

if (!requiredApiToken) {
  console.error('[api-news] NEWS_API_TOKEN is required. Set NEWS_API_TOKEN in environment before starting.');
  process.exit(1);
}

const server = Bun.serve({
  port,
  hostname: host,
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    const origin = req.headers.get('origin');

    if (req.method === 'OPTIONS') {
      return jsonResponse({}, 204, origin);
    }

    if (req.method !== 'GET') {
      return jsonResponse(
        {
          error: 'method_not_allowed',
          message: 'Only GET is supported.'
        },
        405,
        origin
      );
    }

    if (path === '/health') {
      const health = await readNewsArticlesForApi({ limit: 1 });
      const response: HealthResponse = {
        status: health.storage === 'postgres' ? 'ok' : 'degraded',
        checkedAt: new Date().toISOString(),
        storage: health.storage,
        reason: health.reason
      };
      return jsonResponse(response, 200, origin);
    }

    if (path === '/api/news') {
      if (!isAuthorized(req)) {
        return unauthorizedResponse(origin);
      }

      try {
        const sourceNames = getQueryList(url.searchParams, 'source');
        const countries = getQueryList(url.searchParams, 'country');
        const sections = getQueryList(url.searchParams, 'section');
        const limit = parseIntParam(url.searchParams.get('limit'), 100, 1, 200);
        const offset = parseIntParam(url.searchParams.get('offset'), 0, 0, 100000);
        const from = parseDateParam(url.searchParams.get('from'));
        const to = parseDateParam(url.searchParams.get('to'));
        const hours = parseIntParam(url.searchParams.get('hours'), 48, 1, 720);

        if (from && to && new Date(from).getTime() > new Date(to).getTime()) {
          return jsonResponse(
            {
              error: 'invalid_range',
              message: '`from` must be <= `to`.'
            },
            400,
            origin
          );
        }

        const news = await readNewsArticlesForApi({
          sourceNames,
          countries,
          sections,
          limit,
          offset,
          from,
          to,
          hours: from || to ? undefined : hours
        });

        if (news.storage === 'disabled') {
          const errorPayload: ApiError = {
            error: 'storage_unavailable',
            message: news.reason || 'News storage is not available.'
          };
          return jsonResponse(errorPayload, 503, origin);
        }

        const response: NewsApiResponse = {
          storage: news.storage,
          generatedAt: news.generatedAt,
          params: {
            limit,
            offset,
            hours: from || to ? undefined : hours,
            from,
            to,
            sources: sourceNames,
            countries,
            sections
          },
          items: news.items
        };
        return jsonResponse(response, 200, origin);
      } catch (error) {
        if (error instanceof Error && error.message === 'invalid-date') {
          return jsonResponse(
            {
              error: 'invalid_date',
              message: '`from` and `to` must be valid ISO date strings.'
            },
            400,
            origin
          );
        }

        console.error('[api-news] request failed', error);
        return jsonResponse(
          {
            error: 'internal_error',
            message: 'Failed to read news articles.'
          },
          500,
          origin
        );
      }
    }

    return jsonResponse(
      {
        error: 'not_found',
        message: 'Endpoint not found.'
      },
      404,
      origin
    );
  }
});

console.log(`[api-news] listening on http://${host}:${server.port}`);
