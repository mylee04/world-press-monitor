#!/usr/bin/env bun

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Pool } from 'pg';

type AtlasFeed = {
  name?: string;
  url?: string | null;
  sitemapUrl?: string | null;
};

type AtlasCountry = {
  name?: string;
  feeds?: AtlasFeed[];
};

type AtlasCatalog = {
  countries?: AtlasCountry[];
};

type SourceHostEntry = {
  country: string;
  hosts: string[];
  rootHosts: string[];
};

type DuplicateArticleRow = {
  external_id: string;
  source: string;
  url: string;
  source_country: string | null;
};

const DEFAULT_ATLAS_PATH = resolve(process.cwd(), 'data/rss-atlas.json');
const COMPOUND_SUFFIXES = new Set(['co.uk', 'co.jp', 'com.tr', 'com.au', 'net.au', 'org.au', 'co.za']);

function parseArg(name: string): string | null {
  const direct = process.argv.find((value) => value.startsWith(`${name}=`));
  if (direct) return direct.slice(name.length + 1).trim() || null;
  const index = process.argv.indexOf(name);
  if (index >= 0) return process.argv[index + 1]?.trim() || null;
  return null;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

function normalizeHost(rawUrl: string | null | undefined): string | null {
  if (!rawUrl) return null;
  try {
    const host = new URL(rawUrl).hostname.trim().toLowerCase().replace(/^www\./, '');
    return host || null;
  } catch {
    return null;
  }
}

function rootishHost(host: string | null | undefined): string | null {
  const normalized = (host || '').trim().toLowerCase().replace(/^www\./, '');
  if (!normalized) return null;
  const labels = normalized.split('.').filter(Boolean);
  if (labels.length <= 2) return normalized;
  const tail2 = labels.slice(-2).join('.');
  const tail3 = labels.slice(-3).join('.');
  if (COMPOUND_SUFFIXES.has(tail2) && labels.length >= 3) {
    return tail3;
  }
  return tail2;
}

function chunk<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function loadAtlasMappings(atlasPath: string): {
  uniqueSourceMappings: Array<{ source: string; country: string }>;
  duplicateSources: string[];
  duplicateEntriesBySource: Map<string, SourceHostEntry[]>;
} {
  const atlas = JSON.parse(readFileSync(atlasPath, 'utf8')) as AtlasCatalog;
  const sourceCountries = new Map<string, Set<string>>();
  const duplicateEntriesBySource = new Map<string, SourceHostEntry[]>();

  for (const country of atlas.countries || []) {
    const countryName = (country?.name || '').trim();
    if (!countryName) continue;
    for (const feed of country.feeds || []) {
      const source = (feed?.name || '').trim();
      if (!source) continue;

      const countries = sourceCountries.get(source) || new Set<string>();
      countries.add(countryName);
      sourceCountries.set(source, countries);

      const hosts = [...new Set(
        [feed.url, feed.sitemapUrl]
          .map((value) => normalizeHost(value))
          .filter((value): value is string => Boolean(value))
      )];
      const rootHosts = [...new Set(
        hosts
          .map((value) => rootishHost(value))
          .filter((value): value is string => Boolean(value))
      )];
      const entries = duplicateEntriesBySource.get(source) || [];
      entries.push({ country: countryName, hosts, rootHosts });
      duplicateEntriesBySource.set(source, entries);
    }
  }

  const uniqueSourceMappings = [...sourceCountries.entries()]
    .filter(([, countries]) => countries.size === 1)
    .map(([source, countries]) => ({ source, country: [...countries][0] }))
    .sort((left, right) => left.source.localeCompare(right.source));

  const duplicateSources = [...sourceCountries.entries()]
    .filter(([, countries]) => countries.size > 1)
    .map(([source]) => source)
    .sort((left, right) => left.localeCompare(right));

  return { uniqueSourceMappings, duplicateSources, duplicateEntriesBySource };
}

async function insertSourceCountryRows(
  pool: Pool,
  tableName: string,
  rows: Array<{ source: string; country: string }>
): Promise<void> {
  for (const batch of chunk(rows, 500)) {
    const values: unknown[] = [];
    const placeholders = batch.map((row, index) => {
      const base = index * 2;
      values.push(row.source, row.country);
      return `($${base + 1}::text, $${base + 2}::text)`;
    });
    await pool.query(`insert into ${tableName} (source, country) values ${placeholders.join(', ')}`, values);
  }
}

async function insertExternalIdCountryRows(
  pool: Pool,
  tableName: string,
  rows: Array<{ externalId: string; country: string }>
): Promise<void> {
  for (const batch of chunk(rows, 500)) {
    const values: unknown[] = [];
    const placeholders = batch.map((row, index) => {
      const base = index * 2;
      values.push(row.externalId, row.country);
      return `($${base + 1}::text, $${base + 2}::text)`;
    });
    await pool.query(`insert into ${tableName} (external_id, country) values ${placeholders.join(', ')}`, values);
  }
}

function resolveDuplicateCountry(
  row: DuplicateArticleRow,
  duplicateEntriesBySource: Map<string, SourceHostEntry[]>
): string | null {
  const entries = duplicateEntriesBySource.get(row.source) || [];
  if (!entries.length) return null;

  const articleHost = normalizeHost(row.url);
  const articleRootHost = rootishHost(articleHost);
  const matchedCountries = [...new Set(
    entries
      .filter((entry) => (
        (articleHost && entry.hosts.some((host) => (
          articleHost === host
          || articleHost.endsWith(`.${host}`)
          || host.endsWith(`.${articleHost}`)
        )))
        || (articleRootHost && entry.rootHosts.includes(articleRootHost))
      ))
      .map((entry) => entry.country)
  )];

  return matchedCountries.length === 1 ? matchedCountries[0] : null;
}

async function main(): Promise<void> {
  const atlasPath = parseArg('--atlas') || DEFAULT_ATLAS_PATH;
  const databaseUrl = parseArg('--database-url') || process.env.DATABASE_URL || '';
  const dryRun = hasFlag('--dry-run');

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required. Pass --database-url=... or set DATABASE_URL.');
  }

  const { uniqueSourceMappings, duplicateSources, duplicateEntriesBySource } = loadAtlasMappings(atlasPath);
  const pool = new Pool({ connectionString: databaseUrl });

  try {
    await pool.query('begin');
    await pool.query(`alter table news_articles add column if not exists source_country text null`);
    await pool.query(`create index if not exists idx_news_articles_source_country on news_articles(source_country)`);

    const futureBefore = Number((await pool.query(
      `select count(*)::text as count from news_articles where publication_datetime > created_at`
    )).rows[0]?.count || 0);

    const futureUpdate = dryRun
      ? { rowCount: futureBefore }
      : await pool.query(
          `update news_articles
           set publication_datetime = created_at,
               updated_at = now()
           where publication_datetime > created_at`
        );

    await pool.query(
      `create temp table tmp_atlas_source_country (
         source text primary key,
         country text not null
       ) on commit drop`
    );
    await insertSourceCountryRows(pool, 'tmp_atlas_source_country', uniqueSourceMappings);

    const uniqueCountryUpdate = dryRun
      ? await pool.query(
          `select count(*)::int as count
           from news_articles as n
           join tmp_atlas_source_country as t on t.source = n.source
           where n.source_country is distinct from t.country`
        )
      : await pool.query(
          `update news_articles as n
           set source_country = t.country,
               updated_at = now()
           from tmp_atlas_source_country as t
           where n.source = t.source
             and n.source_country is distinct from t.country`
        );

    let duplicateCountryRowsUpdated = 0;
    let unresolvedDuplicateRows = 0;
    if (duplicateSources.length > 0) {
      const duplicateRows = (await pool.query<DuplicateArticleRow>(
        `select external_id, source, url, source_country
         from news_articles
         where source = any($1::text[])`,
        [duplicateSources]
      )).rows;

      const duplicateUpdates: Array<{ externalId: string; country: string }> = [];
      for (const row of duplicateRows) {
        const targetCountry = resolveDuplicateCountry(row, duplicateEntriesBySource);
        if (!targetCountry) {
          unresolvedDuplicateRows += 1;
          continue;
        }
        if ((row.source_country || null) === targetCountry) continue;
        duplicateUpdates.push({ externalId: row.external_id, country: targetCountry });
      }

      if (duplicateUpdates.length > 0) {
        await pool.query(
          `create temp table tmp_atlas_duplicate_country (
             external_id text primary key,
             country text not null
           ) on commit drop`
        );
        await insertExternalIdCountryRows(pool, 'tmp_atlas_duplicate_country', duplicateUpdates);

        if (dryRun) {
          duplicateCountryRowsUpdated = duplicateUpdates.length;
        } else {
          duplicateCountryRowsUpdated = (await pool.query(
            `update news_articles as n
             set source_country = t.country,
                 updated_at = now()
             from tmp_atlas_duplicate_country as t
             where n.external_id = t.external_id
               and n.source_country is distinct from t.country`
          )).rowCount || 0;
        }
      }
    }

    const futureAfter = dryRun
      ? 0
      : Number((await pool.query(
          `select count(*)::text as count from news_articles where publication_datetime > created_at`
        )).rows[0]?.count || 0);

    if (dryRun) {
      await pool.query('rollback');
    } else {
      await pool.query('commit');
    }

    const uniqueCountryRowsUpdated = dryRun
      ? Number(uniqueCountryUpdate.rows[0]?.count || 0)
      : (uniqueCountryUpdate.rowCount || 0);

    console.log(JSON.stringify({
      dryRun,
      atlasPath,
      uniqueSourceMappings: uniqueSourceMappings.length,
      duplicateSources: duplicateSources.length,
      unresolvedDuplicateRows,
      futureBefore,
      futurePublicationRowsUpdated: futureUpdate.rowCount || 0,
      futureAfter,
      uniqueCountryRowsUpdated,
      duplicateCountryRowsUpdated,
    }, null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
