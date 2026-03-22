const DEFAULT_WPR_PG_PORT = '5432';
const DEFAULT_DATABASE_URL_PREFIX = 'postgresql://postgres:postgres@127.0.0.1:';

export function getDefaultDatabaseUrl(): string {
  const port = (process.env.WPR_PG_PORT || process.env.WPM_PG_PORT || '').trim() || DEFAULT_WPR_PG_PORT;
  const dbName = (process.env.WPR_DATABASE_NAME || process.env.WPM_DATABASE_NAME || '').trim() || 'wpr';
  return `${DEFAULT_DATABASE_URL_PREFIX}${port}/${dbName}`;
}

export function resolveDatabaseUrl(): string {
  const configured = process.env.DATABASE_URL?.trim();
  if (configured) return configured;
  return getDefaultDatabaseUrl();
}
