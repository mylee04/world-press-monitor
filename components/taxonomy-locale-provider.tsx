'use client';

import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import {
  type TaxonomyLocale,
  type TaxonomyLocaleMode,
  getResolvedTaxonomyLocale,
} from '@/lib/taxonomy-display';

type TaxonomyLocaleContextValue = {
  mode: TaxonomyLocaleMode;
  browserLocale: string | null;
  resolvedLocale: TaxonomyLocale;
  setMode: (value: TaxonomyLocaleMode) => void;
};

const STORAGE_KEY = 'wpr-taxonomy-locale-mode';
const TaxonomyLocaleContext = createContext<TaxonomyLocaleContextValue | null>(null);

export function TaxonomyLocaleProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [mode, setModeState] = useState<TaxonomyLocaleMode>('auto');
  const [browserLocale, setBrowserLocale] = useState<string | null>(null);

  useEffect(() => {
    try {
      setBrowserLocale(window.navigator.language || null);
    } catch {
      setBrowserLocale(null);
    }

    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === 'auto' || stored === 'en' || stored === 'ko' || stored === 'ja' || stored === 'es' || stored === 'pt' || stored === 'it' || stored === 'fr') {
        setModeState(stored);
      }
    } catch {
      // Ignore storage failures.
    }
  }, []);

  const setMode = (value: TaxonomyLocaleMode) => {
    setModeState(value);
    try {
      window.localStorage.setItem(STORAGE_KEY, value);
    } catch {
      // Ignore storage failures.
    }
  };

  const value = useMemo<TaxonomyLocaleContextValue>(() => ({
    mode,
    browserLocale,
    resolvedLocale: getResolvedTaxonomyLocale(mode, browserLocale),
    setMode,
  }), [browserLocale, mode]);

  return (
    <TaxonomyLocaleContext.Provider value={value}>
      {children}
    </TaxonomyLocaleContext.Provider>
  );
}

export function useTaxonomyLocalePreference(): TaxonomyLocaleContextValue {
  const context = useContext(TaxonomyLocaleContext);
  if (!context) {
    throw new Error('useTaxonomyLocalePreference must be used inside TaxonomyLocaleProvider');
  }
  return context;
}
