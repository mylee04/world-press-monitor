'use client';

import { useId, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { WorldCupJournalistLanguage } from '@/lib/world-cup-journalist-i18n';
import styles from '@/components/world-cup-journalist-view.module.css';

type TeamOption = {
  slug: string;
  label: string;
};

type Props = {
  label: string;
  currentTeamSlug: string;
  options: TeamOption[];
  language: WorldCupJournalistLanguage;
  selectedLeadType?: string | null;
  selectedLeadSource?: string | null;
};

function buildTeamHref(
  teamSlug: string,
  language: WorldCupJournalistLanguage,
  leadType?: string | null,
  leadSource?: string | null
): string {
  const params = new URLSearchParams();
  params.set('team', teamSlug);
  params.set('lang', language);
  if (leadType) params.set('leadType', leadType);
  if (leadSource) params.set('leadSource', leadSource);
  return `/world-cup/?${params.toString()}`;
}

export function WorldCupTeamSelect({
  label,
  currentTeamSlug,
  options,
  language,
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
          value={currentTeamSlug}
          onChange={(event) => {
            const nextTeamSlug = event.target.value;
            startTransition(() => {
              router.replace(buildTeamHref(nextTeamSlug, language, selectedLeadType, selectedLeadSource));
            });
          }}
        >
          {options.map((option) => (
            <option key={option.slug} value={option.slug}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
