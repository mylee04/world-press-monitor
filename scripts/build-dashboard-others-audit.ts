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

type SampleItem = {
  source: string;
  title: string;
  path: string;
};

type CandidateSectionRow = {
  candidate_section: string;
  article_count: string;
  avg_score: string | null;
  distinct_sources: string;
};

type CandidateSourceRow = {
  candidate_section: string;
  source: string;
  article_count: string;
};

type CandidateCategoryRow = {
  candidate_section: string;
  category: string;
  article_count: string;
};

type CandidateSampleRow = {
  candidate_section: string;
  source: string;
  title: string;
  path: string;
};

type CandidateSectionAudit = {
  candidateSection: string;
  articleCount: number;
  avgScore: number | null;
  distinctSources: number;
  topSources: CountItem[];
  topFeedCategories: CountItem[];
  samples: SampleItem[];
};

type OthersAuditReport = {
  generatedAt: string;
  options: {
    days: number;
    topSections: number;
    topSources: number;
    topCategories: number;
    sampleTitles: number;
  };
  summary: {
    articleCount: number;
    recoverableArticleCount: number;
    unrecoverableArticleCount: number;
    recoverablePct: number;
    candidateSections: number;
  };
  candidateSections: CandidateSectionAudit[];
  unrecoverable: {
    articleCount: number;
    topSources: CountItem[];
    topFeedCategories: CountItem[];
    samples: SampleItem[];
  };
};

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const CUSTOMER_VISIBLE_TITLE_QUALITY_SQL = `coalesce(nullif(trim(title_quality), ''), 'ok') <> 'suspect'`;

function parseNumberArg(argv: string[], prefix: string, fallback: number, min: number, max: number): number {
  const raw = argv.find((item) => item.startsWith(prefix));
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw.slice(prefix.length), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function formatPercent(part: number, total: number): number {
  if (total <= 0) return 0;
  return Number(((part / total) * 100).toFixed(1));
}

function toCountMap<T extends { candidate_section: string; article_count: string }>(
  rows: T[]
): Map<string, CountItem[]> {
  const result = new Map<string, CountItem[]>();
  for (const row of rows) {
    const current = result.get(row.candidate_section) || [];
    const label = 'source' in row ? String((row as T & { source: string }).source) : String((row as T & { category: string }).category);
    current.push({
      label,
      count: Number(row.article_count) || 0,
    });
    result.set(row.candidate_section, current);
  }
  return result;
}

function toSampleMap(rows: CandidateSampleRow[]): Map<string, SampleItem[]> {
  const result = new Map<string, SampleItem[]>();
  for (const row of rows) {
    const current = result.get(row.candidate_section) || [];
    current.push({
      source: row.source,
      title: row.title,
      path: row.path,
    });
    result.set(row.candidate_section, current);
  }
  return result;
}

function buildMarkdown(report: OthersAuditReport): string {
  const lines: string[] = [];
  lines.push('# Dashboard others recovery audit');
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Window: ${report.options.days} days`);
  lines.push('');
  lines.push('## Summary');
  lines.push(`- Others articles: ${report.summary.articleCount.toLocaleString()}`);
  lines.push(`- Recoverable via secondary candidate: ${report.summary.recoverableArticleCount.toLocaleString()} (${report.summary.recoverablePct}%)`);
  lines.push(`- No secondary candidate: ${report.summary.unrecoverableArticleCount.toLocaleString()}`);
  lines.push(`- Candidate sections observed: ${report.summary.candidateSections}`);
  lines.push('');

  for (const section of report.candidateSections) {
    lines.push(`## ${section.candidateSection}`);
    lines.push(`- Articles: ${section.articleCount.toLocaleString()}`);
    lines.push(`- Avg candidate score: ${section.avgScore == null ? 'n/a' : section.avgScore.toFixed(2)}`);
    lines.push(`- Distinct sources: ${section.distinctSources.toLocaleString()}`);
    lines.push('- Top sources:');
    for (const item of section.topSources) {
      lines.push(`  - ${item.label}: ${item.count.toLocaleString()}`);
    }
    lines.push('- Top feed categories:');
    for (const item of section.topFeedCategories) {
      lines.push(`  - ${item.label}: ${item.count.toLocaleString()}`);
    }
    lines.push('- Samples:');
    for (const sample of section.samples) {
      lines.push(`  - [${sample.source}] ${sample.title} :: ${sample.path}`);
    }
    lines.push('');
  }

  lines.push('## Unrecoverable');
  lines.push(`- Articles: ${report.unrecoverable.articleCount.toLocaleString()}`);
  lines.push('- Top sources:');
  for (const item of report.unrecoverable.topSources) {
    lines.push(`  - ${item.label}: ${item.count.toLocaleString()}`);
  }
  lines.push('- Top feed categories:');
  for (const item of report.unrecoverable.topFeedCategories) {
    lines.push(`  - ${item.label}: ${item.count.toLocaleString()}`);
  }
  lines.push('- Samples:');
  for (const sample of report.unrecoverable.samples) {
    lines.push(`  - [${sample.source}] ${sample.title} :: ${sample.path}`);
  }
  lines.push('');

  return `${lines.join('\n')}\n`;
}

async function main() {
  const argv = process.argv.slice(2);
  const days = parseNumberArg(argv, '--days=', 31, 1, 3650);
  const topSections = parseNumberArg(argv, '--top-sections=', 8, 3, 20);
  const topSources = parseNumberArg(argv, '--top-sources=', 8, 3, 20);
  const topCategories = parseNumberArg(argv, '--top-categories=', 8, 3, 20);
  const sampleTitles = parseNumberArg(argv, '--sample-titles=', 4, 1, 10);

  const client = new Client({
    connectionString: resolveAppDatabaseUrl(),
  });

  await client.connect();

  try {
    const summaryRows = await client.query<CandidateSectionRow>(
      `
      with others_rows as (
        select
          source,
          coalesce(feed_categories, '{}'::text[]) as feed_categories,
          coalesce(section_candidates, '[]'::jsonb) as section_candidates,
          created_at,
          left(coalesce(title_original, ''), 160) as title,
          regexp_replace(url, '^https?://[^/]+/?', '') as path
        from news_articles
        where publication_datetime >= now() - ($1::int * interval '1 day')
          and ${CUSTOMER_VISIBLE_TITLE_QUALITY_SQL}
          and coalesce(nullif(trim(primary_section), ''), nullif(trim(section), ''), 'others') = 'others'
      ),
      candidate_rows as (
        select
          source,
          feed_categories,
          created_at,
          title,
          path,
          (
            select elem->>'label'
            from jsonb_array_elements(section_candidates) elem
            where elem->>'label' <> 'others'
            order by coalesce((elem->>'score')::numeric, 0) desc, elem->>'label' asc
            limit 1
          ) as candidate_section,
          (
            select coalesce((elem->>'score')::numeric, 0)
            from jsonb_array_elements(section_candidates) elem
            where elem->>'label' <> 'others'
            order by coalesce((elem->>'score')::numeric, 0) desc, elem->>'label' asc
            limit 1
          ) as candidate_score
        from others_rows
      )
      select
        coalesce(candidate_section, '(none)') as candidate_section,
        count(*)::text as article_count,
        avg(candidate_score)::text as avg_score,
        count(distinct source)::text as distinct_sources
      from candidate_rows
      group by 1
      order by count(*) desc, candidate_section asc
      limit $2
      `,
      [days, topSections + 1]
    );

    const sourceRows = await client.query<CandidateSourceRow>(
      `
      with others_rows as (
        select
          source,
          coalesce(section_candidates, '[]'::jsonb) as section_candidates
        from news_articles
        where publication_datetime >= now() - ($1::int * interval '1 day')
          and ${CUSTOMER_VISIBLE_TITLE_QUALITY_SQL}
          and coalesce(nullif(trim(primary_section), ''), nullif(trim(section), ''), 'others') = 'others'
      ),
      candidate_rows as (
        select
          source,
          coalesce((
            select elem->>'label'
            from jsonb_array_elements(section_candidates) elem
            where elem->>'label' <> 'others'
            order by coalesce((elem->>'score')::numeric, 0) desc, elem->>'label' asc
            limit 1
          ), '(none)') as candidate_section
        from others_rows
      ),
      ranked as (
        select
          candidate_section,
          source,
          count(*)::text as article_count,
          row_number() over (
            partition by candidate_section
            order by count(*) desc, source asc
          ) as rn
        from candidate_rows
        group by 1, 2
      )
      select candidate_section, source, article_count
      from ranked
      where rn <= $2
      order by candidate_section asc, article_count::bigint desc, source asc
      `,
      [days, topSources]
    );

    const categoryRows = await client.query<CandidateCategoryRow>(
      `
      with others_rows as (
        select
          coalesce(feed_categories, '{}'::text[]) as feed_categories,
          coalesce(section_candidates, '[]'::jsonb) as section_candidates
        from news_articles
        where publication_datetime >= now() - ($1::int * interval '1 day')
          and ${CUSTOMER_VISIBLE_TITLE_QUALITY_SQL}
          and coalesce(nullif(trim(primary_section), ''), nullif(trim(section), ''), 'others') = 'others'
      ),
      candidate_rows as (
        select
          coalesce((
            select elem->>'label'
            from jsonb_array_elements(section_candidates) elem
            where elem->>'label' <> 'others'
            order by coalesce((elem->>'score')::numeric, 0) desc, elem->>'label' asc
            limit 1
          ), '(none)') as candidate_section,
          unnest(feed_categories) as category
        from others_rows
      ),
      ranked as (
        select
          candidate_section,
          coalesce(nullif(trim(category), ''), '(empty)') as category,
          count(*)::text as article_count,
          row_number() over (
            partition by candidate_section
            order by count(*) desc, coalesce(nullif(trim(category), ''), '(empty)') asc
          ) as rn
        from candidate_rows
        group by 1, 2
      )
      select candidate_section, category, article_count
      from ranked
      where rn <= $2
      order by candidate_section asc, article_count::bigint desc, category asc
      `,
      [days, topCategories]
    );

    const sampleRows = await client.query<CandidateSampleRow>(
      `
      with others_rows as (
        select
          source,
          created_at,
          left(coalesce(title_original, ''), 160) as title,
          regexp_replace(url, '^https?://[^/]+/?', '') as path,
          coalesce(section_candidates, '[]'::jsonb) as section_candidates
        from news_articles
        where publication_datetime >= now() - ($1::int * interval '1 day')
          and ${CUSTOMER_VISIBLE_TITLE_QUALITY_SQL}
          and coalesce(nullif(trim(primary_section), ''), nullif(trim(section), ''), 'others') = 'others'
      ),
      candidate_rows as (
        select
          source,
          created_at,
          title,
          path,
          coalesce((
            select elem->>'label'
            from jsonb_array_elements(section_candidates) elem
            where elem->>'label' <> 'others'
            order by coalesce((elem->>'score')::numeric, 0) desc, elem->>'label' asc
            limit 1
          ), '(none)') as candidate_section
        from others_rows
      ),
      ranked as (
        select
          candidate_section,
          source,
          title,
          path,
          row_number() over (
            partition by candidate_section
            order by created_at desc, source asc
          ) as rn
        from candidate_rows
      )
      select candidate_section, source, title, path
      from ranked
      where rn <= $2
      order by candidate_section asc, source asc
      `,
      [days, sampleTitles]
    );

    const sourceMap = toCountMap(sourceRows.rows);
    const categoryMap = toCountMap(categoryRows.rows);
    const sampleMap = toSampleMap(sampleRows.rows);

    const candidateSections = summaryRows.rows
      .filter((row) => row.candidate_section !== '(none)')
      .slice(0, topSections)
      .map((row) => ({
        candidateSection: row.candidate_section,
        articleCount: Number(row.article_count) || 0,
        avgScore: row.avg_score == null ? null : Number(row.avg_score),
        distinctSources: Number(row.distinct_sources) || 0,
        topSources: sourceMap.get(row.candidate_section) || [],
        topFeedCategories: categoryMap.get(row.candidate_section) || [],
        samples: sampleMap.get(row.candidate_section) || [],
      }));

    const noneRow = summaryRows.rows.find((row) => row.candidate_section === '(none)');
    const totalOthers = summaryRows.rows.reduce((sum, row) => sum + (Number(row.article_count) || 0), 0);
    const unrecoverableArticleCount = Number(noneRow?.article_count || 0);
    const recoverableArticleCount = Math.max(0, totalOthers - unrecoverableArticleCount);

    const report: OthersAuditReport = {
      generatedAt: new Date().toISOString(),
      options: {
        days,
        topSections,
        topSources,
        topCategories,
        sampleTitles,
      },
      summary: {
        articleCount: totalOthers,
        recoverableArticleCount,
        unrecoverableArticleCount,
        recoverablePct: formatPercent(recoverableArticleCount, totalOthers),
        candidateSections: candidateSections.length,
      },
      candidateSections,
      unrecoverable: {
        articleCount: unrecoverableArticleCount,
        topSources: sourceMap.get('(none)') || [],
        topFeedCategories: categoryMap.get('(none)') || [],
        samples: sampleMap.get('(none)') || [],
      },
    };

    const outputDir = resolve(SCRIPT_DIR, '..', 'audits');
    mkdirSync(outputDir, { recursive: true });

    const stamp = report.generatedAt.replace(/[:]/g, '').replace(/\.\d{3}Z$/, 'Z');
    const json = JSON.stringify(report, null, 2);
    const markdown = buildMarkdown(report);

    const latestJsonPath = resolve(outputDir, 'dashboard-others-audit.latest.json');
    const latestMarkdownPath = resolve(outputDir, 'dashboard-others-audit.latest.md');
    const stampedJsonPath = resolve(outputDir, `dashboard-others-audit.${stamp}.json`);
    const stampedMarkdownPath = resolve(outputDir, `dashboard-others-audit.${stamp}.md`);

    writeFileSync(latestJsonPath, json);
    writeFileSync(latestMarkdownPath, markdown);
    writeFileSync(stampedJsonPath, json);
    writeFileSync(stampedMarkdownPath, markdown);

    console.log(`[dashboard-others-audit] wrote ${latestJsonPath}`);
    console.log(`[dashboard-others-audit] wrote ${latestMarkdownPath}`);
    console.log(`[dashboard-others-audit] wrote ${stampedJsonPath}`);
    console.log(`[dashboard-others-audit] wrote ${stampedMarkdownPath}`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
