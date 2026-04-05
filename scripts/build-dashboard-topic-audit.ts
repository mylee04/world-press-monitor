#!/usr/bin/env bun

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';
import { resolveDatabaseUrl as resolveAppDatabaseUrl } from '@/lib/database-url';

type CountItem = {
  label: string;
  count: number;
};

type TopicRow = {
  article_count: string;
  section: string | null;
  topic: string | null;
};

type CategoryRow = {
  article_count: string;
  category: string | null;
  section: string | null;
};

type SourceRow = {
  article_count: string;
  section: string | null;
  source: string | null;
};

type SectionAudit = {
  articleCount: number;
  assignedTopicCount: number;
  hiddenAssignedTailCount: number;
  section: string;
  topTopics: CountItem[];
  topUnassignedFeedCategories: CountItem[];
  topUnassignedSources: CountItem[];
  unassignedCount: number;
  unassignedPct: number;
  visibleTopTopicCount: number;
};

type AuditReport = {
  generatedAt: string;
  options: {
    days: number;
    topCategories: number;
    topSources: number;
    topTopics: number;
  };
  sections: SectionAudit[];
  summary: {
    assignedTopicCount: number;
    articleCount: number;
    hiddenAssignedTailCount: number;
    sectionCount: number;
    unassignedCount: number;
    unassignedPct: number;
    visibleTopTopicCount: number;
  };
};

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));

const DEFAULT_DAYS = 31;
const DEFAULT_TOP_TOPICS = 15;
const DEFAULT_TOP_CATEGORIES = 10;
const DEFAULT_TOP_SOURCES = 10;

const TOPIC_QUERY = `
  WITH base AS (
    SELECT
      COALESCE(NULLIF(BTRIM(primary_section), ''), 'others') AS section,
      NULLIF(BTRIM(primary_topic), '') AS topic
    FROM news_articles
    WHERE publication_datetime >= NOW() - make_interval(days => $1::int)
  )
  SELECT
    section,
    topic,
    COUNT(*)::bigint AS article_count
  FROM base
  GROUP BY section, topic
  ORDER BY section ASC, article_count DESC, topic ASC NULLS LAST
`;

const UNASSIGNED_CATEGORY_QUERY = `
  WITH base AS (
    SELECT
      COALESCE(NULLIF(BTRIM(primary_section), ''), 'others') AS section,
      COALESCE(NULLIF(BTRIM(raw_category), ''), '(empty)') AS category
    FROM news_articles
    LEFT JOIN LATERAL UNNEST(COALESCE(feed_categories, ARRAY[]::text[])) AS raw_category ON TRUE
    WHERE publication_datetime >= NOW() - make_interval(days => $1::int)
      AND (primary_topic IS NULL OR BTRIM(primary_topic) = '')
  )
  SELECT
    section,
    category,
    COUNT(*)::bigint AS article_count
  FROM base
  GROUP BY section, category
  ORDER BY section ASC, article_count DESC, category ASC
`;

const UNASSIGNED_SOURCE_QUERY = `
  WITH base AS (
    SELECT
      COALESCE(NULLIF(BTRIM(primary_section), ''), 'others') AS section,
      COALESCE(NULLIF(BTRIM(source), ''), '(unknown source)') AS source
    FROM news_articles
    WHERE publication_datetime >= NOW() - make_interval(days => $1::int)
      AND (primary_topic IS NULL OR BTRIM(primary_topic) = '')
  )
  SELECT
    section,
    source,
    COUNT(*)::bigint AS article_count
  FROM base
  GROUP BY section, source
  ORDER BY section ASC, article_count DESC, source ASC
`;

function parseNumberFlag(name: string, fallback: number) {
  const arg = process.argv.find((value) => value.startsWith(`--${name}=`));
  if (!arg) {
    return fallback;
  }
  const value = Number(arg.slice(name.length + 3));
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function resolveDatabaseUrls() {
  return unique([
    process.env.DATABASE_URL || '',
    process.env.POSTGRES_URL || '',
    process.env.POSTGRES_PRISMA_URL || '',
    process.env.POSTGRES_URL_NON_POOLING || '',
    process.env.NEON_DATABASE_URL || '',
    (() => {
      try {
        return resolveAppDatabaseUrl();
      } catch {
        return '';
      }
    })(),
    'postgresql://postgres:postgres@127.0.0.1:1304/wpr',
    'postgresql://postgres:postgres@127.0.0.1:5432/wpr',
  ]);
}

function shouldUseSsl(connectionString: string) {
  return !connectionString.includes('localhost') && !connectionString.includes('127.0.0.1');
}

function toCountItems<T extends { article_count: string }>(rows: T[], labelKey: keyof T, limit: number) {
  return rows.slice(0, limit).map((row) => ({
    label: String(row[labelKey] ?? '(unknown)'),
    count: Number(row.article_count || 0),
  }));
}

function formatPercent(count: number, total: number) {
  if (!total) {
    return 0;
  }
  return Number(((count / total) * 100).toFixed(1));
}

function formatSectionLabel(section: string) {
  return section
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US').format(value);
}

function buildMarkdown(report: AuditReport) {
  const lines: string[] = [];
  lines.push('# Dashboard topic audit');
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Window: last ${report.options.days} days`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- Articles: ${formatNumber(report.summary.articleCount)}`);
  lines.push(`- Topic-assigned: ${formatNumber(report.summary.assignedTopicCount)}`);
  lines.push(`- Unassigned: ${formatNumber(report.summary.unassignedCount)} (${report.summary.unassignedPct}%)`);
  lines.push(`- Visible top-topic rows: ${formatNumber(report.summary.visibleTopTopicCount)}`);
  lines.push(`- Hidden assigned tail: ${formatNumber(report.summary.hiddenAssignedTailCount)}`);
  lines.push(`- Sections: ${formatNumber(report.summary.sectionCount)}`);
  lines.push('');
  lines.push('## Coverage by section');
  lines.push('');
  lines.push('| Section | Articles | Topic-assigned | Unassigned | Unassigned % | Visible top topics | Hidden topic tail |');
  lines.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const section of report.sections) {
    lines.push(
      `| ${formatSectionLabel(section.section)} | ${formatNumber(section.articleCount)} | ${formatNumber(section.assignedTopicCount)} | ${formatNumber(section.unassignedCount)} | ${section.unassignedPct}% | ${formatNumber(section.visibleTopTopicCount)} | ${formatNumber(section.hiddenAssignedTailCount)} |`,
    );
  }

  for (const section of report.sections) {
    lines.push('');
    lines.push(`## ${formatSectionLabel(section.section)}`);
    lines.push('');
    lines.push(`- Articles: ${formatNumber(section.articleCount)}`);
    lines.push(`- Topic-assigned: ${formatNumber(section.assignedTopicCount)}`);
    lines.push(`- Unassigned: ${formatNumber(section.unassignedCount)} (${section.unassignedPct}%)`);
    lines.push(`- Visible top topics: ${formatNumber(section.visibleTopTopicCount)}`);
    lines.push(`- Hidden assigned tail: ${formatNumber(section.hiddenAssignedTailCount)}`);
    lines.push('');
    lines.push('### Top assigned topics');
    lines.push('');
    for (const topic of section.topTopics) {
      lines.push(`- ${topic.label}: ${formatNumber(topic.count)}`);
    }
    lines.push('');
    lines.push('### Top unassigned feed categories');
    lines.push('');
    for (const item of section.topUnassignedFeedCategories) {
      lines.push(`- ${item.label}: ${formatNumber(item.count)}`);
    }
    lines.push('');
    lines.push('### Top unassigned sources');
    lines.push('');
    for (const item of section.topUnassignedSources) {
      lines.push(`- ${item.label}: ${formatNumber(item.count)}`);
    }
  }

  lines.push('');
  return `${lines.join('\n')}\n`;
}

async function main() {
  const days = parseNumberFlag('days', DEFAULT_DAYS);
  const topTopics = parseNumberFlag('topics', DEFAULT_TOP_TOPICS);
  const topCategories = parseNumberFlag('categories', DEFAULT_TOP_CATEGORIES);
  const topSources = parseNumberFlag('sources', DEFAULT_TOP_SOURCES);

  const candidates = resolveDatabaseUrls();
  if (candidates.length === 0) {
    throw new Error('Database URL not found. Set DATABASE_URL or local fallback env before running the audit.');
  }

  let client: Client | null = null;
  let lastError: unknown = null;
  for (const connectionString of candidates) {
    const nextClient = new Client({
      connectionString,
      ssl: shouldUseSsl(connectionString) ? { rejectUnauthorized: false } : undefined,
    });
    try {
      await nextClient.connect();
      await nextClient.query('select 1');
      client = nextClient;
      break;
    } catch (error) {
      lastError = error;
      await nextClient.end().catch(() => undefined);
    }
  }

  if (!client) {
    throw lastError instanceof Error ? lastError : new Error('Unable to connect to PostgreSQL for dashboard topic audit.');
  }

  try {
    const topicResult = await client.query<TopicRow>(TOPIC_QUERY, [days]);
    const categoryResult = await client.query<CategoryRow>(UNASSIGNED_CATEGORY_QUERY, [days]);
    const sourceResult = await client.query<SourceRow>(UNASSIGNED_SOURCE_QUERY, [days]);

    const sectionMap = new Map<string, SectionAudit>();

    for (const row of topicResult.rows) {
      const section = row.section || 'others';
      const topic = row.topic;
      const count = Number(row.article_count || 0);
      const current =
        sectionMap.get(section) ||
        {
          articleCount: 0,
          assignedTopicCount: 0,
          hiddenAssignedTailCount: 0,
          section,
          topTopics: [],
          topUnassignedFeedCategories: [],
          topUnassignedSources: [],
          unassignedCount: 0,
          unassignedPct: 0,
          visibleTopTopicCount: 0,
        };

      current.articleCount += count;
      if (topic) {
        current.assignedTopicCount += count;
        current.topTopics.push({
          label: topic,
          count,
        });
      } else {
        current.unassignedCount += count;
      }
      sectionMap.set(section, current);
    }

    const unassignedCategoriesBySection = new Map<string, CategoryRow[]>();
    for (const row of categoryResult.rows) {
      const section = row.section || 'others';
      const existing = unassignedCategoriesBySection.get(section) || [];
      existing.push(row);
      unassignedCategoriesBySection.set(section, existing);
    }

    const unassignedSourcesBySection = new Map<string, SourceRow[]>();
    for (const row of sourceResult.rows) {
      const section = row.section || 'others';
      const existing = unassignedSourcesBySection.get(section) || [];
      existing.push(row);
      unassignedSourcesBySection.set(section, existing);
    }

    const sections = Array.from(sectionMap.values())
      .map((section) => {
        section.topTopics = section.topTopics
          .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
          .slice(0, topTopics);
        section.visibleTopTopicCount = section.topTopics.reduce((sum, item) => sum + item.count, 0);
        section.hiddenAssignedTailCount = Math.max(section.assignedTopicCount - section.visibleTopTopicCount, 0);
        section.unassignedPct = formatPercent(section.unassignedCount, section.articleCount);
        section.topUnassignedFeedCategories = toCountItems(
          unassignedCategoriesBySection.get(section.section) || [],
          'category',
          topCategories,
        );
        section.topUnassignedSources = toCountItems(
          unassignedSourcesBySection.get(section.section) || [],
          'source',
          topSources,
        );
        return section;
      })
      .sort((a, b) => b.articleCount - a.articleCount || a.section.localeCompare(b.section));

    const summary = sections.reduce(
      (accumulator, section) => {
        accumulator.articleCount += section.articleCount;
        accumulator.assignedTopicCount += section.assignedTopicCount;
        accumulator.hiddenAssignedTailCount += section.hiddenAssignedTailCount;
        accumulator.unassignedCount += section.unassignedCount;
        accumulator.visibleTopTopicCount += section.visibleTopTopicCount;
        return accumulator;
      },
      {
        assignedTopicCount: 0,
        articleCount: 0,
        hiddenAssignedTailCount: 0,
        sectionCount: sections.length,
        unassignedCount: 0,
        unassignedPct: 0,
        visibleTopTopicCount: 0,
      },
    );

    summary.unassignedPct = formatPercent(summary.unassignedCount, summary.articleCount);

    const report: AuditReport = {
      generatedAt: new Date().toISOString(),
      options: {
        days,
        topCategories,
        topSources,
        topTopics,
      },
      sections,
      summary,
    };

    const outputDir = resolve(SCRIPT_DIR, '..', 'audits');
    mkdirSync(outputDir, { recursive: true });

    const stamp = report.generatedAt.replace(/[:]/g, '').replace(/\.\d{3}Z$/, 'Z');
    const json = JSON.stringify(report, null, 2);
    const markdown = buildMarkdown(report);

    const latestJsonPath = resolve(outputDir, 'dashboard-topic-audit.latest.json');
    const latestMarkdownPath = resolve(outputDir, 'dashboard-topic-audit.latest.md');
    const stampedJsonPath = resolve(outputDir, `dashboard-topic-audit.${stamp}.json`);
    const stampedMarkdownPath = resolve(outputDir, `dashboard-topic-audit.${stamp}.md`);

    writeFileSync(latestJsonPath, json);
    writeFileSync(latestMarkdownPath, markdown);
    writeFileSync(stampedJsonPath, json);
    writeFileSync(stampedMarkdownPath, markdown);

    console.log(`[dashboard-topic-audit] wrote ${latestJsonPath}`);
    console.log(`[dashboard-topic-audit] wrote ${latestMarkdownPath}`);
    console.log(`[dashboard-topic-audit] wrote ${stampedJsonPath}`);
    console.log(`[dashboard-topic-audit] wrote ${stampedMarkdownPath}`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('[dashboard-topic-audit] failed');
  console.error(error);
  process.exitCode = 1;
});
