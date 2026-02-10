import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type Row = {
  source: string;
  country: string;
  total24h: number;
  errors: string;
};

type CacheHealth = {
  requests: number;
  hits: {
    memory: number;
    redis: number;
  };
  misses: {
    memoryExpiredOrMissing: number;
    redisMissing: number;
    noRedisConfigured: number;
  };
};

type WarmSummary = {
  elapsedMs: number;
  warm: {
    requests: number;
    success: number;
    failed: number;
    totalItems: number;
    chunks: number;
    chunkSize: number;
    outlets: number;
  };
};

type WarmStatusResponse = {
  ok: boolean;
  generatedAt: string;
  lastWarm: WarmSummary | null;
};

type OpsSummary = {
  storage: 'postgres' | 'disabled';
  generatedAt: string;
  totals: {
    uniqueItems24h: number;
    sourceCount24h: number;
    seenTotal24h: number;
    duplicateCandidates24h: number;
    duplicateRate24h: number;
    endpointRuns24h: number;
    failedRuns24h: number;
    failureRate24h: number;
    externalArticles24h: number;
    translatedTitleCoverage24h: number;
    translatedSummaryCoverage24h: number;
  };
};

const AUDITS_DIR = resolve(process.cwd(), 'audits');
const FILE_PREFIX = 'source_daily_counts_';
const FILE_SUFFIX = '.csv';
let dotenvCache: Record<string, string> | null = null;

function loadDotenvMap(): Record<string, string> {
  if (dotenvCache) return dotenvCache;

  const out: Record<string, string> = {};
  const envCandidates = [
    resolve(process.cwd(), '.env.local'),
    resolve(process.cwd(), '.env')
  ];

  for (const envPath of envCandidates) {
    try {
      const raw = readFileSync(envPath, 'utf8');
      const lines = raw.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eq = trimmed.indexOf('=');
        if (eq <= 0) continue;
        const key = trimmed.slice(0, eq).trim();
        let value = trimmed.slice(eq + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        if (key && value) out[key] = value;
      }
    } catch {
      // ignore missing/invalid env files
    }
  }

  dotenvCache = out;
  return out;
}

function envValue(key: string): string {
  return process.env[key] || loadDotenvMap()[key] || '';
}

function loadWebhookFromDotenvFiles(): string | null {
  const value = envValue('DISCORD_WEBHOOK_URL');
  return value || null;
}

function parseArgs(): { dryRun: boolean; filePath: string | null } {
  const args = process.argv.slice(2);
  let dryRun = false;
  let filePath: string | null = null;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--dry-run') dryRun = true;
    if (arg === '--file' && i + 1 < args.length) {
      filePath = resolve(process.cwd(), args[i + 1]);
      i += 1;
    }
  }

  return { dryRun, filePath };
}

function latestCsvFile(): string {
  const files = readdirSync(AUDITS_DIR)
    .filter((file) => file.startsWith(FILE_PREFIX) && file.endsWith(FILE_SUFFIX))
    .sort();

  if (files.length === 0) {
    throw new Error('No daily source CSV found in audits/. Run `bun run report:daily-sources` first.');
  }

  return resolve(AUDITS_DIR, files[files.length - 1]);
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      const next = line[i + 1];
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === ',' && !inQuotes) {
      out.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  out.push(current);
  return out;
}

function loadRows(csvPath: string): Row[] {
  const raw = readFileSync(csvPath, 'utf8').trim();
  if (!raw) return [];
  const lines = raw.split('\n');
  if (lines.length <= 1) return [];

  const header = parseCsvLine(lines[0]);
  const sourceIdx = header.indexOf('source');
  const countryIdx = header.indexOf('country');
  const totalIdx = header.indexOf('total_24h');
  const errorsIdx = header.indexOf('errors');

  if (sourceIdx < 0 || countryIdx < 0 || totalIdx < 0 || errorsIdx < 0) {
    throw new Error('CSV schema mismatch: expected source/country/total_24h/errors columns.');
  }

  return lines.slice(1).map((line) => {
    const cols = parseCsvLine(line);
    return {
      source: cols[sourceIdx] || '',
      country: cols[countryIdx] || '',
      total24h: Number(cols[totalIdx] || '0'),
      errors: cols[errorsIdx] || ''
    };
  });
}

function isUs(country: string): boolean {
  const c = country.trim().toLowerCase();
  return c === 'us' || c === 'united states';
}

function isLatam(country: string): boolean {
  const c = country.trim().toLowerCase();
  return c === 'latam' || c === 'latin america' || c === 'chile' || c === 'argentina' || c === 'uruguay';
}

function sum(rows: Row[]): number {
  return rows.reduce((acc, row) => acc + row.total24h, 0);
}

function topSources(rows: Row[], n = 5): Row[] {
  return [...rows].sort((a, b) => b.total24h - a.total24h).slice(0, n);
}

async function fetchCacheHealth(): Promise<CacheHealth | null> {
  const baseUrl = envValue('NEWS_CACHE_HEALTH_URL') || envValue('APP_BASE_URL') || 'http://localhost:3000';
  const endpoint = `${baseUrl.replace(/\/$/, '')}/api/news-cache-health`;

  try {
    const response = await fetch(endpoint, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(2500)
    });
    if (!response.ok) return null;
    const json = await response.json() as { cache?: CacheHealth };
    return json.cache || null;
  } catch {
    return null;
  }
}

async function fetchWarmSummary(): Promise<WarmSummary | null> {
  const explicit = envValue('NEWS_WARM_REPORT_URL').trim();
  const fallbackBase = (envValue('NEWS_CACHE_HEALTH_URL') || envValue('APP_BASE_URL') || 'http://localhost:3000').replace(/\/$/, '');
  const base = explicit || `${fallbackBase}/api/news-warm`;
  const token = envValue('NEWS_WARM_TOKEN').trim();
  const statusEndpointBase = `${base}${base.includes('?') ? '&' : '?'}mode=status`;
  const statusEndpoint = token
    ? `${statusEndpointBase}&token=${encodeURIComponent(token)}`
    : statusEndpointBase;

  try {
    const response = await fetch(statusEndpoint, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(4000)
    });
    if (response.ok) {
      const json = await response.json() as WarmStatusResponse;
      if (json?.lastWarm?.warm) return json.lastWarm;
    }
  } catch {
    return null;
  }
  return null;
}

async function fetchOpsSummary(): Promise<OpsSummary | null> {
  const baseUrl = envValue('NEWS_CACHE_HEALTH_URL') || envValue('APP_BASE_URL') || 'http://localhost:3000';
  const endpoint = `${baseUrl.replace(/\/$/, '')}/api/ops/ingestion`;

  try {
    const response = await fetch(endpoint, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(3000)
    });
    if (!response.ok) return null;
    return await response.json() as OpsSummary;
  } catch {
    return null;
  }
}

function buildMessage(
  rows: Row[],
  stamp: string,
  cacheHealth: CacheHealth | null,
  warmSummary: WarmSummary | null,
  opsSummary: OpsSummary | null
): string {
  const usRows = rows.filter((row) => isUs(row.country));
  const latamRows = rows.filter((row) => isLatam(row.country));
  const total = sum(rows);
  const withErrors = rows.filter((row) => row.errors.trim().length > 0).length;
  const top5Rows = topSources(rows, 5);
  const top = top5Rows
    .map((row) => `- ${row.source}: ${row.total24h}`)
    .join('\n');
  const cacheEn = cacheHealth
    ? `- Cache health: req ${cacheHealth.requests} · hit(mem ${cacheHealth.hits.memory}, redis ${cacheHealth.hits.redis}) · miss(mem ${cacheHealth.misses.memoryExpiredOrMissing}, redis ${cacheHealth.misses.redisMissing}, no-redis ${cacheHealth.misses.noRedisConfigured})`
    : '- Cache health: unavailable';
  const cacheEs = cacheHealth
    ? `- Salud de caché: req ${cacheHealth.requests} · hit(mem ${cacheHealth.hits.memory}, redis ${cacheHealth.hits.redis}) · miss(mem ${cacheHealth.misses.memoryExpiredOrMissing}, redis ${cacheHealth.misses.redisMissing}, sin-redis ${cacheHealth.misses.noRedisConfigured})`
    : '- Salud de caché: no disponible';
  const warmEn = warmSummary
    ? `- Warm run: ${warmSummary.warm.success}/${warmSummary.warm.requests} ok · failed ${warmSummary.warm.failed} · outlets ${warmSummary.warm.outlets} · chunks ${warmSummary.warm.chunks}x${warmSummary.warm.chunkSize} · items ${warmSummary.warm.totalItems} · ${warmSummary.elapsedMs}ms`
    : '- Warm run: unavailable';
  const warmEs = warmSummary
    ? `- Ejecución warm: ${warmSummary.warm.success}/${warmSummary.warm.requests} ok · fallidas ${warmSummary.warm.failed} · fuentes ${warmSummary.warm.outlets} · bloques ${warmSummary.warm.chunks}x${warmSummary.warm.chunkSize} · items ${warmSummary.warm.totalItems} · ${warmSummary.elapsedMs}ms`
    : '- Ejecución warm: no disponible';
  const opsEn = opsSummary
    ? `- 24h quality: duplicate rate ${opsSummary.totals.duplicateRate24h.toFixed(1)}% · failure rate ${opsSummary.totals.failureRate24h.toFixed(1)}% (${opsSummary.totals.failedRuns24h}/${opsSummary.totals.endpointRuns24h})`
    : '- 24h quality: unavailable';
  const translationEn = opsSummary
    ? `- Translation coverage: title_en ${opsSummary.totals.translatedTitleCoverage24h.toFixed(1)}% · summary_en ${opsSummary.totals.translatedSummaryCoverage24h.toFixed(1)}% (base ${opsSummary.totals.externalArticles24h})`
    : '- Translation coverage: unavailable';
  const opsEs = opsSummary
    ? `- Calidad 24h: tasa duplicados ${opsSummary.totals.duplicateRate24h.toFixed(1)}% · tasa fallos ${opsSummary.totals.failureRate24h.toFixed(1)}% (${opsSummary.totals.failedRuns24h}/${opsSummary.totals.endpointRuns24h})`
    : '- Calidad 24h: no disponible';
  const translationEs = opsSummary
    ? `- Cobertura de traducción: title_en ${opsSummary.totals.translatedTitleCoverage24h.toFixed(1)}% · summary_en ${opsSummary.totals.translatedSummaryCoverage24h.toFixed(1)}% (base ${opsSummary.totals.externalArticles24h})`
    : '- Cobertura de traducción: no disponible';

  return [
    `**PressLab Daily Ingestion (US + LATAM) — ${stamp}**`,
    '',
    '**EN**',
    `- Total 24h items: ${total}`,
    `- US: ${sum(usRows)} items across ${usRows.length} sources`,
    `- LATAM: ${sum(latamRows)} items across ${latamRows.length} sources`,
    `- Sources with errors: ${withErrors}`,
    opsEn,
    translationEn,
    cacheEn,
    warmEn,
    '- Top sources (24h):',
    top || '- (no data)',
    '',
    '**ES**',
    `- Total de items (24h): ${total}`,
    `- EE.UU.: ${sum(usRows)} items en ${usRows.length} fuentes`,
    `- LATAM: ${sum(latamRows)} items en ${latamRows.length} fuentes`,
    `- Fuentes con errores: ${withErrors}`,
    opsEs,
    translationEs,
    cacheEs,
    warmEs,
    '- Fuentes principales (24h):',
    top || '- (sin datos)'
  ].join('\n');
}

async function postToDiscord(webhookUrl: string, content: string): Promise<void> {
  if (content.length > 1900) {
    throw new Error(`Discord payload too long (${content.length} chars). Reduce message length.`);
  }

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Discord webhook failed: ${response.status} ${response.statusText} - ${text}`);
  }
}

async function main(): Promise<void> {
  const { dryRun, filePath } = parseArgs();
  const csvPath = filePath || latestCsvFile();
  const rows = loadRows(csvPath);
  const stamp = new Date().toISOString().slice(0, 10);
  const [cacheHealth, warmSummary, opsSummary] = await Promise.all([
    fetchCacheHealth(),
    fetchWarmSummary(),
    fetchOpsSummary()
  ]);
  const message = buildMessage(rows, stamp, cacheHealth, warmSummary, opsSummary);

  if (dryRun) {
    console.log(message);
    return;
  }

  const webhookUrl = envValue('DISCORD_WEBHOOK_URL') || loadWebhookFromDotenvFiles();
  if (!webhookUrl) {
    throw new Error('Missing DISCORD_WEBHOOK_URL env var.');
  }

  await postToDiscord(webhookUrl, message);
  console.log('Posted daily US/LATAM ingestion summary to Discord.');
}

void main();
