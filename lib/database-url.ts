import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const DEFAULT_WPR_PG_PORT = '5432';
const DEFAULT_DATABASE_URL_PREFIX = 'postgresql://postgres:postgres@127.0.0.1:';
let localEnvLoaded = false;

function stripWrappingQuotes(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseEnvFile(filePath: string): void {
  if (!existsSync(filePath)) return;

  const lines = readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;

    const [, key, rawValue] = match;
    if ((process.env[key] || '').trim()) continue;
    process.env[key] = stripWrappingQuotes(rawValue);
  }
}

function ensureLocalDatabaseEnv(): void {
  if (localEnvLoaded) return;
  localEnvLoaded = true;

  const explicitEnvFile = (process.env.WPR_ENV_FILE || process.env.WPM_ENV_FILE || '').trim();
  const candidates = [
    explicitEnvFile || null,
    path.join(process.cwd(), '.env.local'),
    path.join(process.cwd(), '.env.macmini.local'),
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    parseEnvFile(candidate);
  }

  const port = (process.env.WPR_PG_PORT || process.env.WPM_PG_PORT || '').trim();
  if (port) {
    process.env.WPR_PG_PORT = port;
    process.env.WPM_PG_PORT = port;
  }

  const dbName = (process.env.WPR_DATABASE_NAME || process.env.WPM_DATABASE_NAME || '').trim();
  if (dbName) {
    process.env.WPR_DATABASE_NAME = dbName;
    process.env.WPM_DATABASE_NAME = dbName;
  }
}

export function getDefaultDatabaseUrl(): string {
  ensureLocalDatabaseEnv();
  const port = (process.env.WPR_PG_PORT || process.env.WPM_PG_PORT || '').trim() || DEFAULT_WPR_PG_PORT;
  const dbName = (process.env.WPR_DATABASE_NAME || process.env.WPM_DATABASE_NAME || '').trim() || 'wpr';
  return `${DEFAULT_DATABASE_URL_PREFIX}${port}/${dbName}`;
}

export function resolveDatabaseUrl(): string {
  ensureLocalDatabaseEnv();
  const configured = process.env.DATABASE_URL?.trim();
  if (configured) return configured;
  return getDefaultDatabaseUrl();
}
