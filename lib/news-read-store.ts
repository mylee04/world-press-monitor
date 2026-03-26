import type { Pool } from 'pg';
import type { NewsSection } from '@/lib/types';
import { decodeHtmlEntities, normalizeArticleTitle, normalizeHtmlText } from '@/lib/html-entities';
import { buildArticleTaxonomy, normalizeSourceCategories } from '@/lib/article-taxonomy';
import { truncatePersistedText } from '@/lib/news-write-helpers';

type NewsApiItem = {
  id: string;
  source: string;
  title: string;
  snippet: string | null;
  url: string;
  country: string | null;
  language: string | null;
  primarySection: string | null;
  sections: string[];
  primaryTopic: string | null;
  topics: string[];
  sourceCategories: string[];
  publicationDatetime: string;
  createdAt: string;
  updatedAt: string;
};

type NewsApiReadResult = {
  storage: 'postgres' | 'disabled';
  reason?: string;
  generatedAt: string | null;
  totalCount: number;
  items: NewsApiItem[];
};

type NewsApiFiltersResult = {
  storage: 'postgres' | 'disabled';
  reason?: string;
  filters: {
    countries: string[];
    languages: string[];
    sources: string[];
    sections: string[];
  };
};

type NewsApiFilterRow = {
  value: string;
};

type NewsApiReadRow = {
  id: string;
  source: string;
  title: string;
  snippet_original: string | null;
  url: string;
  country: string | null;
  language: string | null;
  section: string | null;
  primary_section: string | null;
  sections_normalized: string[] | null;
  feed_categories: string[] | null;
  primary_topic: string | null;
  topics: string[] | null;
  publication_datetime: string;
  created_at: string;
  updated_at: string;
  generated_at: string | null;
  total_count?: string | null;
};

type ReadStoreDeps = {
  getPool: () => Pool | null;
  ensureSchema: () => Promise<void>;
  poolDisabledReason: string;
  apiSnippetMaxChars: number;
  newsApiMaxFutureMinutes: number;
  validNewsSectionList: readonly string[];
  customerVisibleTitleQualitySql: string;
  buildCustomerVisibleTitleQualitySql: (columnExpression: string) => string;
  normalizeStoredSectionValue: (value: string | null | undefined) => NewsSection;
};

function truncateText(value: string, maxChars: number): string {
  return truncatePersistedText(value, maxChars);
}

function parseNewsApiFilterList(values: string[] | undefined): string[] {
  return [
    ...new Set(
      (values || [])
        .flatMap((value) => value.split(','))
        .map((item) => item.trim())
        .filter(Boolean)
    )
  ];
}

function mapRowToNewsApiItem(row: NewsApiReadRow, deps: Pick<ReadStoreDeps, 'apiSnippetMaxChars' | 'normalizeStoredSectionValue'>): NewsApiItem {
  const url = decodeHtmlEntities(row.url);
  const title = normalizeArticleTitle(row.title || '', url);
  const snippetText = row.snippet_original ? normalizeHtmlText(row.snippet_original) : '';
  const snippet = snippetText ? truncateText(snippetText, deps.apiSnippetMaxChars) : null;
  const taxonomy = buildArticleTaxonomy({
    storedSection: row.section,
    sourceCategories: row.feed_categories,
    source: row.source,
    url,
    title,
    snippet,
  });
  const storedTopics = normalizeSourceCategories(row.topics);
  const storedSections = normalizeSourceCategories(row.sections_normalized) as NewsSection[];
  const resolvedPrimarySection = deps.normalizeStoredSectionValue(row.primary_section) !== 'others'
    ? deps.normalizeStoredSectionValue(row.primary_section)
    : taxonomy.primarySection;
  const resolvedSections = storedSections.length > 0
    ? storedSections.map((section) => deps.normalizeStoredSectionValue(section))
    : taxonomy.sections;
  const resolvedTopics = storedTopics.length > 0 ? storedTopics : taxonomy.topics;
  const storedPrimaryTopic = (row.primary_topic || '').trim() || null;

  return {
    id: row.id,
    source: row.source,
    title,
    snippet,
    url,
    country: row.country,
    language: row.language,
    primarySection: resolvedPrimarySection,
    sections: resolvedSections,
    primaryTopic: storedPrimaryTopic || resolvedTopics[0] || taxonomy.primaryTopic,
    topics: resolvedTopics,
    sourceCategories: taxonomy.sourceCategories,
    publicationDatetime: row.publication_datetime,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function readNewsArticlesForApiWithDeps(
  deps: ReadStoreDeps,
  options: {
    sourceNames?: string[];
    countries?: string[];
    sections?: string[];
    languages?: string[];
    q?: string | null;
    limit?: number;
    offset?: number;
    hours?: number;
    from?: string | null;
    to?: string | null;
    publicationFrom?: string | null;
    publicationTo?: string | null;
    minCreatedAt?: string | null;
    maxCreatedAt?: string | null;
    minUpdatedAt?: string | null;
    maxUpdatedAt?: string | null;
  }
): Promise<NewsApiReadResult> {
  const db = deps.getPool();
  if (!db) {
    return { storage: 'disabled', reason: deps.poolDisabledReason, generatedAt: null, totalCount: 0, items: [] };
  }
  await deps.ensureSchema();

  const limit = Math.max(1, Math.min(200, Math.floor(options.limit || 100)));
  const offset = Math.max(0, Math.floor(options.offset || 0));
  const sourceNames = parseNewsApiFilterList(options.sourceNames);
  const countries = parseNewsApiFilterList(options.countries);
  const sections = parseNewsApiFilterList(options.sections);
  const languages = parseNewsApiFilterList(options.languages);
  const query = (options.q || '').trim().slice(0, 120);
  const params: unknown[] = [];
  const whereClauses: string[] = [];
  const normalizedSections = [...new Set(sections.map((section) => deps.normalizeStoredSectionValue(section)))];
  const normalizedPublicationSql = 'least(e.publication_datetime, e.created_at)';

  params.push(deps.newsApiMaxFutureMinutes);
  whereClauses.push(`and ${normalizedPublicationSql} <= now() + ($${params.length}::int * interval '1 minute')`);
  whereClauses.push(`and ${deps.buildCustomerVisibleTitleQualitySql('e.title_quality')}`);

  if (sourceNames.length > 0) {
    params.push(sourceNames);
    whereClauses.push(`and e.source = any($${params.length}::text[])`);
  }

  if (countries.length > 0) {
    params.push(countries);
    whereClauses.push(`and e.country = any($${params.length}::text[])`);
  }

  if (languages.length > 0) {
    params.push(languages);
    whereClauses.push(`and e.language = any($${params.length}::text[])`);
  }

  if (normalizedSections.length > 0) {
    params.push(normalizedSections);
    whereClauses.push(`
      and (
        coalesce(e.sections_normalized, '{}'::text[]) && $${params.length}::text[]
        or (
          coalesce(cardinality(e.sections_normalized), 0) = 0
          and coalesce(nullif(trim(e.section), ''), 'others') = any($${params.length}::text[])
        )
      )
    `);
  }

  if (query) {
    params.push(`%${query}%`);
    whereClauses.push(
      `and (
        e.title_original ilike $${params.length}
        or e.source ilike $${params.length}
        or coalesce(e.country, '') ilike $${params.length}
        or coalesce(array_to_string(e.feed_categories, ' '), '') ilike $${params.length}
      )`
    );
  }

  const publicationFrom = options.publicationFrom || options.from || null;
  const publicationTo = options.publicationTo || options.to || null;
  const minCreatedAt = options.minCreatedAt || null;
  const maxCreatedAt = options.maxCreatedAt || null;
  const minUpdatedAt = options.minUpdatedAt || null;
  const maxUpdatedAt = options.maxUpdatedAt || null;

  if (publicationFrom) {
    params.push(publicationFrom);
    whereClauses.push(`and ${normalizedPublicationSql} >= $${params.length}`);
  }
  if (publicationTo) {
    params.push(publicationTo);
    whereClauses.push(`and ${normalizedPublicationSql} <= $${params.length}`);
  }
  if (minCreatedAt) {
    params.push(minCreatedAt);
    whereClauses.push(`and e.created_at >= $${params.length}`);
  }
  if (maxCreatedAt) {
    params.push(maxCreatedAt);
    whereClauses.push(`and e.created_at <= $${params.length}`);
  }
  if (minUpdatedAt) {
    params.push(minUpdatedAt);
    whereClauses.push(`and e.updated_at >= $${params.length}`);
  }
  if (maxUpdatedAt) {
    params.push(maxUpdatedAt);
    whereClauses.push(`and e.updated_at <= $${params.length}`);
  }

  if (!publicationFrom && !publicationTo && !minCreatedAt && !maxCreatedAt && !minUpdatedAt && !maxUpdatedAt) {
    const hours = Math.max(1, Math.min(720, Math.floor(options.hours || 48)));
    params.push(hours);
    whereClauses.push(`and ${normalizedPublicationSql} > now() - ($${params.length}::int * interval '1 hour')`);
  }

  const whereSql = `
    where 1 = 1
    ${whereClauses.join('\n    ')}`;

  params.push(limit);
  const limitIndex = params.length;
  params.push(offset);
  const offsetIndex = params.length;

  const result = await db.query<NewsApiReadRow>(
    `
    with filtered as (
      select
        e.external_id as id,
        e.source,
        e.title_original as title,
        e.snippet_original,
        e.url,
        e.country,
        e.language,
        e.section,
        e.primary_section,
        e.sections_normalized,
        e.feed_categories,
        e.primary_topic,
        e.topics,
        ${normalizedPublicationSql} as publication_datetime,
        e.created_at,
        e.updated_at
      from news_articles e
      ${whereSql}
    )
    select
      filtered.*,
      max(filtered.created_at) over() as generated_at,
      count(*) over()::text as total_count
    from filtered
    order by filtered.publication_datetime desc, filtered.created_at desc
    limit $${limitIndex} offset $${offsetIndex}
    `,
    params
  );

  const items = result.rows.map((row) => mapRowToNewsApiItem(row, deps));
  const totalCount = result.rows[0]?.total_count ? Number(result.rows[0].total_count) : 0;

  return {
    storage: 'postgres',
    totalCount,
    generatedAt: result.rows[0]?.generated_at ? new Date(result.rows[0].generated_at).toISOString() : null,
    items,
  };
}

export async function readNewsApiFiltersWithDeps(deps: ReadStoreDeps): Promise<NewsApiFiltersResult> {
  const db = deps.getPool();
  if (!db) {
    return {
      storage: 'disabled',
      reason: deps.poolDisabledReason,
      filters: { countries: [], languages: [], sources: [], sections: [] },
    };
  }

  await deps.ensureSchema();

  const [countriesResult, languagesResult, sourcesResult] = await Promise.all([
    db.query<NewsApiFilterRow>(
      `select value
       from (
         select distinct trim(country) as value, lower(trim(country)) as sort_key
         from news_articles
         where country is not null and trim(country) <> ''
           and ${deps.customerVisibleTitleQualitySql}
       ) t
       order by t.sort_key`
    ),
    db.query<NewsApiFilterRow>(
      `select value
       from (
         select distinct trim(language) as value, lower(trim(language)) as sort_key
         from news_articles
         where language is not null and trim(language) <> ''
           and ${deps.customerVisibleTitleQualitySql}
       ) t
       order by t.sort_key`
    ),
    db.query<NewsApiFilterRow>(
      `select value
       from (
         select distinct trim(source) as value, lower(trim(source)) as sort_key
         from news_articles
         where source is not null and trim(source) <> ''
           and ${deps.customerVisibleTitleQualitySql}
       ) t
       order by t.sort_key`
    ),
  ]);

  return {
    storage: 'postgres',
    filters: {
      countries: countriesResult.rows.map((row) => row.value),
      languages: languagesResult.rows.map((row) => row.value),
      sources: sourcesResult.rows.map((row) => row.value),
      sections: [...deps.validNewsSectionList],
    },
  };
}
