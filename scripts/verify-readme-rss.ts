#!/usr/bin/env bun
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { lookup } from 'node:dns/promises';
import { resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { readIngestOpsDaily, readNewsArticlesEarliestCreatedAt } from '../lib/ingestion-store';

type AtlasFeed = {
  name: string;
  url: string | null;
  status: string | null;
  checkedDate: string | null;
  valid: string | null;
  row: number;
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

type CheckTask = {
  countryCode: string;
  countryName: string;
  outlet: string;
  url: string;
  feedRow: number;
};

type EndpointResult = {
  countryCode: string;
  countryName: string;
  outlet: string;
  url: string;
  feedRow: number;
  httpCode: number | null;
  failureReason: string | null;
  valid: boolean;
  checkedAt: string;
  xmlDetected: boolean;
};

type NetworkProbeResult = {
  ok: boolean;
  host: string;
  ips: string[];
  raw: string;
  error: string;
  skipped: boolean;
};

type CommandResult = {
  ok: boolean;
  command: string;
  code: number | null;
  stdout: string;
  stderr: string;
  error: string;
};

type ResolveProbeResult = {
  ok: boolean;
  host: string;
  ip: string | null;
  status: number | null;
  outputLine: string;
  reason: string;
};

type TextProbeResult = {
  ok: boolean;
  value?: string;
  error: string;
  skipped: boolean;
};

const README_PATH = process.env.README_PATH || resolve(process.cwd(), 'README.md');
const ATLAS_PATH = process.env.ATLAS_PATH || resolve(process.cwd(), 'data/rss-atlas.json');
const OUTPUT_DIR = resolve(process.cwd(), 'audits');
const NOW = new Date();
const CHECKED_DATE = toCheckedDate(NOW);

const BATCH_SIZE = clampInt(process.env.RSS_BATCH_SIZE, 1, 150, 30);
const BATCH_DELAY_MS = clampInt(process.env.RSS_BATCH_DELAY_MS, 0, 5000, 500);
const REQUEST_TIMEOUT_MS = clampInt(process.env.RSS_REQUEST_TIMEOUT_MS, 5000, 30000, 15000);
const REQUEST_JITTER_MS = clampInt(process.env.RSS_REQUEST_JITTER_MS, 0, 3000, 150);
const MAX_HTTP_REDIRECTS = clampInt(process.env.RSS_MAX_REDIRECTS, 1, 20, 8);
const PRECHECK_TIMEOUT_MS = clampInt(process.env.RSS_PRECHECK_TIMEOUT_MS, 1000, 30000, 5000);
const SHOULD_PRECHECK = process.argv.includes('--precheck') || process.argv.includes('--preflight');
const PRECHECK_URL = process.env.RSS_PRECHECK_URL || '';
const ONLY_VALID_IN_README = process.argv.includes('--valid-only');
const FEED_INGEST_BASELINE_DATE = parseBaselineDate(process.env.RSS_FEED_BASELINE_DATE || '');
let resolvedFeedBaselineDate: string | null = FEED_INGEST_BASELINE_DATE;
const FEED_INGEST_DAILY_WINDOW_DAYS = clampInt(process.env.RSS_FEED_DAILY_WINDOW_DAYS || '1', 1, 365, 1);

const COUNTRY_SECTION_HEADER = /^###\s+(.+?)\s+\(([^)]+)\)$/;
const XML_MARKERS = ['<rss', '<feed', '<urlset', '<sitemapindex', '<?xml'];
const USER_AGENT = 'PressLab-RSSReadmeVerifier/1.0 (+https://github.com/mylee04/world-press-monitor)';
const GETENT_TIMEOUT_MS = clampInt(process.env.RSS_PRECHECK_GETENT_TIMEOUT_MS, 500, 10000, 3000);
const SNAPSHOT_HEADING = '## Latest RSS verification snapshot';
const COMMAND_OUTPUT_MAX_CHARS = 12000;
const AUDIT_FILE_MODE = 0o600;

async function main(): Promise<void> {
  const atlas = loadAtlas();
  if (SHOULD_PRECHECK) {
    const precheckOk = await runNetworkPrecheck(atlas);
    if (!precheckOk) {
      console.log('Precheck status: NO_NETWORK/DNS_BROKEN');
      console.log('Abort: Full verification skipped to avoid mass false invalid marking.');
      process.exit(2);
    }
  }
  const source = readFileSync(README_PATH, 'utf8');
  const sourceLines = source.split(/\r?\n/);

  const tasks = buildCheckTasks(atlas);
  const results = await verifyEndpoints(tasks);
  const invalidResults = results.filter((result) => !result.valid);
  const sitemapFallback = await checkSitemapFallbackForInvalid(invalidResults);
  const recoveredFeedKeys = new Set(
    sitemapFallback.recoveredFeeds.map((item) => makeResultKey(item.countryCode, item.outlet, item.rssUrl))
  );
  const resultMap = buildResultMap(results);
  const feedIngestionSummary = await loadFeedIngestionSummary(atlas);
  const effectiveValidCount = results.filter(
    (result) => result.valid || recoveredFeedKeys.has(makeResultKey(result.countryCode, result.outlet, result.url))
  ).length;
  const effectiveInvalidResults = results.filter(
    (result) => !result.valid && !recoveredFeedKeys.has(makeResultKey(result.countryCode, result.outlet, result.url))
  );
  const summaryCounts = {
    countries: atlas.countries.length,
    totalFeeds: atlas.countries.reduce((acc, country) => acc + country.feeds.length, 0),
    checkedFeeds: results.length,
    valid: effectiveValidCount,
    invalid: effectiveInvalidResults.length,
    failureReasons: summarizeFailureReasons(effectiveInvalidResults),
    skippedNoSource: atlas.countries.reduce(
      (acc, country) => acc + country.feeds.filter((feed) => !feed.url).length,
      0,
    ),
    sitemapFallback,
  };

  const isRuntimeBlocked = isLikelyRuntimeNetworkFailure(results, summaryCounts);
  if (isRuntimeBlocked) {
    const stamp = NOW.toISOString().slice(0, 10);
    const outputPath = resolve(OUTPUT_DIR, `readme_rss_health_${stamp}.json`);
    const latestPath = resolve(OUTPUT_DIR, 'readme_rss_health_latest.json');
    const payload = {
      generatedAt: NOW.toISOString(),
      checkedDate: CHECKED_DATE,
      sourceFile: README_PATH,
      atlasFile: ATLAS_PATH,
      runtimeBlocked: true,
      summary: summaryCounts,
      results,
    };

    writeAuditJson(outputPath, payload);
    writeAuditJson(latestPath, payload);

    console.log('Validation appears to be blocked in this runtime: all checked feeds failed with NETWORK.');
    console.log('Skipping README snapshot overwrite to avoid false invalid marking from environment-level failures.');
    return;
  }

  const preface = getReadmePreface(sourceLines, summaryCounts, results, atlas, recoveredFeedKeys, feedIngestionSummary);
  const updatedSections = renderCountrySections(
    atlas,
    resultMap,
    recoveredFeedKeys,
    ONLY_VALID_IN_README,
    feedIngestionSummary
  );
  const updatedReadme = `${updateHeaderCheckedDate(preface)}\n${updatedSections.join('\n')}\n`;
  writeFileSync(README_PATH, updatedReadme, 'utf8');

  const stamp = NOW.toISOString().slice(0, 10);
  const reportPath = resolve(OUTPUT_DIR, `readme_rss_health_${stamp}.json`);
  const latestPath = resolve(OUTPUT_DIR, 'readme_rss_health_latest.json');
  const payload = {
    generatedAt: NOW.toISOString(),
    checkedDate: CHECKED_DATE,
    sourceFile: README_PATH,
    atlasFile: ATLAS_PATH,
    summary: summaryCounts,
    results,
  };

  writeAuditJson(reportPath, payload);
  writeAuditJson(latestPath, payload);

  console.log(`Checked ${summaryCounts.checkedFeeds} RSS endpoints`);
  console.log(`Valid: ${summaryCounts.valid}`);
  console.log(`Invalid: ${summaryCounts.invalid}`);
  console.log(`No-source rows: ${summaryCounts.skippedNoSource}`);
  if (summaryCounts.sitemapFallback) {
    const fallback = summaryCounts.sitemapFallback;
    console.log(`Sitemap fallback checks: checked=${fallback.checkedInvalidFeeds}, attempted=${fallback.attemptedFeeds}, success=${fallback.succeededFeeds}, failed=${fallback.failedFeeds}, no-candidate=${fallback.noCandidateFeeds}`);
  }
  if (Object.keys(summaryCounts.failureReasons).length > 0) {
    console.log(`Failure reasons:`);
    for (const [reason, count] of Object.entries(summaryCounts.failureReasons).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${reason}: ${count}`);
    }
  } else {
    console.log(`Failure reasons: none`);
  }
  console.log(`Wrote README: ${README_PATH}`);
  console.log(`Wrote report: ${reportPath}`);
}

function loadAtlas(): Atlas {
  const raw = readFileSync(ATLAS_PATH, 'utf8');
  const parsed = JSON.parse(raw) as Atlas;
  if (!Array.isArray(parsed.countries)) {
    throw new Error(`Invalid atlas format in ${ATLAS_PATH}`);
  }
  return parsed;
}

function buildCheckTasks(atlas: Atlas): CheckTask[] {
  const tasks: CheckTask[] = [];
  for (const country of atlas.countries) {
    for (const feed of country.feeds) {
      if (feed.enabled === false) continue;
      if (!feed.url) continue;
      tasks.push({
        countryCode: country.code,
        countryName: country.name,
        outlet: feed.name,
        url: feed.url,
        feedRow: Number.isFinite(feed.row) ? feed.row : 0,
      });
    }
  }
  return tasks;
}

async function loadFeedIngestionSummary(atlas: Atlas): Promise<FeedIngestionSummary> {
  const baselineDate = await resolveFeedBaselineDate();
  const summary: FeedIngestionSummary = {
    enabled: true,
    baselineDate,
    dailyWindowDays: FEED_INGEST_DAILY_WINDOW_DAYS,
    countsByOutlet: new Map<string, FeedIngestionCount>()
  };

  if (atlas.countries.length === 0) {
    return summary;
  }

  const dailyResult = await readIngestOpsDaily({
    runner: 'worker',
    days: FEED_INGEST_DAILY_WINDOW_DAYS,
    limit: 1000000
  });
  const cumulativeResult = await readIngestOpsDaily({
    runner: 'worker',
    from: baselineDate,
    limit: 1000000
  });

  if (dailyResult.storage !== 'postgres' || cumulativeResult.storage !== 'postgres') {
    return {
      ...summary,
      enabled: false
    };
  }

  for (const row of dailyResult.rows) {
    const current = summary.countsByOutlet.get(row.outletId) || { daily: 0, cumulative: 0 };
    current.daily += Number(row.validCount) || 0;
    summary.countsByOutlet.set(row.outletId, current);
  }
  for (const row of cumulativeResult.rows) {
    const current = summary.countsByOutlet.get(row.outletId) || { daily: 0, cumulative: 0 };
    current.cumulative += Number(row.validCount) || 0;
    summary.countsByOutlet.set(row.outletId, current);
  }

  return summary;
}

async function resolveFeedBaselineDate(): Promise<string> {
  if (resolvedFeedBaselineDate) return resolvedFeedBaselineDate;

  const earliest = await readNewsArticlesEarliestCreatedAt();
  if (earliest.storage === 'postgres' && earliest.earliestCreatedAt) {
    const date = parseBaselineDate(earliest.earliestCreatedAt);
    if (date) {
      resolvedFeedBaselineDate = date;
      return date;
    }
  }

  const fallback = toIsoDate(new Date(NOW.getTime() - 365 * 24 * 60 * 60 * 1000));
  resolvedFeedBaselineDate = fallback;
  return fallback;
}

async function runNetworkPrecheck(atlas: Atlas): Promise<boolean> {
  const isMac = process.platform === 'darwin';
  const sampleFeed =
    PRECHECK_URL || atlas.countries.flatMap((country) => country.feeds).find((feed) => feed.url)?.url;

  if (!sampleFeed) {
    console.log('Precheck skipped: no candidate RSS URL available');
    return false;
  }

  console.log('--- Network precheck ---');
  let host = '';
  try {
    host = new URL(sampleFeed).hostname;
  } catch {
    console.log(`Precheck URL parse failed: ${sampleFeed}`);
    return false;
  }

  const googleDnsGetent = isMac ? skippedGetentResult('www.google.com') : probeGetentDns('www.google.com');
  const sampleDnsGetent = isMac ? skippedGetentResult(host) : probeGetentDns(host);
  const googleDnsNode = await probeDns('www.google.com');
  const sampleDnsNode = await probeDns(host);
  const resolvConf = readTextFile('/etc/resolv.conf');
  const nsswitchConf = isMac
    ? { ok: false, value: '', error: 'SKIP_MACOS', skipped: true }
    : { ...readTextFile('/etc/nsswitch.conf'), skipped: false };

  const httpResult = await probeHttp(sampleFeed);
  const resolvedIp = sampleDnsGetent.ips[0] || sampleDnsNode.ips[0] || null;
  const curlResolveResult = resolvedIp ? await probeCurlResolve(sampleFeed, host, resolvedIp) : null;
  const googleResolveResult = await probeCurlResolve('https://www.google.com', 'www.google.com', googleDnsGetent.ips[0] || googleDnsNode.ips[0]);

  if (sampleDnsGetent.skipped) {
    console.log(`DNS (getent) ${host}: SKIP (not available on macOS)`);
  } else {
    console.log(
      `DNS (getent) ${host}: ${sampleDnsGetent.ok ? `OK (${sampleDnsGetent.ips.join(', ')})` : `FAIL (${sampleDnsGetent.error})`}`
    );
  }
  console.log(`DNS (node) ${host}: ${sampleDnsNode.ok ? `OK (${sampleDnsNode.ips.join(', ')})` : `FAIL (${sampleDnsNode.error})`}`);
  if (googleDnsGetent.skipped) {
    console.log(`DNS (getent) www.google.com: SKIP (not available on macOS)`);
  } else {
    console.log(
      `DNS (getent) www.google.com: ${
        googleDnsGetent.ok ? `OK (${googleDnsGetent.ips.join(', ')})` : `FAIL (${googleDnsGetent.error})`
      }`
    );
  }
  console.log(`DNS (node) www.google.com: ${googleDnsNode.ok ? `OK (${googleDnsNode.ips.join(', ')})` : `FAIL (${googleDnsNode.error})`}`);

  if (resolvConf.ok) {
    const lines = getConfLines(resolvConf.value || '');
    console.log('resolv.conf:');
    for (const line of lines.slice(0, 8)) {
      console.log(`  ${line}`);
    }
  } else {
    console.log(`resolv.conf: FAIL (${resolvConf.error})`);
  }

  if (nsswitchConf.skipped) {
    console.log('nsswitch.conf: SKIP (not used on macOS)');
  } else if (nsswitchConf.ok) {
    const hostsLine = extractNsswitchHostsLine(nsswitchConf.value || '');
    console.log(`nsswitch hosts line: ${hostsLine || '(none)'}`);
  } else {
    console.log(`nsswitch.conf: FAIL (${nsswitchConf.error})`);
  }

  console.log(
    `HTTP ${sampleFeed}: ${httpResult.ok ? 'OK' : 'FAIL'} (${httpResult.status ?? 'ERR'}) ${httpResult.extra}`
  );
  if (curlResolveResult) {
    if (curlResolveResult.ok) {
      console.log(`curl --resolve ${host} OK (${curlResolveResult.status})`);
    } else {
      console.log(`curl --resolve ${host} FAIL: ${curlResolveResult.reason}`);
    }
  } else {
    console.log(`curl --resolve ${host}: SKIPPED (no resolved IP)`);
  }
  if (googleResolveResult.ok) {
    console.log(`curl --resolve www.google.com OK (${googleResolveResult.status})`);
  } else {
    console.log(`curl --resolve www.google.com ${googleResolveResult.ok ? 'OK' : `FAIL (${googleResolveResult.reason})`}`);
  }

  const recommendations = inferPrecheckRecommendations({
    host,
    sampleFeed,
    sampleDnsGetent,
    sampleDnsNode,
    googleDnsGetent,
    googleDnsNode,
    curlResolveResult,
    googleResolveResult,
    httpResult: {
      ok: httpResult.ok,
      status: httpResult.status,
      note: httpResult.extra,
    },
  });

  const reportPayload = {
    generatedAt: NOW.toISOString(),
    sampleUrl: sampleFeed,
    sampleHost: host,
    checks: {
      sampleDnsGetent,
      sampleDnsNode,
      googleDnsGetent,
      googleDnsNode,
      httpSample: {
        ok: httpResult.ok,
        status: httpResult.status,
        note: httpResult.extra,
      },
      curlResolve: curlResolveResult,
      googleCurlResolve: googleResolveResult,
      resolvConf: {
        ok: resolvConf.ok,
        content: resolvConf.value || '',
      },
      nsswitchConf: {
        ok: nsswitchConf.ok,
        content: nsswitchConf.value || '',
        skipped: nsswitchConf.skipped,
      },
    },
    recommendations,
  };

  const precheckPath = resolve(OUTPUT_DIR, 'readme_network_precheck_latest.json');
  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeAuditJson(precheckPath, reportPayload);
  console.log('Precheck report:');
  for (const line of recommendations.slice(0, 6)) {
    console.log(`  - ${line}`);
  }
  console.log(`Wrote precheck report: ${precheckPath}`);
  const canResolveSample = sampleDnsGetent.ok || sampleDnsNode.ok;
  const canResolveGoogle = googleDnsGetent.ok || googleDnsNode.ok;
  const networkUsable = canResolveSample && canResolveGoogle;
  if (!networkUsable) {
    console.log('Precheck warning: full verification is blocked in this runtime. DNS/BASIC EGRESS likely broken.');
  } else {
    console.log('Precheck check: DNS baseline appears available. Continuing is safe.');
  }
  console.log('--- End precheck ---');
  return networkUsable;
}

function getConfLines(content: string): string[] {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
}

function extractNsswitchHostsLine(content: string): string {
  const line = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => /^hosts:/.test(line));
  return line || '';
}

function readTextFile(path: string): TextProbeResult {
  try {
    return { ok: true, value: readFileSync(path, 'utf8'), error: '', skipped: false };
  } catch (error) {
    return { ok: false, value: '', error: String(error), skipped: false };
  }
}

function skippedGetentResult(hostname: string): NetworkProbeResult {
  return {
    ok: false,
    host: hostname,
    ips: [],
    raw: '',
    error: 'SKIPPED_DARWIN',
    skipped: true,
  };
}

function probeGetentDns(hostname: string): NetworkProbeResult {
  const command = `getent hosts ${hostname}`;
  const result = runCommand('getent', ['hosts', hostname], GETENT_TIMEOUT_MS);
  if (!result.ok) {
    return {
      ok: false,
      host: hostname,
      ips: [],
      raw: joinStreams(result.stdout, result.stderr),
      error: result.error || result.stderr || `exit ${result.code}`,
      skipped: false,
    };
  }
  const ips = parseIpsFromGetent(result.stdout || '');
  if (ips.length === 0) {
    return {
      ok: false,
      host: hostname,
      ips: [],
      raw: result.stdout,
      error: 'NO_IP',
      skipped: false,
    };
  }
  return { ok: true, host: hostname, ips, raw: result.stdout, error: '', skipped: false };
}

function parseIpsFromGetent(raw: string): string[] {
  const ips: string[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const firstToken = trimmed.split(/\s+/)[0];
    if (!firstToken) continue;
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(firstToken) || /^[0-9a-fA-F:]+$/.test(firstToken)) {
      if (!ips.includes(firstToken)) {
        ips.push(firstToken);
      }
    }
  }
  return ips;
}

async function probeCurlResolve(url: string, host: string, ip?: string | null): Promise<ResolveProbeResult> {
  if (!ip) {
    return { ok: false, host, ip: null, status: null, outputLine: '', reason: 'NO_RESOLVED_IP' };
  }

  let resolvedIp = ip;
  const parsed = new URL(url);
  const port = parsed.port || (parsed.protocol === 'https:' ? '443' : '80');
  const resolveArg = `${host}:${port}:${resolvedIp}`;
  const result = runCommand('curl', ['-sSI', '--max-time', `${Math.max(1, Math.floor(PRECHECK_TIMEOUT_MS / 1000))}`, '--resolve', resolveArg, url], PRECHECK_TIMEOUT_MS + 1000);
  if (!result.ok) {
    return {
      ok: false,
      host,
      ip: resolvedIp,
      status: null,
      outputLine: joinStreams(result.stdout, result.stderr),
      reason: result.error || result.stderr || `exit ${result.code}`,
    };
  }
  const firstLine = result.stdout.split(/\r?\n/)[0]?.trim() || '';
  const match = firstLine.match(/HTTP\/\d(?:\.\d)?\s+(\d{3})/);
  if (!match) {
    return {
      ok: false,
      host,
      ip: resolvedIp,
      status: null,
      outputLine: firstLine || result.stdout,
      reason: 'NO_HTTP_STATUS',
    };
  }
  const status = Number.parseInt(match[1], 10);
  if (Number.isNaN(status)) {
    return { ok: false, host, ip: resolvedIp, status: null, outputLine: firstLine, reason: 'INVALID_HTTP_STATUS' };
  }
  return {
    ok: status >= 200 && status < 300,
    host,
    ip: resolvedIp,
    status,
    outputLine: firstLine,
    reason: status >= 200 && status < 300 ? '' : `HTTP_${status}`,
  };
}

function runCommand(command: string, args: string[], timeoutMs: number): CommandResult {
  try {
    const result = spawnSync(command, args, {
      encoding: 'utf8',
      timeout: timeoutMs,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
    });
    const stdout = (result.stdout || '').trim();
    const stderr = (result.stderr || '').trim();
    const commandError = result.error ? String(result.error) : '';
    const exitText = result.status === null ? 'null' : `${result.status}`;
    const safeCommand = `${command} ${args.join(' ')}`;
    return {
      ok: result.status === 0 && !result.error,
      command: redactSensitiveCommandText(safeCommand),
      code: result.status,
      stdout: sanitizeCommandOutput(stdout),
      stderr: sanitizeCommandOutput(stderr),
      error: commandError || (result.status === 0 ? '' : `exit ${exitText}`),
    };
  } catch (error) {
    return {
      ok: false,
      command: redactSensitiveCommandText(`${command} ${args.join(' ')}`),
      code: null,
      stdout: '',
      stderr: '',
      error: String(error),
    };
  }
}

function writeAuditJson(path: string, payload: unknown): void {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const raw = `${JSON.stringify(payload, null, 2)}\n`;
  writeFileSync(path, raw, { encoding: 'utf8', mode: AUDIT_FILE_MODE });
}

function redactSensitiveText(input: string): string {
  let output = input.replace(/(https?:\/\/)([^:\/\s@]+):([^@\/\s]+)@/g, '$1$2:***@');
  output = output.replace(/(Authorization:\s*)\S+/gi, '$1***REDACTED***');
  output = output.replace(/(token=)[^&\s#]+/gi, '$1***REDACTED***');
  output = output.replace(/(Bearer\s+)[A-Za-z0-9._-]+/gi, '$1***REDACTED***');
  return output.length <= COMMAND_OUTPUT_MAX_CHARS
    ? output
    : `${output.slice(0, COMMAND_OUTPUT_MAX_CHARS)}\n...[truncated ${output.length - COMMAND_OUTPUT_MAX_CHARS} chars]`;
}

function sanitizeCommandOutput(value: string): string {
  return redactSensitiveText(value || '');
}

function redactSensitiveCommandText(value: string): string {
  return redactSensitiveText(value);
}

function inferPrecheckRecommendations(input: {
  host: string;
  sampleFeed: string;
  sampleDnsGetent: NetworkProbeResult;
  sampleDnsNode: NetworkProbeResult;
  googleDnsGetent: NetworkProbeResult;
  googleDnsNode: NetworkProbeResult;
  curlResolveResult: ResolveProbeResult | null;
  googleResolveResult: ResolveProbeResult;
  httpResult: { ok: boolean; status: number | null; note: string };
}): string[] {
  const lines: string[] = [];
  const dnsHealthy = input.sampleDnsGetent.ok || input.sampleDnsNode.ok;
  const googleHealthy = input.googleDnsGetent.ok || input.googleDnsNode.ok;
  const getentSkipped = input.sampleDnsGetent.skipped || input.googleDnsGetent.skipped;

  if (!dnsHealthy || !googleHealthy) {
    lines.push('DNS resolution is failing in this runtime. Check system resolver, /etc/resolv.conf, and container DNS settings.');
    lines.push('If you changed DNS/VPN/proxy recently, try a clean network profile and retry precheck.');
    if (!input.sampleDnsGetent.ok && !input.sampleDnsGetent.skipped) {
      lines.push(`No hostname->IP mapping for ${input.host}. This usually means getaddrinfo/system resolver is blocked.`);
    }
  }

  if (input.httpResult.ok && !input.sampleDnsGetent.ok && !input.sampleDnsGetent.skipped) {
    lines.push('HTTP works but getent DNS failed => getent path/permissions likely missing. Keep getaddrinfo preflight as primary.');
  }

  if (getentSkipped && input.httpResult.ok) {
    lines.push('Running on macOS: getent/nsswitch checks are intentionally skipped; this is informational only.');
  }

  if (!input.httpResult.ok && input.curlResolveResult && input.curlResolveResult.ok) {
    lines.push('curl --resolve works while Node fetch failed. Runtime fetch path may be blocked by proxy/TLS policies.');
  }

  if (!input.httpResult.ok && !input.curlResolveResult?.ok) {
    lines.push('Downstream endpoint access is blocked from this runtime. Run the same command on another host that can reach the internet.');
  }

  if (!input.curlResolveResult && (input.sampleDnsGetent.ok || input.sampleDnsNode.ok)) {
    lines.push('No resolved IP available for curl --resolve check. Retry after resolving with a working resolver command.');
  }

  if (lines.length === 0) {
    lines.push('No major precheck failure detected; full verification can proceed.');
  }
  return lines;
}

function joinStreams(stdout: string, stderr: string): string {
  const s = `${stdout || ''}`.trim();
  const e = `${stderr || ''}`.trim();
  return [s, e].filter(Boolean).join('\n');
}

function probeDns(hostname: string): Promise<NetworkProbeResult> {
  return withTimeout<{ address: string | undefined }>(
    lookup(hostname, { all: false }).then((result) => ({ address: result.address })),
    PRECHECK_TIMEOUT_MS
  )
    .then(({ address }) => {
      const ips = address ? [address] : [];
      return {
        ok: true,
        host: hostname,
        ips,
        raw: address || '',
        error: '',
        skipped: false,
      };
    })
    .catch((error) => ({
      ok: false,
      host: hostname,
      ips: [],
      raw: '',
      error: classifyLookupError(error),
      skipped: false,
    }));
}

async function probeHttp(url: string): Promise<{ ok: boolean; status: number | null; extra: string }> {
  try {
    const response = await fetchWithTimeout(url, PRECHECK_TIMEOUT_MS);
    const body = await response.text();
    const bodyStart = body.slice(0, 512).toLowerCase();
    const contentType = response.headers.get('content-type') || '';
    const looksLikeXml = contentType.includes('xml') || contentType.includes('rss');
    const xmlDetected = XML_MARKERS.some((marker) => bodyStart.includes(marker));
    const ok = response.status >= 200 && response.status < 300 && (looksLikeXml || xmlDetected);
    return {
      ok,
      status: response.status,
      extra: ok ? 'xml-like response' : classifyHttpBodyFailure(bodyStart, contentType),
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      extra: classifyFetchError(error),
    };
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => {
        reject(new Error('TIMEOUT'));
      }, timeoutMs);
    }),
  ]);
}

function classifyLookupError(error: unknown): string {
  const message = String(error).toLowerCase();
  if (message.includes('timeout')) return 'TIMEOUT';
  if (message.includes('eai_again') || message.includes('not found') || message.includes('enotfound')) return 'DNS';
  return 'NETWORK';
}

type FailureCount = Record<string, number>;
type SitemapFallbackDetail = {
  countryCode: string;
  country: string;
  outlet: string;
  rssUrl: string;
  sitemapUrl: string;
};
type SitemapFallbackSummary = {
  checkedInvalidFeeds: number;
  attemptedFeeds: number;
  succeededFeeds: number;
  failedFeeds: number;
  noCandidateFeeds: number;
  candidateAttempts: number;
  recoveredFeeds: SitemapFallbackDetail[];
  sampleSuccesses: SitemapFallbackDetail[];
};
type SummaryCounts = {
  countries: number;
  totalFeeds: number;
  checkedFeeds: number;
  valid: number;
  invalid: number;
  failureReasons: FailureCount;
  skippedNoSource: number;
  sitemapFallback?: SitemapFallbackSummary;
};

type InvalidItem = {
  country: string;
  outlet: string;
  url: string;
  reason: string;
  httpCode: number | null;
};

type FeedIngestionCount = {
  daily: number;
  cumulative: number;
};

type FeedIngestionSummary = {
  enabled: boolean;
  baselineDate: string;
  dailyWindowDays: number;
  countsByOutlet: Map<string, FeedIngestionCount>;
};

function getReadmePreface(
  sourceLines: string[],
  summary: SummaryCounts,
  results: EndpointResult[],
  atlas: Atlas,
  recoveredFeedKeys: Set<string>,
  feedIngestionSummary: FeedIngestionSummary
): string {
  const firstSection = sourceLines.findIndex((line) => COUNTRY_SECTION_HEADER.test(line));
  const cut = firstSection >= 0 ? sourceLines.slice(0, firstSection) : sourceLines;
  const snapshotStart = cut.findIndex((line) => line.trim() === SNAPSHOT_HEADING);
  const trimmed = snapshotStart >= 0 ? removeExistingSnapshot(cut, snapshotStart) : cut;
  const snapshotSection = renderVerificationSnapshot(summary, results, atlas, recoveredFeedKeys, feedIngestionSummary);
  const updated = [...trimmed, '', snapshotSection].filter((line, index, arr) => {
    const prev = arr[index - 1];
    if (!prev || !line) return true;
    return !(prev === '' && line === '');
  });
  return `${updateHeaderCheckedDate(updated.join('\n')).replace(/\n+$/, '')}`;
}

function removeExistingSnapshot(lines: string[], startIndex: number): string[] {
  let end = startIndex + 1;
  while (end < lines.length) {
    if (COUNTRY_SECTION_HEADER.test(lines[end]) || (lines[end].startsWith('## ') && lines[end].trim() !== SNAPSHOT_HEADING)) {
      break;
    }
    end += 1;
  }
  return [...lines.slice(0, startIndex), ...lines.slice(end)];
}

function renderVerificationSnapshot(
  summary: SummaryCounts,
  results: EndpointResult[],
  atlas: Atlas,
  recoveredFeedKeys: Set<string>,
  feedIngestionSummary: FeedIngestionSummary
): string {
  const lines: string[] = [];
  const invalidItems: InvalidItem[] = results
    .filter(
      (result) =>
        !result.valid &&
        result.failureReason !== null &&
        !recoveredFeedKeys.has(makeResultKey(result.countryCode, result.outlet, result.url))
    )
    .map((result) => ({
      country: result.countryName,
      outlet: result.outlet,
      url: result.url,
      reason: result.failureReason!,
      httpCode: result.httpCode,
    }));

  const noSourceItems = atlas.countries.flatMap((country) =>
    country.feeds
      .filter((feed) => !feed.url)
      .map((feed) => ({ country: country.name, outlet: feed.name }))
  );

  const grouped = new Map<string, InvalidItem[]>();
  for (const item of invalidItems) {
    const list = grouped.get(item.reason) || [];
    list.push(item);
    grouped.set(item.reason, list);
  }

  lines.push(SNAPSHOT_HEADING);
  lines.push('');
  lines.push(`- Checked endpoints: \`${summary.checkedFeeds}\``);
  lines.push(`- Valid: \`${summary.valid}\``);
  lines.push(`- Invalid: \`${summary.invalid}\``);
  if (summary.sitemapFallback && summary.sitemapFallback.succeededFeeds > 0) {
    lines.push(`- Recovered via sitemap: \`${summary.sitemapFallback.succeededFeeds}\``);
  }
  lines.push(`- No-source rows: \`${summary.skippedNoSource}\``);
  if (summary.sitemapFallback) {
    const fallback = summary.sitemapFallback;
    lines.push(
      `- Sitemap fallback checks: checked \`${fallback.checkedInvalidFeeds}\`, attempted \`${fallback.attemptedFeeds}\`, success \`${fallback.succeededFeeds}\`, failed \`${fallback.failedFeeds}\`, no-candidate \`${fallback.noCandidateFeeds}\`, candidates \`${fallback.candidateAttempts}\``
    );
  }
  lines.push(`- Snapshot date: \`${CHECKED_DATE}\``);
  lines.push(`- RSS ingest baseline: \`${feedIngestionSummary.baselineDate}\``);
  lines.push(`- RSS daily window: \`${feedIngestionSummary.dailyWindowDays}d\` (runner: worker)`);
  lines.push(`- Source artifact: \`audits/readme_rss_health_latest.json\``);
  lines.push('');
  lines.push('### Failure reasons');
  lines.push('|Reason|Count|');
  lines.push('|---|---:|');
  for (const [reason, count] of Object.entries(summary.failureReasons).sort((a, b) => b[1] - a[1])) {
    lines.push(`|${reason}|${count}|`);
  }

  lines.push('');
  lines.push('### Invalid feeds by reason');
  for (const [reason, items] of [...grouped.entries()].sort((a, b) => b[1].length - a[1].length)) {
    const sorted = [...items].sort((left, right) => {
      const byCountry = left.country.localeCompare(right.country);
      return byCountry !== 0 ? byCountry : left.outlet.localeCompare(right.outlet);
    });
    lines.push('');
    lines.push(`#### ${reason} (${items.length})`);
    lines.push('|Country|Outlet|RSS URL|HTTP|');
    lines.push('|---|---|---|---:|');
    for (const item of sorted) {
      lines.push(`|${item.country}|${item.outlet}|<${item.url}>|${item.httpCode === null ? '-' : item.httpCode}|`);
    }
  }

  if (summary.sitemapFallback && summary.sitemapFallback.sampleSuccesses.length > 0) {
    lines.push('');
    lines.push('### Sitemap fallback successes');
    lines.push('|Country|Outlet|Failed RSS URL|Recovered via sitemap|');
    lines.push('|---|---|---|---|');
    for (const item of summary.sitemapFallback.sampleSuccesses) {
      lines.push(`|${item.country}|${item.outlet}|<${item.rssUrl}>|<${item.sitemapUrl}>|`);
    }
  }

  lines.push('');
  lines.push('### No-source rows');
  if (noSourceItems.length === 0) {
    lines.push('- none');
  } else {
    const sortedNoSource = [...noSourceItems].sort((left, right) => {
      const byCountry = left.country.localeCompare(right.country);
      return byCountry !== 0 ? byCountry : left.outlet.localeCompare(right.outlet);
    });
    lines.push('|Country|Outlet|');
    lines.push('|---|---|');
    for (const item of sortedNoSource) {
      lines.push(`|${item.country}|${item.outlet}|`);
    }
  }
  return lines.join('\n');
}

function renderCountrySections(
  atlas: Atlas,
  resultMap: Map<string, EndpointResult>,
  recoveredFeedKeys: Set<string>,
  onlyValid: boolean,
  feedIngestionSummary: FeedIngestionSummary
): string[] {
  const lines: string[] = [];

  for (const country of atlas.countries) {
    lines.push(`### ${country.name} (${country.code})`);
    lines.push('|No.|Outlet|RSS URL|HTTP Status|Checked Date|Valid?|Daily|Since baseline|');
    lines.push('|---|---|---|---|---|---|---:|---:|');

    if (!country.feeds.length) {
      if (onlyValid) {
        lines.push('- no valid RSS feeds in this country.');
      } else {
        lines.push(
          formatRow({
            row: 1,
            outlet: 'No RSS source configured',
            url: 'N/A',
            status: '❌ NO_SOURCE',
            checkedDate: CHECKED_DATE,
            validLabel: 'needs verification',
            daily: null,
            cumulative: null,
          })
        );
      }
      lines.push('');
      continue;
    }

    let rowCounter = 0;
    for (const feed of country.feeds) {
      if (!feed.url) {
        if (onlyValid) continue;
        const row = ++rowCounter;
        lines.push(
          formatRow({
            row,
            outlet: feed.name,
            url: 'N/A',
            status: '❌ NO_SOURCE',
            checkedDate: CHECKED_DATE,
            validLabel: 'needs verification',
            daily: null,
            cumulative: null,
          })
        );
        continue;
      }

      const key = makeResultKey(country.code, feed.name, feed.url);
      const result = resultMap.get(key);
      const recovered = result !== undefined && recoveredFeedKeys.has(key);
      const outletId = makeOutletId(country.name, feed.name, feed.url);
      const feedCounts = feedIngestionSummary.countsByOutlet.get(outletId) || null;
      const daily = feedIngestionSummary.enabled ? (feedCounts ? feedCounts.daily : 0) : null;
      const cumulative = feedIngestionSummary.enabled ? (feedCounts ? feedCounts.cumulative : 0) : null;
      if (onlyValid && (!result || (!result.valid && !recovered))) {
        continue;
      }

      const row = ++rowCounter;

      if (!result) {
        lines.push(
          formatRow({
            row,
            outlet: feed.name,
            url: feed.url,
            status: 'needs check',
            checkedDate: CHECKED_DATE,
            validLabel: 'needs verification',
            daily,
            cumulative,
          })
        );
        continue;
      }

      lines.push(
        formatRow({
          row,
          outlet: feed.name,
          url: feed.url,
          status: recovered ? 'Recovered via sitemap' : formatStatus(result),
          checkedDate: CHECKED_DATE,
          validLabel: result && (result.valid || recovered) ? 'valid' : 'invalid',
          daily,
          cumulative,
        })
      );
    }

    if (onlyValid && rowCounter === 0) {
      lines.push('- no valid RSS feeds in this country.');
    }

    lines.push('');
  }

  return lines;
}

function buildResultMap(results: EndpointResult[]): Map<string, EndpointResult> {
  const map = new Map<string, EndpointResult>();
  for (const result of results) {
    map.set(makeResultKey(result.countryCode, result.outlet, result.url), result);
  }
  return map;
}

function makeResultKey(countryCode: string, outlet: string, url: string): string {
  return `${countryCode}|${outlet}|${url}`;
}

async function verifyEndpoints(tasks: CheckTask[]): Promise<EndpointResult[]> {
  const results: EndpointResult[] = [];

  for (let start = 0; start < tasks.length; start += BATCH_SIZE) {
    const batch = tasks.slice(start, start + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(async (task) => {
        if (REQUEST_JITTER_MS > 0) {
          await sleep(Math.floor(Math.random() * REQUEST_JITTER_MS));
        }
        return checkEndpoint(task);
      })
    );

    results.push(...batchResults);
    if (start + BATCH_SIZE < tasks.length && BATCH_DELAY_MS > 0) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  return results;
}

async function checkSitemapFallbackForInvalid(invalidResults: EndpointResult[]): Promise<SitemapFallbackSummary> {
  const summary: SitemapFallbackSummary = {
    checkedInvalidFeeds: invalidResults.length,
    attemptedFeeds: 0,
    succeededFeeds: 0,
    failedFeeds: 0,
    noCandidateFeeds: 0,
    candidateAttempts: 0,
    recoveredFeeds: [],
    sampleSuccesses: [],
  };

  for (let start = 0; start < invalidResults.length; start += BATCH_SIZE) {
    const batch = invalidResults.slice(start, start + BATCH_SIZE);
    const batchChecks = await Promise.all(
      batch.map(async (result) => {
        if (REQUEST_JITTER_MS > 0) {
          await sleep(Math.floor(Math.random() * REQUEST_JITTER_MS));
        }

        const candidates = await buildSitemapFallbackUrls(result.url);
        if (candidates.length === 0) {
          return {
            outcome: 'no_candidate' as const,
            result,
            candidate: undefined,
            attempts: 0,
          };
        }

        let attempts = 0;
        for (const candidate of candidates) {
          const candidateResult = await checkSitemapFallbackCandidate(candidate, 0);
          attempts += candidateResult.attempts;
          if (candidateResult.ok) {
            return {
              outcome: 'success' as const,
              result,
              candidate: candidateResult.recoveredUrl || candidate,
              attempts,
            };
          }
        }
        return {
          outcome: 'failed' as const,
          result,
          candidate: candidates[0],
          attempts,
        };
      })
    );

    for (const checkResult of batchChecks) {
      summary.candidateAttempts += checkResult.attempts;
      if (checkResult.outcome === 'no_candidate') {
        summary.noCandidateFeeds += 1;
      } else {
        summary.attemptedFeeds += 1;
        if (checkResult.outcome === 'success' && checkResult.candidate) {
          summary.succeededFeeds += 1;
          const recovered = {
            countryCode: checkResult.result.countryCode,
            country: checkResult.result.countryName,
            outlet: checkResult.result.outlet,
            rssUrl: checkResult.result.url,
            sitemapUrl: checkResult.candidate,
          };
          summary.recoveredFeeds.push(recovered);
          if (summary.sampleSuccesses.length < 20) {
            summary.sampleSuccesses.push(recovered);
          }
        } else {
          summary.failedFeeds += 1;
        }
      }
    }

    if (start + BATCH_SIZE < invalidResults.length && BATCH_DELAY_MS > 0) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  return summary;
}

async function buildSitemapFallbackUrls(sourceUrl: string): Promise<string[]> {
  const urls: string[] = [];

  try {
    const parsed = new URL(sourceUrl);
    const root = `${parsed.protocol}://${parsed.host}`;
    const basePath = parsed.pathname.endsWith('/') ? parsed.pathname : `${parsed.pathname.replace(/\/[^/]*$/, '')}/`;
    urls.push(`${root}${basePath}sitemap_news.xml`);
    urls.push(`${root}${basePath}sitemap-news.xml`);
    urls.push(`${root}${basePath}sitemap.xml`);
    urls.push(`${root}${basePath}sitemap_index.xml`);
    urls.push(`${root}/sitemap_news.xml`);
    urls.push(`${root}/sitemap-news.xml`);
    urls.push(`${root}/sitemap.xml`);
    urls.push(`${root}/sitemap_index.xml`);
    const robotsUrls = await extractSitemapUrlsFromRobots(sourceUrl);
    urls.push(...robotsUrls);
  } catch {
    return dedupeStrings(urls);
  }

  return prioritizeSitemapCandidates(dedupeStrings(urls));
}

async function checkSitemapFallbackCandidate(
  url: string,
  depth: number
): Promise<{ ok: boolean; status: number | null; reason: string; attempts: number; recoveredUrl?: string }> {
  try {
    if (depth > 2) {
      return { ok: false, status: null, reason: 'SITEMAP_DEPTH_LIMIT', attempts: 0 };
    }

    const { response } = await fetchWithRedirects(url, REQUEST_TIMEOUT_MS, MAX_HTTP_REDIRECTS);
    const { bodyStart, bodyText } = await readSitemapBody(url, response);
    const contentType = response.headers.get('content-type') || '';
    const xmlDetected = XML_MARKERS.some((marker) => bodyStart.includes(marker));
    const rootXml = classifySitemapRoot(bodyStart);

    if (rootXml === 'sitemapindex' && depth < 2) {
      const childCandidates = prioritizeSitemapCandidates(extractSitemapLocs(bodyText, url));
      if (childCandidates.length === 0) {
        return { ok: false, status: response.status, reason: 'SITEMAPINDEX_NO_CHILD_URLS', attempts: 1 };
      }
      let attempts = 1;
      for (const child of childCandidates.slice(0, 12)) {
        const childResult = await checkSitemapFallbackCandidate(child, depth + 1);
        attempts += childResult.attempts;
        if (childResult.ok) {
          return {
            ok: true,
            status: childResult.status,
            reason: childResult.reason,
            attempts,
            recoveredUrl: childResult.recoveredUrl || child,
          };
        }
      }
      return { ok: false, status: response.status, reason: 'SITEMAPINDEX_NO_VALID_URLSET', attempts };
    }

    const looksLikeXml = contentType.includes('xml') || contentType.includes('rss') || contentType.includes('atom');
    const looksLikeUrlset = rootXml === 'urlset' || /<url>/i.test(bodyStart);
    if (response.status >= 200 && response.status < 300 && xmlDetected && looksLikeXml && looksLikeUrlset) {
      return { ok: true, status: response.status, reason: 'OK', attempts: 1 };
    }
    if (response.status >= 200 && response.status < 300) {
      return { ok: false, status: response.status, reason: classifyHttpBodyFailure(bodyStart, contentType), attempts: 1 };
    }
    return { ok: false, status: response.status, reason: `HTTP_${response.status}`, attempts: 1 };
  } catch (error) {
    return { ok: false, status: null, reason: classifyFetchError(error), attempts: 0 };
  }
}

function prioritizeSitemapCandidates(urls: string[]): string[] {
  return dedupeStrings(urls).sort((a, b) => scoreSitemapCandidate(b) - scoreSitemapCandidate(a));
}

function scoreSitemapCandidate(url: string): number {
  const lower = url.toLowerCase();
  if (!lower.includes('sitemap')) return 0;
  let score = 20;
  if (lower.includes('news')) score += 100;
  if (lower.includes('today')) score += 40;
  if (lower.includes('breaking')) score += 30;
  if (lower.includes('sitemap-news')) score += 60;
  if (lower.includes('sitemap_news')) score += 60;
  if (lower.includes('sitemap_index')) score += 20;
  if (lower.includes('sitemapindex')) score += 10;
  if (lower.includes('image') || lower.includes('photo')) score -= 20;
  return score;
}

function classifySitemapRoot(xmlText: string): 'sitemapindex' | 'urlset' | 'other' {
  const lower = xmlText.toLowerCase();
  if (lower.includes('<sitemapindex')) return 'sitemapindex';
  if (lower.includes('<urlset')) return 'urlset';
  return 'other';
}

function extractSitemapLocs(xmlText: string, baseUrl?: string): string[] {
  const urls: string[] = [];
  const normalized = normalizeSitemapXmlText(xmlText);
  if (!normalized) {
    return urls;
  }

  for (const match of normalized.matchAll(/<loc>(.*?)<\/loc>/g)) {
    const raw = match?.[1]?.trim();
    if (!raw) {
      continue;
    }
    urls.push(raw);
  }
  if (baseUrl) {
    try {
      const base = new URL(baseUrl);
      const absoluteUrls: string[] = [];
      for (const rawLoc of urls) {
        try {
          if (rawLoc.startsWith('http://') || rawLoc.startsWith('https://')) {
            absoluteUrls.push(rawLoc);
          } else {
            absoluteUrls.push(new URL(rawLoc, base).toString());
          }
        } catch {
          continue;
        }
      }
      return absoluteUrls;
    } catch {
      return urls;
    }
  }
  return urls;
}

function normalizeSitemapXmlText(xmlText: string): string {
  return xmlText
    .replace(/<\?[\s\S]*?\?>/g, '')
    .replace(/<\!DOCTYPE[\s\S]*?>/i, '')
    .trim();
}

async function extractSitemapUrlsFromRobots(sourceUrl: string): Promise<string[]> {
  try {
    const parsed = new URL(sourceUrl);
    const robotsUrl = `${parsed.origin}/robots.txt`;
    const { response } = await fetchWithRedirects(robotsUrl, REQUEST_TIMEOUT_MS, MAX_HTTP_REDIRECTS);
    if (!response.ok) {
      return [];
    }
    const robotsText = await response.text();
    const lines = robotsText.split(/\r?\n/);
    const urls: string[] = [];
    for (const line of lines) {
      const match = /^sitemap:\s*(.+)$/i.exec(line.trim());
      if (!match) continue;
      const raw = match[1]?.trim();
      if (!raw) continue;
      try {
        urls.push(new URL(raw, parsed.origin).toString());
      } catch {
        continue;
      }
    }
    return urls;
  } catch {
    return [];
  }
}

async function readSitemapBody(url: string, response: Response): Promise<{ bodyText: string; bodyStart: string }> {
  const contentType = response.headers.get('content-type') || '';
  const contentEncoding = response.headers.get('content-encoding') || '';
  const bytes = new Uint8Array(await response.arrayBuffer());
  let bodyText = '';
  const isGzip =
    url.toLowerCase().endsWith('.gz') ||
    contentType.includes('gzip') ||
    contentEncoding.includes('gzip') ||
    (bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b);
  try {
    if (isGzip) {
      bodyText = new TextDecoder().decode(gunzipSync(Buffer.from(bytes)));
    } else {
      bodyText = new TextDecoder().decode(bytes);
    }
  } catch {
    bodyText = new TextDecoder().decode(bytes);
  }
  return {
    bodyText,
    bodyStart: bodyText.slice(0, 4000).toLowerCase(),
  };
}

function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const value of values) {
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    deduped.push(normalized);
  }
  return deduped;
}

async function checkEndpoint(task: CheckTask): Promise<EndpointResult> {
  try {
    const { response } = await fetchWithRedirects(task.url, REQUEST_TIMEOUT_MS, MAX_HTTP_REDIRECTS);
    const body = await response.text();
    const bodyStart = body.slice(0, 2000).toLowerCase();
    const xmlDetected = XML_MARKERS.some((marker) => bodyStart.includes(marker));
    const contentType = response.headers.get('content-type') || '';
    const looksLikeXml = contentType.includes('xml') || contentType.includes('rss');
    const valid = response.status >= 200 && response.status < 300 && (xmlDetected || looksLikeXml);
    const isSuccessHttpStatus = response.status >= 200 && response.status < 300;
    const failureReason = isSuccessHttpStatus
      ? valid
        ? null
        : classifyHttpBodyFailure(bodyStart, contentType)
      : `HTTP_${response.status}`;

    return {
      countryCode: task.countryCode,
      countryName: task.countryName,
      outlet: task.outlet,
      url: task.url,
      feedRow: task.feedRow,
      httpCode: response.status,
      failureReason,
      valid,
      checkedAt: NOW.toISOString(),
      xmlDetected,
    };
  } catch (error) {
    return {
      countryCode: task.countryCode,
      countryName: task.countryName,
      outlet: task.outlet,
      url: task.url,
      feedRow: task.feedRow,
      httpCode: null,
      failureReason: classifyFetchError(error),
      valid: false,
      checkedAt: NOW.toISOString(),
      xmlDetected: false,
    };
  }
}

function formatRow(params: {
  row: number;
  outlet: string;
  url: string;
  status: string;
  checkedDate: string;
  validLabel: string;
  daily: number | null;
  cumulative: number | null;
}): string {
  const urlDisplay = params.url === 'N/A' ? 'N/A' : `<${params.url}>`;
  const daily = params.daily === null ? '-' : `${params.daily}`;
  const cumulative = params.cumulative === null ? '-' : `${params.cumulative}`;
  return `${params.row}|${params.outlet}|${urlDisplay}|${params.status}|${params.checkedDate}|${params.validLabel}|${daily}|${cumulative}|`;
}

function formatStatus(result: EndpointResult): string {
  if (result.httpCode === null) {
    return `ERR (${result.failureReason || 'NETWORK'})`;
  }
  if (result.valid) {
    return String(result.httpCode);
  }
  return `${result.httpCode} (${result.failureReason || 'INVALID'})`;
}

function classifyFetchError(error: unknown): string {
  const message = String(error).toLowerCase();
  if (message.includes('redirect') && message.includes('loop')) {
    return 'HTTP_REDIRECT_LOOP';
  }
  if (message.includes('too many redirects')) {
    return 'HTTP_REDIRECT_LOOP';
  }
  if (message.includes('dns') || message.includes('could not resolve host') || message.includes('getaddrinfo')) {
    return 'DNS';
  }
  if (message.includes('abort') || message.includes('timeout')) {
    return 'TIMEOUT';
  }
  if (message.includes('certificate') || message.includes('ssl') || message.includes('tls')) {
    return 'TLS';
  }
  if (message.includes('connection refused')) {
    return 'CONNECTION_REFUSED';
  }
  if (message.includes('econnreset') || message.includes('socket hang up')) {
    return 'CONNECTION_RESET';
  }
  return 'NETWORK';
}

function classifyHttpBodyFailure(bodyStart: string, contentType: string): string {
  if (contentType.includes('json')) return 'INVALID_JSON';
  if (contentType.includes('text/html')) return 'HTML_RETURNED';
  if (bodyStart.startsWith('<!doctype html')) return 'HTML_RETURNED';
  return 'INVALID_FEED_FORMAT';
}

function summarizeFailureReasons(results: EndpointResult[]): Record<string, number> {
  const counters: Record<string, number> = {};
  for (const result of results) {
    if (!result.failureReason) continue;
    counters[result.failureReason] = (counters[result.failureReason] || 0) + 1;
  }
  return counters;
}

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function makeOutletId(countryName: string, sourceName: string, feedUrl: string): string {
  const safe = normalizeText(`${countryName} ${sourceName}`)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-')
    .slice(0, 120);
  let hash = 2166136261;
  for (let i = 0; i < feedUrl.length; i += 1) {
    hash ^= feedUrl.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `${safe || 'source'}-${(hash >>> 0).toString(36)}`;
}

function parseBaselineDate(value: string): string | null {
  const trimmed = (value || '').trim();
  if (!trimmed) return null;

  const parsed = new Date(trimmed);
  if (!Number.isFinite(parsed.getTime())) return null;

  const maxDate = NOW;
  if (parsed.getTime() > maxDate.getTime()) return toIsoDate(maxDate);
  return toIsoDate(parsed);
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function isLikelyRuntimeNetworkFailure(results: EndpointResult[], summary: SummaryCounts): boolean {
  return (
    summary.checkedFeeds > 0 &&
    summary.invalid === summary.checkedFeeds &&
    Object.keys(summary.failureReasons).length === 1 &&
    summary.failureReasons.NETWORK === summary.invalid &&
    results.every((result) => result.failureReason === 'NETWORK')
  );
}

function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  return fetch(url, {
    method: 'GET',
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/rss+xml, application/xml, text/xml, */*',
    },
    redirect: 'manual',
    signal: controller.signal,
  }).finally(() => {
    clearTimeout(timeout);
  });
}

type FetchRedirectResult = {
  response: Response;
  redirectCount: number;
  finalUrl: string;
};

async function fetchWithRedirects(
  initialUrl: string,
  timeoutMs: number,
  maxRedirects: number
): Promise<FetchRedirectResult> {
  let currentUrl = initialUrl;
  let redirectCount = 0;
  const visited = new Set<string>();
  const startedAt = Date.now();

  while (true) {
    const elapsed = Date.now() - startedAt;
    const remaining = Math.max(500, timeoutMs - elapsed);

    const response = await fetchWithTimeout(currentUrl, remaining);
    const status = response.status;

    if (status >= 300 && status < 400) {
      const location = response.headers.get('location');
      if (location) {
        await response.arrayBuffer().catch(() => {});
        const nextUrl = new URL(location, currentUrl).toString();
        redirectCount += 1;
        if (redirectCount > maxRedirects) {
          throw new Error(`Too many redirects: ${maxRedirects}`);
        }
        if (visited.has(nextUrl)) {
          throw new Error(`Redirect loop detected: ${nextUrl}`);
        }
        visited.add(currentUrl);
        currentUrl = nextUrl;
        continue;
      }
      return { response, redirectCount, finalUrl: currentUrl };
    }

    return { response, redirectCount, finalUrl: currentUrl };
  }
}

function updateHeaderCheckedDate(contents: string): string {
  if (!contents.includes('- Last checked:')) {
    return contents;
  }

  return contents.replace(
    /- Last checked:\s*\d{2}\/\d{2}\/\d{4}/,
    `- Last checked: ${CHECKED_DATE}`
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function clampInt(value: string | undefined, min: number, max: number, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < min || parsed > max) {
    return fallback;
  }
  return parsed;
}

function toCheckedDate(date: Date): string {
  const mm = `${date.getMonth() + 1}`.padStart(2, '0');
  const dd = `${date.getDate()}`.padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
