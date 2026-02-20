#!/usr/bin/env bun

import { Pool } from 'pg';

type CountryRow = {
  country: string;
  count_last_1h: string;
  count_last_24h: string;
};

const DEFAULT_WEBHOOK_ENV_VARS = ['WPM_HOURLY_DISCORD_WEBHOOK'];

const DEFAULT_LOG_PREFIX = '[news-country-discord]';
const MAX_DISCORD_CHARS = 1900;

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

async function postToDiscord(webhookUrl: string, content: string): Promise<void> {
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ content })
  });

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
    const topCountries = parseTopCountriesLimit();
    const selectedRows = topCountries > 0 ? rows.slice(0, topCountries) : rows;

    const total1h = rows.reduce((acc, row) => acc + Number(row.count_last_1h), 0);
    const total24h = rows.reduce((acc, row) => acc + Number(row.count_last_24h), 0);

    const lines = selectedRows
      .map((row, index) => `${index + 1}. ${row.country}: 1h ${row.count_last_1h}, 24h ${row.count_last_24h}`);

    const header = [
      `📰 PressLab Hourly Country Intake (${new Date().toISOString()})`,
      `Source: news_articles`,
      `Last 1h: ${total1h.toLocaleString()} / Last 24h: ${total24h.toLocaleString()}`,
      lines.length > 0 ? '' : 'No records in news_articles.'
    ].join('\n');

    const chunks = splitIntoChunks([header, ...(lines.length > 0 ? lines : []), `Total ${rows.length} countries. Showing ${lines.length}.`]);

    for (const content of chunks) {
      await postToDiscord(webhookUrl, content);
    }
    console.log(`${DEFAULT_LOG_PREFIX} posted ${chunks.length} message(s), ${rows.length} country rows (show ${lines.length}).`);
  } finally {
    await pool.end().catch(() => void 0);
  }
}

main().catch((error) => {
  console.error(`${DEFAULT_LOG_PREFIX} failed`, error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
