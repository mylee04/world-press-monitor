#!/usr/bin/env bun
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { formatCanadaPrioritySourcesCsv, isCanadaPrioritySourceName } from '../lib/canada-priority-outlets';

type Mode = 'priority' | 'reconcile' | 'rss-fastlane';
type AtlasFeed = {
  name?: string;
  url?: string | null;
  sitemapUrl?: string | null;
};
type AtlasCountry = {
  name?: string;
  feeds?: AtlasFeed[];
};
type AtlasCatalog = {
  countries?: AtlasCountry[];
};

const DEFAULT_RECONCILE_DAYS = 2;
const ATLAS_PATH = resolve(process.cwd(), 'data/rss-atlas.json');

function parseArgValue(prefix: string): string | null {
  const token = process.argv.slice(2).find((value) => value.startsWith(prefix));
  return token ? token.slice(prefix.length).trim() : null;
}

function parseMode(): Mode {
  const raw = (parseArgValue('--mode=') || 'priority').toLowerCase();
  if (raw === 'rss-fastlane') return 'rss-fastlane';
  return raw === 'reconcile' ? 'reconcile' : 'priority';
}

function parseIntArg(prefix: string, fallback: number): number {
  const raw = parseArgValue(prefix);
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function formatDateOnlyUtc(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function buildReconcileWindow(days: number): { from: string; to: string } {
  const now = new Date();
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
  return {
    from: formatDateOnlyUtc(start),
    to: formatDateOnlyUtc(end),
  };
}

function loadCanadaPriorityRssOnlySources(): string[] {
  const raw = readFileSync(ATLAS_PATH, 'utf8');
  const atlas = JSON.parse(raw) as AtlasCatalog;
  const canada = (atlas.countries || []).find((country) => (country.name || '').trim() === 'Canada');
  return (canada?.feeds || [])
    .filter((feed) => isCanadaPrioritySourceName(feed.name))
    .filter((feed) => typeof feed.url === 'string' && feed.url.trim().length > 0)
    .filter((feed) => !(typeof feed.sitemapUrl === 'string' && feed.sitemapUrl.trim().length > 0))
    .map((feed) => (feed.name || '').trim())
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right));
}

function buildCommand(mode: Mode, reconcileDays: number): { args: string[]; env: Record<string, string> } {
  if (mode === 'reconcile') {
    const window = buildReconcileWindow(reconcileDays);
    return {
      args: [
        'scripts/ingest-worker.ts',
        '--once',
        '--country=Canada',
        '--method=sitemap',
        `--backfill-from=${window.from}`,
        `--backfill-to=${window.to}`,
      ],
      env: {
        INGEST_BACKFILL_IGNORE_WATERMARK: 'true',
        INGEST_BACKFILL_IGNORE_BACKOFF: 'false',
      },
    };
  }

  if (mode === 'rss-fastlane') {
    const rssOnlySources = loadCanadaPriorityRssOnlySources();
    return {
      args: [
        'scripts/ingest-worker.ts',
        '--once',
        '--country=Canada',
        `--source=${rssOnlySources.join(',')}`,
        '--method=rss',
      ],
      env: {
        INGEST_FETCH_CONCURRENCY: '6',
        INGEST_ITEM_MAP_CONCURRENCY: '12',
      },
    };
  }

  return {
    args: [
      'scripts/ingest-worker.ts',
      '--once',
      '--country=Canada',
      `--source=${formatCanadaPrioritySourcesCsv()}`,
      '--method=rss',
      '--method=sitemap',
    ],
    env: {},
  };
}

function main(): void {
  const mode = parseMode();
  const reconcileDays = parseIntArg('--days=', DEFAULT_RECONCILE_DAYS);
  const printCommand = process.argv.includes('--print-command');
  const { args, env } = buildCommand(mode, reconcileDays);

  if (printCommand) {
    console.log(['bun', ...args].join(' '));
    console.log(JSON.stringify(env, null, 2));
    return;
  }

  const result = spawnSync('bun', args, {
    stdio: 'inherit',
    env: {
      ...process.env,
      ...env,
    },
  });

  if (typeof result.status === 'number') {
    process.exitCode = result.status;
    return;
  }

  if (result.error) {
    throw result.error;
  }
}

main();
