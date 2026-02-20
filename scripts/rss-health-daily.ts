#!/usr/bin/env bun
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

type AtlasFeed = {
  name: string;
  url: string | null;
  status: string | null;
  checkedDate: string;
  valid: string;
  row: number;
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

type HealthResult = {
  countryCode: string;
  outlet: string;
  url: string;
  valid: boolean;
};

type HealthSummary = {
  countries: number;
  totalFeeds: number;
  checkedFeeds: number;
  valid: number;
  invalid: number;
  failureReasons: Record<string, number>;
  skippedNoSource: number;
};

type HealthReport = {
  generatedAt: string;
  checkedDate?: string;
  runtimeBlocked?: boolean;
  summary: HealthSummary;
  results?: HealthResult[];
};

const ATLAS_PATH = process.env.ATLAS_PATH || resolve(process.cwd(), 'data/rss-atlas.json');
const REPORT_PATH = process.env.RSS_HEALTH_REPORT_PATH || resolve(process.cwd(), 'audits/readme_rss_health_latest.json');
const argv = new Set(process.argv.slice(2));

const doPrecheck = !argv.has('--no-precheck');
const doExport = !argv.has('--skip-export');
const doDiscordNotify = !argv.has('--no-discord');
const discordWebhookUrl = (process.env.RSS_HEALTH_DISCORD_WEBHOOK_URL || process.env.DISCORD_WEBHOOK_URL || '').trim();
const discordUsername = process.env.RSS_HEALTH_DISCORD_USERNAME || 'RSS Health';
const discordMention = process.env.RSS_HEALTH_DISCORD_MENTION || '';
const discordTimeoutMs = clampInt(process.env.RSS_HEALTH_DISCORD_TIMEOUT_MS, 1000, 20000, 5000);

function clampInt(raw: string | undefined, min: number, max: number, fallback: number): number {
  const parsed = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(Math.max(parsed, min), max);
}

function runCommand(label: string, command: string, args: string[]): void {
  const proc = spawnSync(command, args, { stdio: 'inherit' });
  if (proc.error) {
    throw new Error(`${label} failed: ${String(proc.error)}`);
  }
  if (proc.status !== 0) {
    throw new Error(`${label} failed with exit code ${proc.status}`);
  }
}

function makeKey(countryCode: string, outlet: string, url: string): string {
  return `${countryCode}|${outlet}|${url}`;
}

function loadAtlas(): Atlas {
  const raw = readFileSync(ATLAS_PATH, 'utf8');
  const atlas = JSON.parse(raw) as Atlas;
  if (!Array.isArray(atlas.countries)) {
    throw new Error(`Invalid atlas format: countries array not found in ${ATLAS_PATH}`);
  }
  return atlas;
}

function loadHealthReport(): HealthReport {
  if (!existsSync(REPORT_PATH)) {
    throw new Error(`Health report not found: ${REPORT_PATH}. Run verify command first.`);
  }
  const raw = readFileSync(REPORT_PATH, 'utf8');
  return JSON.parse(raw) as HealthReport;
}

function pruneAtlasToValid(atlas: Atlas, report: HealthReport): { before: number; after: number; removedInvalid: number; removedNoUrl: number } {
  const validSet = new Set<string>();
  const validSetByUrl = new Set<string>();
  const results = report.results ?? [];
  for (const row of results) {
    if (row.valid) {
      validSet.add(makeKey(row.countryCode, row.outlet, row.url));
      validSetByUrl.add(`${row.countryCode}|${row.url}`);
    }
  }

  const before = atlas.countries.reduce((acc, country) => acc + country.feeds.length, 0);
  let removedInvalid = 0;
  let removedNoUrl = 0;

  atlas.countries = atlas.countries
    .map((country) => {
      const kept: AtlasFeed[] = [];
      for (const feed of country.feeds) {
        if (!feed.url) {
          removedNoUrl += 1;
          continue;
        }
        const byOutlet = validSet.has(makeKey(country.code, feed.name, feed.url));
        const byUrl = validSetByUrl.has(`${country.code}|${feed.url}`);
        if (!byOutlet && !byUrl) {
          removedInvalid += 1;
          continue;
        }
        kept.push(feed);
      }
      return { ...country, feeds: kept };
    })
    .filter((country) => country.feeds.length > 0);

  const after = atlas.countries.reduce((acc, country) => acc + country.feeds.length, 0);
  atlas.generatedAt = new Date().toISOString();
  if (report.checkedDate) {
    atlas.lastChecked = report.checkedDate;
  }

  return { before, after, removedInvalid, removedNoUrl };
}

function summarizeTopReasons(reasonMap: Record<string, number>, limit = 8): Array<[string, number]> {
  return Object.entries(reasonMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
}

function toDiscordTimestamp(dateInput: string, checkedDate?: string): string {
  if (checkedDate && /^\d{2}\/\d{2}\/\d{4}$/.test(checkedDate)) {
    const [month, day, year] = checkedDate.split('/');
    return `${year}-${month}-${day}T00:00:00`;
  }
  const date = new Date(dateInput);
  return isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function clampSummaryString(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 3)}...`;
}

function getDiscordColor(summary: HealthSummary, runtimeBlocked: boolean): number {
  if (runtimeBlocked) return 0xf39c12;
  if (summary.invalid === 0) return 0x2ecc71;
  return 0xe74c3c;
}

async function sendDiscordNotification(report: HealthReport, pruneStats: { before: number; after: number; removedInvalid: number; removedNoUrl: number }): Promise<void> {
  if (!discordWebhookUrl) {
    console.log('Discord webhook not configured. Set RSS_HEALTH_DISCORD_WEBHOOK_URL or DISCORD_WEBHOOK_URL to enable notifications.');
    return;
  }
  if (!doDiscordNotify) {
    return;
  }

  const summary = report.summary;
  const runtimeBlocked = Boolean(report.runtimeBlocked);
  const validPct = summary.checkedFeeds > 0 ? Math.round((summary.valid / summary.checkedFeeds) * 100) : 0;
  const status = runtimeBlocked ? '⚠️ BLOCKED' : summary.invalid === 0 ? '✅ HEALTHY' : '🚨 DEGRADED';
  const title = `RSS health daily: ${status}`;
  const topFailures = summarizeTopReasons(summary.failureReasons, 6)
    .map(([reason, count]) => `- ${reason}: ${count}`)
    .join('\n');

  const description = clampSummaryString(
    [
      `Checked: **${summary.checkedFeeds}** feeds`,
      `Valid: **${summary.valid}** (${validPct}%)`,
      `Invalid: **${summary.invalid}**`,
      `No-source rows: **${summary.skippedNoSource}**`,
      `Pruned: **${pruneStats.removedInvalid}** invalid / **${pruneStats.removedNoUrl}** no-source`,
      runtimeBlocked ? `Runtime blocked: **${runtimeBlocked ? 'true' : 'false'}**` : null,
    ]
      .filter(Boolean)
      .join('\n'),
    1800
  );

  const payload = {
    username: discordUsername,
    content: discordMention || undefined,
    embeds: [
      {
        title,
        description,
        color: getDiscordColor(summary, runtimeBlocked),
        timestamp: toDiscordTimestamp(report.generatedAt, report.checkedDate),
        fields: [
          {
            name: 'Top failures',
            value: clampSummaryString(topFailures || 'None', 1024),
            inline: false,
          },
          {
            name: 'All feeds',
            value: `${pruneStats.before} → ${pruneStats.after}`,
            inline: true,
          },
          {
            name: 'Countries',
            value: String(summary.countries),
            inline: true,
          },
        ],
        footer: {
          text: `Generated: ${report.generatedAt}`,
        },
      },
    ],
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), discordTimeoutMs);
  try {
    const response = await fetch(discordWebhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`HTTP ${response.status} ${response.statusText}: ${body}`);
    }
    console.log('Discord notification sent.');
  } finally {
    clearTimeout(timeout);
  }
}

async function main(): Promise<void> {
  console.log('--- Daily RSS health pipeline start ---');
  if (doPrecheck) {
    runCommand('Precheck + verify', 'bun', ['run', 'verify:readme-rss:precheck']);
  } else {
    runCommand('Verify', 'bun', ['run', 'verify:readme-rss']);
  }

  const atlas = loadAtlas();
  const report = loadHealthReport();
  if (report.runtimeBlocked) {
    console.log('Runtime blocked by network/DNS; skip prune and retry later.');
    await sendDiscordNotification(
      {
        ...report,
        summary: report.summary ?? {
          countries: atlas.countries.length,
          totalFeeds: atlas.countries.reduce((acc, country) => acc + country.feeds.length, 0),
          checkedFeeds: 0,
          valid: 0,
          invalid: 0,
          failureReasons: {},
          skippedNoSource: atlas.countries.reduce(
            (acc, country) => acc + country.feeds.filter((feed) => !feed.url).length,
            0
          ),
        },
      },
      {
        before: atlas.countries.reduce((acc, country) => acc + country.feeds.length, 0),
        after: atlas.countries.reduce((acc, country) => acc + country.feeds.filter((feed) => feed.url).length, 0),
        removedInvalid: 0,
        removedNoUrl: 0,
      }
    );
    return;
  }

  const stats = pruneAtlasToValid(atlas, report);
  writeFileSync(ATLAS_PATH, `${JSON.stringify(atlas, null, 2)}\n`, 'utf8');

  console.log(`Pruned atlas: before=${stats.before} after=${stats.after}, removed_invalid=${stats.removedInvalid}, removed_no_url=${stats.removedNoUrl}`);

  if (doExport) {
    runCommand('Export catalog', 'bun', ['run', 'atlas:export-catalog']);
  }

  console.log('--- Daily RSS health pipeline done ---');
  await sendDiscordNotification(report, {
    before: stats.before,
    after: stats.after,
    removedInvalid: stats.removedInvalid,
    removedNoUrl: stats.removedNoUrl,
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
