'use client';

import { useId, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { WorldCupJournalistLanguage } from '@/lib/world-cup-journalist-i18n';
import styles from '@/components/world-cup-journalist-view.module.css';

type LanguageOption = {
  code: WorldCupJournalistLanguage;
  label: string;
};

type Props = {
  label: string;
  currentLanguage: WorldCupJournalistLanguage;
  options: LanguageOption[];
  teamSlug: string;
  selectedPersonId?: string | null;
  selectedLeadType?: string | null;
  selectedLeadSource?: string | null;
};

function buildLanguageHref(
  teamSlug: string,
  language: WorldCupJournalistLanguage,
  personId?: string | null,
  leadType?: string | null,
  leadSource?: string | null
): string {
  const params = new URLSearchParams();
  params.set('team', teamSlug);
  params.set('lang', language);
  if (personId) params.set('person', personId);
  if (leadType) params.set('leadType', leadType);
  if (leadSource) params.set('leadSource', leadSource);
  return personId ? `/world-cup/?${params.toString()}#person-detail` : `/world-cup/?${params.toString()}`;
}

export function WorldCupLanguageSelect({
  label,
  currentLanguage,
  options,
  teamSlug,
  selectedPersonId,
  selectedLeadType,
  selectedLeadSource,
}: Props) {
  const router = useRouter();
  const selectId = useId();
  const [isPending, startTransition] = useTransition();

  return (
    <div className={styles.languageControl}>
      <label className={styles.languageSelectLabel} htmlFor={selectId}>
        {label}
      </label>
      <div className={styles.languageSelectWrap}>
        <select
          className={styles.languageSelect}
          disabled={isPending}
          id={selectId}
          value={currentLanguage}
          onChange={(event) => {
            const nextLanguage = event.target.value as WorldCupJournalistLanguage;
            startTransition(() => {
              router.replace(buildLanguageHref(teamSlug, nextLanguage, selectedPersonId, selectedLeadType, selectedLeadSource));
            });
          }}
        >
          {options.map((option) => (
            <option key={option.code} value={option.code}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
