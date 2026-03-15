'use client';

import { useEffect, useState } from 'react';
import type {
  PublicCountryMonthShard,
  PublicDataManifest,
  PublicDateShard,
  PublicSourcesFile,
} from '@/lib/public-data';
import { withBasePath } from '@/lib/site-paths';

type JsonState<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
};

export function useJsonResource<T>(path: string | null): JsonState<T> {
  const [state, setState] = useState<JsonState<T>>({
    data: null,
    loading: Boolean(path),
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    const resolvedPath = withBasePath(path);

    if (!resolvedPath) {
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

    fetch(resolvedPath)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`${response.status} ${response.statusText}`);
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
            error: error instanceof Error ? error.message : 'Failed to load JSON resource',
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [path]);

  return state;
}

export function useManifest(): JsonState<PublicDataManifest> {
  return useJsonResource<PublicDataManifest>('/data/manifest.json');
}

export function useSources(): JsonState<PublicSourcesFile> {
  return useJsonResource<PublicSourcesFile>('/data/sources.json');
}

export function useShard(path: string | null): JsonState<PublicDateShard | PublicCountryMonthShard> {
  return useJsonResource<PublicDateShard | PublicCountryMonthShard>(path);
}
