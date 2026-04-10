'use client';

import { useEffect, useState } from 'react';

function formatDateTimeUtc(value: string | null | undefined, fallback: string): string {
  if (!value) return fallback;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return fallback;

  try {
    return new Intl.DateTimeFormat('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'UTC',
    }).format(parsed);
  } catch {
    return parsed.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
  }
}

function formatDateTimeLocal(value: string | null | undefined, fallback: string): string {
  if (!value) return fallback;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return fallback;

  try {
    return new Intl.DateTimeFormat('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(parsed);
  } catch {
    return parsed.toLocaleString();
  }
}

type OpsLocalTimestampProps = {
  value: string | null | undefined;
  fallback?: string;
};

export function OpsLocalTimestamp({ value, fallback = 'Unavailable' }: OpsLocalTimestampProps) {
  const [label, setLabel] = useState<string>(() => formatDateTimeUtc(value, fallback));

  useEffect(() => {
    setLabel(formatDateTimeLocal(value, fallback));
  }, [value, fallback]);

  return <span>{label}</span>;
}
