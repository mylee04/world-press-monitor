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

function writeArtifacts(outputJsonPath: string, outputMdPath: string, items: TriageItem[]): void {
  mkdirSync(dirname(outputJsonPath), { recursive: true });

  const summary = Object.fromEntries(
    items.reduce((map, item) => {
      map.set(item.triageAction, (map.get(item.triageAction) || 0) + 1);
      return map;
    }, new Map<string, number>())
  );

  const payload = {
    generatedAt: new Date().toISOString(),
    summary,
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
  writeArtifacts(options.outputJsonPath, options.outputMdPath, items);
  console.log(
    JSON.stringify(
      {
        total: items.length,
        byAction: Object.fromEntries(
          items.reduce((map, item) => {
            map.set(item.triageAction, (map.get(item.triageAction) || 0) + 1);
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
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
