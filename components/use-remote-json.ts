'use client';

import { useEffect, useRef, useState } from 'react';

export type JsonState<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
  updatedAt: number | null;
};

export const REMOTE_JSON_AUTO_REFRESH_MS = 60 * 60 * 1000;

export function useRemoteJson<T>(url: string | null, refreshMs = REMOTE_JSON_AUTO_REFRESH_MS): JsonState<T> {
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
      setState({ data: null, loading: false, error: null, updatedAt: null });
      return () => {
        cancelled = true;
      };
    }

    const load = async (isBackground = false) => {
      if (!cancelled) {
        setState((current) => ({
          data: current.data,
          loading: isBackground ? current.loading : true,
          error: null,
          updatedAt: current.updatedAt,
        }));
      }

      try {
        const response = await fetch(url, { cache: 'no-store', credentials: 'same-origin' });
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { message?: string } | null;
          throw new Error(payload?.message || `${response.status} ${response.statusText}`);
        }
        const payload = (await response.json()) as T;
        if (!cancelled) {
          updatedAtRef.current = Date.now();
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

    void load();

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
  }, [url, refreshMs]);

  return state;
}
