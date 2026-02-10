import { appendFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { PRESET_BY_KEY } from '../data/outlets';

const DEFAULT_BASE_URL = 'http://localhost:3000';
const DEFAULT_INTERVAL_SEC = 120;
const DEFAULT_LIMIT = 3000;
const LOG_FILE = resolve(process.cwd(), 'audits/top10-major-monitor.log');

function getEnv(name: string): string {
  return (process.env[name] || '').trim();
}

function nowIso(): string {
  return new Date().toISOString();
}

function ensureLogDir(): void {
  mkdirSync(resolve(process.cwd(), 'audits'), { recursive: true });
}

function appendLog(line: string): void {
  ensureLogDir();
  appendFileSync(LOG_FILE, `${line}\n`, 'utf8');
}

function buildUrl(limit: number): string {
  const preset = PRESET_BY_KEY.get('top10_major');
  if (!preset || preset.outletIds.length === 0) {
    throw new Error('top10_major preset is missing or empty');
  }
  const base = getEnv('APP_BASE_URL') || DEFAULT_BASE_URL;
  const query = new URLSearchParams();
  query.set('outlets', preset.outletIds.join(','));
  query.set('limit', String(limit));
  return `${base}/api/news?${query.toString()}`;
}

async function collectOnce(url: string): Promise<void> {
  const started = Date.now();
  const response = await fetch(url);
  const elapsed = Date.now() - started;

  if (!response.ok) {
    const text = (await response.text()).slice(0, 300).replace(/\s+/g, ' ');
    const line = `[${nowIso()}] status=fail http=${response.status} elapsedMs=${elapsed} body="${text}"`;
    console.error(line);
    appendLog(line);
    return;
  }

  const payload = await response.json() as {
    count?: number;
    ingestion?: {
      totalEndpoints?: number;
      okEndpoints?: number;
      failedEndpoints?: number;
      circuitOpenEndpoints?: number;
    };
    persistence?: {
      storage?: string;
      persisted?: number;
      externalPersisted?: number;
      error?: string;
    };
  };

  const line = [
    `[${nowIso()}]`,
    'status=ok',
    `elapsedMs=${elapsed}`,
    `items=${payload.count || 0}`,
    `endpoints_ok=${payload.ingestion?.okEndpoints || 0}`,
    `endpoints_fail=${payload.ingestion?.failedEndpoints || 0}`,
    `circuit_open=${payload.ingestion?.circuitOpenEndpoints || 0}`,
    `persisted=${payload.persistence?.persisted || 0}`,
    `external_persisted=${payload.persistence?.externalPersisted || 0}`,
    `storage=${payload.persistence?.storage || 'unknown'}`,
    payload.persistence?.error ? `persist_error="${payload.persistence.error.replace(/\s+/g, ' ')}"` : ''
  ].filter(Boolean).join(' ');

  console.log(line);
  appendLog(line);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const once = args.includes('--once');
  const intervalSec = Math.max(
    60,
    Number.parseInt(getEnv('TOP10_MONITOR_INTERVAL_SEC') || `${DEFAULT_INTERVAL_SEC}`, 10) || DEFAULT_INTERVAL_SEC
  );
  const limit = Math.max(
    500,
    Number.parseInt(getEnv('TOP10_MONITOR_LIMIT') || `${DEFAULT_LIMIT}`, 10) || DEFAULT_LIMIT
  );
  const url = buildUrl(limit);

  if (once) {
    await collectOnce(url);
    return;
  }

  const startLine = `[${nowIso()}] monitor=start intervalSec=${intervalSec} limit=${limit} url=${url}`;
  console.log(startLine);
  appendLog(startLine);

  for (;;) {
    try {
      await collectOnce(url);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const line = `[${nowIso()}] status=error message="${message.replace(/\s+/g, ' ')}"`;
      console.error(line);
      appendLog(line);
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, intervalSec * 1000));
  }
}

void main();
