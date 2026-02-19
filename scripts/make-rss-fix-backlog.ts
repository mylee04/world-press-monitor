#!/usr/bin/env bun
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

type HealthResult = {
  countryCode: string;
  countryName: string;
  outlet: string;
  url: string;
  httpCode: number | null;
  failureReason: string | null;
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
  checkedDate: string;
  runtimeBlocked?: boolean;
  summary: HealthSummary;
  results: HealthResult[];
};

type CliArgs = {
  reportPath: string;
  focusReasons?: Set<string>;
  outputCsv: string;
  limit?: number;
};

const DEFAULT_REASON_ORDER = [
  'HTTP_404',
  'HTML_RETURNED',
  'HTTP_403',
  'HTTP_401',
  'TIMEOUT',
  'TLS',
  'HTTP_429',
  'HTTP_502',
  'HTTP_530',
  'INVALID_JSON',
  'NETWORK',
  'CONNECTION_RESET',
  'CONNECTION_REFUSED',
];

const args = parseArgs(process.argv.slice(2));
const report = loadReport(args.reportPath);
const focus = args.focusReasons || new Set(DEFAULT_REASON_ORDER);
const generatedDate = report.checkedDate;
if (report.runtimeBlocked) {
  console.log('Source report indicates runtime-level verification blockage (environment/network issue).');
}

const invalidRows = report.results
  .filter((row) => !row.valid)
  .filter((row) => row.failureReason && focus.has(row.failureReason))
  .map((row) => ({
    countryName: row.countryName,
    countryCode: row.countryCode,
    outlet: row.outlet,
    url: row.url,
    domain: safeDomain(row.url),
    httpCode: row.httpCode,
    failureReason: row.failureReason || 'UNKNOWN',
    suggestedAction: suggestFix(row),
    priority: reasonPriority(row.failureReason || 'UNKNOWN'),
    checkedDate: report.checkedDate,
  }))
  .sort((a, b) => {
    if (a.priority !== b.priority) {
      return a.priority - b.priority;
    }
    if (a.countryName !== b.countryName) {
      return a.countryName.localeCompare(b.countryName);
    }
    return a.outlet.localeCompare(b.outlet);
  });

const finalRows = typeof args.limit === 'number' ? invalidRows.slice(0, args.limit) : invalidRows;

const lines = [
  'countryName,countryCode,outlet,url,domain,httpCode,failureReason,suggestedAction,sourceCheckedDate,reportCheckedDate',
  ...finalRows.map((row) =>
    [
      quote(row.countryName),
      quote(row.countryCode),
      quote(row.outlet),
      quote(row.url),
      row.domain,
      row.httpCode === null ? '' : String(row.httpCode),
      row.failureReason,
      quote(row.suggestedAction),
      quote(generatedDate),
      quote(report.checkedDate),
    ].join(',')
  ),
];

writeFileSync(args.outputCsv, `${lines.join('\n')}\n`, 'utf8');
console.log(`Wrote fix backlog CSV: ${args.outputCsv}`);
console.log(`Input report: ${args.reportPath}`);
console.log(`Rows: ${finalRows.length}`);
console.log('Top failure reasons:');
for (const [reason, count] of Object.entries(report.summary.failureReasons).sort((a, b) => b[1] - a[1])) {
  console.log(`  - ${reason}: ${count}`);
}

function parseArgs(argv: string[]): CliArgs {
  const output: CliArgs = {
    reportPath: resolve(process.cwd(), 'audits', 'readme_rss_health_latest.json'),
    outputCsv: resolve(process.cwd(), 'audits', 'rss_fix_backlog.csv'),
  };

  for (const arg of argv) {
    if (!arg.startsWith('--')) {
      output.reportPath = resolve(process.cwd(), arg);
      continue;
    }

    if (arg.startsWith('--reasons=')) {
      const reasonArg = arg.split('=', 2)[1];
      const values = reasonArg
        ? reasonArg
            .split(',')
            .map((v) => v.trim())
            .filter(Boolean)
        : [];
      if (values.length > 0) {
        output.focusReasons = new Set(values);
      }
      continue;
    }

    if (arg.startsWith('--output=')) {
      const value = arg.split('=', 2)[1] || '';
      output.outputCsv = value ? resolve(process.cwd(), value) : resolve(process.cwd(), 'audits/rss_fix_backlog.csv');
      continue;
    }

    if (arg.startsWith('--limit=')) {
      const value = Number.parseInt(arg.split('=', 2)[1] || '', 10);
      if (!Number.isNaN(value) && value > 0) {
        output.limit = value;
      }
      continue;
    }
  }

  return output;
}

function loadReport(inputPath: string): HealthReport {
  const candidate = inputPath || resolve(process.cwd(), 'audits', 'readme_rss_health_latest.json');
  if (existsSync(candidate)) {
    return readReport(candidate);
  }

  const latest = resolve(process.cwd(), 'audits', 'readme_rss_health_latest.json');
  if (existsSync(latest)) {
    return readReport(latest);
  }

  const allCandidates = findDailyHealthReports();
  if (allCandidates.length === 0) {
    throw new Error('No health report found in ./audits. Run `bun run rss:health:once` first.');
  }
  return readReport(allCandidates[allCandidates.length - 1]);
}

function findDailyHealthReports(): string[] {
  const dir = resolve(process.cwd(), 'audits');
  const files = readdirSync(dir)
    .filter((name) => /^readme_rss_health_\d{4}-\d{2}-\d{2}\.json$/.test(name))
    .sort();
  return files.map((name) => resolve(dir, name));
}

function readReport(path: string): HealthReport {
  const raw = readFileSync(path, 'utf8');
  return JSON.parse(raw) as HealthReport;
}

function safeDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'INVALID_URL';
  }
}

function quote(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function reasonPriority(reason: string): number {
  const index = DEFAULT_REASON_ORDER.indexOf(reason);
  return index >= 0 ? index : DEFAULT_REASON_ORDER.length + 100;
}

function suggestFix(row: HealthResult): string {
  const reason = row.failureReason || 'UNKNOWN';

  if (reason === 'HTTP_404') {
    return 'Likely stale URL. Replace with official RSS endpoint from source section.';
  }

  if (reason === 'HTML_RETURNED') {
    if (row.url.includes('/rss') || row.url.includes('about_rss')) {
      return 'Looks like RSS directory/listing page. Mark as directory or replace with direct feed URL.';
    }
    return 'HTML is returned instead of XML. Find official feed endpoint.';
  }

  if (reason === 'HTTP_403' || reason === 'HTTP_401') {
    return 'Source blocks request/auth required. Replace feed or mark as auth-restricted.';
  }

  if (reason === 'TLS') {
    return 'TLS/certificate issue. Test alternate subdomain or remove unstable source.';
  }

  if (reason === 'TIMEOUT') {
    return 'Transient timeout. Retry with lower concurrency and longer delay.';
  }

  if (reason === 'HTTP_429') {
    return 'Rate-limited. Backoff and retry with slower cadence.';
  }

  if (reason === 'NETWORK' || reason === 'CONNECTION_RESET' || reason === 'CONNECTION_REFUSED') {
    return 'Network-level failure. Re-run on healthy runtime or later schedule.';
  }

  if (reason === 'INVALID_JSON') {
    return 'JSON response from endpoint. Replace with true XML/Atom feed.';
  }

  return 'Inspect source feed page and update to canonical RSS URL.';
}
