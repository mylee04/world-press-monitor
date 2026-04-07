import { NextRequest } from 'next/server';
import { buildPublicSnapshotCacheHeaders, PUBLIC_MAP_RESPONSE_CACHE_CONTROL } from '@/lib/dashboard-cache-control';
import { readDashboardSummarySnapshot } from '@/lib/customer-dashboard-snapshot-store';
import { proxyPortalServerApiRequest, shouldUseLocalFallbackForPortalResponse } from '@/lib/customer-portal';

type DashboardSummaryPayload = {
  storage?: 'postgres' | 'disabled';
  generatedAt?: string | null;
  windowDays?: number;
  latestHours?: number;
  latestDate?: string | null;
  previewDate?: string | null;
  totals?: Record<string, unknown>;
  sectionTotals?: Record<string, number>;
  recentDates?: Array<{ date: string; count: number }>;
  topicSampleSize?: number;
  topicGroups?: unknown;
  sourceCategoryCoverage?: Record<string, unknown>;
  preview?: {
    articleCount?: number;
    topCountries?: Array<{ country: string; countryCode: string | null; count: number }>;
    headlines?: unknown[];
  };
  reason?: string;
  [key: string]: unknown;
};

const DASHBOARD_SUMMARY_UPSTREAM_TIMEOUT_MS = 15_000;

function isUsableDashboardSummarySnapshot(payload: DashboardSummaryPayload | null | undefined): payload is DashboardSummaryPayload {
  return Boolean(payload && payload.storage === 'postgres');
}

function hasAnyDashboardSummaryPayload(payload: DashboardSummaryPayload | null | undefined): payload is DashboardSummaryPayload {
  return Boolean(payload && typeof payload === 'object');
}

async function readUpstreamFailureMessage(upstream: Response): Promise<string | undefined> {
  try {
    const rawPayload = await upstream.text();
    if (!rawPayload) {
      return undefined;
    }

    const normalizedPayload = rawPayload.trim();
    try {
      const parsed = JSON.parse(normalizedPayload) as {
        message?: string;
        error?: string;
      };
      if (typeof parsed?.message === 'string' && parsed.message) {
        return parsed.message.trim();
      }
      if (typeof parsed?.error === 'string' && parsed.error) {
        return parsed.error.trim();
      }
    } catch {
      return normalizedPayload;
    }
    return normalizedPayload;
  } catch {
    return undefined;
  }
}

function sanitizeDashboardSummary(payload: DashboardSummaryPayload): DashboardSummaryPayload {
  const preview = payload.preview && typeof payload.preview === 'object' ? payload.preview : {};
  const topCountries = Array.isArray(preview.topCountries) ? preview.topCountries : [];
  const rawReason = typeof payload.reason === 'string' ? payload.reason.trim() : '';
  const normalizedReason = rawReason === 'not_initialized' || rawReason === 'missing_database_url'
    ? 'Dashboard data is initializing. Please try again shortly.'
    : rawReason;

  const sanitized = {
    ...payload,
    reason: normalizedReason || payload.reason,
    preview: {
      articleCount: Number(preview.articleCount || 0),
      topCountries: topCountries.map((item) => ({
        country: typeof item?.country === 'string' ? item.country : '-',
        countryCode: typeof item?.countryCode === 'string' ? item.countryCode : null,
        count: Number(item?.count || 0),
      })),
    },
  };

  return sanitized;
}

export const runtime = 'nodejs';

function buildSummaryResponse(payload: DashboardSummaryPayload, headers?: Record<string, string>) {
  const sanitizedPayload = sanitizeDashboardSummary(payload);
  return new Response(JSON.stringify(sanitizedPayload), {
    status: 200,
    headers: buildPublicSnapshotCacheHeaders({
      'content-type': 'application/json',
      ...(headers || {}),
    }),
  });
}

function buildDisabledSummaryResponse(reason?: string): DashboardSummaryPayload {
  return {
    storage: 'disabled',
    generatedAt: null,
    windowDays: 31,
    latestHours: 24,
    latestDate: null,
    previewDate: null,
    totals: {
      rowsWindow: 0,
      inserted24h: 0,
      published24h: 0,
      checkedSources24h: 0,
    },
    sectionTotals: {},
    recentDates: [],
    topicSampleSize: 0,
    topicGroups: [],
    sourceCategoryCoverage: {
      categorizedArticles: 0,
      uncategorizedArticles: 0,
      distinctCategories: 0,
      topCategories: [],
    },
    preview: {
      articleCount: 0,
      topCountries: [],
      headlines: [],
    },
    reason,
  };
}

export async function GET(request: NextRequest) {
  const snapshot = await readDashboardSummarySnapshot();
  const snapshotPayload = snapshot as unknown as DashboardSummaryPayload | null | undefined;

  const upstream = await proxyPortalServerApiRequest(request, '/api/dashboard/summary', {
    cacheControl: PUBLIC_MAP_RESPONSE_CACHE_CONTROL,
    responseHeaders: buildPublicSnapshotCacheHeaders(),
    timeoutMs: DASHBOARD_SUMMARY_UPSTREAM_TIMEOUT_MS,
  });

  if (upstream.ok) {
    const payload = (await upstream.clone().json().catch(() => null)) as DashboardSummaryPayload | null;
    if (isUsableDashboardSummarySnapshot(payload)) {
      return buildSummaryResponse(payload, { 'X-Data-Source': 'upstream' });
    }

    if (isUsableDashboardSummarySnapshot(snapshotPayload)) {
      return buildSummaryResponse(snapshotPayload, { 'X-Data-Source': 'snapshot-fallback' });
    }

    if (hasAnyDashboardSummaryPayload(payload)) {
      return buildSummaryResponse(payload, { 'X-Data-Source': 'upstream' });
    }

    return upstream;
  }

  const shouldUseSnapshotFallback = await shouldUseLocalFallbackForPortalResponse(upstream);
  const upstreamMessage = await readUpstreamFailureMessage(upstream.clone());
  const reason = `Dashboard summary unavailable from portal: ${upstream.status}` +
    (upstreamMessage ? ` (${upstreamMessage.slice(0, 200)})` : '');
  if (shouldUseSnapshotFallback && hasAnyDashboardSummaryPayload(snapshotPayload)) {
    return buildSummaryResponse(
      {
        ...snapshotPayload,
        reason: snapshotPayload.reason || reason,
      },
      {
        'X-Data-Source': isUsableDashboardSummarySnapshot(snapshotPayload) ? 'snapshot-fallback' : 'disabled-snapshot-fallback',
      }
    );
  }

  if (!shouldUseSnapshotFallback) {
    return upstream;
  }

  return buildSummaryResponse(
    buildDisabledSummaryResponse(reason),
    {
      'X-Data-Source': 'disabled-fallback',
    }
  );
}
