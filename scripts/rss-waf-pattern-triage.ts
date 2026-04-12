#!/usr/bin/env bun
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

type BacklogItem = {
  country: string;
  source: string;
  method: string;
  atlasUrl: string | null;
  latestFailedUrl: string;
  latestSuccessUrl: string | null;
  action: string;
  rationale: string;
};

type BacklogReport = {
  backlog?: BacklogItem[];
};

type TriageAction =
  | 'RETAIN_MANUAL_WAF_REVIEW'
  | 'ROOT_SITEMAP_SUCCESS_REUSE'
  | 'SAME_HOST_CANONICAL_PATH_SWAP'
  | 'DUPLICATE_ATLAS_URL_FAILURE'
  | 'HOST_FAMILY_WAF_CLUSTER';

type TriageItem = {
  country: string;
  source: string;
  host: string;
  method: string;
  latestFailedUrl: string;
  atlasUrl: string | null;
  triageAction: TriageAction;
  rationale: string;
};

type HostFamilyQueue = {
  host: string;
  total: number;
  countries: string[];
  sources: string[];
  triageSummary: Record<string, number>;
  missingAtlasUrlCount: number;
  failedUrls: string[];
  atlasUrls: string[];
  nextStep: string;
};

type CliOptions = {
  backlogPath: string;
  outputJsonPath: string;
  outputMdPath: string;
};

function parseOptions(): CliOptions {
  return {
    backlogPath: resolve(process.cwd(), 'audits/rss_hard_403_backlog_latest.json'),
    outputJsonPath: resolve(process.cwd(), 'audits/rss_waf_pattern_triage_latest.json'),
    outputMdPath: resolve(process.cwd(), 'audits/rss_waf_pattern_triage_latest.md'),
  };
}

function loadBacklog(filePath: string): BacklogReport {
  return JSON.parse(readFileSync(filePath, 'utf8')) as BacklogReport;
}

function hostOf(value: string | null | undefined): string {
  if (!value) return '';
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function pathnameOf(value: string | null | undefined): string {
  if (!value) return '';
  try {
    return new URL(value).pathname.toLowerCase();
  } catch {
    return '';
  }
}

function normalizeUrl(value: string | null | undefined): string {
  if (!value) return '';
  try {
    const url = new URL(value);
    url.hash = '';
    return url.toString();
  } catch {
    return value.trim();
  }
}

function rootLikePath(pathname: string): boolean {
  return pathname === '/sitemap.xml' || pathname === '/wp-sitemap.xml' || pathname === '/sitemaps.xml';
}

function summarizeByAction(items: TriageItem[]): Record<string, number> {
  return Object.fromEntries(
    items.reduce((map, item) => {
      map.set(item.triageAction, (map.get(item.triageAction) || 0) + 1);
      return map;
    }, new Map<string, number>())
  );
}

function triageItems(items: BacklogItem[]): TriageItem[] {
  const manual = items.filter((item) => item.action === 'MANUAL_WAF_REVIEW');
  const hostCounts = new Map<string, number>();
  for (const item of manual) {
    const host = hostOf(item.latestFailedUrl);
    hostCounts.set(host, (hostCounts.get(host) || 0) + 1);
  }

  return manual.map((item) => {
    const host = hostOf(item.latestFailedUrl);
    const failedUrl = normalizeUrl(item.latestFailedUrl);
    const atlasUrl = normalizeUrl(item.atlasUrl);
    const failedPath = pathnameOf(item.latestFailedUrl);
    const atlasPath = pathnameOf(item.atlasUrl);
    const count = hostCounts.get(host) || 0;

    let triageAction: TriageAction = 'RETAIN_MANUAL_WAF_REVIEW';
    let rationale = 'no clear low-risk pattern beyond manual WAF review';

    if (atlasUrl && atlasUrl === failedUrl) {
      triageAction = 'DUPLICATE_ATLAS_URL_FAILURE';
      rationale = 'atlas points at the same failing URL; likely retry/cooldown or de-duplication case';
    } else if (atlasUrl && hostOf(item.atlasUrl) === host && rootLikePath(atlasPath) && failedPath !== atlasPath) {
      triageAction = 'ROOT_SITEMAP_SUCCESS_REUSE';
      rationale = 'host has a root-style sitemap in atlas while a narrower sitemap path is failing';
    } else if (atlasUrl && hostOf(item.atlasUrl) === host) {
      triageAction = 'SAME_HOST_CANONICAL_PATH_SWAP';
      rationale = 'atlas and failed URL are on the same host with differing sitemap paths';
    } else if (count >= 3) {
      triageAction = 'HOST_FAMILY_WAF_CLUSTER';
      rationale = `same host appears ${count} times in manual WAF backlog`;
    }

    return {
      country: item.country,
      source: item.source,
      host,
      method: item.method,
      latestFailedUrl: item.latestFailedUrl,
      atlasUrl: item.atlasUrl,
      triageAction,
      rationale,
    };
  });
}

function buildHostFamilyQueues(items: TriageItem[]): HostFamilyQueue[] {
  const grouped = new Map<string, TriageItem[]>();
  for (const item of items) {
    const host = item.host || 'unknown-host';
    const bucket = grouped.get(host) || [];
    bucket.push(item);
    grouped.set(host, bucket);
  }

  return Array.from(grouped.entries())
    .map(([host, group]) => {
      const triageSummary = summarizeByAction(group);
      const countries = Array.from(new Set(group.map((item) => item.country))).sort();
      const sources = Array.from(new Set(group.map((item) => item.source))).sort();
      const failedUrls = Array.from(new Set(group.map((item) => item.latestFailedUrl))).sort();
      const atlasUrls = Array.from(
        new Set(group.map((item) => item.atlasUrl).filter((value): value is string => Boolean(value)))
      ).sort();
      const missingAtlasUrlCount = group.filter((item) => !item.atlasUrl).length;
      const lowRiskCount =
        (triageSummary.ROOT_SITEMAP_SUCCESS_REUSE || 0)
        + (triageSummary.SAME_HOST_CANONICAL_PATH_SWAP || 0)
        + (triageSummary.DUPLICATE_ATLAS_URL_FAILURE || 0);

      let nextStep = 'Manual host-level WAF verification required.';
      if (lowRiskCount > 0) {
        nextStep = 'Review low-risk same-host/root-sitemap atlas candidates before broader host WAF work.';
      } else if (missingAtlasUrlCount === group.length) {
        nextStep = 'Fallback-only sitemap failures; keep atlas unchanged until host-level verification succeeds.';
      } else if ((triageSummary.HOST_FAMILY_WAF_CLUSTER || 0) >= 3) {
        nextStep = 'Treat as a single host-family WAF queue and verify access once for the whole host.';
      }

      return {
        host,
        total: group.length,
        countries,
        sources,
        triageSummary,
        missingAtlasUrlCount,
        failedUrls,
        atlasUrls,
        nextStep,
      };
    })
    .sort((a, b) => b.total - a.total || a.host.localeCompare(b.host));
}

function writeArtifacts(
  outputJsonPath: string,
  outputMdPath: string,
  items: TriageItem[],
  hostFamilies: HostFamilyQueue[]
): void {
  mkdirSync(dirname(outputJsonPath), { recursive: true });

  const summary = summarizeByAction(items);

  const payload = {
    generatedAt: new Date().toISOString(),
    summary,
    hostFamilies,
    items,
  };

  writeFileSync(outputJsonPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

  const lines = [
    '# RSS WAF Pattern Triage',
    '',
    `Generated: ${payload.generatedAt}`,
    '',
    '## Summary',
    '',
    ...Object.entries(summary).map(([key, count]) => `- ${key}: ${count}`),
    '',
    '## Host-family Queues',
    '',
    '| Host | Total | Countries | Sources | Missing Atlas URL | Actions | Next Step |',
    '| --- | ---: | --- | --- | ---: | --- | --- |',
    ...hostFamilies.map((item) => (
      `| ${item.host} | ${item.total} | ${item.countries.join(', ')} | ${item.sources.slice(0, 6).join(', ')}${item.sources.length > 6 ? ' …' : ''} | ${item.missingAtlasUrlCount} | ${Object.entries(item.triageSummary).map(([key, count]) => `${key} ${count}`).join(', ')} | ${item.nextStep} |`
    )),
    '',
    '## Items',
    '',
    '| Country | Source | Host | Triage Action | Failed URL | Atlas URL | Rationale |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...items.map((item) => `| ${item.country} | ${item.source} | ${item.host} | ${item.triageAction} | ${item.latestFailedUrl} | ${item.atlasUrl || ''} | ${item.rationale} |`),
    '',
  ];

  writeFileSync(outputMdPath, `${lines.join('\n')}\n`, 'utf8');
}

async function main(): Promise<void> {
  const options = parseOptions();
  const backlog = loadBacklog(options.backlogPath).backlog || [];
  const items = triageItems(backlog);
  const hostFamilies = buildHostFamilyQueues(items);
  writeArtifacts(options.outputJsonPath, options.outputMdPath, items, hostFamilies);
  console.log(
    JSON.stringify(
      {
        total: items.length,
        byAction: summarizeByAction(items),
        topHosts: hostFamilies.slice(0, 5).map((item) => ({
          host: item.host,
          total: item.total,
          nextStep: item.nextStep,
        })),
        outputJsonPath: options.outputJsonPath,
        outputMdPath: options.outputMdPath,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
