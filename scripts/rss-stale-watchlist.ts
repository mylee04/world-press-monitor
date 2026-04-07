#!/usr/bin/env bun
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { Pool } from 'pg';
import { resolveDatabaseUrl } from '@/lib/database-url';

type AtlasFeed = {
  name: string;
  url?: string | null;
  sitemapUrl?: string | null;
  enabled?: boolean;
};

type AtlasCountry = {
  name: string;
  code: string;
  feeds: AtlasFeed[];
};

type Atlas = {
  version?: number;
  generatedAt?: string;
  lastChecked?: string;
  countries: AtlasCountry[];
};

type LatestSuccessRow = {
  country: string;
  source: string;
  latest_ran_at: string;
  newest_item_published_at: string;
  methods_seen: string[];
};

type StaleAction = 'KEEP' | 'WATCH' | 'DISABLE_CANDIDATE' | 'AUTO_DISABLE' | 'EXEMPT_ARCHIVE' | 'HIGH_VALUE_STALE_HOLD' | 'FUTURE_DATED_HOLD';

type StaleItem = {
  country: string;
  source: string;
  atlasUrl: string | null;
  atlasSitemapUrl: string | null;
  latestRanAt: string;
  newestItemPublishedAt: string;
  staleDays: number;
  methodsSeen: string[];
  action: StaleAction;
  rationale: string;
};

type CliOptions = {
  days: number;
  watchDays: number;
  candidateDays: number;
  autoDisableDays: number;
  safeDisableDays: number;
  applyDisable: boolean;
  runner: string;
  atlasPath: string;
  outputJsonPath: string;
  outputMdPath: string;
  outputSafeDisableJsonPath: string;
  outputSafeDisableMdPath: string;
};

const HIGH_VALUE_STALE_COUNTRIES = new Set(['Belgium']);
const HIGH_VALUE_STALE_SOURCE_PATTERNS = [
  /\bcbc\b/i,
  /\bantara\b/i,
  /people\.cn/i,
  /\bvg\b/i,
  /aftonbladet/i,
];
const HIGH_VALUE_STALE_HOST_PATTERNS = [
  /(^|\.)cbc\.ca$/i,
  /(^|\.)antaranews\.com$/i,
  /(^|\.)people\.com\.cn$/i,
  /(^|\.)vg\.no$/i,
  /(^|\.)aftonbladet\.se$/i,
];

function parseArgValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  const arg = process.argv.find((entry) => entry.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : undefined;
}

function parseNumberArg(name: string, fallback: number, min: number, max: number): number {
  const raw = parseArgValue(name);
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function parseOptions(): CliOptions {
  return {
    days: parseNumberArg('days', 30, 1, 180),
    watchDays: parseNumberArg('watch-days', 3, 1, 90),
    candidateDays: parseNumberArg('candidate-days', 7, 1, 180),
    autoDisableDays: parseNumberArg('auto-disable-days', 14, 1, 365),
    safeDisableDays: parseNumberArg('safe-disable-days', 30, 7, 365),
    applyDisable: process.argv.includes('--apply-disable'),
    runner: parseArgValue('runner') || 'worker',
    atlasPath: process.env.ATLAS_PATH || resolve(process.cwd(), 'data/rss-atlas.json'),
    outputJsonPath: resolve(process.cwd(), 'audits/rss_stale_watchlist_latest.json'),
    outputMdPath: resolve(process.cwd(), 'audits/rss_stale_watchlist_latest.md'),
    outputSafeDisableJsonPath: resolve(process.cwd(), 'audits/rss_safe_disable_now_latest.json'),
    outputSafeDisableMdPath: resolve(process.cwd(), 'audits/rss_safe_disable_now_latest.md'),
  };
}

function loadAtlas(atlasPath: string): Atlas {
  return JSON.parse(readFileSync(atlasPath, 'utf8')) as Atlas;
}

function writeAtlas(atlasPath: string, atlas: Atlas): void {
  writeFileSync(atlasPath, `${JSON.stringify(atlas, null, 2)}\n`);
}

async function loadLatestSuccessfulSources(pool: Pool, options: CliOptions): Promise<LatestSuccessRow[]> {
  const sql = `
    with successful as (
      select
        country,
        source,
        method,
        newest_item_published_at,
        ran_at,
        row_number() over (
          partition by country, source, method
          order by ran_at desc
        ) as rn
      from rss_health_status
      where runner = $1
        and coalesce(parsed_ok, false) = true
        and coalesce(fetched_count, 0) > 0
        and newest_item_published_at is not null
        and ran_at >= now() - ($2 * interval '1 day')
    ),
    latest_by_method as (
      select * from successful where rn = 1
    )
    select
      country,
      source,
      max(ran_at)::text as latest_ran_at,
      max(newest_item_published_at)::text as newest_item_published_at,
      array_agg(method order by method) as methods_seen
    from latest_by_method
    group by country, source
    order by country, source;
  `;

  const result = await pool.query<LatestSuccessRow>(sql, [options.runner, options.days]);
  return result.rows;
}

function isArchiveLikeCandidate(
  source: string,
  atlasUrl: string | null,
  atlasSitemapUrl: string | null,
  methodsSeen: string[],
  newestItemPublishedAt: string,
  staleDays: number
): boolean {
  const normalizedSource = source.trim().toLowerCase();
  const urlSignals = `${atlasUrl || ''} ${atlasSitemapUrl || ''}`.toLowerCase();
  const sitemapOnly = methodsSeen.length > 0 && methodsSeen.every((value) => value === 'sitemap');
  const publishedYear = new Date(newestItemPublishedAt).getUTCFullYear();

  const hasArchiveLikeSourceSignal = (
    normalizedSource.includes('sitemap index')
    || normalizedSource.includes('articles sitemap')
    || normalizedSource.includes('news sitemap')
    || normalizedSource.includes('google news sitemap')
    || normalizedSource.includes('googlenews')
    || normalizedSource.includes('archive')
  );

  const hasArchiveLikeUrlSignal = (
    urlSignals.includes('/sitemap')
    || urlSignals.includes('sitemap.xml')
    || urlSignals.includes('sitemap-news')
    || urlSignals.includes('sitemapnews')
    || urlSignals.includes('googlenews')
    || urlSignals.includes('.xml.gz')
  );

  return sitemapOnly && staleDays >= 30 && (hasArchiveLikeSourceSignal || hasArchiveLikeUrlSignal || publishedYear < 2020);
}

function extractHost(value: string | null): string {
  if (!value) return '';
  try {
    return new URL(value).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return '';
  }
}

function isHighValueStaleHold(
  country: string,
  source: string,
  atlasUrl: string | null,
  atlasSitemapUrl: string | null
): boolean {
  if (HIGH_VALUE_STALE_COUNTRIES.has(country)) return true;

  const normalizedSource = source.trim().toLowerCase();
  const hosts = [extractHost(atlasUrl), extractHost(atlasSitemapUrl)].filter(Boolean);

  if (HIGH_VALUE_STALE_SOURCE_PATTERNS.some((pattern) => pattern.test(normalizedSource))) {
    return true;
  }

  return hosts.some((host) => HIGH_VALUE_STALE_HOST_PATTERNS.some((pattern) => pattern.test(host)));
}

function classifyStale(
  country: string,
  source: string,
  atlasUrl: string | null,
  atlasSitemapUrl: string | null,
  methodsSeen: string[],
  newestItemPublishedAt: string,
  staleDays: number,
  options: CliOptions
): { action: StaleAction; rationale: string } {
  if (staleDays <= -1) {
    return {
      action: 'FUTURE_DATED_HOLD',
      rationale: `newest item is ${Math.abs(staleDays).toFixed(1)} days in the future; held for manual review`
    };
  }
  if (isArchiveLikeCandidate(source, atlasUrl, atlasSitemapUrl, methodsSeen, newestItemPublishedAt, staleDays)) {
    return {
      action: 'EXEMPT_ARCHIVE',
      rationale: `archive/index-style sitemap endpoint with ${staleDays.toFixed(1)} stale days`
    };
  }
  if (staleDays >= options.candidateDays && isHighValueStaleHold(country, source, atlasUrl, atlasSitemapUrl)) {
    return {
      action: 'HIGH_VALUE_STALE_HOLD',
      rationale: `high-value source held for manual review at ${staleDays.toFixed(1)} stale days`
    };
  }
  if (staleDays >= options.autoDisableDays) {
    return { action: 'AUTO_DISABLE', rationale: `newest item is ${staleDays.toFixed(1)} days old` };
  }
  if (staleDays >= options.candidateDays) {
    return { action: 'DISABLE_CANDIDATE', rationale: `newest item is ${staleDays.toFixed(1)} days old` };
  }
  if (staleDays >= options.watchDays) {
    return { action: 'WATCH', rationale: `newest item is ${staleDays.toFixed(1)} days old` };
  }
  return { action: 'KEEP', rationale: `newest item is ${staleDays.toFixed(1)} days old` };
}

function buildItems(atlas: Atlas, latestRows: LatestSuccessRow[], options: CliOptions): StaleItem[] {
  const latestByKey = new Map(latestRows.map((row) => [`${row.country}|||${row.source}`, row]));
  const nowMs = Date.now();
  const items: StaleItem[] = [];

  for (const country of atlas.countries || []) {
    for (const feed of country.feeds || []) {
      if (feed.enabled === false) continue;
      if (!feed.url && !feed.sitemapUrl) continue;
      const latest = latestByKey.get(`${country.name}|||${feed.name}`);
      if (!latest?.newest_item_published_at) continue;
      const newestMs = new Date(latest.newest_item_published_at).getTime();
      if (!Number.isFinite(newestMs)) continue;
      const staleDays = (nowMs - newestMs) / (1000 * 60 * 60 * 24);
      const { action, rationale } = classifyStale(
        country.name,
        feed.name,
        feed.url || null,
        feed.sitemapUrl || null,
        latest.methods_seen || [],
        latest.newest_item_published_at,
        staleDays,
        options
      );
      items.push({
        country: country.name,
        source: feed.name,
        atlasUrl: feed.url || null,
        atlasSitemapUrl: feed.sitemapUrl || null,
        latestRanAt: latest.latest_ran_at,
        newestItemPublishedAt: latest.newest_item_published_at,
        staleDays,
        methodsSeen: latest.methods_seen || [],
        action,
        rationale,
      });
    }
  }

  items.sort((a, b) => {
    const actionScore = (value: StaleAction) =>
      value === 'AUTO_DISABLE'
        ? 4
        : value === 'HIGH_VALUE_STALE_HOLD'
          ? 3
          : value === 'FUTURE_DATED_HOLD'
            ? 3
          : value === 'DISABLE_CANDIDATE'
            ? 2
            : value === 'WATCH'
              ? 1
              : 0;
    const byAction = actionScore(b.action) - actionScore(a.action);
    if (byAction !== 0) return byAction;
    return b.staleDays - a.staleDays;
  });

  return items;
}

function buildSafeDisableNowItems(items: StaleItem[], options: CliOptions): StaleItem[] {
  return items.filter((item) => item.action === 'AUTO_DISABLE' && item.staleDays >= options.safeDisableDays);
}

function applyDisable(atlas: Atlas, items: StaleItem[], options: CliOptions): number {
  const targets = new Set(buildSafeDisableNowItems(items, options).map((item) => `${item.country}|||${item.source}`));
  let disabled = 0;
  for (const country of atlas.countries || []) {
    for (const feed of country.feeds || []) {
      if (feed.enabled === false) continue;
      if (!targets.has(`${country.name}|||${feed.name}`)) continue;
      feed.enabled = false;
      disabled += 1;
    }
  }
  return disabled;
}

function writeArtifacts(outputJsonPath: string, outputMdPath: string, items: StaleItem[], disabledCount: number, options: CliOptions): void {
  const safeDisableNowItems = buildSafeDisableNowItems(items, options);
  mkdirSync(dirname(outputJsonPath), { recursive: true });
  const payload = {
    generatedAt: new Date().toISOString(),
    days: options.days,
    watchDays: options.watchDays,
    candidateDays: options.candidateDays,
    autoDisableDays: options.autoDisableDays,
    applyDisable: options.applyDisable,
    disabledCount,
    summary: {
      total: items.length,
      watch: items.filter((item) => item.action === 'WATCH').length,
      disableCandidate: items.filter((item) => item.action === 'DISABLE_CANDIDATE').length,
      autoDisable: items.filter((item) => item.action === 'AUTO_DISABLE').length,
      highValueHold: items.filter((item) => item.action === 'HIGH_VALUE_STALE_HOLD').length,
      futureDatedHold: items.filter((item) => item.action === 'FUTURE_DATED_HOLD').length,
      exemptArchive: items.filter((item) => item.action === 'EXEMPT_ARCHIVE').length,
      safeDisableNow: safeDisableNowItems.length,
    },
    items,
  };
  writeFileSync(outputJsonPath, `${JSON.stringify(payload, null, 2)}\n`);

  const lines = [
    '# RSS Stale Watchlist',
    '',
    `Generated: ${payload.generatedAt}`,
    `Lookback days: ${options.days}`,
    `Watch days: ${options.watchDays}`,
    `Disable candidate days: ${options.candidateDays}`,
    `Auto-disable days: ${options.autoDisableDays}`,
    `Apply disable: ${options.applyDisable ? 'yes' : 'no'}`,
    `Disabled count: ${disabledCount}`,
    '',
    `- Total items: ${payload.summary.total}`,
    `- Watch: ${payload.summary.watch}`,
    `- Disable candidate: ${payload.summary.disableCandidate}`,
    `- Auto-disable: ${payload.summary.autoDisable}`,
    `- High-value stale hold: ${payload.summary.highValueHold}`,
    `- Future-dated hold: ${payload.summary.futureDatedHold}`,
    `- Exempt archive/index: ${payload.summary.exemptArchive}`,
    `- Safe disable now: ${payload.summary.safeDisableNow}`,
    '',
    '| Country | Source | Action | Stale days | Newest item | Methods |',
    '| --- | --- | --- | --- | --- | --- |',
    ...items.map((item) => `| ${item.country} | ${item.source} | ${item.action} | ${item.staleDays.toFixed(1)} | ${item.newestItemPublishedAt} | ${item.methodsSeen.join(',')} |`),
    '',
  ];
  writeFileSync(outputMdPath, `${lines.join('\n')}\n`);

  const safePayload = {
    generatedAt: payload.generatedAt,
    days: options.days,
    autoDisableDays: options.autoDisableDays,
    safeDisableDays: options.safeDisableDays,
    total: safeDisableNowItems.length,
    items: safeDisableNowItems,
  };
  writeFileSync(options.outputSafeDisableJsonPath, `${JSON.stringify(safePayload, null, 2)}\n`);

  const safeLines = [
    '# RSS Safe Disable Now',
    '',
    `Generated: ${payload.generatedAt}`,
    `Lookback days: ${options.days}`,
    `Auto-disable days: ${options.autoDisableDays}`,
    `Safe disable now days: ${options.safeDisableDays}`,
    `Total items: ${safeDisableNowItems.length}`,
    '',
    '| Country | Source | Stale days | Newest item | Methods |',
    '| --- | --- | --- | --- | --- |',
    ...safeDisableNowItems.map((item) => `| ${item.country} | ${item.source} | ${item.staleDays.toFixed(1)} | ${item.newestItemPublishedAt} | ${item.methodsSeen.join(',')} |`),
    '',
  ];
  writeFileSync(options.outputSafeDisableMdPath, `${safeLines.join('\n')}\n`);
}

async function main(): Promise<void> {
  const options = parseOptions();
  const atlas = loadAtlas(options.atlasPath);
  const pool = new Pool({ connectionString: resolveDatabaseUrl() });
  try {
    const latestRows = await loadLatestSuccessfulSources(pool, options);
    const items = buildItems(atlas, latestRows, options);
    const disabledCount = options.applyDisable ? applyDisable(atlas, items, options) : 0;
    if (options.applyDisable && disabledCount > 0) {
      writeAtlas(options.atlasPath, atlas);
    }
    writeArtifacts(options.outputJsonPath, options.outputMdPath, items, disabledCount, options);
    console.log(JSON.stringify({
      total: items.length,
      watch: items.filter((item) => item.action === 'WATCH').length,
      disableCandidate: items.filter((item) => item.action === 'DISABLE_CANDIDATE').length,
      autoDisable: items.filter((item) => item.action === 'AUTO_DISABLE').length,
      highValueHold: items.filter((item) => item.action === 'HIGH_VALUE_STALE_HOLD').length,
      futureDatedHold: items.filter((item) => item.action === 'FUTURE_DATED_HOLD').length,
      exemptArchive: items.filter((item) => item.action === 'EXEMPT_ARCHIVE').length,
      safeDisableNow: buildSafeDisableNowItems(items, options).length,
      disabledCount,
      outputJsonPath: options.outputJsonPath,
      outputMdPath: options.outputMdPath,
      outputSafeDisableJsonPath: options.outputSafeDisableJsonPath,
      outputSafeDisableMdPath: options.outputSafeDisableMdPath,
    }, null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
