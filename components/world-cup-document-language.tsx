'use client';

import { useEffect } from 'react';
import type { WorldCupJournalistLanguage } from '@/lib/world-cup-journalist-i18n';

export function WorldCupDocumentLanguage({ language }: { language: WorldCupJournalistLanguage }) {
  useEffect(() => {
    const root = document.documentElement;
    const previousLanguage = root.lang;

    root.lang = language;

    return () => {
      root.lang = previousLanguage || 'en';
    };
  }, [language]);

  return null;
}
