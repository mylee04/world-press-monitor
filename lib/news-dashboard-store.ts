import type { Pool } from 'pg';
import type { NewsSection } from '@/lib/types';
import { decodeHtmlEntities, looksLikeLowSignalArticleTitle, normalizeArticleTitle, normalizeHtmlText, normalizeReadableArticleTitle } from '@/lib/html-entities';
import { buildDisplaySourceName } from '@/lib/source-display';
import { buildArticleTaxonomy, isTopicAllowedForSection, NEWS_SECTION_ORDER, normalizeSourceCategories } from '@/lib/article-taxonomy';
import { truncatePersistedText } from '@/lib/news-write-helpers';

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
};

type NewsApiSummaryTotalsRow = {
  rows_window: string;
  inserted_24h: string;
  published_24h: string;
  generated_at: string | null;
};

type NewsApiCheckedSourcesRow = {
  checked_sources_24h: string;
};

type NewsApiSectionTotalRow = {
  section: string | null;
  count: string;
};

type NewsApiDateRow = {
  preview_date: string | null;
  latest_date: string | null;
};

type NewsApiDateCountRow = {
  date: string;
  count: string;
};

type NewsApiCountryCountRow = {
  country: string | null;
  count: string;
};

type NewsApiDashboardTopicCountRow = {
  section: string;
  article_count: string;
  topic: string;
  count: string;
};

type NewsApiDashboardSourceCategoryCoverageRow = {
  categorized_articles: string;
  uncategorized_articles: string;
  distinct_categories: string;
};

type NewsApiDashboardSourceCategoryCountRow = {
  category: string;
  count: string;
};

type NewsApiDashboardHeadlineItem = {
  id: string;
  source: string;
  sourceDisplay: string;
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

type NewsApiDashboardTopicGroupItem = {
  section: string;
  articleCount: number;
  topics: Array<{ topic: string; count: number }>;
};

type NewsApiDashboardSourceCategoryCountItem = {
  category: string;
  count: number;
};

type NewsApiDashboardSummaryItem = {
  storage: 'postgres' | 'disabled';
  reason?: string;
  generatedAt: string | null;
  windowDays: number;
  latestHours: number;
  latestDate: string | null;
  previewDate: string | null;
  totals: {
    rowsWindow: number;
    inserted24h: number;
    published24h: number;
    checkedSources24h: number;
  };
  sectionTotals: Record<string, number>;
  recentDates: Array<{ date: string; count: number }>;
  topicSampleSize: number;
  topicGroups: NewsApiDashboardTopicGroupItem[];
  sourceCategoryCoverage: {
    categorizedArticles: number;
    uncategorizedArticles: number;
    distinctCategories: number;
    topCategories: NewsApiDashboardSourceCategoryCountItem[];
  };
  preview: {
    articleCount: number;
    topCountries: Array<{ country: string | null; count: number }>;
    headlines: NewsApiDashboardHeadlineItem[];
  };
};

type DashboardSummaryCacheEntry = {
  expiresAt: number;
  value: NewsApiDashboardSummaryItem;
};

type DashboardDeps = {
  getPool: () => Pool | null;
  ensureSchema: () => Promise<void>;
  poolDisabledReason: string;
  newsApiMaxFutureMinutes: number;
  dashboardTopicDisplayLimit: number;
  dashboardSourceCategoryDisplayLimit: number;
  dashboardSummaryCacheMs: number;
  dashboardSummaryCache: Map<string, DashboardSummaryCacheEntry>;
  apiSnippetMaxChars: number;
  customerVisibleTitleQualitySql: string;
  normalizeStoredSectionValue: (value: string | null | undefined) => NewsSection;
};

function truncateText(value: string, maxChars: number): string {
  return truncatePersistedText(value, maxChars);
}

function mapRowToNewsApiItem(
  row: NewsApiReadRow,
  deps: Pick<DashboardDeps, 'apiSnippetMaxChars' | 'normalizeStoredSectionValue'>
): NewsApiDashboardHeadlineItem {
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
    sourceDisplay: buildDisplaySourceName(row.source),
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

function mapRowToDisplayNewsApiItem(
  row: NewsApiReadRow,
  deps: Pick<DashboardDeps, 'apiSnippetMaxChars' | 'normalizeStoredSectionValue'>
): NewsApiDashboardHeadlineItem | null {
  const title = normalizeReadableArticleTitle(row.title || '', row.url, row.source || '');
  if (!title || looksLikeLowSignalArticleTitle(title, row.source || '', row.url || '')) {
    return null;
  }

  return {
    ...mapRowToNewsApiItem(row, deps),
    title,
  };
}

async function readDashboardTopicGroupsForWindow(
  db: Pool,
  deps: DashboardDeps,
  windowDays: number,
  maxFutureMinutes: number,
  asOfIso: string
): Promise<NewsApiDashboardTopicGroupItem[]> {
  const result = await db.query<NewsApiDashboardTopicCountRow>(
    `
    with windowed as (
      select
        coalesce(nullif(trim(primary_section), ''), nullif(trim(section), ''), 'others') as section,
        nullif(trim(primary_topic), '') as primary_topic
      from news_articles
      where publication_datetime >= $4::timestamptz - ($1::int * interval '1 day')
        and publication_datetime <= $4::timestamptz + ($2::int * interval '1 minute')
        and ${deps.customerVisibleTitleQualitySql}
    ),
    section_counts as (
      select
        section,
        count(*)::text as article_count
      from windowed
      where section <> 'others'
      group by 1
    ),
    topic_counts as (
      select
        section,
        primary_topic as topic,
        count(*)::text as count
      from windowed
      where section <> 'others'
        and primary_topic is not null
      group by 1, 2
    ),
    ranked as (
      select
        topic_counts.section,
        section_counts.article_count,
        topic_counts.topic,
        topic_counts.count,
        row_number() over (
          partition by topic_counts.section
          order by topic_counts.count::bigint desc, topic_counts.topic asc
        ) as rn
      from topic_counts
      join section_counts using (section)
    )
    select
      section,
      article_count,
      topic,
      count
    from ranked
    where rn <= $3
    `,
    [windowDays, maxFutureMinutes, deps.dashboardTopicDisplayLimit, asOfIso]
  );

  const groupsBySection = new Map<string, NewsApiDashboardTopicGroupItem>();
  for (const row of result.rows) {
    const section = deps.normalizeStoredSectionValue(row.section);
    if (section === 'others') continue;
    const topic = (row.topic || '').trim().toLowerCase();
    if (!isTopicAllowedForSection(section, topic)) continue;
    const current = groupsBySection.get(section) || {
      section,
      articleCount: Number(row.article_count) || 0,
      topics: [],
    };
    current.topics.push({
      topic,
      count: Number(row.count) || 0,
    });
    groupsBySection.set(section, current);
  }

  return NEWS_SECTION_ORDER
    .filter((section) => section !== 'others')
    .map((section) => groupsBySection.get(section))
    .filter((group): group is NewsApiDashboardTopicGroupItem => Boolean(group));
}

async function readDashboardSourceCategoryCoverageForWindow(
  db: Pool,
  deps: DashboardDeps,
  windowDays: number,
  maxFutureMinutes: number,
  asOfIso: string
) {
  const [coverageResult, topCategoriesResult] = await Promise.all([
    db.query<NewsApiDashboardSourceCategoryCoverageRow>(
      `
      with windowed as (
        select coalesce(feed_categories, '{}'::text[]) as feed_categories
        from news_articles
        where publication_datetime >= $3::timestamptz - ($1::int * interval '1 day')
          and publication_datetime <= $3::timestamptz + ($2::int * interval '1 minute')
          and ${deps.customerVisibleTitleQualitySql}
      ),
      expanded as (
        select unnest(feed_categories) as category
        from windowed
        where cardinality(feed_categories) > 0
      )
      select
        (select count(*)::text from windowed where cardinality(feed_categories) > 0) as categorized_articles,
        (select count(*)::text from windowed where cardinality(feed_categories) = 0) as uncategorized_articles,
        (select count(distinct category)::text from expanded) as distinct_categories
      `,
      [windowDays, maxFutureMinutes, asOfIso]
    ),
    db.query<NewsApiDashboardSourceCategoryCountRow>(
      `
      with windowed as (
        select unnest(feed_categories) as category
        from news_articles
        where publication_datetime >= $4::timestamptz - ($1::int * interval '1 day')
          and publication_datetime <= $4::timestamptz + ($2::int * interval '1 minute')
          and cardinality(feed_categories) > 0
          and ${deps.customerVisibleTitleQualitySql}
      )
      select
        category,
        count(*)::text as count
      from windowed
      group by 1
      order by count(*) desc, category asc
      limit $3
      `,
      [windowDays, maxFutureMinutes, deps.dashboardSourceCategoryDisplayLimit, asOfIso]
    ),
  ]);

  return {
    categorizedArticles: Number(coverageResult.rows[0]?.categorized_articles || 0),
    uncategorizedArticles: Number(coverageResult.rows[0]?.uncategorized_articles || 0),
    distinctCategories: Number(coverageResult.rows[0]?.distinct_categories || 0),
    topCategories: topCategoriesResult.rows.map((row) => ({
      category: row.category,
      count: Number(row.count) || 0,
    })),
  };
}

function buildDashboardSummaryCacheKey(options?: {
  windowDays?: number;
  latestHours?: number;
  previewLimit?: number;
  topCountriesLimit?: number;
  maxFutureHours?: number;
}): string {
  return JSON.stringify({
    windowDays: options?.windowDays || 31,
    latestHours: options?.latestHours || 24,
    previewLimit: options?.previewLimit || 8,
    topCountriesLimit: options?.topCountriesLimit || 6,
    maxFutureHours: options?.maxFutureHours ?? null,
  });
}

export async function readNewsDashboardSummaryWithDeps(
  deps: DashboardDeps,
  options?: {
    windowDays?: number;
    latestHours?: number;
    previewLimit?: number;
    topCountriesLimit?: number;
    maxFutureHours?: number;
  }
): Promise<NewsApiDashboardSummaryItem> {
  const cacheKey = buildDashboardSummaryCacheKey(options);
  const cached = deps.dashboardSummaryCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const db = deps.getPool();
  if (!db) {
    return {
      storage: 'disabled',
      reason: deps.poolDisabledReason,
      generatedAt: null,
      windowDays: options?.windowDays || 31,
      latestHours: options?.latestHours || 24,
      latestDate: null,
      previewDate: null,
      totals: { rowsWindow: 0, inserted24h: 0, published24h: 0, checkedSources24h: 0 },
      sectionTotals: {},
      recentDates: [],
      topicSampleSize: 0,
      topicGroups: [],
      sourceCategoryCoverage: {
        categorizedArticles: 0,
        uncategorizedArticles: 0,
        distinctCategories: 0,
        topCategories: [],
      },
      preview: {
        articleCount: 0,
        topCountries: [],
        headlines: [],
      },
    };
  }

  await deps.ensureSchema();

  const windowDays = Math.max(1, Math.min(90, Math.floor(options?.windowDays || 31)));
  const latestHours = Math.max(1, Math.min(720, Math.floor(options?.latestHours || 24)));
  const previewLimit = Math.max(1, Math.min(20, Math.floor(options?.previewLimit || 8)));
  const topCountriesLimit = Math.max(1, Math.min(20, Math.floor(options?.topCountriesLimit || 6)));
  const maxFutureMinutes = options?.maxFutureHours == null
    ? deps.newsApiMaxFutureMinutes
    : Math.max(0, Math.min(168 * 60, Math.floor(options.maxFutureHours * 60)));
  const asOfIso = new Date().toISOString();

  const [totalsResult, checkedSourcesResult, sectionTotalsResult, dateResult, recentDatesResult, topicGroupRows, sourceCategoryCoverage] = await Promise.all([
    db.query<NewsApiSummaryTotalsRow>(
      `
      select
        count(*)::text as rows_window,
        count(*) filter (where created_at >= $4::timestamptz - ($2::int * interval '1 hour'))::text as inserted_24h,
        count(*) filter (where publication_datetime >= $4::timestamptz - ($2::int * interval '1 hour'))::text as published_24h,
        max(created_at)::text as generated_at
      from news_articles
      where publication_datetime >= $4::timestamptz - ($1::int * interval '1 day')
        and publication_datetime <= $4::timestamptz + ($3::int * interval '1 minute')
        and ${deps.customerVisibleTitleQualitySql}
      `,
      [windowDays, latestHours, maxFutureMinutes, asOfIso]
    ),
    db.query<NewsApiCheckedSourcesRow>(
      `
      select count(distinct coalesce(country, 'Global') || '|' || source)::text as checked_sources_24h
      from rss_health_status
      where ran_at >= $2::timestamptz - ($1::int * interval '1 hour')
        and runner = 'worker'
        and attempted
      `,
      [latestHours, asOfIso]
    ),
    db.query<NewsApiSectionTotalRow>(
      `
      select
        coalesce(nullif(trim(primary_section), ''), nullif(trim(section), ''), 'others') as section,
        count(*)::text as count
      from news_articles
      where publication_datetime >= $3::timestamptz - ($1::int * interval '1 day')
        and publication_datetime <= $3::timestamptz + ($2::int * interval '1 minute')
        and ${deps.customerVisibleTitleQualitySql}
      group by 1
      `,
      [windowDays, maxFutureMinutes, asOfIso]
    ),
    db.query<NewsApiDateRow>(
      `
      with windowed as (
        select
          case
            when publication_datetime > $3::timestamptz + ($2::int * interval '1 minute') then created_at
            else publication_datetime
          end as normalized_publication_datetime
        from news_articles
        where publication_datetime >= $3::timestamptz - ($1::int * interval '1 day')
          and publication_datetime <= $3::timestamptz + ($2::int * interval '1 minute')
          and ${deps.customerVisibleTitleQualitySql}
      ),
      dates as (
        select distinct (normalized_publication_datetime at time zone 'UTC')::date as date
        from windowed
      )
      select
        max(date)::text as latest_date,
        coalesce(max(date) filter (where date < ($3::timestamptz at time zone 'UTC')::date), max(date))::text as preview_date
      from dates
      `,
      [windowDays, maxFutureMinutes, asOfIso]
    ),
    db.query<NewsApiDateCountRow>(
      `
      with windowed as (
        select
          case
            when publication_datetime > $3::timestamptz + ($2::int * interval '1 minute') then created_at
            else publication_datetime
          end as normalized_publication_datetime
        from news_articles
        where publication_datetime >= $3::timestamptz - ($1::int * interval '1 day')
          and publication_datetime <= $3::timestamptz + ($2::int * interval '1 minute')
          and ${deps.customerVisibleTitleQualitySql}
      )
      select
        (normalized_publication_datetime at time zone 'UTC')::date::text as date,
        count(*)::text as count
      from windowed
      group by 1
      order by 1 desc
      limit 7
      `,
      [windowDays, maxFutureMinutes, asOfIso]
    ),
    readDashboardTopicGroupsForWindow(db, deps, windowDays, maxFutureMinutes, asOfIso),
    readDashboardSourceCategoryCoverageForWindow(db, deps, windowDays, maxFutureMinutes, asOfIso),
  ]);

  const dateRow = dateResult.rows[0];
  const previewDate = dateRow?.preview_date || null;
  const latestDate = dateRow?.latest_date || null;

  let previewArticleCount = 0;
  let previewTopCountries: Array<{ country: string | null; count: number }> = [];
  let previewHeadlines: NewsApiDashboardHeadlineItem[] = [];
  const topicSampleSize = Number(totalsResult.rows[0]?.rows_window || 0);

  if (latestHours > 0) {
    const [countryCountsResult, headlinesResult, countResult] = await Promise.all([
      db.query<NewsApiCountryCountRow>(
        `
        select
          coalesce(country, 'Global') as country,
          count(*)::text as count
        from news_articles
        where publication_datetime >= $4::timestamptz - ($1::int * interval '1 hour')
          and publication_datetime <= $4::timestamptz + ($2::int * interval '1 minute')
          and ${deps.customerVisibleTitleQualitySql}
        group by 1
        order by count(*) desc, country asc
        limit $3
        `,
        [latestHours, maxFutureMinutes, topCountriesLimit, asOfIso]
      ),
      db.query<NewsApiReadRow>(
        `
        select
          external_id as id,
          source,
          title_original as title,
          null::text as snippet_original,
          url,
          country,
          language,
          coalesce(section, 'others') as section,
          primary_section,
          sections_normalized,
          feed_categories,
          primary_topic,
          topics,
          publication_datetime,
          created_at,
          updated_at,
          max(created_at) over() as generated_at
        from news_articles
        where publication_datetime >= $4::timestamptz - ($1::int * interval '1 hour')
          and publication_datetime <= $4::timestamptz + ($2::int * interval '1 minute')
          and ${deps.customerVisibleTitleQualitySql}
        order by publication_datetime desc, created_at desc
        limit $3
        `,
        [latestHours, maxFutureMinutes, previewLimit, asOfIso]
      ),
      db.query<{ count: string }>(
        `
        select count(*)::text as count
        from news_articles
        where publication_datetime >= $3::timestamptz - ($1::int * interval '1 hour')
          and publication_datetime <= $3::timestamptz + ($2::int * interval '1 minute')
          and ${deps.customerVisibleTitleQualitySql}
        `,
        [latestHours, maxFutureMinutes, asOfIso]
      ),
    ]);

    previewTopCountries = countryCountsResult.rows.map((row) => ({
      country: row.country,
      count: Number(row.count) || 0,
    }));
    previewArticleCount = Number(countResult.rows[0]?.count || 0);

    previewHeadlines = headlinesResult.rows
      .map((row) => mapRowToDisplayNewsApiItem(row, deps))
      .filter((row): row is NewsApiDashboardHeadlineItem => row !== null);
  }

  const summary: NewsApiDashboardSummaryItem = {
    storage: 'postgres',
    generatedAt: totalsResult.rows[0]?.generated_at ? new Date(totalsResult.rows[0].generated_at).toISOString() : null,
    windowDays,
    latestHours,
    latestDate,
    previewDate,
    totals: {
      rowsWindow: Number(totalsResult.rows[0]?.rows_window || 0),
      inserted24h: Number(totalsResult.rows[0]?.inserted_24h || 0),
      published24h: Number(totalsResult.rows[0]?.published_24h || 0),
      checkedSources24h: Number(checkedSourcesResult.rows[0]?.checked_sources_24h || 0),
    },
    sectionTotals: Object.fromEntries(
      sectionTotalsResult.rows.reduce<Array<[NewsSection, number]>>((acc, row) => {
        const section = deps.normalizeStoredSectionValue(row.section);
        const count = Number(row.count) || 0;
        const existing = acc.find(([key]) => key === section);
        if (existing) {
          existing[1] += count;
        } else {
          acc.push([section, count]);
        }
        return acc;
      }, [])
    ),
    recentDates: recentDatesResult.rows.map((row) => ({
      date: row.date,
      count: Number(row.count) || 0,
    })),
    topicSampleSize,
    topicGroups: topicGroupRows,
    sourceCategoryCoverage,
    preview: {
      articleCount: previewArticleCount,
      topCountries: previewTopCountries,
      headlines: previewHeadlines,
    },
  };

  if (deps.dashboardSummaryCacheMs > 0) {
    deps.dashboardSummaryCache.set(cacheKey, {
      expiresAt: Date.now() + deps.dashboardSummaryCacheMs,
      value: summary,
    });
  }

  return summary;
}
