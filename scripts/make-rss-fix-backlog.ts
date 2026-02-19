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

type FixSuggestion = {
  action: 'REPLACE' | 'TRY_REPLACE' | 'MARK_DIRECTORY' | 'DROP_OR_GENERATE' | 'RETRY_LATER' | 'INSPECT_REQUIRED';
  candidates: string[];
  note: string;
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

const HIGH_CONFIDENCE_FIXES: Array<{
  reason?: string;
  outletContains?: string[];
  countryNameContains?: string[];
  domainContains: string[];
  pathContains?: string[];
  action: FixSuggestion['action'];
  candidates: string[];
  note: string;
}> = [
  {
    domainContains: ['infobae.com'],
    action: 'REPLACE',
    candidates: ['https://www.infobae.com/arc/outboundfeeds/rss/?outputType=xml'],
    note: 'Arc outboundfeeds likely requires outputType=xml.',
  },
  {
    countryNameContains: ['United States'],
    domainContains: ['ajc.com'],
    action: 'TRY_REPLACE',
    candidates: ['https://www.ajc.com/arc/outboundfeeds/rss/?outputType=xml'],
    note: 'Try Arc outboundfeeds RSS candidate.',
  },
  {
    countryNameContains: ['United States'],
    domainContains: ['bostonglobe.com'],
    action: 'TRY_REPLACE',
    candidates: ['https://www.bostonglobe.com/arc/outboundfeeds/rss?outputType=xml'],
    note: 'Try Arc outboundfeeds RSS candidate.',
  },
  {
    countryNameContains: ['United States'],
    domainContains: ['vanityfair.com'],
    action: 'REPLACE',
    candidates: ['http://feeds.feedburner.com/vfdotcomrss'],
    note: 'Official Feedburner feed is maintained and already used in other copies.',
  },
  {
    countryNameContains: ['United States'],
    domainContains: ['esquire.com'],
    action: 'REPLACE',
    candidates: [
      'https://www.esquire.com/rss/entertainment.xml',
      'https://www.esquire.com/rss/style.xml',
      'https://www.esquire.com/rss/food-drink.xml',
      'https://www.esquire.com/rss/sports.xml',
    ],
    note: 'Official Esquire feed list is sectioned; start with entertainment/style.',
  },
  {
    countryNameContains: ['United States'],
    domainContains: ['gq.com'],
    action: 'REPLACE',
    candidates: ['https://www.gq.com/feed/rss'],
    note: 'Use GQ RSS endpoint (feed/ instead of /feed).',
  },
  {
    countryNameContains: ['United States'],
    domainContains: ['espn.com'],
    reason: 'HTTP_404',
    action: 'TRY_REPLACE',
    candidates: ['https://www.espn.com/espn/rss/news'],
    note: 'Fallback to ESPN top-level section RSS.',
  },
  {
    countryNameContains: ['United States'],
    domainContains: ['space.com'],
    reason: 'HTTP_404',
    action: 'TRY_REPLACE',
    candidates: ['https://www.space.com/feeds/all'],
    note: 'Try feed namespace variant used by this publisher.',
  },
  {
    countryNameContains: ['United States'],
    domainContains: ['newsweek.com'],
    reason: 'HTTP_404',
    action: 'TRY_REPLACE',
    candidates: ['https://www.newsweek.com/rss'],
    note: 'Common legacy Newsweek RSS entry point.',
  },
  {
    countryNameContains: ['United States'],
    domainContains: ['scientificamerican.com'],
    reason: 'HTTP_404',
    action: 'TRY_REPLACE',
    candidates: ['https://www.scientificamerican.com/rss/'],
    note: 'Try RSS root path for section-based feeds.',
  },
  {
    countryNameContains: ['United States'],
    domainContains: ['nationalgeographic.com'],
    reason: 'HTTP_404',
    action: 'DROP_OR_GENERATE',
    candidates: [],
    note: 'No public canonical feed found; consider substitute source or generator.',
  },
  {
    countryNameContains: ['United States'],
    domainContains: ['pbs.org'],
    reason: 'HTTP_404',
    action: 'TRY_REPLACE',
    candidates: ['https://www.pbs.org/newshour/feeds/rss/headlines'],
    note: 'PBS often exposes section feeds under /newshour/feeds.',
  },
  {
    countryNameContains: ['United States'],
    domainContains: ['webmd.com'],
    reason: 'HTTP_404',
    action: 'TRY_REPLACE',
    candidates: ['https://www.webmd.com/rss'],
    note: 'Try alternate RSS endpoint.',
  },
  {
    countryNameContains: ['United States'],
    domainContains: ['apnews.com'],
    reason: 'HTTP_404',
    action: 'DROP_OR_GENERATE',
    candidates: [],
    note: 'AP no longer publishes open public RSS in many paths.',
  },
  {
    countryNameContains: ['United States'],
    domainContains: ['cleveland.com'],
    action: 'REPLACE',
    candidates: ['https://www.cleveland.com/arc/outboundfeeds/rss/?outputType=xml'],
    note: 'Cleveland is known to expose Arc outboundfeeds XML.',
  },
  {
    countryNameContains: ['United States'],
    domainContains: ['theathletic.com'],
    reason: 'HTTP_404',
    action: 'DROP_OR_GENERATE',
    candidates: [],
    note: 'Likely paywall/auth feed; prefer generator fallback.',
  },
  {
    countryNameContains: ['China'],
    domainContains: ['chinadaily.com.cn'],
    reason: 'HTTP_404',
    action: 'REPLACE',
    candidates: ['http://www.chinadaily.com.cn/rss/world_rss.xml'],
    note: 'Known China Daily RSS XML endpoint.',
  },
  {
    countryNameContains: ['China', 'Taiwan'],
    domainContains: ['ltn.com.tw'],
    action: 'TRY_REPLACE',
    reason: 'HTML_RETURNED',
    candidates: ['https://news.ltn.com.tw/rss/all.xml', 'https://news.ltn.com.tw/rss/business.xml'],
    note: 'LTP has section RSS endpoints under news.ltn.com.tw.',
  },
  {
    countryNameContains: ['Argentina'],
    domainContains: ['reporteenergia.com'],
    action: 'TRY_REPLACE',
    reason: 'HTML_RETURNED',
    candidates: ['https://www.reporteenergia.com/feed/'],
    note: 'Reporte Energía exposes feed under /feed/.',
  },
  {
    countryNameContains: ['China'],
    domainContains: ['scmp.com'],
    reason: 'HTML_RETURNED',
    action: 'TRY_REPLACE',
    candidates: ['https://www.scmp.com/rss/91/feed'],
    note: 'SCMP RSS path has changed; try alternate feed id.',
  },
  {
    countryNameContains: ['Japan'],
    domainContains: ['mainichi.jp'],
    action: 'TRY_REPLACE',
    reason: 'HTML_RETURNED',
    candidates: ['https://mainichi.jp/rss/etc/english_latest.rss'],
    note: 'Try language section feed variant.',
  },
  {
    countryNameContains: ['Japan'],
    domainContains: ['nippon.com'],
    action: 'TRY_REPLACE',
    reason: 'HTML_RETURNED',
    candidates: ['https://www.nippon.com/en/feed/'],
    note: 'Try language-level feed endpoint.',
  },
  {
    countryNameContains: ['Australia'],
    domainContains: ['sydneytimes', 'sydneymorningherald'],
    reason: 'HTTP_404',
    action: 'TRY_REPLACE',
    candidates: [],
    note: 'Check if this publication moved to proprietary archive/JS endpoints.',
  },
  {
    countryNameContains: ['France'],
    domainContains: ['lepoint.fr'],
    action: 'TRY_REPLACE',
    reason: 'HTML_RETURNED',
    candidates: [],
    note: 'Directory/listing page behavior; locate canonical feed in page source.',
  },
  {
    countryNameContains: ['South Korea', 'Korea'],
    domainContains: ['world.kbs.co.kr'],
    action: 'MARK_DIRECTORY',
    reason: 'HTML_RETURNED',
    candidates: ['http://world.kbs.co.kr/rss/rss_news.htm?lang=e'],
    note: 'Current URL is RSS directory page; add actual feed items separately.',
  },
  {
    countryNameContains: ['South Korea', 'Korea'],
    domainContains: ['koreaherald.com'],
    action: 'MARK_DIRECTORY',
    reason: 'HTML_RETURNED',
    candidates: ['https://www.koreaherald.com/rss/newsAll'],
    note: 'RSS root is often directory-only; switch to concrete section endpoint.',
  },
  {
    countryNameContains: ['South Korea', 'Korea'],
    domainContains: ['koreatimes.co.kr', 'koreatimes.com'],
    action: 'REPLACE',
    reason: 'HTML_RETURNED',
    candidates: ['https://feed.koreatimes.co.kr/k/allnews.xml'],
    note: 'Known Koreatimes feed host for XML.',
  },
  {
    countryNameContains: ['United States'],
    domainContains: ['usatoday.com'],
    action: 'TRY_REPLACE',
    reason: 'HTML_RETURNED',
    candidates: ['https://rssfeeds.usatoday.com/usatoday-NewsTopStories', 'https://rssfeeds.usatoday.com/UsatodaycomNation-TopStories'],
    note: 'Try alternate lowercase top-stories key and fallback legacy endpoint.',
  },
];

const DIRECTORY_INDICATORS = ['/rss', '/about_rss', 'about_rss.htm', '/rss/', '/feed?'];
const HTML_BLOCKING_HOSTS = ['reuters.com', 'rg.ru'];

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
  .map((row) => {
    const suggestion = suggestFix(row);
    return {
    countryName: row.countryName,
    countryCode: row.countryCode,
    outlet: row.outlet,
    url: row.url,
    domain: safeDomain(row.url),
    httpCode: row.httpCode,
    failureReason: row.failureReason || 'UNKNOWN',
    fixAction: suggestion.action,
    candidateUrls: suggestion.candidates,
    suggestedAction: suggestion.note,
    priority: reasonPriority(row.failureReason || 'UNKNOWN'),
    checkedDate: report.checkedDate,
  };
  })
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
  'countryName,countryCode,outlet,url,domain,httpCode,failureReason,fixAction,candidateUrls,suggestedAction,sourceCheckedDate,reportCheckedDate',
  ...finalRows.map((row) =>
    [
      quote(row.countryName),
      quote(row.countryCode),
      quote(row.outlet),
      quote(row.url),
      row.domain,
      row.httpCode === null ? '' : String(row.httpCode),
      row.failureReason,
      quote(row.fixAction),
      quote(row.candidateUrls.join(' | ')),
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

function suggestFix(row: HealthResult): FixSuggestion {
  const reason = row.failureReason || 'UNKNOWN';
  const domain = safeDomain(row.url).toLowerCase();
  const path = getPath(row.url).toLowerCase();

  const directMatch = HIGH_CONFIDENCE_FIXES.find((rule) => {
    if (rule.reason && rule.reason !== reason) {
      return false;
    }
    if (rule.countryNameContains && !rule.countryNameContains.some((value) => row.countryName.toLowerCase() === value.toLowerCase())) {
      return false;
    }
    if (rule.outletContains && !rule.outletContains.some((needle) => row.outlet.toLowerCase().includes(needle.toLowerCase()))) {
      return false;
    }
    if (!rule.domainContains.some((needle) => domain.includes(needle.toLowerCase()))) {
      return false;
    }
    if (rule.pathContains && !rule.pathContains.some((needle) => path.includes(needle.toLowerCase()))) {
      return false;
    }
    return true;
  });

  if (directMatch) {
    return {
      action: directMatch.action,
      candidates: directMatch.candidates,
      note: directMatch.note,
    };
  }

  if (reason === 'HTTP_404') {
    return {
      action: 'TRY_REPLACE',
      candidates: [],
      note: 'Likely stale URL. Re-check source section for canonical RSS path.',
    };
  }

  if (reason === 'HTML_RETURNED') {
    if (DIRECTORY_INDICATORS.some((indicator) => path.includes(indicator))) {
      return {
        action: 'MARK_DIRECTORY',
        candidates: [],
        note: 'Looks like RSS directory/listing or discovery page. Replace with concrete feed URL.',
      };
    }

    if (isKnownRssBlocker(row)) {
      return {
        action: 'DROP_OR_GENERATE',
        candidates: [],
        note: 'Blocked/auth-required HTML/anti-bot response likely. Consider generator fallback.',
      };
    }

    return {
      action: 'TRY_REPLACE',
      candidates: [],
      note: 'HTML is returned instead of XML. Find official feed endpoint.',
    };
  }

  if (reason === 'HTTP_403' || reason === 'HTTP_401') {
    return {
      action: 'DROP_OR_GENERATE',
      candidates: [],
      note: 'Source blocks bots/auths. Prefer generator or alternative source.',
    };
  }

  if (reason === 'TLS' || reason === 'NETWORK' || reason === 'TIMEOUT' || reason === 'HTTP_429' || reason === 'HTTP_502') {
    return {
      action: 'RETRY_LATER',
      candidates: [],
      note: 'Transient infra issue. Retry with stable runtime and longer timeout/backoff.',
    };
  }

  return {
    action: 'INSPECT_REQUIRED',
    candidates: [],
    note: 'Inspect source feed page and update to canonical RSS URL.',
  };
}

function getPath(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return '';
  }
}

function isKnownRssBlocker(row: HealthResult): boolean {
  try {
    const hostname = new URL(row.url).hostname.toLowerCase();
    return HTML_BLOCKING_HOSTS.some((domain) => hostname.includes(domain));
  } catch {
    return false;
  }
}
