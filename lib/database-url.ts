const DEFAULT_WPM_PG_PORT = '5432';
const DEFAULT_DATABASE_URL_PREFIX = 'postgresql://postgres:postgres@127.0.0.1:';
const DEFAULT_DATABASE_URL_SUFFIX = '/wpm';

export function getDefaultDatabaseUrl(): string {
  const port = (process.env.WPM_PG_PORT || '').trim() || DEFAULT_WPM_PG_PORT;
  return `${DEFAULT_DATABASE_URL_PREFIX}${port}${DEFAULT_DATABASE_URL_SUFFIX}`;
}

export function resolveDatabaseUrl(): string {
  const configured = process.env.DATABASE_URL?.trim();
  if (configured) return configured;
  return getDefaultDatabaseUrl();
}
