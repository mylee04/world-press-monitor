#!/usr/bin/env bun
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

type AtlasFeed = {
  name: string;
  url?: string | null;
  sitemapUrl?: string | null;
  enabled?: boolean;
  status?: string | null;
  checkedDate?: string | null;
  valid?: string | null;
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

type Hard403BacklogItem = {
  country: string;
  source: string;
  method: string;
  atlasUrl: string | null;
  latestFailedUrl: string;
  latestSuccessUrl: string | null;
  action: string;
};

type Hard403BacklogReport = {
  backlog?: Hard403BacklogItem[];
};

type CanonicalSwapChange = {
  country: string;
  source: string;
  method: string;
  from: string | null;
  to: string;
};

type RemovedDuplicate = {
  country: string;
  source: string;
  sitemapUrl: string;
  replacedBy: string;
};

type CliOptions = {
  atlasPath: string;
  backlogPath: string;
  outputJsonPath: string;
  outputMdPath: string;
  apply: boolean;
};

function parseOptions(): CliOptions {
  return {
    atlasPath: process.env.ATLAS_PATH || resolve(process.cwd(), 'data/rss-atlas.json'),
    backlogPath: resolve(process.cwd(), 'audits/rss_hard_403_backlog_latest.json'),
    outputJsonPath: resolve(process.cwd(), 'audits/rss_followup_remediation_latest.json'),
    outputMdPath: resolve(process.cwd(), 'audits/rss_followup_remediation_latest.md'),
    apply: !process.argv.includes('--dry-run'),
  };
}

function loadAtlas(filePath: string): Atlas {
  return JSON.parse(readFileSync(filePath, 'utf8')) as Atlas;
}

function writeAtlas(filePath: string, atlas: Atlas): void {
  writeFileSync(filePath, `${JSON.stringify(atlas, null, 2)}\n`, 'utf8');
}

function loadBacklog(filePath: string): Hard403BacklogReport {
  return JSON.parse(readFileSync(filePath, 'utf8')) as Hard403BacklogReport;
}

function normalizeUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    url.hash = '';
    return url.toString();
  } catch {
    const trimmed = value.trim();
    return trimmed || null;
  }
}

function buildActiveAtlasUrlMap(atlas: Atlas): Map<string, string> {
  const map = new Map<string, string>();
  for (const country of atlas.countries) {
    for (const feed of country.feeds || []) {
      if (feed.enabled === false) continue;
      const rssUrl = normalizeUrl(feed.url);
      const sitemapUrl = normalizeUrl(feed.sitemapUrl);
      if (rssUrl) map.set(`rss|||${country.name}|||${rssUrl}`, feed.name);
      if (sitemapUrl) map.set(`sitemap|||${country.name}|||${sitemapUrl}`, feed.name);
    }
  }
  return map;
}

function applyCanonicalBacklogSwaps(
  atlas: Atlas,
  backlog: Hard403BacklogItem[]
): { applied: CanonicalSwapChange[]; skipped: number } {
  const applied: CanonicalSwapChange[] = [];
  let skipped = 0;

  for (const item of backlog) {
    if (item.action !== 'CANONICAL_SWAP_CANDIDATE' || !item.latestSuccessUrl) continue;

    const country = atlas.countries.find((entry) => entry.name === item.country);
    const feed = country?.feeds.find((entry) => entry.name === item.source && entry.enabled !== false);
    if (!country || !feed) {
      skipped += 1;
      continue;
    }

    const slot = item.method === 'sitemap' ? 'sitemapUrl' : 'url';
    const currentValue = normalizeUrl(slot === 'sitemapUrl' ? feed.sitemapUrl : feed.url);
    const failedValue = normalizeUrl(item.latestFailedUrl);
    const successValue = normalizeUrl(item.latestSuccessUrl);
    if (!successValue) {
      skipped += 1;
      continue;
    }
    if (currentValue && failedValue && currentValue !== failedValue) {
      skipped += 1;
      continue;
    }

    const activeAtlasUrls = buildActiveAtlasUrlMap(atlas);
    const existingRepresentative = activeAtlasUrls.get(`${item.method}|||${item.country}|||${successValue}`);
    if (existingRepresentative && existingRepresentative !== feed.name) {
      skipped += 1;
      continue;
    }

    if (currentValue === successValue) {
      skipped += 1;
      continue;
    }

    if (slot === 'sitemapUrl') {
      feed.sitemapUrl = item.latestSuccessUrl;
    } else {
      feed.url = item.latestSuccessUrl;
    }
    applied.push({
      country: item.country,
      source: item.source,
      method: item.method,
      from: currentValue,
      to: item.latestSuccessUrl,
    });
  }

  return { applied, skipped };
}

function removeDisabledDuplicateSitemaps(atlas: Atlas): RemovedDuplicate[] {
  const removed: RemovedDuplicate[] = [];

  for (const country of atlas.countries) {
    const activeBySitemap = new Map<string, string>();
    for (const feed of country.feeds || []) {
      if (feed.enabled === false) continue;
      const sitemapUrl = normalizeUrl(feed.sitemapUrl);
      if (sitemapUrl) activeBySitemap.set(sitemapUrl, feed.name);
    }

    country.feeds = (country.feeds || []).filter((feed) => {
      const sitemapUrl = normalizeUrl(feed.sitemapUrl);
      if (
        feed.enabled === false
        && !feed.url
        && sitemapUrl
        && activeBySitemap.has(sitemapUrl)
      ) {
        removed.push({
          country: country.name,
          source: feed.name,
          sitemapUrl,
          replacedBy: activeBySitemap.get(sitemapUrl)!,
        });
        return false;
      }
      return true;
    });
  }

  return removed;
}

function writeArtifacts(
  outputJsonPath: string,
  outputMdPath: string,
  options: CliOptions,
  canonicalChanges: CanonicalSwapChange[],
  removedDuplicates: RemovedDuplicate[],
  skippedCanonical: number
): void {
  mkdirSync(dirname(outputJsonPath), { recursive: true });

  const payload = {
    generatedAt: new Date().toISOString(),
    apply: options.apply,
    summary: {
      canonicalApplied: canonicalChanges.length,
      canonicalSkipped: skippedCanonical,
      duplicateSitemapsRemoved: removedDuplicates.length,
    },
    canonicalChanges,
    removedDuplicates,
  };

  writeFileSync(outputJsonPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

  const lines = [
    '# RSS Follow-up Remediation',
    '',
    `Generated: ${payload.generatedAt}`,
    `Apply mode: ${options.apply ? 'apply' : 'dry-run'}`,
    '',
    `- Canonical swaps applied: ${payload.summary.canonicalApplied}`,
    `- Canonical swaps skipped: ${payload.summary.canonicalSkipped}`,
    `- Disabled duplicate sitemaps removed: ${payload.summary.duplicateSitemapsRemoved}`,
    '',
    '## Canonical Swaps Applied',
    '',
    '| Country | Source | Method | From | To |',
    '| --- | --- | --- | --- | --- |',
    ...canonicalChanges.map((item) => `| ${item.country} | ${item.source} | ${item.method} | ${item.from || ''} | ${item.to} |`),
    '',
    '## Removed Disabled Duplicate Sitemaps',
    '',
    '| Country | Source | Sitemap URL | Replaced By |',
    '| --- | --- | --- | --- |',
    ...removedDuplicates.map((item) => `| ${item.country} | ${item.source} | ${item.sitemapUrl} | ${item.replacedBy} |`),
    '',
  ];

  writeFileSync(outputMdPath, `${lines.join('\n')}\n`, 'utf8');
}

async function main(): Promise<void> {
  const options = parseOptions();
  const atlas = loadAtlas(options.atlasPath);
  const backlog = loadBacklog(options.backlogPath).backlog || [];

  const { applied, skipped } = applyCanonicalBacklogSwaps(atlas, backlog);
  const removedDuplicates = removeDisabledDuplicateSitemaps(atlas);

  if (options.apply && (applied.length > 0 || removedDuplicates.length > 0)) {
    writeAtlas(options.atlasPath, atlas);
  }

  writeArtifacts(
    options.outputJsonPath,
    options.outputMdPath,
    options,
    applied,
    removedDuplicates,
    skipped
  );

  console.log(
    JSON.stringify(
      {
        canonicalApplied: applied.length,
        canonicalSkipped: skipped,
        duplicateSitemapsRemoved: removedDuplicates.length,
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
