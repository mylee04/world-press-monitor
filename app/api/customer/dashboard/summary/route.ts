import { NextRequest } from 'next/server';
import { PUBLIC_MAP_RESPONSE_CACHE_CONTROL } from '@/lib/dashboard-cache-control';
import { proxyPortalServerApiRequest } from '@/lib/customer-portal';

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
  };
  reason?: string;
  [key: string]: unknown;
};

function sanitizeDashboardSummary(payload: DashboardSummaryPayload): DashboardSummaryPayload {
  const preview = payload.preview && typeof payload.preview === 'object' ? payload.preview : {};
  const topCountries = Array.isArray(preview.topCountries) ? preview.topCountries : [];

  const sanitized = {
    ...payload,
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

export async function GET(request: NextRequest) {
  const upstream = await proxyPortalServerApiRequest(request, '/api/dashboard/summary', {
    cacheControl: PUBLIC_MAP_RESPONSE_CACHE_CONTROL,
  });

  if (!upstream.ok) {
    return upstream;
  }

  const payload = (await upstream.json().catch(() => null)) as DashboardSummaryPayload | null;
  if (!payload || typeof payload !== 'object') {
    return upstream;
  }

  const sanitizedPayload = sanitizeDashboardSummary(payload);
  return new Response(JSON.stringify(sanitizedPayload), {
    status: upstream.status,
    headers: {
      'content-type': 'application/json',
      'Cache-Control': PUBLIC_MAP_RESPONSE_CACHE_CONTROL,
    },
  });
}
