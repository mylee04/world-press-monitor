import { createHash } from 'node:crypto';
import type { Pool } from 'pg';
import type { NewsItem } from '@/lib/types';
import {
  preferPersistedArticleRow,
  type NewsArticlePersistable,
  type MissingPublishedAtPersistable,
  toMissingPublishedAtPersistable,
  toNewsArticlePersistable,
} from '@/lib/news-write-helpers';
import { normalizeSourceCategories } from '@/lib/article-taxonomy';

function sha256Hex(value: string): Promise<string> {
  return Promise.resolve(createHash('sha256').update(value).digest('hex'));
}

type ExistingArticleIdentityRow = {
  external_id: string;
  stable_id: string | null;
};

export type MissingPublishedAtCandidate = {
  outletId: string;
  source: string;
  country: string;
  method: 'rss' | 'sitemap';
  link: string;
  title: string;
  description: string | null;
  language: string | null;
  section: string;
  categories: string[];
};

export type NewsArticleFeedCategoryBackfill = {
  externalId: string;
  sourceCategories: string[];
};

export type IngestionPersistenceDeps = {
  getPool: () => Pool | null;
  ensureSchema: () => Promise<void>;
  executeIngestionQuery: (db: Pool, queryText: string, values: unknown[], label: string) => Promise<void>;
  chunk: <T>(items: T[], size: number) => T[][];
  publicationMaxAgeMs: number;
  storedTitleMaxChars: number;
  storedSnippetMaxChars: number;
};

async function resolveExistingArticleExternalIds(
  db: Pool,
  rows: NewsArticlePersistable[]
): Promise<Map<string, string>> {
  const stableIds = [...new Set(rows.map((row) => row.stableId).filter((value): value is string => Boolean(value)))];
  const externalIds = [...new Set(rows.map((row) => row.externalId).filter(Boolean))];
  if (!stableIds.length && !externalIds.length) return new Map();

  const result = await db.query<ExistingArticleIdentityRow>(
    `
    select external_id, stable_id
    from news_articles
    where (
      cardinality($1::text[]) > 0
      and external_id = any($1::text[])
    ) or (
      cardinality($2::text[]) > 0
      and stable_id = any($2::text[])
    )
    `,
    [externalIds, stableIds]
  );

  const stableIdToExternalId = new Map<string, string>();
  const externalIdSet = new Set<string>();
  for (const row of result.rows) {
    if (row.stable_id) {
      stableIdToExternalId.set(row.stable_id, row.external_id);
    }
    externalIdSet.add(row.external_id);
  }

  const resolved = new Map<string, string>();
  for (const row of rows) {
    const key = `${row.externalId}|${row.stableId || ''}`;
    if (row.stableId && stableIdToExternalId.has(row.stableId)) {
      resolved.set(key, stableIdToExternalId.get(row.stableId)!);
      continue;
    }
    if (externalIdSet.has(row.externalId)) {
      resolved.set(key, row.externalId);
    }
  }

  return resolved;
}

export async function persistNewsArticlesWithDeps(
  deps: IngestionPersistenceDeps,
  items: NewsItem[],
): Promise<{ persisted: number; storage: 'postgres' | 'disabled'; reason?: string }> {
  const db = deps.getPool();
  if (!db) return { persisted: 0, storage: 'disabled', reason: 'missing_database_url' };
  if (!items.length) return { persisted: 0, storage: 'postgres' };

  await deps.ensureSchema();
  const rows = (
    await Promise.all(
      items.map((item) =>
        toNewsArticlePersistable(item, {
          publicationMaxAgeMs: deps.publicationMaxAgeMs,
          storedTitleMaxChars: deps.storedTitleMaxChars,
          storedSnippetMaxChars: deps.storedSnippetMaxChars,
          sha256Hex,
        })
      )
    )
  ).filter((row): row is NewsArticlePersistable => Boolean(row));
  if (!rows.length) return { persisted: 0, storage: 'postgres' };
  const resolvedExisting = await resolveExistingArticleExternalIds(db, rows);
  const resolvedRows = rows.map((row) => ({
    ...row,
    externalId: resolvedExisting.get(`${row.externalId}|${row.stableId || ''}`) || row.externalId,
  }));
  const dedupedRows = [...resolvedRows.reduce((acc, row) => {
    const dedupeKey = row.stableId || row.externalId;
    const current = acc.get(dedupeKey);
    if (!current) {
      acc.set(dedupeKey, row);
      return acc;
    }
    acc.set(dedupeKey, preferPersistedArticleRow(current, row));
    return acc;
  }, new Map<string, NewsArticlePersistable>()).values()];
  const insertRows = [...dedupedRows.reduce((acc, row) => {
    const current = acc.get(row.externalId);
    if (!current) {
      acc.set(row.externalId, row);
      return acc;
    }
    acc.set(row.externalId, preferPersistedArticleRow(current, row));
    return acc;
  }, new Map<string, NewsArticlePersistable>()).values()];

  const groups = deps.chunk(insertRows, 250);
  for (const group of groups) {
    const values: unknown[] = [];
    const parts: string[] = [];
    group.forEach((row, i) => {
      const base = i * 25;
      parts.push(
        `($${base + 1}::text,$${base + 2}::text,least($${base + 3}::timestamptz, now()),$${base + 4}::text,$${base + 5}::text,$${base + 6}::text[],$${base + 7}::text[],$${base + 8}::text,$${base + 9}::text[],$${base + 10}::timestamptz,$${base + 11}::timestamptz,$${base + 12}::text,$${base + 13}::text,$${base + 14}::text,$${base + 15}::timestamptz,$${base + 16}::text,$${base + 17}::text,$${base + 18}::timestamptz,$${base + 19}::timestamptz,$${base + 20}::text,$${base + 21}::text,$${base + 22}::text,$${base + 23}::text,$${base + 24}::text,$${base + 25}::text,now(),now())`
      );
      values.push(
        row.externalId,
        row.stableId,
        row.publicationDatetime,
        row.section,
        row.primarySection,
        row.sectionsNormalized,
        row.feedCategories,
        row.primaryTopic,
        row.topics,
        new Date().toISOString(),
        new Date().toISOString(),
        row.titleOriginal,
        row.titleQuality,
        row.titleQualityReason,
        row.titleQualityCheckedAt,
        row.titleRepairStatus,
        row.titleRepairSource,
        row.titleRepairAttemptedAt,
        row.titleRepairedAt,
        row.snippetOriginal,
        row.country,
        row.sourceCountry,
        row.url,
        row.source,
        row.language
      );
    });

    await deps.executeIngestionQuery(
      db,
      `
      insert into news_articles (
        external_id, stable_id, publication_datetime, section, primary_section, sections_normalized, feed_categories, primary_topic, topics, topics_derived_at, taxonomy_derived_at, title_original, title_quality, title_quality_reason, title_quality_checked_at, title_repair_status, title_repair_source, title_repair_attempted_at, title_repaired_at, snippet_original,
        country, source_country, url, source, language, created_at, updated_at
      ) values ${parts.join(',')}
      on conflict (external_id) do update set
        stable_id = coalesce(excluded.stable_id, news_articles.stable_id),
        publication_datetime = least(excluded.publication_datetime, news_articles.created_at),
        section = excluded.section,
        primary_section = coalesce(excluded.primary_section, news_articles.primary_section),
        sections_normalized = (
          select array(
            select distinct section_value
            from unnest(
              coalesce(news_articles.sections_normalized, '{}'::text[]) ||
              coalesce(excluded.sections_normalized, '{}'::text[])
            ) as section_value
            where section_value is not null and btrim(section_value) <> ''
          )
        ),
        feed_categories = (
          select array(
            select distinct unnest(
              coalesce(news_articles.feed_categories, '{}'::text[]) ||
              coalesce(excluded.feed_categories, '{}'::text[])
            )
          )
        ),
        primary_topic = coalesce(excluded.primary_topic, news_articles.primary_topic),
        topics = (
          select array(
            select distinct topic
            from unnest(
              coalesce(news_articles.topics, '{}'::text[]) ||
              coalesce(excluded.topics, '{}'::text[])
            ) as topic
            where topic is not null and btrim(topic) <> ''
          )
        ),
        topics_derived_at = now(),
        taxonomy_derived_at = now(),
        title_original = case
          when coalesce(nullif(trim(news_articles.title_quality), ''), 'ok') in ('ok', 'recovered')
            and coalesce(nullif(trim(excluded.title_quality), ''), 'ok') = 'suspect'
          then news_articles.title_original
          when (excluded.title_original = excluded.url or excluded.title_original like 'http%')
            and news_articles.title_original is not null
            and news_articles.title_original <> ''
            and news_articles.title_original <> news_articles.url
            and news_articles.title_original not like 'http%'
          then news_articles.title_original
          else excluded.title_original
        end,
        title_quality = case
          when coalesce(nullif(trim(news_articles.title_quality), ''), 'ok') in ('ok', 'recovered')
            and coalesce(nullif(trim(excluded.title_quality), ''), 'ok') = 'suspect'
          then news_articles.title_quality
          else excluded.title_quality
        end,
        title_quality_reason = case
          when coalesce(nullif(trim(news_articles.title_quality), ''), 'ok') in ('ok', 'recovered')
            and coalesce(nullif(trim(excluded.title_quality), ''), 'ok') = 'suspect'
          then news_articles.title_quality_reason
          else excluded.title_quality_reason
        end,
        title_quality_checked_at = case
          when coalesce(nullif(trim(news_articles.title_quality), ''), 'ok') in ('ok', 'recovered')
            and coalesce(nullif(trim(excluded.title_quality), ''), 'ok') = 'suspect'
          then coalesce(news_articles.title_quality_checked_at, excluded.title_quality_checked_at)
          else excluded.title_quality_checked_at
        end,
        title_repair_status = case
          when coalesce(nullif(trim(news_articles.title_quality), ''), 'ok') in ('ok', 'recovered')
            and coalesce(nullif(trim(excluded.title_quality), ''), 'ok') = 'suspect'
          then news_articles.title_repair_status
          else excluded.title_repair_status
        end,
        title_repair_source = case
          when coalesce(nullif(trim(news_articles.title_quality), ''), 'ok') in ('ok', 'recovered')
            and coalesce(nullif(trim(excluded.title_quality), ''), 'ok') = 'suspect'
          then news_articles.title_repair_source
          else excluded.title_repair_source
        end,
        title_repair_attempted_at = case
          when coalesce(nullif(trim(news_articles.title_quality), ''), 'ok') in ('ok', 'recovered')
            and coalesce(nullif(trim(excluded.title_quality), ''), 'ok') = 'suspect'
          then news_articles.title_repair_attempted_at
          else excluded.title_repair_attempted_at
        end,
        title_repaired_at = case
          when coalesce(nullif(trim(news_articles.title_quality), ''), 'ok') in ('ok', 'recovered')
            and coalesce(nullif(trim(excluded.title_quality), ''), 'ok') = 'suspect'
          then news_articles.title_repaired_at
          else excluded.title_repaired_at
        end,
        snippet_original = coalesce(nullif(excluded.snippet_original, ''), news_articles.snippet_original),
        country = excluded.country,
        source_country = coalesce(excluded.source_country, news_articles.source_country),
        url = excluded.url,
        source = excluded.source,
        language = excluded.language,
        updated_at = now()
      `,
      values,
      'persistNewsArticles.insert'
    );
  }

  return { persisted: insertRows.length, storage: 'postgres' };
}

export async function backfillNewsArticleFeedCategoriesWithDeps(
  deps: IngestionPersistenceDeps,
  items: NewsArticleFeedCategoryBackfill[],
): Promise<{ updated: number; storage: 'postgres' | 'disabled'; reason?: string }> {
  const db = deps.getPool();
  if (!db) return { updated: 0, storage: 'disabled', reason: 'missing_database_url' };
  if (!items.length) return { updated: 0, storage: 'postgres' };

  await deps.ensureSchema();
  const deduped = [...items.reduce((acc, item) => {
    const externalId = (item.externalId || '').trim();
    if (!externalId) return acc;
    const current = acc.get(externalId) || [];
    acc.set(externalId, normalizeSourceCategories([...current, ...(item.sourceCategories || [])]));
    return acc;
  }, new Map<string, string[]>()).entries()]
    .map(([externalId, sourceCategories]) => ({ externalId, sourceCategories }))
    .filter((item) => item.sourceCategories.length > 0);

  if (!deduped.length) return { updated: 0, storage: 'postgres' };

  let updated = 0;
  const groups = deps.chunk(deduped, 250);
  for (const group of groups) {
    const values: unknown[] = [];
    const parts: string[] = [];
    group.forEach((item, index) => {
      const base = index * 2;
      parts.push(`($${base + 1}::text, $${base + 2}::text[])`);
      values.push(item.externalId, item.sourceCategories);
    });
    const result = await db.query(
      `
      with incoming as (
        select *
        from (values ${parts.join(',')}) as t(external_id, feed_categories)
      )
      update news_articles as n
      set feed_categories = (
            select array(
              select distinct category
              from unnest(
                coalesce(n.feed_categories, '{}'::text[]) ||
                coalesce(incoming.feed_categories, '{}'::text[])
              ) as category
              where category is not null and btrim(category) <> ''
            )
          ),
          updated_at = now()
      from incoming
      where n.external_id = incoming.external_id
        and cardinality(coalesce(incoming.feed_categories, '{}'::text[])) > 0
      `,
      values
    );
    updated += result.rowCount || 0;
  }

  return { updated, storage: 'postgres' };
}

export async function persistMissingPublishedAtCandidatesWithDeps(
  deps: IngestionPersistenceDeps,
  items: MissingPublishedAtCandidate[],
): Promise<{ persisted: number; storage: 'postgres' | 'disabled'; reason?: string }> {
  const db = deps.getPool();
  if (!db) return { persisted: 0, storage: 'disabled', reason: 'missing_database_url' };
  if (!items.length) return { persisted: 0, storage: 'postgres' };

  await deps.ensureSchema();
  const rows = (
    await Promise.all(
      items.map((item) =>
        toMissingPublishedAtPersistable(item, {
          storedTitleMaxChars: deps.storedTitleMaxChars,
          storedSnippetMaxChars: deps.storedSnippetMaxChars,
          sha256Hex,
        })
      )
    )
  ).filter(
    (row): row is MissingPublishedAtPersistable => Boolean(row)
  );
  if (!rows.length) return { persisted: 0, storage: 'postgres' };

  const dedupedRows = [...rows.reduce((acc, row) => {
    const current = acc.get(row.candidateId);
    if (!current) {
      acc.set(row.candidateId, row);
      return acc;
    }
    if ((row.snippetOriginal || '').length > (current.snippetOriginal || '').length) {
      acc.set(row.candidateId, row);
      return acc;
    }
    acc.set(row.candidateId, {
      ...current,
      feedCategories: [...new Set([...current.feedCategories, ...row.feedCategories])],
    });
    return acc;
  }, new Map<string, MissingPublishedAtPersistable>()).values()];

  const groups = deps.chunk(dedupedRows, 250);
  for (const group of groups) {
    const values: unknown[] = [];
    const parts: string[] = [];
    group.forEach((row, i) => {
      const base = i * 11;
      parts.push(
        `($${base + 1}::text,$${base + 2}::text,$${base + 3}::text,$${base + 4}::text,$${base + 5}::text,$${base + 6}::text,$${base + 7}::text,$${base + 8}::text,$${base + 9}::text,$${base + 10}::text,$${base + 11}::text[],now(),now(),now(),now())`
      );
      values.push(
        row.candidateId,
        row.outletId,
        row.source,
        row.country,
        row.method,
        row.url,
        row.titleOriginal,
        row.snippetOriginal,
        row.language,
        row.section,
        row.feedCategories
      );
    });

    await deps.executeIngestionQuery(
      db,
      `
      insert into ingest_missing_published_at (
        candidate_id, outlet_id, source, country, method, url, title_original, snippet_original,
        language, section, feed_categories, first_seen_at, last_seen_at, created_at, updated_at
      ) values ${parts.join(',')}
      on conflict (candidate_id) do update set
        outlet_id = excluded.outlet_id,
        source = excluded.source,
        country = excluded.country,
        method = excluded.method,
        url = excluded.url,
        title_original = case
          when (excluded.title_original = excluded.url or excluded.title_original like 'http%')
            and ingest_missing_published_at.title_original is not null
            and ingest_missing_published_at.title_original <> ''
            and ingest_missing_published_at.title_original <> ingest_missing_published_at.url
            and ingest_missing_published_at.title_original not like 'http%'
          then ingest_missing_published_at.title_original
          else excluded.title_original
        end,
        snippet_original = coalesce(nullif(excluded.snippet_original, ''), ingest_missing_published_at.snippet_original),
        language = excluded.language,
        section = excluded.section,
        feed_categories = (
          select array(
            select distinct unnest(
              coalesce(ingest_missing_published_at.feed_categories, '{}'::text[]) ||
              coalesce(excluded.feed_categories, '{}'::text[])
            )
          )
        ),
        last_seen_at = now(),
        seen_count = ingest_missing_published_at.seen_count + 1,
        updated_at = now()
      `,
      values,
      'persistMissingPublishedAtCandidates.insert'
    );
  }

  return { persisted: dedupedRows.length, storage: 'postgres' };
}
