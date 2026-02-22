#!/usr/bin/env bun

import { Pool } from 'pg';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type CountryRow = {
  country: string;
  count_last_1h: string;
  count_last_24h: string;
};

type AtlasCountry = {
  name: string;
  code?: string;
};

type AtlasCatalog = {
  countries?: AtlasCountry[];
};

const DEFAULT_WEBHOOK_ENV_VARS = ['WPM_HOURLY_DISCORD_WEBHOOK'];
const DEFAULT_ATLAS_PATH = resolve(process.cwd(), 'data/rss-atlas.json');

const DEFAULT_LOG_PREFIX = '[news-country-discord]';
const MAX_DISCORD_CHARS = 1900;

function redactWebhookUrlForLog(raw: string): string {
  try {
    const parsed = new URL(raw);
    const parts = parsed.pathname.split('/').filter(Boolean);
    const id = parts[parts.length - 2] ?? '';
    const token = parts[parts.length - 1] ?? '';
    return `${parsed.origin}${parts.length > 0 ? `.../${id}/${token.slice(-8)}` : ''}`;
  } catch {
    return '[invalid-url]';
  }
}

function formatElapsedMs(startMs: number): number {
  return Date.now() - startMs;
}

function pickWebhookUrl(): string {
  for (const key of DEFAULT_WEBHOOK_ENV_VARS) {
    const raw = process.env[key];
    if (!raw) continue;
    const trimmed = raw.trim();
    if (trimmed) return trimmed;
  }
  return '';
}

function parseTopCountriesLimit(): number {
  const raw = process.env.NEWS_COUNTRY_REPORT_TOP_COUNTRIES;
  if (!raw) return 0;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return parsed;
}

function splitIntoChunks(lines: string[]): string[] {
  const chunks: string[] = [''];
  let current = 0;

  for (const line of lines) {
    const next = line ? `${chunks[current] ? '\n' : ''}${line}` : '';
    if (line.length >= MAX_DISCORD_CHARS) {
      const safeChunk = chunks[current].trim();
      if (safeChunk.length > 0) {
        chunks.push(line);
      } else {
        chunks[current] = line;
      }
      chunks.push('');
      current = chunks.length - 1;
      continue;
    }

    if ((chunks[current].length + next.length) > MAX_DISCORD_CHARS) {
      current += 1;
      chunks[current] = line;
    } else {
      chunks[current] = `${chunks[current]}${next}`;
    }
  }

  return chunks.map((chunk) => chunk.trim()).filter((chunk) => chunk.length > 0);
}

function normalizeCountryValue(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function parseCountrySetFromEnv(raw: string | undefined): Set<string> {
  if (!raw) return new Set();
  return new Set(
    raw
      .split(',')
      .map((value) => normalizeCountryValue(value))
      .filter((value) => value.length > 0),
  );
}

function loadAtlasCountries(filePath: string): Set<string> {
  try {
    const atlasRaw = readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(atlasRaw) as AtlasCatalog;
    if (!Array.isArray(parsed.countries)) return new Set();

    const set = new Set<string>();
    for (const country of parsed.countries) {
      if (country?.name) set.add(normalizeCountryValue(country.name));
      if (country?.code) set.add(normalizeCountryValue(country.code));
    }
    return set;
  } catch (error) {
    console.warn(
      `${DEFAULT_LOG_PREFIX} failed to read atlas countries (${filePath}): ${error instanceof Error ? error.message : String(error)}`,
    );
    return new Set();
  }
}

function buildCountryFilterSet(): Set<string> {
  const explicitActive = parseCountrySetFromEnv(process.env.NEWS_COUNTRY_REPORT_ACTIVE_COUNTRIES);
  if (explicitActive.size > 0) return explicitActive;

  const atlasPath = process.env.ATLAS_PATH || DEFAULT_ATLAS_PATH;
  const fromAtlas = loadAtlasCountries(atlasPath);
  if (fromAtlas.size > 0) return fromAtlas;

  return new Set();
}

async function postToDiscord(webhookUrl: string, content: string): Promise<void> {
  const startedAt = Date.now();
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ content })
  });

  console.log(`${DEFAULT_LOG_PREFIX} discord_http_status=${response.status} elapsed_ms=${formatElapsedMs(startedAt)} url=${redactWebhookUrlForLog(webhookUrl)}`);
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`discord_webhook_http_${response.status}: ${text.slice(0, 400)}`);
  }
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not configured. Set DATABASE_URL in .env.local.');
  }

  const webhookUrl = pickWebhookUrl();
  if (!webhookUrl) {
    console.warn(`${DEFAULT_LOG_PREFIX} SKIP: no webhook configured. Set one of ${DEFAULT_WEBHOOK_ENV_VARS.join(', ')}.`);
    return;
  }

  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const query = `
      SELECT
        COALESCE(country, '(unknown)') AS country,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '1 hour')::bigint::text AS count_last_1h,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours')::bigint::text AS count_last_24h
      FROM news_articles
      GROUP BY COALESCE(country, '(unknown)')
      ORDER BY COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '1 hour') DESC, country ASC
    `;

    const result = await pool.query<CountryRow>(query);
    const rows = result.rows;
    const countryFilter = buildCountryFilterSet();
    const excludedCountries = parseCountrySetFromEnv(process.env.NEWS_COUNTRY_REPORT_EXCLUDED_COUNTRIES);

    const filteredRows = rows.filter((row) => {
      const normalized = normalizeCountryValue(row.country);
      if (countryFilter.size > 0 && !countryFilter.has(normalized)) return false;
      if (excludedCountries.size > 0 && excludedCountries.has(normalized)) return false;
      return true;
    });

    const unexpectedCountries = rows
      .filter((row) => countryFilter.size > 0 && !countryFilter.has(normalizeCountryValue(row.country)))
      .map((row) => row.country);

    const topCountries = parseTopCountriesLimit();
    const selectedRows = topCountries > 0 ? filteredRows.slice(0, topCountries) : filteredRows;

    const total1h = filteredRows.reduce((acc, row) => acc + Number(row.count_last_1h), 0);
    const total24h = filteredRows.reduce((acc, row) => acc + Number(row.count_last_24h), 0);

    const lines = selectedRows
      .map((row, index) => `${index + 1}. ${row.country}: 1h ${row.count_last_1h}, 24h ${row.count_last_24h}`);

    const header = [
      `📰 Hourly News Data Intake by Country (${new Date().toISOString()})`,
      `Source: news_articles`,
      `Last 1h: ${total1h.toLocaleString()} / Last 24h: ${total24h.toLocaleString()}`,
      countryFilter.size > 0 ? `Countries in scope: ${countryFilter.size}` : 'Countries in scope: all',
      unexpectedCountries.length > 0 ? `Unexpected countries in data: ${unexpectedCountries.join(', ')}` : '',
      lines.length > 0 ? '' : 'No records in news_articles.'
    ].join('\n');

    const chunks = splitIntoChunks([
      header,
      ...(lines.length > 0 ? lines : []),
      `Total ${filteredRows.length} countries. Showing ${selectedRows.length}.`,
    ]);

    for (const content of chunks) {
      await postToDiscord(webhookUrl, content);
    }
    console.log(`${DEFAULT_LOG_PREFIX} posted ${chunks.length} message(s), ${filteredRows.length} country rows (show ${selectedRows.length}).`);
  } finally {
    await pool.end().catch(() => void 0);
  }
}

main().catch((error) => {
  console.error(`${DEFAULT_LOG_PREFIX} failed`, error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
