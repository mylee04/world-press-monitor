export type PublicationTimeMode = 'local' | 'utc' | 'chicago';

export const CHICAGO_TIME_ZONE = 'America/Chicago';

export function resolvePublicationTimeZone(mode: PublicationTimeMode, localTimeZone: string | null): string | undefined {
  if (mode === 'utc') return 'UTC';
  if (mode === 'chicago') return CHICAGO_TIME_ZONE;
  return localTimeZone || undefined;
}

export function renderPublicationTimeZoneLabel(mode: PublicationTimeMode, localTimeZone: string | null): string {
  if (mode === 'utc') return 'UTC';
  if (mode === 'chicago') return CHICAGO_TIME_ZONE;
  return localTimeZone ? `Local (${localTimeZone})` : 'Local';
}

export function formatPublicationTime(
  value: string | null | undefined,
  mode: PublicationTimeMode,
  localTimeZone: string | null
): string {
  if (!value) return '-';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';

  const timeZone = resolvePublicationTimeZone(mode, localTimeZone);

  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
    timeZoneName: 'short',
  }).format(date);
}
