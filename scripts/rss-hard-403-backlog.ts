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
  countries: AtlasCountry[];
};

type Row = {
  country: string;
  source: string;
  outlet_id: string;
  method: string;
  endpoint_url: string;
  health_classification: string | null;
  parsed_ok: boolean | null;
  fetched_count: number | null;
  ran_at: string;
};

type BacklogAction =
  | 'CANONICAL_SWAP_CANDIDATE'
  | 'MANUAL_SCOPE_CHANGE_REVIEW'
  | 'BROWSER_FALLBACK_CANDIDATE'
  | 'SOFT_403_COOLDOWN'
  | 'MANUAL_WAF_REVIEW';

type BacklogItem = {
  country: string;
  source: string;
  outletId: string;
  method: string;
  atlasUrl: string | null;
  latestFailedUrl: string;
  latestFailure: string | null;
  latestFailedAt: string;
  latestSuccessUrl: string | null;
  latestSuccessAt: string | null;
  action: BacklogAction;
  rationale: string;
};

type CliOptions = {
  days: number;
  atlasPath: string;
  outputJsonPath: string;
  outputMdPath: string;
  runner: string;
};

const BROWSER_FALLBACK_HOSTS = new Set([
  'www.standaard.be',
  'www.nieuwsblad.be',
  'www.gva.be',
  'www.hbvl.be',
  'www.rtl.be',
  'rtl.be',
]);

const MANUAL_SCOPE_CHANGE_SOURCES = [
  'cnn brasil',
  'financial times germany',
  'tempo.co',
  'cna singapore',
  'radio sweden - sweden today',
  'unian',
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
    days: parseNumberArg('days', 7, 1, 90),
    atlasPath: process.env.ATLAS_PATH || resolve(process.cwd(), 'data/rss-atlas.json'),
    outputJsonPath: resolve(process.cwd(), 'audits/rss_hard_403_backlog_latest.json'),
    outputMdPath: resolve(process.cwd(), 'audits/rss_hard_403_backlog_latest.md'),
    runner: parseArgValue('runner') || 'worker',
  };
}

function loadAtlas(atlasPath: string): Atlas {
  return JSON.parse(readFileSync(atlasPath, 'utf8')) as Atlas;
}

function getAtlasUrl(atlas: Atlas, country: string, source: string, method: string): string | null {
  const countryEntry = atlas.countries.find((entry) => entry.name === country);
  const feed = countryEntry?.feeds.find((entry) => entry.name === source && entry.enabled !== false);
  if (!feed) return null;
  if (method === 'sitemap') return feed.sitemapUrl || null;
  return feed.url || null;
}

function tryParseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

async function loadRows(pool: Pool, options: CliOptions): Promise<Row[]> {
  const sql = `
    with ranked as (
      select
        country,
        source,
        outlet_id,
        method,
        coalesce(final_url, requested_url) as endpoint_url,
        health_classification,
        parsed_ok,
        fetched_count,
        ran_at,
        row_number() over (
          partition by country, source, method, coalesce(final_url, requested_url)
          order by ran_at desc
        ) as rn
      from rss_health_status
      where runner = $1
        and coalesce(final_url, requested_url) is not null
        and ran_at >= now() - ($2 * interval '1 day')
    )
    select
      country,
      source,
      outlet_id,
      method,
      endpoint_url,
      health_classification,
      parsed_ok,
      fetched_count,
      ran_at
    from ranked
    where rn = 1
    order by country, source, method;
  `;

  const result = await pool.query<Row>(sql, [options.runner, options.days]);
  return result.rows;
}

function buildBacklog(rows: Row[], atlas: Atlas): BacklogItem[] {
  const latestSuccessByKey = new Map<string, Row>();
  const latestFailureRows: Row[] = [];

  for (const row of rows) {
    const key = `${row.country}|||${row.source}|||${row.method}`;
    if (row.parsed_ok && (row.fetched_count || 0) > 0) {
      const existing = latestSuccessByKey.get(key);
      if (!existing || new Date(row.ran_at).getTime() > new Date(existing.ran_at).getTime()) {
        latestSuccessByKey.set(key, row);
      }
      continue;
    }
    const normalizedSource = row.source.trim().toLowerCase();
    const isManualScopeChange = MANUAL_SCOPE_CHANGE_SOURCES.some((value) => normalizedSource.includes(value));
    if ((row.health_classification || '').includes('http_403') || isManualScopeChange) {
      latestFailureRows.push(row);
    }
  }

  const backlog = latestFailureRows.map((row) => {
    const key = `${row.country}|||${row.source}|||${row.method}`;
    const latestSuccess = latestSuccessByKey.get(key) || null;
    const atlasUrl = getAtlasUrl(atlas, row.country, row.source, row.method);
    const parsed = tryParseUrl(row.endpoint_url);
    const normalizedSource = row.source.trim().toLowerCase();
    const isManualScopeChange = MANUAL_SCOPE_CHANGE_SOURCES.some((value) => normalizedSource.includes(value));

    let action: BacklogAction = 'MANUAL_WAF_REVIEW';
    let rationale = 'hard 403 with no safe recovery signal';

    if (isManualScopeChange) {
      action = 'MANUAL_SCOPE_CHANGE_REVIEW';
      rationale = 'candidate replacement changes source meaning, section scope, or feed format';
    } else if (latestSuccess && latestSuccess.endpoint_url !== row.endpoint_url) {
      action = 'CANONICAL_SWAP_CANDIDATE';
      rationale = 'same source has a different recent successful endpoint';
    } else if (row.method === 'sitemap' && parsed && BROWSER_FALLBACK_HOSTS.has(parsed.hostname.toLowerCase())) {
      action = 'BROWSER_FALLBACK_CANDIDATE';
      rationale = 'blocked sitemap is on a host compatible with browser fallback';
    } else if (row.method === 'rss') {
      action = 'SOFT_403_COOLDOWN';
      rationale = 'repeated RSS 403 should back off before more retries';
    }

    return {
      country: row.country,
      source: row.source,
      outletId: row.outlet_id,
      method: row.method,
      atlasUrl,
      latestFailedUrl: row.endpoint_url,
      latestFailure: row.health_classification,
      latestFailedAt: row.ran_at,
      latestSuccessUrl: latestSuccess?.endpoint_url || null,
      latestSuccessAt: latestSuccess?.ran_at || null,
      action,
      rationale,
    };
  });

  backlog.sort((a, b) => {
    const actionScore = (value: BacklogAction) =>
      value === 'CANONICAL_SWAP_CANDIDATE' ? 3
      : value === 'BROWSER_FALLBACK_CANDIDATE' ? 2
      : value === 'SOFT_403_COOLDOWN' ? 1
      : 0;
    const byAction = actionScore(b.action) - actionScore(a.action);
    if (byAction !== 0) return byAction;
    const byCountry = a.country.localeCompare(b.country);
    if (byCountry !== 0) return byCountry;
    return a.source.localeCompare(b.source);
  });

  return backlog;
}

function writeArtifacts(outputJsonPath: string, outputMdPath: string, backlog: BacklogItem[], options: CliOptions): void {
  mkdirSync(dirname(outputJsonPath), { recursive: true });

  const payload = {
    generatedAt: new Date().toISOString(),
    days: options.days,
    runner: options.runner,
    summary: {
      total: backlog.length,
      byAction: Object.fromEntries(
        backlog.reduce((map, item) => {
          map.set(item.action, (map.get(item.action) || 0) + 1);
          return map;
        }, new Map<string, number>())
      ),
    },
    backlog,
  };

  writeFileSync(outputJsonPath, `${JSON.stringify(payload, null, 2)}\n`);

  const lines = [
    '# RSS Hard 403 Backlog',
    '',
    `Generated: ${payload.generatedAt}`,
    `Lookback days: ${options.days}`,
    `Runner: ${options.runner}`,
    '',
    `- Total backlog items: ${payload.summary.total}`,
    '',
    '## Backlog',
    '',
    '| Country | Source | Method | Action | Latest failed URL | Rationale |',
    '| --- | --- | --- | --- | --- | --- |',
    ...backlog.map((item) => `| ${item.country} | ${item.source} | ${item.method} | ${item.action} | ${item.latestFailedUrl} | ${item.rationale} |`),
    '',
  ];

  writeFileSync(outputMdPath, `${lines.join('\n')}\n`);
}

async function main(): Promise<void> {
  const options = parseOptions();
  const atlas = loadAtlas(options.atlasPath);
  const pool = new Pool({ connectionString: resolveDatabaseUrl() });

  try {
    const rows = await loadRows(pool, options);
    const backlog = buildBacklog(rows, atlas);
    writeArtifacts(options.outputJsonPath, options.outputMdPath, backlog, options);
    console.log(
      JSON.stringify(
        {
          total: backlog.length,
          byAction: Object.fromEntries(
            backlog.reduce((map, item) => {
              map.set(item.action, (map.get(item.action) || 0) + 1);
              return map;
            }, new Map<string, number>())
          ),
          outputJsonPath: options.outputJsonPath,
          outputMdPath: options.outputMdPath,
        },
        null,
        2
      )
    );
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
