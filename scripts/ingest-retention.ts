#!/usr/bin/env bun

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pruneExpiredIngestionData } from '../lib/ingestion-store';

type CliOptions = {
  dryRun: boolean;
  writeJson: boolean;
  newsArticlesRetentionDays?: number;
  ingestOpsHourlyRetentionDays?: number;
  ingestOpsDailyRetentionDays?: number;
  rssHealthRetentionDays?: number;
};

const argv = process.argv.slice(2);
const options: CliOptions = {
  dryRun: argv.includes('--dry-run'),
  writeJson: parseBoolArg(argv, 'write-json'),
  newsArticlesRetentionDays: parseIntArg(argv, 'news-retention-days'),
  ingestOpsHourlyRetentionDays: parseIntArg(argv, 'ops-hourly-retention-days'),
  ingestOpsDailyRetentionDays: parseIntArg(argv, 'ops-daily-retention-days'),
  rssHealthRetentionDays: parseIntArg(argv, 'rss-health-retention-days')
};

const result = await pruneExpiredIngestionData({
  dryRun: options.dryRun,
  newsArticlesRetentionDays: options.newsArticlesRetentionDays,
  ingestOpsHourlyRetentionDays: options.ingestOpsHourlyRetentionDays,
  ingestOpsDailyRetentionDays: options.ingestOpsDailyRetentionDays,
  rssHealthRetentionDays: options.rssHealthRetentionDays
});

if (result.storage !== 'postgres') {
  console.error(`[ingest-retention] storage_disabled: ${result.reason || 'unknown'}`);
  process.exitCode = 1;
} else {
  const runMode = options.dryRun ? 'dry-run' : 'delete';
  const total = result.deleted.newsArticles + result.deleted.ingestOpsHourly + result.deleted.ingestOpsDaily + result.deleted.rssHealthStatus;

  console.log(`[ingest-retention] mode=${runMode}`);
  console.log(`[ingest-retention] news_articles deleted=${result.deleted.newsArticles}`);
  console.log(`[ingest-retention] ingest_ops_hourly deleted=${result.deleted.ingestOpsHourly}`);
  console.log(`[ingest-retention] ingest_ops_daily deleted=${result.deleted.ingestOpsDaily}`);
  console.log(`[ingest-retention] rss_health_status deleted=${result.deleted.rssHealthStatus}`);
  console.log(`[ingest-retention] total=${total}`);

  if (options.writeJson) {
    const payload = {
      generatedAt: new Date().toISOString(),
      mode: runMode,
      options,
      deleted: result.deleted,
      totalDeleted: total
    };
    const outputDir = resolve(process.cwd(), 'audits');
    mkdirSync(outputDir, { recursive: true });
    const stamp = new Date().toISOString().slice(0, 10);
    const latest = resolve(outputDir, 'ingest_retention_latest.json');
    const dated = resolve(outputDir, `ingest_retention_${stamp}.json`);
    const data = `${JSON.stringify(payload, null, 2)}\n`;
    writeFileSync(latest, data);
    writeFileSync(dated, data);
    console.log(`[ingest-retention] wrote ${latest}`);
    console.log(`[ingest-retention] wrote ${dated}`);
  }
}

function parseIntArg(argv: string[], key: string): number | undefined {
  const prefix = `--${key}=`;
  const withEqual = argv.find((item) => item.startsWith(prefix));
  if (withEqual) {
    const raw = withEqual.slice(prefix.length);
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  const idx = argv.indexOf(`--${key}`);
  if (idx >= 0 && argv[idx + 1] && !argv[idx + 1].startsWith('--')) {
    const parsed = Number.parseInt(argv[idx + 1], 10);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function parseBoolArg(argv: string[], key: string): boolean {
  return argv.includes(`--${key}`) || parseArgValue(argv, key) === '1' || parseArgValue(argv, key) === 'true';
}

function parseArgValue(argv: string[], key: string): string | undefined {
  const prefix = `--${key}=`;
  const withEqual = argv.find((item) => item.startsWith(prefix));
  if (withEqual) return withEqual.slice(prefix.length);
  const idx = argv.indexOf(`--${key}`);
  if (idx >= 0 && argv[idx + 1] && !argv[idx + 1].startsWith('--')) {
    return argv[idx + 1];
  }
  return undefined;
}
