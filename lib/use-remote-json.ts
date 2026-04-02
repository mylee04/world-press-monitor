'use client';

import { useEffect, useRef, useState } from 'react';

export type JsonState<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
  updatedAt: number | null;
};

export const REMOTE_JSON_AUTO_REFRESH_MS = 60 * 60 * 1000;
export const REMOTE_JSON_STALE_CACHE_MS = 30 * 60 * 1000;

export type RemoteJsonCacheMode = 'none' | 'memory' | 'session';

export type UseRemoteJsonOptions = {
  cacheMode?: RemoteJsonCacheMode;
  requestCache?: RequestCache;
  staleMs?: number;
};

type CachedRemoteJsonValue<T> = {
  data: T;
  updatedAt: number;
};

const REMOTE_JSON_SESSION_PREFIX = 'remote-json:v1:';
const remoteJsonMemoryCache = new Map<string, CachedRemoteJsonValue<unknown>>();

function getSessionStorageKey(url: string): string {
  return `${REMOTE_JSON_SESSION_PREFIX}${url}`;
}

function isValidCacheEntry<T>(
  entry: CachedRemoteJsonValue<T> | null | undefined,
  staleMs: number
): entry is CachedRemoteJsonValue<T> {
  if (!entry) return false;
  return Date.now() - entry.updatedAt <= staleMs;
}

function readMemoryCache<T>(url: string, staleMs: number): CachedRemoteJsonValue<T> | null {
  const entry = remoteJsonMemoryCache.get(url) as CachedRemoteJsonValue<T> | undefined;
  if (!isValidCacheEntry(entry, staleMs)) {
    remoteJsonMemoryCache.delete(url);
    return null;
  }
  return entry;
}

function readSessionCache<T>(url: string, staleMs: number): CachedRemoteJsonValue<T> | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(getSessionStorageKey(url));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedRemoteJsonValue<T>;
    if (!isValidCacheEntry(parsed, staleMs)) {
      window.sessionStorage.removeItem(getSessionStorageKey(url));
      return null;
    }
    remoteJsonMemoryCache.set(url, parsed as CachedRemoteJsonValue<unknown>);
    return parsed;
  } catch {
    window.sessionStorage.removeItem(getSessionStorageKey(url));
    return null;
  }
}

function readCachedRemoteJson<T>(
  url: string,
  cacheMode: RemoteJsonCacheMode,
  staleMs: number
): CachedRemoteJsonValue<T> | null {
  if (cacheMode === 'none') return null;
  const memoryEntry = readMemoryCache<T>(url, staleMs);
  if (memoryEntry) return memoryEntry;
  if (cacheMode !== 'session') return null;
  return readSessionCache<T>(url, staleMs);
}

function writeCachedRemoteJson<T>(url: string, value: CachedRemoteJsonValue<T>, cacheMode: RemoteJsonCacheMode): void {
  if (cacheMode === 'none') return;
  remoteJsonMemoryCache.set(url, value as CachedRemoteJsonValue<unknown>);
  if (cacheMode !== 'session' || typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(getSessionStorageKey(url), JSON.stringify(value));
  } catch {
    // Ignore storage quota and serialization failures. Memory cache remains available.
  }
}

export function useRemoteJson<T>(
  url: string | null,
  refreshMs = REMOTE_JSON_AUTO_REFRESH_MS,
  options: UseRemoteJsonOptions = {}
): JsonState<T> {
  const {
    cacheMode = 'memory',
    requestCache = cacheMode === 'none' ? 'no-store' : 'default',
    staleMs = REMOTE_JSON_STALE_CACHE_MS,
  } = options;
  const updatedAtRef = useRef<number | null>(null);
  const [state, setState] = useState<JsonState<T>>({
    data: null,
    loading: Boolean(url),
    error: null,
    updatedAt: null,
  });

  useEffect(() => {
    let cancelled = false;
    if (!url) {
      updatedAtRef.current = null;
      setState({ data: null, loading: false, error: null, updatedAt: null });
      return () => {
        cancelled = true;
      };
    }

    const cached = readCachedRemoteJson<T>(url, cacheMode, staleMs);
    updatedAtRef.current = cached?.updatedAt ?? null;
    setState({
      data: cached?.data ?? null,
      loading: !cached,
      error: null,
      updatedAt: cached?.updatedAt ?? null,
    });

    const load = async (isBackground = false) => {
      if (!cancelled) {
        setState((current) => ({
          data: current.data,
          loading: isBackground || current.data ? false : true,
          error: null,
          updatedAt: current.updatedAt,
        }));
      }

      try {
        const response = await fetch(url, { cache: requestCache, credentials: 'same-origin' });
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { message?: string } | null;
          throw new Error(payload?.message || `${response.status} ${response.statusText}`);
        }
        const payload = (await response.json()) as T;
        if (!cancelled) {
          updatedAtRef.current = Date.now();
          writeCachedRemoteJson(url, { data: payload, updatedAt: updatedAtRef.current }, cacheMode);
          setState({
            data: payload,
            loading: false,
            error: null,
            updatedAt: updatedAtRef.current,
          });
        }
      } catch (error: unknown) {
        if (!cancelled) {
          setState((current) => ({
            data: current.data,
            loading: false,
            error: error instanceof Error ? error.message : 'Failed to load resource.',
            updatedAt: current.updatedAt,
          }));
        }
      }
    };

    void load(Boolean(cached));

    const interval = window.setInterval(() => {
      void load(true);
    }, refreshMs);

    const handleVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      const staleFor = Date.now() - (updatedAtRef.current || 0);
      if (!updatedAtRef.current || staleFor >= refreshMs) {
        void load(true);
      }
    };
    window.addEventListener('focus', handleVisibility);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener('focus', handleVisibility);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [url, refreshMs, cacheMode, requestCache, staleMs]);

  return state;
}
