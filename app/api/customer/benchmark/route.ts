import { NextRequest, NextResponse } from 'next/server';
import { buildDisabledCountryBenchmarkResponse } from '@/lib/benchmark-store-shaping';
import type { CountryBenchmarkResponse } from '@/lib/benchmark-types';
import { readCountryBenchmarkSnapshot } from '@/lib/customer-dashboard-snapshot-store';
import { buildPublicSnapshotCacheHeaders, PUBLIC_MAP_RESPONSE_CACHE_CONTROL } from '@/lib/dashboard-cache-control';
import type { DashboardDataSource } from '@/lib/news-api';
import { proxyPortalServerApiRequest, shouldUseLocalFallbackForPortalResponse } from '@/lib/customer-portal';

export const runtime = 'nodejs';
const DASHBOARD_BENCHMARK_UPSTREAM_TIMEOUT_MS = 30_000;

function isUsableCountryBenchmarkSnapshot(payload: CountryBenchmarkResponse | null | undefined): payload is CountryBenchmarkResponse {
  return Boolean(payload && payload.storage === 'postgres' && Array.isArray(payload.countries) && payload.countries.length > 0);
}

function buildBenchmarkResponse(payload: CountryBenchmarkResponse, source: DashboardDataSource) {
  return NextResponse.json({ ...payload, dataSource: source }, {
    headers: buildPublicSnapshotCacheHeaders({
      'X-Data-Source': source,
    }),
  });
}

export async function GET(request: NextRequest) {
  const snapshot = await readCountryBenchmarkSnapshot();
  const upstream = await proxyPortalServerApiRequest(request, '/api/dashboard/benchmark', {
    cacheControl: PUBLIC_MAP_RESPONSE_CACHE_CONTROL,
    responseHeaders: buildPublicSnapshotCacheHeaders(),
    timeoutMs: DASHBOARD_BENCHMARK_UPSTREAM_TIMEOUT_MS,
  });

  if (upstream.ok) {
    const payload = (await upstream.clone().json().catch(() => null)) as CountryBenchmarkResponse | null;
    if (isUsableCountryBenchmarkSnapshot(payload)) {
      return buildBenchmarkResponse(payload, 'upstream');
    }

    if (isUsableCountryBenchmarkSnapshot(snapshot)) {
      return buildBenchmarkResponse(snapshot, 'snapshot-fallback');
    }

    if (payload && typeof payload === 'object') {
      return buildBenchmarkResponse(payload, 'upstream');
    }

    return upstream;
  }

  const shouldUseSnapshotFallback = await shouldUseLocalFallbackForPortalResponse(upstream);
  if (shouldUseSnapshotFallback && snapshot) {
    return buildBenchmarkResponse(
      snapshot,
      isUsableCountryBenchmarkSnapshot(snapshot) ? 'snapshot-fallback' : 'disabled-snapshot-fallback'
    );
  }

  if (!shouldUseSnapshotFallback) {
    return upstream;
  }

  return buildBenchmarkResponse(buildDisabledCountryBenchmarkResponse(), 'disabled-fallback');
}
