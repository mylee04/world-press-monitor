import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import { parseRssOrAtomWithStats } from '@/lib/parsers';
import { buildFeedStableId } from '@/lib/pipeline';
import { runWithConcurrency } from '@/lib/concurrency';

type AtlasCatalog = {
  countries?: Array<{
    name?: string;
    code?: string;
    feeds?: Array<{
      name?: string;
      url?: string | null;
      enabled?: boolean;
    }>;
  }>;
};

type FeedTarget = {
  country: string;
  source: string;
  url: string;
};

type StableLinkRow = {
  link: string;
  stableId: string;
  source: string;
};

function parseArgValue(flag: string): string | null {
  const inline = process.argv.find((token) => token.startsWith(`${flag}=`));
  if (inline) return inline.slice(flag.length + 1).trim() || null;
  const index = process.argv.indexOf(flag);
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1].trim() || null;
  return null;
}

function parseIntArg(flag: string, fallback: number, min = 1, max = 10_000): number {
  const raw = parseArgValue(flag);
  const parsed = Number.parseInt(raw || '', 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function parseCsvArg(flag: string): string[] {
  const raw = parseArgValue(flag);
  if (!raw) return [];
  return raw.split(',').map((value) => value.trim()).filter(Boolean);
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function normalizeText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function loadFeedTargets(atlasPath: string, countries: string[], sourcePrefixes: string[]): FeedTarget[] {
  const raw = readFileSync(atlasPath, 'utf8');
  const atlas = JSON.parse(raw) as AtlasCatalog;
  const countryFilter = new Set(countries.map(normalizeText));
  const sourcePrefixFilter = sourcePrefixes.map(normalizeText);

  return (atlas.countries || []).flatMap((country) => {
    const countryName = country.name || country.code || 'Global';
    return (country.feeds || [])
      .filter((feed) => feed.enabled !== false && typeof feed.url === 'string' && feed.url.trim().length > 0)
      .map((feed) => ({
        country: countryName,
        source: feed.name || 'Unknown source',
        url: feed.url!.trim(),
      }))
      .filter((feed) => {
        if (countryFilter.size > 0 && !countryFilter.has(normalizeText(feed.country))) return false;
        if (sourcePrefixFilter.length === 0) return true;
        const normalizedSource = normalizeText(feed.source);
        return sourcePrefixFilter.some((prefix) => normalizedSource.startsWith(prefix));
      });
  });
}

async function fetchStableRows(target: FeedTarget, itemLimit: number, minPublishedAtMs: number): Promise<StableLinkRow[]> {
  try {
    const response = await fetch(target.url, {
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; PresslabStableIdBackfill/1.0)',
        'accept': 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8',
      }
    });
    if (!response.ok) return [];
    const xml = await response.text();
    const parsed = parseRssOrAtomWithStats(xml, itemLimit);
    return parsed.items
      .map((item) => ({
        link: item.link,
        stableId: buildFeedStableId(item.stableId || '', item.link),
        source: target.source,
        publishedAtMs: new Date(item.publishedAt).getTime(),
      }))
      .filter((item) => item.link && item.stableId && Number.isFinite(item.publishedAtMs) && item.publishedAtMs >= minPublishedAtMs)
      .map(({ link, stableId, source }) => ({ link, stableId, source }));
  } catch {
    return [];
  }
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  const atlasPath = process.env.ATLAS_PATH || resolve(process.cwd(), 'data/rss-atlas.json');
  const countries = parseCsvArg('--country');
  const sourcePrefixes = parseCsvArg('--source-prefix');
  const hours = parseIntArg('--hours', 168, 1, 24 * 30);
  const itemLimit = parseIntArg('--item-limit', 200, 10, 2000);
  const concurrency = parseIntArg('--concurrency', 8, 1, 32);
  const apply = hasFlag('--apply');

  const targets = loadFeedTargets(atlasPath, countries, sourcePrefixes);
  const minPublishedAtMs = Date.now() - hours * 60 * 60 * 1000;
  const rows = (await runWithConcurrency(targets, concurrency, (target) => fetchStableRows(target, itemLimit, minPublishedAtMs)))
    .flat()
    .reduce((acc, row) => {
      const current = acc.get(row.link);
      if (!current) {
        acc.set(row.link, row);
      }
      return acc;
    }, new Map<string, StableLinkRow>());
  const dedupedRows = [...rows.values()];

  if (!apply) {
    console.log(JSON.stringify({
      apply: false,
      targets: targets.length,
      candidates: dedupedRows.length,
      sample: dedupedRows.slice(0, 10),
    }, null, 2));
    return;
  }

  const db = new Pool({ connectionString: databaseUrl });
  try {
    let updated = 0;
    const chunks: StableLinkRow[][] = [];
    for (let i = 0; i < dedupedRows.length; i += 250) {
      chunks.push(dedupedRows.slice(i, i + 250));
    }

    for (const chunk of chunks) {
      const values: unknown[] = [];
      const parts: string[] = [];
      chunk.forEach((row, index) => {
        const base = index * 2;
        parts.push(`($${base + 1}::text,$${base + 2}::text)`);
        values.push(row.link, row.stableId);
      });

      const result = await db.query(
        `
        update news_articles as n
        set stable_id = data.stable_id,
            updated_at = now()
        from (values ${parts.join(',')}) as data(url, stable_id)
        where n.url = data.url
          and (n.stable_id is null or n.stable_id = data.stable_id)
        `,
        values
      );
      updated += result.rowCount || 0;
    }

    console.log(JSON.stringify({
      apply: true,
      targets: targets.length,
      candidates: dedupedRows.length,
      updated,
    }, null, 2));
  } finally {
    await db.end();
  }
}

main().catch((error) => {
  console.error('[backfill-news-article-stable-ids] failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
