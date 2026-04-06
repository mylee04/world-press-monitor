'use client';

import { useEffect, useMemo, useState } from 'react';
import type { CountryBenchmarkResponse } from '@/lib/benchmark-types';
import { useCustomerAccess } from '@/components/customer-access-provider';
import { useRemoteJson } from '@/lib/use-remote-json';
import type {
  NewsApiDashboardSummaryResponse,
  NewsApiFiltersResponse,
  NewsApiResponse,
} from '@/lib/news-api';
import { buildNewsApiUrl } from '@/lib/news-api';

type JsonState<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
};

type NewsApiQuery = {
  countries?: string[];
  sections?: string[];
  sources?: string[];
  languages?: string[];
  q?: string | null;
  limit?: number;
  offset?: number;
  hours?: number;
  publicationFrom?: string | null;
  publicationTo?: string | null;
  minCreatedAt?: string | null;
  maxCreatedAt?: string | null;
  minUpdatedAt?: string | null;
  maxUpdatedAt?: string | null;
};

function useRemoteJsonResource<T>(url: string | null): JsonState<T> {
  const [state, setState] = useState<JsonState<T>>({
    data: null,
    loading: Boolean(url),
    error: null,
  });

  useEffect(() => {
    let cancelled = false;

    if (!url) {
      setState({ data: null, loading: false, error: null });
      return () => {
        cancelled = true;
      };
    }

    setState((current) => ({
      data: current.data,
      loading: true,
      error: null,
    }));

    fetch(url, {
      cache: 'no-store',
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
      },
    })
      .then(async (response) => {
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { message?: string } | null;
          throw new Error(payload?.message || `${response.status} ${response.statusText}`);
        }
        return (await response.json()) as T;
      })
      .then((payload) => {
        if (!cancelled) {
          setState({ data: payload, loading: false, error: null });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({
            data: null,
            loading: false,
            error: error instanceof Error ? error.message : 'Failed to load API resource',
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [url]);

  return state;
}

function appendList(searchParams: URLSearchParams, key: string, values: string[] | undefined): void {
  for (const value of values || []) {
    const normalized = value.trim();
    if (normalized) {
      searchParams.append(key, normalized);
    }
  }
}

function buildNewsApiQueryUrl(path: string, query?: NewsApiQuery): string | null {
  const baseUrl = buildNewsApiUrl(path);
  if (!baseUrl) return null;
  const usesRelativePath = baseUrl.startsWith('/');
  const url = new URL(baseUrl, 'http://localhost');
  const searchParams = url.searchParams;

  appendList(searchParams, 'country', query?.countries);
  appendList(searchParams, 'section', query?.sections);
  appendList(searchParams, 'source', query?.sources);
  appendList(searchParams, 'language', query?.languages);

  if (query?.q) searchParams.set('q', query.q);
  if (typeof query?.limit === 'number') searchParams.set('limit', String(query.limit));
  if (typeof query?.offset === 'number') searchParams.set('offset', String(query.offset));
  if (typeof query?.hours === 'number') searchParams.set('hours', String(query.hours));
  if (query?.publicationFrom) searchParams.set('publication_from', query.publicationFrom);
  if (query?.publicationTo) searchParams.set('publication_to', query.publicationTo);
  if (query?.minCreatedAt) searchParams.set('min_createdAt', query.minCreatedAt);
  if (query?.maxCreatedAt) searchParams.set('max_createdAt', query.maxCreatedAt);
  if (query?.minUpdatedAt) searchParams.set('min_updatedAt', query.minUpdatedAt);
  if (query?.maxUpdatedAt) searchParams.set('max_updatedAt', query.maxUpdatedAt);

  return usesRelativePath ? `${url.pathname}${url.search}` : url.toString();
}

export function useNewsApiFilters(): JsonState<NewsApiFiltersResponse> {
  const { isReady, apiConfigured } = useCustomerAccess();
  const url = useMemo(() => buildNewsApiUrl('/api/filters'), []);
  return useRemoteJsonResource<NewsApiFiltersResponse>(isReady && apiConfigured ? url : null);
}

export function useNewsApiDashboardSummary(): JsonState<NewsApiDashboardSummaryResponse> {
  const { isReady, apiConfigured } = useCustomerAccess();
  const url = useMemo(() => buildNewsApiUrl('/api/dashboard/summary'), []);
  return useRemoteJsonResource<NewsApiDashboardSummaryResponse>(isReady && apiConfigured ? url : null);
}

export function useNewsApiNews(query: NewsApiQuery): JsonState<NewsApiResponse> {
  const { hasToken, isReady, apiConfigured } = useCustomerAccess();
  const queryKey = JSON.stringify(query);
  const url = useMemo(() => buildNewsApiQueryUrl('/api/news', query), [queryKey]);
  return useRemoteJsonResource<NewsApiResponse>(isReady && apiConfigured && hasToken ? url : null);
}

export function useCountryBenchmark(): JsonState<CountryBenchmarkResponse> {
  const { isReady } = useCustomerAccess();
  const url = useMemo(() => '/api/customer/benchmark', []);
  return useRemoteJson<CountryBenchmarkResponse>(isReady ? url : null, undefined, { cacheMode: 'session' });
}
