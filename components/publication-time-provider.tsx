'use client';

import { createContext, type ReactNode, useContext, useEffect, useState } from 'react';
import type { PublicationTimeMode } from '@/lib/timezone-display';

type PublicationTimeContextValue = {
  mode: PublicationTimeMode;
  localTimeZone: string | null;
  setMode: (value: PublicationTimeMode) => void;
};

const STORAGE_KEY = 'wpr-publication-time-mode';

const PublicationTimeContext = createContext<PublicationTimeContextValue | null>(null);

export function PublicationTimeProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [mode, setModeState] = useState<PublicationTimeMode>('local');
  const [localTimeZone, setLocalTimeZone] = useState<string | null>(null);

  useEffect(() => {
    try {
      const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;
      setLocalTimeZone(resolved || null);
    } catch {
      setLocalTimeZone(null);
    }

    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === 'local' || stored === 'utc' || stored === 'chicago') {
        setModeState(stored);
      }
    } catch {
      // Ignore client storage failures and keep the local-time default.
    }
  }, []);

  const setMode = (value: PublicationTimeMode) => {
    setModeState(value);
    try {
      window.localStorage.setItem(STORAGE_KEY, value);
    } catch {
      // Ignore client storage failures; the in-memory preference still updates.
    }
  };

  return (
    <PublicationTimeContext.Provider value={{ mode, localTimeZone, setMode }}>
      {children}
    </PublicationTimeContext.Provider>
  );
}

export function usePublicationTimePreference(): PublicationTimeContextValue {
  const context = useContext(PublicationTimeContext);
  if (!context) {
    throw new Error('usePublicationTimePreference must be used inside PublicationTimeProvider');
  }
  return context;
}
