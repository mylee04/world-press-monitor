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
  version: number;
  generatedAt: string;
  lastChecked: string;
  countries: AtlasCountry[];
};

type CandidateRow = {
  country: string;
  source: string;
  outlet_id: string;
  failed_method: string;
  failed_url: string;
  failed_reason: string | null;
  failed_at: string;
  success_method: string;
  success_url: string;
  success_count: number;
  success_at: string;
};

type SwapKind =
  | 'WWW_NORMALIZATION'
  | 'TRAILING_SLASH'
  | 'QUERY_CANONICAL'
  | 'SOURCE_ALLOWLIST_HOST_SWAP'
  | 'RSS_TO_SITEMAP_PROMOTION';

type CandidateAction = 'AUTO_APPLY' | 'REVIEW' | 'SKIP';

type Candidate = {
  country: string;
  source: string;
  outletId: string;
  failedMethod: string;
  successMethod: string;
  currentAtlasUrl: string;
  failedUrl: string;
  successUrl: string;
  failedReason: string | null;
  successCount: number;
  failedAt: string;
  successAt: string;
  swapKind: SwapKind | null;
  action: CandidateAction;
  rationale: string;
};

type CliOptions = {
  days: number;
  apply: boolean;
  atlasPath: string;
  outputJsonPath: string;
  outputMdPath: string;
  runner: string;
  countries: Set<string>;
};

const SAFE_QUERY_KEYS = new Set(['format', 'outputtype', '_outputtype']);

const SOURCE_HOST_SWAP_ALLOWLIST: Array<{
  match: string;
  hostIncludes: string[];
}> = [
  { match: 'marketwatch', hostIncludes: ['feeds.content.dowjones.io'] },
  { match: 'cbc', hostIncludes: ['www.cbc.ca'] },
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

function parseListArg(name: string): Set<string> {
  const raw = parseArgValue(name);
  if (!raw) return new Set();
  return new Set(
    raw
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean)
  );
}

function parseOptions(): CliOptions {
  return {
    days: parseNumberArg('days', 7, 1, 90),
    apply: process.argv.includes('--apply'),
    atlasPath: process.env.ATLAS_PATH || resolve(process.cwd(), 'data/rss-atlas.json'),
    outputJsonPath: resolve(process.cwd(), 'audits/rss_auto_repair_candidates_latest.json'),
    outputMdPath: resolve(process.cwd(), 'audits/rss_auto_repair_candidates_latest.md'),
    runner: parseArgValue('runner') || 'worker',
    countries: parseListArg('countries'),
  };
}

function loadAtlas(atlasPath: string): Atlas {
  return JSON.parse(readFileSync(atlasPath, 'utf8')) as Atlas;
}

function writeAtlas(atlasPath: string, atlas: Atlas): void {
  writeFileSync(atlasPath, `${JSON.stringify(atlas, null, 2)}\n`);
}

function tryParseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function normalizeUrlString(value: string): string {
  return value.trim();
}

function withoutTrailingSlash(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith('/')) return pathname.slice(0, -1);
  return pathname;
}

function normalizeHost(hostname: string): string {
  return hostname.trim().toLowerCase();
}

function normalizeComparable(url: URL): string {
  const clone = new URL(url.toString());
  clone.hostname = normalizeHost(clone.hostname).replace(/^www\./, '');
  clone.pathname = withoutTrailingSlash(clone.pathname);
  clone.hash = '';
  return clone.toString();
}

function isWwwNormalization(failed: URL, success: URL): boolean {
  const failedHost = normalizeHost(failed.hostname);
  const successHost = normalizeHost(success.hostname);
  if (failedHost === successHost) return false;
  const stripFailed = failedHost.replace(/^www\./, '');
  const stripSuccess = successHost.replace(/^www\./, '');
  if (stripFailed !== stripSuccess) return false;
  return (
    withoutTrailingSlash(failed.pathname) === withoutTrailingSlash(success.pathname)
    && failed.search === success.search
  );
}

function isTrailingSlashSwap(failed: URL, success: URL): boolean {
  return normalizeComparable(failed) === normalizeComparable(success) && failed.pathname !== success.pathname;
}

function isSafeQueryCanonical(failed: URL, success: URL): boolean {
  if (normalizeHost(failed.hostname) !== normalizeHost(success.hostname)) return false;
  if (withoutTrailingSlash(failed.pathname) !== withoutTrailingSlash(success.pathname)) return false;
  if (!success.searchParams.size) return false;
  for (const key of success.searchParams.keys()) {
    if (!SAFE_QUERY_KEYS.has(key.toLowerCase())) return false;
  }
  return true;
}

function isAllowlistedHostSwap(source: string, success: URL): boolean {
  const normalizedSource = source.trim().toLowerCase();
  return SOURCE_HOST_SWAP_ALLOWLIST.some((rule) =>
    normalizedSource.includes(rule.match)
    && rule.hostIncludes.some((host) => normalizeHost(success.hostname).includes(host))
  );
}

function classifySwap(
  source: string,
  failedMethod: string,
  successMethod: string,
  failedUrl: string,
  successUrl: string
): { kind: SwapKind | null; rationale: string } {
  const failed = tryParseUrl(failedUrl);
  const success = tryParseUrl(successUrl);
  if (!failed || !success) return { kind: null, rationale: 'invalid_url' };

  if (failedMethod === 'rss' && successMethod === 'sitemap') {
    return { kind: 'RSS_TO_SITEMAP_PROMOTION', rationale: 'same source has a healthy sitemap while rss endpoint fails' };
  }

  if (isWwwNormalization(failed, success)) {
    return { kind: 'WWW_NORMALIZATION', rationale: 'host differs only by www normalization' };
  }
  if (isTrailingSlashSwap(failed, success)) {
    return { kind: 'TRAILING_SLASH', rationale: 'path differs only by trailing slash' };
  }
  if (isSafeQueryCanonical(failed, success)) {
    return { kind: 'QUERY_CANONICAL', rationale: 'same host/path with canonical rss/xml query variant' };
  }
  if (isAllowlistedHostSwap(source, success)) {
    return { kind: 'SOURCE_ALLOWLIST_HOST_SWAP', rationale: 'source is allowlisted for this official host swap' };
  }

  return { kind: null, rationale: 'candidate is not in safe auto-apply classes' };
}

function findAtlasFeed(atlas: Atlas, country: string, source: string): AtlasFeed | null {
  const countryEntry = atlas.countries.find((entry) => entry.name === country);
  if (!countryEntry) return null;
  return countryEntry.feeds.find((feed) => feed.name === source && feed.enabled !== false) || null;
}

async function loadCandidateRows(pool: Pool, options: CliOptions): Promise<CandidateRow[]> {
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
    ),
    latest_endpoint as (
      select * from ranked where rn = 1
    ),
    failed as (
      select * from latest_endpoint where coalesce(parsed_ok, false) = false
    ),
    succeeded as (
      select * from latest_endpoint where coalesce(parsed_ok, false) = true and coalesce(fetched_count, 0) > 0
    ),
    paired as (
      select
        f.country,
        f.source,
        f.outlet_id,
        f.method as failed_method,
        f.endpoint_url as failed_url,
        f.health_classification as failed_reason,
        f.ran_at as failed_at,
        s.method as success_method,
        s.endpoint_url as success_url,
        s.fetched_count as success_count,
        s.ran_at as success_at,
        row_number() over (
          partition by f.country, f.source
          order by s.ran_at desc, s.fetched_count desc, s.endpoint_url
        ) as success_rank
      from failed f
      join succeeded s
        on s.country = f.country
       and s.source = f.source
       and s.endpoint_url <> f.endpoint_url
    )
    select
      country,
      source,
      outlet_id,
      failed_method,
      failed_url,
      failed_reason,
      failed_at,
      success_method,
      success_url,
      success_count,
      success_at
    from paired
    where success_rank = 1
    order by country, source;
  `;

  const result = await pool.query<CandidateRow>(sql, [options.runner, options.days]);
  return result.rows;
}

function buildCandidates(rows: CandidateRow[], atlas: Atlas, options: CliOptions): Candidate[] {
  const candidates: Candidate[] = [];

  for (const row of rows) {
    if (options.countries.size > 0 && !options.countries.has(row.country.trim().toLowerCase())) continue;
    const atlasFeed = findAtlasFeed(atlas, row.country, row.source);
    if (!atlasFeed) continue;

    const currentSlotValue = row.failed_method === 'sitemap' ? atlasFeed.sitemapUrl : atlasFeed.url;
    if (!currentSlotValue) continue;
    const atlasUrl = normalizeUrlString(currentSlotValue);
    const failedUrl = normalizeUrlString(row.failed_url);
    if (atlasUrl !== failedUrl) continue;

    const { kind, rationale } = classifySwap(row.source, row.failed_method, row.success_method, failedUrl, row.success_url);
    const action: CandidateAction = kind ? 'AUTO_APPLY' : 'REVIEW';
    candidates.push({
      country: row.country,
      source: row.source,
      outletId: row.outlet_id,
      failedMethod: row.failed_method,
      successMethod: row.success_method,
      currentAtlasUrl: atlasUrl,
      failedUrl,
      successUrl: normalizeUrlString(row.success_url),
      failedReason: row.failed_reason,
      successCount: Number(row.success_count) || 0,
      failedAt: row.failed_at,
      successAt: row.success_at,
      swapKind: kind,
      action,
      rationale,
    });
  }

  candidates.sort((a, b) => {
    const actionScore = (value: CandidateAction) => (value === 'AUTO_APPLY' ? 2 : value === 'REVIEW' ? 1 : 0);
    const byAction = actionScore(b.action) - actionScore(a.action);
    if (byAction !== 0) return byAction;
    const byCountry = a.country.localeCompare(b.country);
    if (byCountry !== 0) return byCountry;
    return a.source.localeCompare(b.source);
  });

  return candidates;
}

function applyCandidates(atlas: Atlas, candidates: Candidate[]): number {
  const byKey = new Map(candidates.filter((candidate) => candidate.action === 'AUTO_APPLY').map((candidate) => [`${candidate.country}|||${candidate.source}`, candidate]));
  let applied = 0;
  for (const country of atlas.countries) {
    for (const feed of country.feeds || []) {
      if (feed.enabled === false) continue;
      const candidate = byKey.get(`${country.name}|||${feed.name}`);
      if (!candidate) continue;
      const currentSlotValue = candidate.failedMethod === 'sitemap' ? feed.sitemapUrl : feed.url;
      if (!currentSlotValue || normalizeUrlString(currentSlotValue) !== candidate.failedUrl) continue;
      if (candidate.swapKind === 'RSS_TO_SITEMAP_PROMOTION') {
        delete feed.url;
        feed.sitemapUrl = candidate.successUrl;
      } else if (candidate.failedMethod === 'sitemap') {
        feed.sitemapUrl = candidate.successUrl;
      } else {
        feed.url = candidate.successUrl;
      }
      applied += 1;
    }
  }
  return applied;
}

function writeArtifacts(outputJsonPath: string, outputMdPath: string, candidates: Candidate[], appliedCount: number, options: CliOptions): void {
  mkdirSync(dirname(outputJsonPath), { recursive: true });

  const payload = {
    generatedAt: new Date().toISOString(),
    days: options.days,
    runner: options.runner,
    apply: options.apply,
    appliedCount,
    summary: {
      total: candidates.length,
      autoApply: candidates.filter((candidate) => candidate.action === 'AUTO_APPLY').length,
      review: candidates.filter((candidate) => candidate.action === 'REVIEW').length,
      byKind: Object.fromEntries(
        candidates.reduce((map, candidate) => {
          const key = candidate.swapKind || 'UNCLASSIFIED';
          map.set(key, (map.get(key) || 0) + 1);
          return map;
        }, new Map<string, number>())
      ),
    },
    candidates,
  };

  writeFileSync(outputJsonPath, `${JSON.stringify(payload, null, 2)}\n`);

  const lines = [
    '# RSS Auto-Repair Candidates',
    '',
    `Generated: ${payload.generatedAt}`,
    `Lookback days: ${options.days}`,
    `Runner: ${options.runner}`,
    `Apply mode: ${options.apply ? 'yes' : 'no'}`,
    `Applied count: ${appliedCount}`,
    '',
    `- Total candidates: ${payload.summary.total}`,
    `- Auto-apply: ${payload.summary.autoApply}`,
    `- Review: ${payload.summary.review}`,
    '',
    '## Candidates',
    '',
    '| Country | Source | Failed method | Success method | Action | Kind | Failed | Success | Reason |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...candidates.map((candidate) =>
      `| ${candidate.country} | ${candidate.source} | ${candidate.failedMethod} | ${candidate.successMethod} | ${candidate.action} | ${candidate.swapKind || 'UNCLASSIFIED'} | ${candidate.failedUrl} | ${candidate.successUrl} | ${candidate.rationale} |`
    ),
    '',
  ];

  writeFileSync(outputMdPath, `${lines.join('\n')}\n`);
}

async function main(): Promise<void> {
  const options = parseOptions();
  const atlas = loadAtlas(options.atlasPath);
  const pool = new Pool({ connectionString: resolveDatabaseUrl() });

  try {
    const rows = await loadCandidateRows(pool, options);
    const candidates = buildCandidates(rows, atlas, options);
    const appliedCount = options.apply ? applyCandidates(atlas, candidates) : 0;
    if (options.apply && appliedCount > 0) {
      writeAtlas(options.atlasPath, atlas);
    }
    writeArtifacts(options.outputJsonPath, options.outputMdPath, candidates, appliedCount, options);
    console.log(
      JSON.stringify(
        {
          total: candidates.length,
          autoApply: candidates.filter((candidate) => candidate.action === 'AUTO_APPLY').length,
          review: candidates.filter((candidate) => candidate.action === 'REVIEW').length,
          appliedCount,
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
