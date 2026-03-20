import {
  readNewsArticlesForApi,
  readNewsApiFilters,
  readNewsDashboardSummary,
  checkNewsDatabaseHealth,
  type NewsApiItem
} from '@/lib/ingestion-store';
import type {
  NewsApiDashboardSummaryResponse,
  NewsApiFiltersResponse,
  NewsApiResponse,
} from '@/lib/news-api';
import { createHash, timingSafeEqual } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

type HealthResponse = {
  status: 'ok' | 'degraded';
  checkedAt: string;
  storage: 'postgres' | 'disabled';
  reason?: string;
  latencyMs?: number;
  timeoutMs?: number;
};

type HealthzResponse = {
  status: 'ok';
  checkedAt: string;
  service: 'api-news';
};

type ApiError = {
  error: string;
  message: string;
};

type ApiRateLimitState = {
  requestCount: number;
  windowStart: number;
  blockedUntil: number;
};

type ApiRateLimitDecision = {
  limited: boolean;
  reason?: string;
  retryAfterSeconds?: number;
  remaining: number;
  limit: number;
};

type ApiPolicyRole = 'read' | 'admin';

type ApiAuthPolicy = {
  token: string;
  tokenHash: string;
  tenant: string | null;
  roles: Set<'read' | 'admin'>;
  allowedCountries?: string[];
  allowedSources?: string[];
  allowedSections?: string[];
  allowedLanguages?: string[];
  maxLimit: number;
};

type ApiAuthContext = {
  tokenHash: string;
  policy: ApiAuthPolicy;
};

const MAX_LIST_FILTER_VALUES = 50;
const MAX_FILTER_VALUE_LEN = 160;
const MAX_TOKEN_POLICY_VALUES = 500;
const MAX_TOKEN_VALUE_LEN = 800;
const REQUEST_AUDIT_PATH = resolve(process.cwd(), 'audits/api-news-audit.jsonl');
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'Cross-Origin-Resource-Policy': 'same-site',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
  'X-Permitted-Cross-Domain-Policies': 'none',
  'Content-Security-Policy':
    "default-src 'none'; base-uri 'none'; script-src 'self' https://cdn.jsdelivr.net 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:;"
};

const AUDIT_TTL_MS = 5 * 60 * 1000;
const NEWS_API_HEALTH_DB_TIMEOUT_MS = (() => {
  const raw = process.env.NEWS_API_HEALTH_DB_TIMEOUT_MS;
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.max(200, Math.min(15_000, parsed));
  }
  return 2_000;
})();
const apiAuditEntries = new Map<string, { expiresAt: number; remaining: number }>();

function getApiAuditKey(req: IncomingMessage): string {
  const ip = req.socket?.remoteAddress || 'unknown';
  const userAgent = getHeaderValue(req.headers, 'user-agent') || '';
  return `${ip}|${userAgent.slice(0, 24)}`;
}

function writeAuditLog(entry: {
  startMs: number;
  req: IncomingMessage;
  status: number;
  tokenHash?: string;
  path: string;
  reason?: string;
}): void {
  const key = getApiAuditKey(entry.req);
  const cached = apiAuditEntries.get(key);
  const now = Date.now();
  const remaining = cached && cached.expiresAt > now ? cached.remaining : 0;
  const remainingAfterUpdate = Math.max(0, remaining - 1);
  apiAuditEntries.set(key, { expiresAt: now + AUDIT_TTL_MS, remaining: remainingAfterUpdate });

  try {
    mkdirSync(resolve(process.cwd(), 'audits'), { recursive: true });
    const safeIp = entry.req.socket?.remoteAddress || 'unknown';
    const logPayload = {
      at: new Date(entry.startMs).toISOString(),
      status: entry.status,
      method: entry.req.method || 'GET',
      path: entry.path,
      tokenHash: entry.tokenHash || null,
      ip: safeIp,
      userAgent: getHeaderValue(entry.req.headers, 'user-agent'),
      reason: entry.reason || null,
      durationMs: Date.now() - entry.startMs
    };
    appendFileSync(REQUEST_AUDIT_PATH, `${JSON.stringify(logPayload)}\n`, 'utf8');
  } catch {
    // Ignore audit log failures intentionally to avoid breaking API traffic.
  }
}

function parsePolicyList(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return [...new Set(
      raw
        .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
        .filter((value) => value.length > 0)
        .slice(0, MAX_TOKEN_POLICY_VALUES)
    )];
  }
  return [...new Set(String(raw).split(',').map((entry) => entry.trim()).filter(Boolean))];
}

function normalizePolicyList(raw: unknown): string[] {
  return parsePolicyList(raw)
    .map((value) => value.toLowerCase())
    .filter(Boolean);
}

function isSafeAuthToken(raw: string): boolean {
  if (!raw) return false;
  if (raw.length > MAX_TOKEN_VALUE_LEN) return false;
  if (/[\r\n\0]/.test(raw)) return false;
  return true;
}

function normalizePolicyFilterValue(raw: unknown): string[] {
  return parsePolicyList(raw)
    .map((value) => value.toLowerCase())
    .filter(Boolean);
}

function parseTokenPolicies(): ApiAuthPolicy[] {
  const rawBaseTokens = parsePolicyList(process.env.NEWS_API_TOKEN || process.env.NEWS_API_TOKENS);
  const baseTokens: ApiAuthPolicy[] = [];
  for (const token of rawBaseTokens) {
    if (!isSafeAuthToken(token)) continue;
    baseTokens.push({
      token,
      tokenHash: createHash('sha256').update(token).digest('hex'),
      tenant: null,
      roles: new Set<'read' | 'admin'>(['read']),
      maxLimit: 200
    });
  }

  const configuredPolicies = process.env.NEWS_API_TOKEN_POLICIES || '';
  if (!configuredPolicies) return baseTokens;

  try {
    const parsed = JSON.parse(configuredPolicies) as unknown;
    if (Array.isArray(parsed)) {
      for (const item of parsed) {
        if (!item || typeof item !== 'object') continue;
        const token = (item as { token?: string }).token?.trim();
        if (!token) continue;
        if (!isSafeAuthToken(token)) continue;
        const maxLimitRaw = Number((item as { maxLimit?: string | number }).maxLimit);
        const maxLimit = Number.isFinite(maxLimitRaw) ? Math.max(1, Math.min(5000, Math.floor(maxLimitRaw))) : 200;
        const rawRoles = parsePolicyList((item as { roles?: unknown }).roles);
        const roles = rawRoles.length > 0
          ? new Set(rawRoles.filter((role): role is 'read' | 'admin' => role === 'read' || role === 'admin'))
          : new Set<'read' | 'admin'>(['read']);

        baseTokens.push({
          token,
          tokenHash: createHash('sha256').update(token).digest('hex'),
          tenant: String(((item as { tenant?: unknown }).tenant ?? '').toString().trim()) || null,
          roles,
          allowedCountries: normalizePolicyFilterValue((item as { allowedCountries?: unknown }).allowedCountries),
          allowedSources: normalizePolicyFilterValue((item as { allowedSources?: unknown }).allowedSources),
          allowedSections: normalizePolicyFilterValue((item as { allowedSections?: unknown }).allowedSections),
          allowedLanguages: normalizePolicyFilterValue((item as { allowedLanguages?: unknown }).allowedLanguages),
          maxLimit: roles.has('admin') ? 5000 : maxLimit
        });
      }
    }
  } catch {
    console.error('[api-news] invalid NEWS_API_TOKEN_POLICIES JSON, ignoring structured policy entries.');
  }
  const deduped = new Map<string, ApiAuthPolicy>();
  for (const policy of baseTokens) {
    deduped.set(policy.tokenHash, policy);
  }
  return [...deduped.values()];
}

const tokenPolicies = parseTokenPolicies();
const allowPublicReadOnly = /^1|true|yes$/i.test(process.env.NEWS_API_ALLOW_PUBLIC_READ_ONLY || 'false');
const publicReadRateLimitPerMinute = Math.max(
  1,
  Math.min(10_000, Number.parseInt(process.env.NEWS_API_PUBLIC_RATE_LIMIT_PER_MINUTE || '60', 10) || 60)
);
const publicReadMaxLimit = Math.max(
  1,
  Math.min(500, Number.parseInt(process.env.NEWS_API_PUBLIC_MAX_LIMIT || '100', 10) || 100)
);
const PUBLIC_READ_ONLY_TOKEN_HASH = 'public-read-only';
const publicReadPolicy: ApiAuthPolicy = {
  token: '',
  tokenHash: PUBLIC_READ_ONLY_TOKEN_HASH,
  tenant: null,
  roles: new Set<'read' | 'admin'>(['read']),
  maxLimit: publicReadMaxLimit
};

if (!tokenPolicies.length && !allowPublicReadOnly) {
  console.error('[api-news] NEWS_API_TOKEN or NEWS_API_TOKENS is required. Set it before starting.');
  process.exit(1);
}
if (!tokenPolicies.length && allowPublicReadOnly) {
  console.warn('[api-news] starting in public read-only mode without bearer tokens.');
}

const rateLimitPerMinute = Math.max(
  1,
  Math.min(10000, Number.parseInt(process.env.NEWS_API_RATE_LIMIT_PER_MINUTE || '120', 10) || 120)
);
const rateLimitBlockSeconds = Math.max(
  1,
  Math.min(600, Number.parseInt(process.env.NEWS_API_RATE_LIMIT_BLOCK_SECONDS || '30', 10) || 30)
);
const rateLimitWindowMs = 60_000;
const apiRateCounters = new Map<string, ApiRateLimitState>();
const allowPublicDocs = /^1|true|yes$/i.test(process.env.NEWS_API_ALLOW_PUBLIC_DOCS || 'false');

const maxOffset = Math.max(1, Math.min(100000, Number.parseInt(process.env.NEWS_API_MAX_OFFSET || '100000', 10) || 100000));

function getAuthToken(req: IncomingMessage): string {
  const header = getHeaderValue(req.headers, 'authorization');
  const trimmed = header.trim();
  if (!trimmed) return '';
  const match = trimmed.match(/^Bearer\s+(.+)$/i);
  return (match ? match[1] : trimmed).trim();
}

function secureTokenEquals(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  return timingSafeEqual(Buffer.from(left), Buffer.from(right));
}

function getMatchingAuthPolicy(authHeader: string): ApiAuthPolicy | undefined {
  for (const policy of tokenPolicies) {
    if (secureTokenEquals(authHeader, policy.token)) {
      return policy;
    }
  }
  return undefined;
}

function getAuthContext(req: IncomingMessage): ApiAuthContext | null {
  const token = getAuthToken(req);
  if (!token || !isSafeAuthToken(token)) return null;
  const policy = getMatchingAuthPolicy(token);
  if (!policy) return null;
  return { tokenHash: policy.tokenHash, policy };
}

function getPublicReadOnlyContext(): ApiAuthContext {
  return {
    tokenHash: PUBLIC_READ_ONLY_TOKEN_HASH,
    policy: publicReadPolicy
  };
}

function isTenantAllowed(policy: ApiAuthPolicy, req: IncomingMessage): boolean {
  if (!policy.tenant) return true;
  const tenantHeader = getHeaderValue(req.headers, 'x-tenant-id').trim().toLowerCase();
  if (!tenantHeader) return true;
  return tenantHeader === policy.tenant.toLowerCase();
}

function hasScopeOrError(values: string[], allowed: string[] | undefined): { values: string[]; denied: boolean } {
  if (!allowed || allowed.length === 0) {
    return { values, denied: false };
  }
  if (values.length === 0) {
    return { values: [...allowed], denied: false };
  }
  const lower = new Set(allowed.map((item) => item.toLowerCase()));
  const filtered = values.filter((value) => lower.has(value.toLowerCase()));
  return { values: filtered, denied: filtered.length === 0 };
}

function enforceRolePolicy(policy: ApiAuthPolicy, requiredRole: ApiPolicyRole): boolean {
  return policy.roles.has(requiredRole);
}

function getApiRateLimitKey(req: IncomingMessage, tokenHash: string): string {
  return `token:${tokenHash}`;
}

function checkRateLimit(key: string, limit: number): ApiRateLimitDecision {
  const now = Date.now();
  const current = apiRateCounters.get(key);
  if (!current) {
    apiRateCounters.set(key, { requestCount: 1, windowStart: now, blockedUntil: 0 });
    return { limited: false, remaining: limit - 1, limit };
  }

  if (current.blockedUntil && current.blockedUntil > now) {
    const retryAfterSeconds = Math.max(1, Math.ceil((current.blockedUntil - now) / 1000));
    return {
      limited: true,
      reason: 'blocked',
      retryAfterSeconds,
      remaining: 0,
      limit
    };
  }

  if (now - current.windowStart >= rateLimitWindowMs) {
    current.requestCount = 1;
    current.windowStart = now;
    current.blockedUntil = 0;
    apiRateCounters.set(key, current);
    return { limited: false, remaining: limit - 1, limit };
  }

  current.requestCount += 1;
  if (current.requestCount <= limit) {
    apiRateCounters.set(key, current);
    return { limited: false, remaining: Math.max(0, limit - current.requestCount), limit };
  }

  current.blockedUntil = now + rateLimitBlockSeconds * 1000;
  apiRateCounters.set(key, current);
  return {
    limited: true,
    reason: 'rate_limit_exceeded',
    retryAfterSeconds: rateLimitBlockSeconds,
    remaining: 0,
    limit
  };
}

function isAllowedFilterValue(value: string): boolean {
  if (!value) return false;
  if (value.length > MAX_FILTER_VALUE_LEN) return false;
  return !/[\u0000-\u001F<>`'"]/.test(value);
}

function normalizeFilterValues(values: string[]): string[] {
  return [...new Set(
    values
      .map((value) => value.trim().toLowerCase())
      .filter((value) => isAllowedFilterValue(value) && value.length > 0)
  )].slice(0, MAX_LIST_FILTER_VALUES);
}

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

function parseTextParam(value: string | null, maxLength: number): string | null {
  if (!value) return null;
  const normalized = value.replace(/[\u0000-\u001F]/g, ' ').trim();
  if (!normalized) return null;
  return normalized.slice(0, maxLength);
}

function parseListParam(value: string | null): string[] {
  if (!value) return [];
  const values = [...new Set(
    value
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0)
      .filter((entry) => entry.length <= MAX_FILTER_VALUE_LEN)
  )];
  return values.slice(0, MAX_LIST_FILTER_VALUES);
}

function getQueryList(searchParams: URLSearchParams, key: string): string[] {
  const values = searchParams.getAll(key);
  return [...new Set(values.flatMap((value) => parseListParam(value)))];
}

const configuredOrigins = (process.env.NEWS_API_CORS_ORIGINS || '')
  .split(',')
  .map((entry) => entry.trim())
  .filter(Boolean);

const allowAnyOrigin = configuredOrigins.includes('*');

function isAllowedOrigin(origin: string | null, requestHost: string | null): boolean {
  if (!origin) return false;
  if (!requestHost) return false;
  if (allowAnyOrigin) return true;
  if (configuredOrigins.length === 0) {
    try {
      const parsed = new URL(origin);
      return parsed.host === requestHost || parsed.hostname === requestHost.split(':')[0];
    } catch {
      return false;
    }
  }
  return configuredOrigins.includes(origin);
}

function corsHeaders(origin: string | null, requestHost: string | null): Record<string, string> {
  if (isAllowedOrigin(origin, requestHost)) {
    return {
      'Access-Control-Allow-Origin': origin || '*',
      'Access-Control-Allow-Methods': 'GET,OPTIONS',
      'Access-Control-Allow-Headers': 'authorization,content-type'
    };
  }
  return {};
}

type JsonResponse = {
  status: number;
  headers: Record<string, string>;
  body: string;
};

const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'PressLab News API',
    version: '1.0.0',
    description: 'Read-only API for News Articles ingested from RSS sources.'
  },
  servers: [
    {
      url: '/'
    }
  ],
  paths: {
    '/health': {
      get: {
        summary: 'Health check',
        responses: {
          200: {
            description: 'Service health'
          }
        }
      }
    },
    '/healthz': {
      get: {
        summary: 'Liveness probe endpoint',
        responses: {
          200: {
            description: 'Service is running'
          }
        }
      }
    },
    '/api/news': {
      get: {
        summary: 'List ingested news articles',
        parameters: [
          {
            name: 'limit',
            in: 'query',
            schema: { type: 'integer', minimum: 1, maximum: 200 },
            required: false,
            description: 'Max rows to return (1-200). Default 100.'
          },
          {
            name: 'offset',
            in: 'query',
            schema: { type: 'integer', minimum: 0 },
            required: false,
            description: 'Pagination offset.'
          },
          {
            name: 'hours',
            in: 'query',
            schema: { type: 'integer', minimum: 1, maximum: 720 },
            required: false,
            description: 'Window in hours (default 48).'
        },
        {
          name: 'from',
          in: 'query',
          schema: { type: 'string', format: 'date-time' },
          required: false,
          description: 'ISO datetime lower bound (UTC).'
        },
          {
            name: 'to',
            in: 'query',
            schema: { type: 'string', format: 'date-time' },
            required: false,
            description: 'ISO datetime upper bound (UTC).'
          },
          {
            name: 'source',
            in: 'query',
            schema: { type: 'string' },
            required: false,
            description: 'Optional source filter. Repeatable by comma-separated values.'
          },
          {
            name: 'country',
            in: 'query',
            schema: { type: 'string' },
            required: false,
            description: 'Optional country filter. Repeatable by comma-separated values.'
          },
          {
            name: 'section',
            in: 'query',
            schema: { type: 'string' },
            required: false,
            description: 'Optional section filter. Repeatable by comma-separated values.'
          },
          {
            name: 'q',
            in: 'query',
            schema: { type: 'string', maxLength: 120 },
            required: false,
            description: 'Optional keyword filter against title, snippet, source, and country.'
          },
          {
            name: 'language',
            in: 'query',
            schema: { type: 'string' },
            required: false,
            description: 'Optional language filter. Repeatable by comma-separated values.'
          },
          {
            name: 'publication_from',
            in: 'query',
            schema: { type: 'string', format: 'date-time' },
            required: false,
            description: 'Alias for publication_datetime lower bound (UTC).'
          },
        {
          name: 'publication_to',
          in: 'query',
          schema: { type: 'string', format: 'date-time' },
          required: false,
          description: 'Alias for publication_datetime upper bound (UTC).'
        },
        {
          name: 'min_createdAt',
          in: 'query',
          schema: { type: 'string', format: 'date-time' },
          required: false,
          description: 'Filter by created_at >= value (alias: min_created_at, created_from).'
        },
        {
          name: 'max_createdAt',
          in: 'query',
          schema: { type: 'string', format: 'date-time' },
          required: false,
          description: 'Filter by created_at <= value (alias: max_created_at, created_to).'
        },
        {
          name: 'min_updatedAt',
          in: 'query',
          schema: { type: 'string', format: 'date-time' },
          required: false,
          description: 'Filter by updated_at >= value (alias: min_updated_at).'
        },
        {
          name: 'max_updatedAt',
          in: 'query',
          schema: { type: 'string', format: 'date-time' },
          required: false,
          description: 'Filter by updated_at <= value (alias: max_updated_at).'
        }
        ],
        responses: {
          200: {
            description: 'Article list with metadata',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    storage: { type: 'string', enum: ['postgres', 'disabled'] },
                    generatedAt: { type: ['string', 'null'], format: 'date-time', nullable: true },
                    total: { type: 'integer' },
                    params: {
                      type: 'object',
                      properties: {
                        limit: { type: 'integer' },
                        offset: { type: 'integer' },
                        hours: { type: ['integer', 'null'] },
                        from: { type: ['string', 'null'], format: 'date-time' },
                        to: { type: ['string', 'null'], format: 'date-time' },
                        publicationFrom: { type: ['string', 'null'], format: 'date-time' },
                        publicationTo: { type: ['string', 'null'], format: 'date-time' },
                        minCreatedAt: { type: ['string', 'null'], format: 'date-time' },
                        maxCreatedAt: { type: ['string', 'null'], format: 'date-time' },
                        minUpdatedAt: { type: ['string', 'null'], format: 'date-time' },
                        maxUpdatedAt: { type: ['string', 'null'], format: 'date-time' },
                        q: { type: ['string', 'null'] },
                        sources: { type: 'array', items: { type: 'string' } },
                        countries: { type: 'array', items: { type: 'string' } },
                        sections: { type: 'array', items: { type: 'string' } },
                        languages: { type: 'array', items: { type: 'string' } }
                      }
                    },
                    items: {
                      type: 'array',
                      items: { type: 'object', additionalProperties: true }
                    }
                  }
                }
              }
            }
          },
          401: {
            description: 'Missing or invalid NEWS_API_TOKEN'
          },
          503: {
            description: 'Storage unavailable'
          }
        },
        security: [{ bearerAuth: [] }]
      }
    },
    '/api/filters': {
      get: {
        summary: 'Get available filter options for /api/news',
        responses: {
          200: {
            description: 'Filter options loaded from ingested articles',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    storage: { type: 'string', enum: ['postgres', 'disabled'] },
                    filters: {
                      type: 'object',
                      properties: {
                        countries: { type: 'array', items: { type: 'string' } },
                        languages: { type: 'array', items: { type: 'string' } },
                        sources: { type: 'array', items: { type: 'string' } },
                        sections: { type: 'array', items: { type: 'string' } }
                      }
                    },
                    reason: { type: 'string' }
                  }
                }
              }
            }
          },
          401: {
            description: 'Missing or invalid NEWS_API_TOKEN'
          },
          503: {
            description: 'Storage unavailable'
          }
        },
        security: [{ bearerAuth: [] }]
      }
    },
    '/api/dashboard/summary': {
      get: {
        summary: 'Get live dashboard summary for the ingested news window',
        parameters: [
          {
            name: 'window_days',
            in: 'query',
            schema: { type: 'integer', minimum: 1, maximum: 90 },
            required: false,
            description: 'Rolling publication window in days. Default 31.'
          },
          {
            name: 'latest_hours',
            in: 'query',
            schema: { type: 'integer', minimum: 1, maximum: 720 },
            required: false,
            description: 'Latest activity window in hours. Default 24.'
          },
          {
            name: 'preview_limit',
            in: 'query',
            schema: { type: 'integer', minimum: 1, maximum: 20 },
            required: false,
            description: 'Max preview headlines to return. Default 8.'
          },
          {
            name: 'top_countries_limit',
            in: 'query',
            schema: { type: 'integer', minimum: 1, maximum: 20 },
            required: false,
            description: 'Max preview countries to return. Default 6.'
          }
        ],
        responses: {
          200: {
            description: 'Dashboard summary backed by the live database'
          },
          503: {
            description: 'Storage unavailable'
          }
        },
        security: [{ bearerAuth: [] }]
      }
    }
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'token'
      }
    }
  }
} as const;

const filtersCacheTtlMs = Math.max(
  5_000,
  (Number(process.env.NEWS_API_FILTERS_CACHE_TTL_SECONDS || '180') || 180) * 1_000
);
const dashboardSummaryCacheTtlMs = Math.max(
  5_000,
  (Number(process.env.NEWS_API_DASHBOARD_CACHE_TTL_SECONDS || '60') || 60) * 1_000
);
type FilterCacheEntry = {
  payload: NewsApiFiltersResponse;
  timestamp: number;
};
let filtersCache: FilterCacheEntry | null = null;
type DashboardSummaryCacheEntry = {
  cacheKey: string;
  payload: NewsApiDashboardSummaryResponse;
  timestamp: number;
};
let dashboardSummaryCache: DashboardSummaryCacheEntry | null = null;

const docsHtml = `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>PressLab News API Docs</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css" />
    <style>
      body { margin: 0; }
      #swagger-ui { max-width: 1200px; margin: 0 auto; }
    </style>
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
    <script>
      window.onload = function () {
        SwaggerUIBundle({
          url: '/openapi.json',
          dom_id: '#swagger-ui',
          persistAuthorization: true
        });
      };
</script>
  </body>
</html>
`;

const playgroundHtml = `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>PressLab News API Playground</title>
    <style>
      :root {
        --bg: #0f172a;
        --panel: #111827;
        --text: #e5e7eb;
        --muted: #9ca3af;
        --accent: #38bdf8;
      }

      * {
        box-sizing: border-box;
      }
      body {
        margin: 0;
        background: linear-gradient(120deg, #020617, #0b1324 55%, #0f172a);
        color: var(--text);
        font-family: 'Inter', 'Segoe UI', Tahoma, sans-serif;
      }
      .wrap {
        max-width: 980px;
        margin: 0 auto;
        padding: 24px;
      }
      h1 {
        margin: 0 0 8px;
        font-size: 28px;
      }
      .sub {
        color: var(--muted);
        margin-bottom: 16px;
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 12px;
        margin-bottom: 12px;
      }
      label {
        display: block;
        margin-bottom: 8px;
        font-size: 12px;
        color: var(--muted);
      }
      input,
      select,
      button {
        width: 100%;
        border-radius: 10px;
        border: 1px solid #273244;
        background: var(--panel);
        color: var(--text);
        padding: 10px;
        font-size: 14px;
      }
      input::placeholder {
        color: #6b7280;
      }
      .actions {
        display: flex;
        gap: 8px;
        margin: 8px 0 12px;
      }
      .filter-actions {
        display: flex;
        gap: 6px;
        margin-bottom: 6px;
      }
      button {
        cursor: pointer;
        font-weight: 600;
      }
      .small-btn {
        width: auto;
        padding: 6px 10px;
        font-size: 12px;
        min-width: 80px;
      }
      .primary {
        background: linear-gradient(135deg, #2563eb, #7c3aed);
        border: none;
      }
      .secondary {
        background: #1f2937;
      }
      .status {
        font-size: 13px;
        color: var(--muted);
        margin: 8px 0;
      }
      .fieldsmall {
        font-size: 12px;
        margin-top: 6px;
        color: var(--muted);
        word-break: break-all;
      }
      pre {
        background: #030712dd;
        padding: 16px;
        border-radius: 12px;
        min-height: 220px;
        white-space: pre-wrap;
        border: 1px solid #273244;
      }
      .hidden {
        display: none;
      }
    </style>
  </head>
  <body>
    <div class="wrap">
      <h1>PressLab News API Playground</h1>
      <div class="sub">파라미터를 체크박스/드롭다운으로 고르고 가져온 데이터를 JSON/다운로드로 확인하세요.</div>

      <div>
        <label>API Base URL</label>
        <input id="baseUrl" value="" placeholder="예: https://api.worldpressradar.com" />
      </div>
      <div>
        <label>Authorization Token</label>
        <input id="token" value="" placeholder="Bearer 또는 토큰만 입력" />
      </div>

      <div class="actions">
        <button class="primary" id="loadFiltersBtn">Load Filter Options</button>
      </div>

      <div class="grid">
        <div>
          <label>Countries (multi-select)</label>
          <div class="filter-actions">
            <button type="button" class="small-btn secondary" data-select-action="all" data-select-target="countries">전체 선택</button>
            <button type="button" class="small-btn secondary" data-select-action="clear" data-select-target="countries">전체 해제</button>
          </div>
          <select id="countries" multiple size="6"></select>
        </div>
        <div>
          <label>Languages (multi-select)</label>
          <div class="filter-actions">
            <button type="button" class="small-btn secondary" data-select-action="all" data-select-target="languages">전체 선택</button>
            <button type="button" class="small-btn secondary" data-select-action="clear" data-select-target="languages">전체 해제</button>
          </div>
          <select id="languages" multiple size="6"></select>
        </div>
        <div>
          <label>Sources (multi-select)</label>
          <div class="filter-actions">
            <button type="button" class="small-btn secondary" data-select-action="all" data-select-target="sources">전체 선택</button>
            <button type="button" class="small-btn secondary" data-select-action="clear" data-select-target="sources">전체 해제</button>
          </div>
          <select id="sources" multiple size="6"></select>
        </div>
        <div>
          <label>Sections (multi-select)</label>
          <div class="filter-actions">
            <button type="button" class="small-btn secondary" data-select-action="all" data-select-target="sections">전체 선택</button>
            <button type="button" class="small-btn secondary" data-select-action="clear" data-select-target="sections">전체 해제</button>
          </div>
          <select id="sections" multiple size="6"></select>
        </div>
      </div>

      <div class="grid">
        <div>
          <label>created_from</label>
          <input id="createdFrom" type="datetime-local" />
        </div>
        <div>
          <label>created_to</label>
          <input id="createdTo" type="datetime-local" />
        </div>
        <div>
          <label>updated_from</label>
          <input id="updatedFrom" type="datetime-local" />
        </div>
        <div>
          <label>updated_to</label>
          <input id="updatedTo" type="datetime-local" />
        </div>
        <div>
          <label>publication_from</label>
          <input id="publicationFrom" type="datetime-local" />
        </div>
        <div>
          <label>publication_to</label>
          <input id="publicationTo" type="datetime-local" />
        </div>
        <div>
          <label>hours</label>
          <input id="hours" type="number" min="1" max="720" value="48" />
        </div>
        <div>
          <label>limit</label>
          <input id="limit" type="number" min="1" max="200" value="100" />
        </div>
        <div>
          <label>offset</label>
          <input id="offset" type="number" min="0" value="0" />
        </div>
        <div>
          <label>keyword</label>
          <input id="keyword" type="text" placeholder="title, snippet, source, country" />
        </div>
      </div>

      <div class="actions">
        <button class="primary" id="fetchBtn">Fetch</button>
        <button class="secondary" id="downloadBtn" disabled>Download JSON</button>
        <button class="secondary" id="downloadCsvBtn" disabled>Download CSV</button>
      </div>
      <div class="status" id="status">Ready</div>
      <div class="fieldsmall" id="urlLine">Query URL: </div>

      <pre id="result">No data yet.</pre>
    </div>

    <script>
      const storage = window.localStorage;
      const baseUrlInput = document.getElementById('baseUrl');
      const tokenInput = document.getElementById('token');
      const countriesSelect = document.getElementById('countries');
      const languagesSelect = document.getElementById('languages');
      const sourcesSelect = document.getElementById('sources');
      const sectionsSelect = document.getElementById('sections');
      const publicationFromInput = document.getElementById('publicationFrom');
      const publicationToInput = document.getElementById('publicationTo');
      const createdFromInput = document.getElementById('createdFrom');
      const createdToInput = document.getElementById('createdTo');
      const updatedFromInput = document.getElementById('updatedFrom');
      const updatedToInput = document.getElementById('updatedTo');
      const hoursInput = document.getElementById('hours');
      const limitInput = document.getElementById('limit');
      const offsetInput = document.getElementById('offset');
      const keywordInput = document.getElementById('keyword');
      const fetchBtn = document.getElementById('fetchBtn');
      const downloadBtn = document.getElementById('downloadBtn');
      const downloadCsvBtn = document.getElementById('downloadCsvBtn');
      const loadFiltersBtn = document.getElementById('loadFiltersBtn');
      const statusEl = document.getElementById('status');
      const urlLine = document.getElementById('urlLine');
      const resultEl = document.getElementById('result');

      const host = window.location.origin;
      const saved = {
        baseUrl: storage.getItem('wpm-playground-base') || host,
        token: storage.getItem('wpm-playground-token') || ''
      };
      baseUrlInput.value = saved.baseUrl;
      tokenInput.value = saved.token;

      let lastPayload = null;

      function getSelectedCsv(selectEl) {
        return Array.from(selectEl.selectedOptions)
          .map((option) => option.value)
          .filter(Boolean)
          .join(',');
      }

      function fillOptions(selectEl, items) {
        while (selectEl.firstChild) {
          selectEl.removeChild(selectEl.firstChild);
        }
        if (!items.length) {
          const option = document.createElement('option');
          option.value = '';
          option.textContent = 'No options';
          selectEl.appendChild(option);
          selectEl.disabled = true;
          return;
        }
        selectEl.disabled = false;
        for (const value of items) {
          const option = document.createElement('option');
          option.value = value;
          option.textContent = value;
          selectEl.appendChild(option);
        }
      }

      function setAllOptions(selectEl, selected) {
        for (const option of Array.from(selectEl.options)) {
          option.selected = selected;
        }
      }

      function wireFilterButtons() {
        for (const button of document.querySelectorAll('[data-select-action][data-select-target]')) {
          button.addEventListener('click', () => {
            const target = button.getAttribute('data-select-target');
            const action = button.getAttribute('data-select-action');
            const element = target ? document.getElementById(target) : null;
            if (!(element instanceof HTMLSelectElement)) return;
            setAllOptions(element, action === 'all');
          });
        }
      }

      function toIso(value) {
        if (!value) return '';
        const parsed = new Date(value);
        if (Number.isNaN(parsed.getTime())) return '';
        return parsed.toISOString();
      }

      function tokenHeader() {
        const raw = tokenInput.value.trim();
        if (!raw) return {};
        return raw.startsWith('Bearer ')
          ? { Authorization: raw }
          : { Authorization: 'Bearer '.concat(raw) };
      }

      function filtersEndpoint() {
        const baseUrl = baseUrlInput.value.trim().replace(/\/+$/, '') || host;
        return baseUrl + '/api/filters';
      }

      async function loadFilterOptions() {
        const headers = {
          Accept: 'application/json',
          ...tokenHeader()
        };
        statusEl.textContent = 'Loading options...';
        try {
          const response = await fetch(filtersEndpoint(), { headers });
          const text = await response.text();
        if (!response.ok) {
            throw new Error('HTTP ' + response.status + ': ' + text);
          }
          const payload = JSON.parse(text);
          if (payload.storage === 'disabled') {
            throw new Error('Storage disabled: ' + (payload.reason || 'storage unavailable'));
          }
          const filters = payload.filters || {};
          fillOptions(countriesSelect, filters.countries || []);
          fillOptions(languagesSelect, filters.languages || []);
          fillOptions(sourcesSelect, filters.sources || []);
          fillOptions(sectionsSelect, filters.sections || []);
          statusEl.textContent = 'Filter options loaded';
        } catch (error) {
          fillOptions(countriesSelect, []);
          fillOptions(languagesSelect, []);
          fillOptions(sourcesSelect, []);
          fillOptions(sectionsSelect, []);
          statusEl.textContent = String(error);
        }
      }

      function buildUrl() {
        const baseUrl = baseUrlInput.value.trim().replace(/\/+$/, '') || host;
        const params = new URLSearchParams();

        const countries = getSelectedCsv(countriesSelect);
        const languages = getSelectedCsv(languagesSelect);
        const sources = getSelectedCsv(sourcesSelect);
        const sections = getSelectedCsv(sectionsSelect);
        const limit = limitInput.value.trim();
        const offset = offsetInput.value.trim();
        const hours = hoursInput.value.trim();
        const keyword = keywordInput.value.trim();
        const publicationFrom = toIso(publicationFromInput.value);
        const publicationTo = toIso(publicationToInput.value);
        const createdFrom = toIso(createdFromInput.value);
        const createdTo = toIso(createdToInput.value);
        const updatedFrom = toIso(updatedFromInput.value);
        const updatedTo = toIso(updatedToInput.value);

        if (countries) params.set('country', countries);
        if (languages) params.set('language', languages);
        if (sources) params.set('source', sources);
        if (sections) params.set('section', sections);
        if (hours) params.set('hours', hours);
        if (limit) params.set('limit', limit);
        if (offset) params.set('offset', offset);
        if (keyword) params.set('q', keyword);
        if (publicationFrom) params.set('publication_from', publicationFrom);
        if (publicationTo) params.set('publication_to', publicationTo);
        if (createdFrom) params.set('created_from', createdFrom);
        if (createdTo) params.set('created_to', createdTo);
        if (updatedFrom) params.set('updated_from', updatedFrom);
        if (updatedTo) params.set('updated_to', updatedTo);

        const query = params.toString();
        return baseUrl + '/api/news' + (query ? '?' + query : '');
      }

      async function fetchNews() {
        const apiUrl = buildUrl();
        urlLine.textContent = 'Query URL: ' + apiUrl;
        statusEl.textContent = 'Requesting...';
        downloadBtn.disabled = true;
        downloadCsvBtn.disabled = true;

        try {
          const headers = {
            ...tokenHeader(),
            Accept: 'application/json'
          };

          const response = await fetch(apiUrl, { headers });
      const text = await response.text();
      if (!response.ok) {
          throw new Error('HTTP ' + response.status + ': ' + text);
      }
      const payload = JSON.parse(text);
      lastPayload = payload;
      resultEl.textContent = JSON.stringify(payload, null, 2);
      const total = typeof payload.total === 'number' ? payload.total : 0;
      const returned = Array.isArray(payload.items) ? payload.items.length : 0;
          statusEl.textContent = 'OK - total ' + total + ', returned ' + returned;
          downloadBtn.disabled = false;
          downloadCsvBtn.disabled = false;
          storage.setItem('wpm-playground-base', baseUrlInput.value.trim() || window.location.origin);
          storage.setItem('wpm-playground-token', tokenInput.value.trim());
        } catch (error) {
          lastPayload = null;
          resultEl.textContent = String(error);
          statusEl.textContent = 'Failed';
          downloadBtn.disabled = true;
          downloadCsvBtn.disabled = true;
        }
      }

      function escapeCsvValue(value) {
        const asString = value === null || value === undefined ? '' : String(value);
        const normalized = asString.replace(/\r/g, ' ').replace(/\n/g, ' ');
        return '"' + normalized.replace(/"/g, '""') + '"';
      }

      function downloadCsv() {
        if (!lastPayload || !Array.isArray(lastPayload.items)) return;
        const csvColumns = [
          'id',
          'source',
          'title',
          'snippet',
          'url',
          'country',
          'language',
          'section',
          'publicationDatetime',
          'createdAt',
          'updatedAt'
        ];
        const rows = [];
        rows.push('# total,' + (typeof lastPayload.total === 'number' ? lastPayload.total : 0));
        rows.push(csvColumns.map((column) => escapeCsvValue(column)).join(','));
        for (const item of lastPayload.items) {
          rows.push(csvColumns.map((column) => escapeCsvValue(item[column])).join(','));
        }
        const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' });
        const href = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const ts = new Date().toISOString().replace(/[:.]/g, '-');
        a.href = href;
        a.download = 'news-api-response-' + ts + '.csv';
        a.click();
        URL.revokeObjectURL(href);
      }

      function downloadJson() {
        if (!lastPayload) return;
        const blob = new Blob([JSON.stringify(lastPayload, null, 2)], { type: 'application/json;charset=utf-8' });
        const href = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const ts = new Date().toISOString().replace(/[:.]/g, '-');
        a.href = href;
        a.download = 'news-api-response-' + ts + '.json';
        a.click();
        URL.revokeObjectURL(href);
      }

      fetchBtn.addEventListener('click', fetchNews);
      loadFiltersBtn.addEventListener('click', loadFilterOptions);
      downloadBtn.addEventListener('click', downloadJson);
      downloadCsvBtn.addEventListener('click', downloadCsv);
      wireFilterButtons();

      (async () => {
        loadFilterOptions();
      })();
    </script>
  </body>
</html>
`;

const docsResponse = {
  status: 200,
  headers: {
    'content-type': 'text/html; charset=utf-8'
  },
  body: docsHtml
};

const playgroundResponse = {
  status: 200,
  headers: {
    'content-type': 'text/html; charset=utf-8'
  },
  body: playgroundHtml
};

function jsonResponse(payload: unknown, status = 200): JsonResponse {
  const headers = {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  };
  return {
    status,
    headers,
    body: JSON.stringify(payload),
  };
}

function unauthorizedResponse(): JsonResponse {
  return jsonResponse({
    error: 'unauthorized',
    message: 'Missing or invalid NEWS_API_TOKEN'
  }, 401);
}

function getHeaderValue(headers: IncomingMessage['headers'], key: string): string {
  const value = headers[key.toLowerCase()];
  if (Array.isArray(value)) {
    return value[0] || '';
  }
  return value || '';
}

function applyFilterValues(values: string[], allowed: string[] | undefined): string[] {
  if (!allowed || allowed.length === 0) return values;
  const allowedSet = new Set(allowed.map((value) => value.toLowerCase()));
  return values.filter((value) => allowedSet.has(value.toLowerCase()));
}

function formatRateLimitHeaders(decision: ApiRateLimitDecision): Record<string, string> {
  const headers: Record<string, string> = {
    'X-RateLimit-Limit': String(decision.limit),
    'X-RateLimit-Remaining': String(decision.remaining),
  };
  if (decision.retryAfterSeconds && decision.retryAfterSeconds > 0) {
    headers['Retry-After'] = String(decision.retryAfterSeconds);
  }
  return headers;
}

function sendJsonResponse(
  req: IncomingMessage,
  res: ServerResponse,
  response: JsonResponse,
  rateLimitDecision?: ApiRateLimitDecision
): void {
  const origin = getHeaderValue(req.headers, 'origin');
  const requestHost = req.headers.host || `${host}:${port}`;
  const cors = corsHeaders(origin, requestHost);

  res.statusCode = response.status;
  const headers = {
    ...SECURITY_HEADERS,
    ...response.headers,
    ...cors,
    ...(rateLimitDecision ? formatRateLimitHeaders(rateLimitDecision) : {}),
    Vary: origin ? 'Origin' : 'Origin'
  };

  for (const [key, value] of Object.entries(headers)) {
    res.setHeader(key, value);
  }
  res.end(response.body);
}

function sendHtmlResponse(req: IncomingMessage, res: ServerResponse, response: { status: number; headers: Record<string, string>; body: string }): void {
  sendJsonResponse(
    req,
    res,
    {
      status: response.status,
      headers: {
        'content-type': response.headers['content-type'],
        'cache-control': response.headers['cache-control'] || 'no-store'
      },
      body: response.body
    }
  );
}

const port = Number(process.env.NEWS_API_PORT || '4100');
const host = process.env.NEWS_API_HOST || '0.0.0.0';
const apiDocPaths = new Set(['/openapi.json', '/docs', '/playground', '/ui']);
const publicReadPaths = new Set(['/api/news', '/api/filters', '/api/dashboard/summary']);

const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  const requestStart = Date.now();
  if (!req.url) {
    sendJsonResponse(req, res, jsonResponse({ error: 'bad_request', message: 'Missing request URL.' }, 400));
    return;
  }

  const url = new URL(req.url, `http://${host}:${port}`);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const origin = getHeaderValue(req.headers, 'origin');
  const requestHost = req.headers.host || `${host}:${port}`;
  const method = (req.method || 'GET').toUpperCase();
  const explicitContext = getAuthContext(req);
  const isDocPath = apiDocPaths.has(path);
  const isHealthPath = path === '/health' || path === '/healthz';
  const publicReadContext =
    !explicitContext && allowPublicReadOnly && publicReadPaths.has(path) ? getPublicReadOnlyContext() : null;
  const context = explicitContext || publicReadContext;
  const isPublicReadContext = Boolean(publicReadContext);
  const requiresAuth = !isHealthPath && !(allowPublicDocs && isDocPath) && !isPublicReadContext;
  const policy = context?.policy;
  const isAdminEndpoint = isDocPath;
  const requiredRole: ApiPolicyRole = isAdminEndpoint ? 'admin' : 'read';

  const rateLimitDecision = context
    ? checkRateLimit(
      isPublicReadContext
        ? `public:${req.socket?.remoteAddress || 'unknown'}`
        : getApiRateLimitKey(req, context.tokenHash),
      isPublicReadContext
        ? publicReadRateLimitPerMinute
        : Math.max(1, Math.min(5000, policy?.maxLimit ?? rateLimitPerMinute))
    )
    : undefined;

  if (method === 'OPTIONS') {
    if (origin && !isAllowedOrigin(origin, requestHost)) {
      sendJsonResponse(
        req,
        res,
        jsonResponse(
          {
            error: 'forbidden_origin',
            message: 'CORS denied for this origin.'
          },
          403
        )
      );
      return;
    }
    sendJsonResponse(req, res, jsonResponse({}, 204), rateLimitDecision);
    return;
  }

  if (rateLimitDecision?.limited) {
    sendJsonResponse(
      req,
      res,
      jsonResponse(
        {
          error: 'rate_limited',
          message: 'Too many requests. Please retry after a short wait.'
        },
        429
      ),
      rateLimitDecision
    );
    return;
  }

  if (path === '/healthz') {
    const response: HealthzResponse = {
      status: 'ok',
      checkedAt: new Date().toISOString(),
      service: 'api-news'
    };
    sendJsonResponse(req, res, jsonResponse(response, 200), rateLimitDecision);
    return;
  }

  if (requiresAuth) {
    if (!context || !enforceRolePolicy(context.policy, requiredRole)) {
      sendJsonResponse(
        req,
        res,
        unauthorizedResponse(),
        rateLimitDecision
      );
      return;
    }

    if (!isTenantAllowed(context.policy, req)) {
      writeAuditLog({
        startMs: requestStart,
        req,
        status: 403,
        tokenHash: context.tokenHash,
        path,
        reason: 'tenant_not_allowed'
      });
      sendJsonResponse(
        req,
        res,
        jsonResponse({ error: 'forbidden', message: 'Tenant is not allowed.' }, 403),
        rateLimitDecision
      );
      return;
    }

    if (origin && !isAllowedOrigin(origin, requestHost)) {
      sendJsonResponse(
        req,
        res,
        jsonResponse(
          {
            error: 'forbidden_origin',
            message: 'CORS denied for this origin.'
          },
          403
        ),
        rateLimitDecision
      );
      return;
    }
  } else if (isDocPath && !allowPublicDocs) {
    sendJsonResponse(req, res, unauthorizedResponse());
    return;
  }

  if (requiresAuth && origin && !isAllowedOrigin(origin, requestHost)) {
    sendJsonResponse(
      req,
      res,
      jsonResponse(
        {
          error: 'forbidden_origin',
          message: 'CORS denied for this origin.'
        },
        403
      ),
      rateLimitDecision
    );
    return;
  }

  if (method !== 'GET') {
    sendJsonResponse(
      req,
      res,
      jsonResponse(
        {
          error: 'method_not_allowed',
          message: 'Only GET is supported.'
        },
        405
      ),
      rateLimitDecision
    );
    return;
  }

  if (path === '/health') {
    const health = await checkNewsDatabaseHealth(NEWS_API_HEALTH_DB_TIMEOUT_MS);
    const response: HealthResponse = {
      status: health.ok ? 'ok' : 'degraded',
      checkedAt: new Date().toISOString(),
      storage: health.ok ? 'postgres' : 'disabled',
      reason: health.reason,
      latencyMs: health.latencyMs,
      timeoutMs: NEWS_API_HEALTH_DB_TIMEOUT_MS
    };
    sendJsonResponse(req, res, jsonResponse(response, health.ok ? 200 : 503), rateLimitDecision);
    return;
  }

  if (path === '/openapi.json') {
    const spec = openApiSpec as Record<string, unknown>;
    sendJsonResponse(req, res, jsonResponse(spec, 200), rateLimitDecision);
    return;
  }

  if (path === '/docs') {
    sendHtmlResponse(req, res, docsResponse);
    return;
  }

  if (path === '/playground' || path === '/ui') {
    sendHtmlResponse(req, res, playgroundResponse);
    return;
  }

  if (!context || !policy) {
    sendJsonResponse(req, res, unauthorizedResponse(), rateLimitDecision);
    return;
  }

  if (path === '/api/filters') {
    try {
      const now = Date.now();
      if (filtersCache && now - filtersCache.timestamp < filtersCacheTtlMs) {
        const cached: NewsApiFiltersResponse = filtersCache.payload;
        const filteredPayload: NewsApiFiltersResponse = {
          ...cached,
          filters: {
            countries: applyFilterValues(cached.filters.countries, policy.allowedCountries),
            languages: applyFilterValues(cached.filters.languages, policy.allowedLanguages),
            sources: applyFilterValues(cached.filters.sources, policy.allowedSources),
            sections: applyFilterValues(cached.filters.sections, policy.allowedSections)
          }
        };
        sendJsonResponse(req, res, jsonResponse(filteredPayload, 200), rateLimitDecision);
        return;
      }

      const filters = await readNewsApiFilters();
      if (filters.storage === 'disabled') {
        const payload: NewsApiFiltersResponse = {
          storage: 'disabled',
          reason: filters.reason || 'News storage is not available.',
          filters: {
            countries: [],
            languages: [],
            sources: [],
            sections: []
          }
        };
        sendJsonResponse(req, res, jsonResponse(payload, 503), rateLimitDecision);
        return;
      }

      const response: NewsApiFiltersResponse = {
        storage: 'postgres',
        reason: undefined,
        filters: {
          countries: applyFilterValues(filters.filters.countries, policy.allowedCountries),
          languages: applyFilterValues(filters.filters.languages, policy.allowedLanguages),
          sources: applyFilterValues(filters.filters.sources, policy.allowedSources),
          sections: applyFilterValues(filters.filters.sections, policy.allowedSections)
        }
      };
      filtersCache = {
        payload: response,
        timestamp: now
      };
      sendJsonResponse(req, res, jsonResponse(response, 200), rateLimitDecision);
    } catch (error) {
      console.error('[api-news] filters request failed', error);
      sendJsonResponse(
        req,
        res,
        jsonResponse(
          {
            error: 'internal_error',
            message: 'Failed to read filter options.'
          } satisfies ApiError,
          500
        ),
        rateLimitDecision
      );
    }
    return;
  }

  if (path === '/api/dashboard/summary') {
    try {
      const windowDays = parseIntParam(url.searchParams.get('window_days'), 31, 1, 90);
      const latestHours = parseIntParam(url.searchParams.get('latest_hours'), 24, 1, 720);
      const previewLimit = parseIntParam(url.searchParams.get('preview_limit'), 8, 1, 20);
      const topCountriesLimit = parseIntParam(url.searchParams.get('top_countries_limit'), 6, 1, 20);
      const maxFutureHours = parseIntParam(url.searchParams.get('max_future_hours'), 6, 1, 168);
      const cacheKey = JSON.stringify({
        windowDays,
        latestHours,
        previewLimit,
        topCountriesLimit,
        maxFutureHours
      });
      const now = Date.now();

      if (
        dashboardSummaryCache
        && dashboardSummaryCache.cacheKey === cacheKey
        && now - dashboardSummaryCache.timestamp < dashboardSummaryCacheTtlMs
      ) {
        sendJsonResponse(req, res, jsonResponse(dashboardSummaryCache.payload, 200), rateLimitDecision);
        return;
      }

      const summary = await readNewsDashboardSummary({
        windowDays,
        latestHours,
        previewLimit,
        topCountriesLimit,
        maxFutureHours
      });

      if (summary.storage === 'disabled') {
        const errorPayload: ApiError = {
          error: 'storage_unavailable',
          message: summary.reason || 'News storage is not available.'
        };
        sendJsonResponse(req, res, jsonResponse(errorPayload, 503), rateLimitDecision);
        return;
      }

      const response: NewsApiDashboardSummaryResponse = {
        storage: summary.storage,
        generatedAt: summary.generatedAt,
        windowDays: summary.windowDays,
        latestHours: summary.latestHours,
        latestDate: summary.latestDate,
        previewDate: summary.previewDate,
        totals: {
          rowsWindow: summary.totals.rowsWindow,
          inserted24h: summary.totals.inserted24h,
          published24h: summary.totals.published24h,
          checkedSources24h: summary.totals.checkedSources24h
        },
        sectionTotals: summary.sectionTotals,
        recentDates: summary.recentDates,
        preview: {
          articleCount: summary.preview.articleCount,
          topCountries: summary.preview.topCountries
            .filter((item): item is { country: string; count: number } => Boolean(item.country))
            .map((item) => ({
              country: item.country,
              countryCode: null,
              count: item.count
            })),
          headlines: summary.preview.headlines.map((item) => ({
            ...item,
            countryCode: null
          }))
        }
      };
      dashboardSummaryCache = {
        cacheKey,
        payload: response,
        timestamp: now
      };
      sendJsonResponse(req, res, jsonResponse(response, 200), rateLimitDecision);
    } catch (error) {
      console.error('[api-news] dashboard summary request failed', error);
      sendJsonResponse(
        req,
        res,
        jsonResponse(
          {
            error: 'internal_error',
            message: 'Failed to read dashboard summary.'
          } satisfies ApiError,
          500
        ),
        rateLimitDecision
      );
    }
    return;
  }

  if (path === '/api/news') {
    try {
      const sourceScope = hasScopeOrError(getQueryList(url.searchParams, 'source'), policy.allowedSources);
      const countryScope = hasScopeOrError(getQueryList(url.searchParams, 'country'), policy.allowedCountries);
      const sectionScope = hasScopeOrError(getQueryList(url.searchParams, 'section'), policy.allowedSections);
      const languageScope = hasScopeOrError(getQueryList(url.searchParams, 'language'), policy.allowedLanguages);

      if (sourceScope.denied || countryScope.denied || sectionScope.denied || languageScope.denied) {
        sendJsonResponse(
          req,
          res,
          jsonResponse(
            {
              error: 'forbidden_filter',
              message: 'Requested filters are not allowed for this token.'
            },
            403
          ),
          rateLimitDecision
        );
        return;
      }

      const sourceNames = sourceScope.values;
      const countries = countryScope.values;
      const sections = sectionScope.values;
      const languages = languageScope.values;
      const maxLimit = Math.max(1, Math.min(5000, policy.maxLimit));
      const limit = parseIntParam(url.searchParams.get('limit'), 100, 1, maxLimit);
      const offset = parseIntParam(url.searchParams.get('offset'), 0, 0, maxOffset);
      const legacyFrom = parseDateParam(url.searchParams.get('from'));
      const legacyTo = parseDateParam(url.searchParams.get('to'));
      const from = parseDateParam(url.searchParams.get('publication_from')) || legacyFrom;
      const to = parseDateParam(url.searchParams.get('publication_to')) || legacyTo;
      const minCreatedAt = parseDateParam(url.searchParams.get('min_createdAt') ||
        url.searchParams.get('min_created_at') ||
        url.searchParams.get('created_from'));
      const maxCreatedAt = parseDateParam(url.searchParams.get('max_createdAt') ||
        url.searchParams.get('max_created_at') ||
        url.searchParams.get('created_to'));
      const minUpdatedAt = parseDateParam(url.searchParams.get('min_updatedAt') ||
        url.searchParams.get('min_updated_at') ||
        url.searchParams.get('updated_from'));
      const maxUpdatedAt = parseDateParam(url.searchParams.get('max_updatedAt') ||
        url.searchParams.get('max_updated_at') ||
        url.searchParams.get('updated_to'));
      const q = parseTextParam(url.searchParams.get('q'), 120);
      const hours = parseIntParam(url.searchParams.get('hours'), 48, 1, 720);

      if (minCreatedAt && maxCreatedAt && new Date(minCreatedAt).getTime() > new Date(maxCreatedAt).getTime()) {
        sendJsonResponse(
          req,
          res,
          jsonResponse(
            {
              error: 'invalid_range',
              message: '`min_createdAt` must be <= `max_createdAt`.'
            },
            400
          ),
          rateLimitDecision
        );
        return;
      }

      if (minUpdatedAt && maxUpdatedAt && new Date(minUpdatedAt).getTime() > new Date(maxUpdatedAt).getTime()) {
        sendJsonResponse(
          req,
          res,
          jsonResponse(
            {
              error: 'invalid_range',
              message: '`min_updatedAt` must be <= `max_updatedAt`.'
            },
            400
          ),
          rateLimitDecision
        );
        return;
      }

      if (from && to && new Date(from).getTime() > new Date(to).getTime()) {
        sendJsonResponse(
          req,
          res,
          jsonResponse(
            {
              error: 'invalid_range',
              message: '`from` must be <= `to`.'
            },
            400
          ),
          rateLimitDecision
        );
        return;
      }

      const news = await readNewsArticlesForApi({
        sourceNames,
        countries,
        sections,
        languages,
        q,
        limit,
        offset,
        publicationFrom: from,
        publicationTo: to,
        minCreatedAt,
        maxCreatedAt,
        minUpdatedAt,
        maxUpdatedAt,
        hours: from || to ? undefined : hours
      });

      if (news.storage === 'disabled') {
        const errorPayload: ApiError = {
          error: 'storage_unavailable',
          message: news.reason || 'News storage is not available.'
        };
        sendJsonResponse(req, res, jsonResponse(errorPayload, 503), rateLimitDecision);
        return;
      }

      const response: NewsApiResponse = {
        storage: news.storage,
        generatedAt: news.generatedAt,
        total: news.totalCount,
        params: {
          limit,
          offset,
          hours: from || to ? undefined : hours,
          publicationFrom: from,
          publicationTo: to,
          minCreatedAt,
          maxCreatedAt,
          minUpdatedAt,
          maxUpdatedAt,
          q,
          from,
          to,
          sources: sourceNames,
          countries,
          sections,
          languages
        },
        items: news.items
      };
      sendJsonResponse(req, res, jsonResponse(response, 200), rateLimitDecision);
    } catch (error) {
      if (error instanceof Error && error.message === 'invalid-date') {
        sendJsonResponse(
          req,
          res,
          jsonResponse(
            {
              error: 'invalid_date',
              message:
                '`from`/`to`, `publication_from`/`publication_to`, `created_from`/`created_to`, `updated_from`/`updated_to` must be valid ISO date strings.'
            },
            400
          ),
          rateLimitDecision
        );
        return;
      }

      console.error('[api-news] request failed', error);
      sendJsonResponse(
        req,
        res,
        jsonResponse(
          {
            error: 'internal_error',
            message: 'Failed to read news articles.'
          },
          500
        ),
        rateLimitDecision
      );
    }
    return;
  }

  sendJsonResponse(
    req,
    res,
    jsonResponse(
      {
        error: 'not_found',
        message: 'Endpoint not found.'
      },
      404
    ),
    rateLimitDecision
  );
});

server.listen(port, host, () => {
  console.log(`[api-news] listening on http://${host}:${port}`);
});
