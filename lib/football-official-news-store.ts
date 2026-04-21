import type { Pool } from 'pg';
import { Pool as PgPool } from 'pg';
import { resolveDatabaseUrl } from '@/lib/database-url';

type OfficialNewsTotalsRow = {
  article_count: string;
  linked_article_count: string;
};

type OfficialNewsMentionBreakdownRow = {
  entity_type: string;
  mention_count: string;
  article_count: string;
};

type OfficialNewsTeamRow = {
  team: string;
  article_count: string;
  linked_article_count: string;
  team_mention_article_count: string;
};

type OfficialNewsGapRow = {
  team: string;
  source: string;
  title_original: string;
  url: string;
  publication_datetime: string;
};

type OfficialNewsSelectedTeamTotalsRow = {
  article_count: string;
  linked_article_count: string;
  team_mention_article_count: string;
};

type OfficialNewsSelectedTeamArticleRow = {
  source: string;
  title_original: string;
  url: string;
  publication_datetime: string;
  entity_types: string[] | null;
};

export type FootballOfficialNewsLaneSummary = {
  generatedAt: string;
  windowDays: number;
  totals: {
    officialArticles: number;
    linkedArticles: number;
  };
  mentionBreakdown: Array<{
    entityType: string;
    mentions: number;
    articles: number;
  }>;
  topTeams: Array<{
    team: string;
    officialArticles: number;
    linkedArticles: number;
    teamMentionArticles: number;
  }>;
  teamMentionGaps: Array<{
    team: string;
    source: string;
    title: string;
    url: string;
    publicationDatetime: string;
  }>;
  selectedTeam: {
    team: string;
    officialArticles: number;
    linkedArticles: number;
    teamMentionArticles: number;
    recentArticles: Array<{
      source: string;
      title: string;
      url: string;
      publicationDatetime: string;
      entityTypes: string[];
    }>;
  } | null;
};

let pool: Pool | null = null;

function buildOfficialNewsArticleFilter(alias: string, daysParam = '$1'): string {
  return `
    ${alias}.source like '%official news%'
    and ${alias}.publication_datetime >= now() - (${daysParam}::int * interval '1 day')
    and coalesce(nullif(trim(${alias}.title_quality), ''), 'ok') <> 'suspect'
    and lower(coalesce(${alias}.title_original, '')) not in (
      'vacature',
      'afc asian cup 2023 news'
    )
    and lower(coalesce(${alias}.title_original, '')) not like '"a" national team%'
    and lower(coalesce(${alias}.title_original, '')) not like 'category:%'
    and lower(coalesce(${alias}.title_original, '')) not like 'the home of football%'
    and lower(coalesce(${alias}.title_original, '')) not like 'fixtures & results%'
    and lower(coalesce(${alias}.url, '')) not like '%/qualified-teams-nations-march-fixtures-results%'
  `;
}

function getPool(): Pool {
  if (!pool) {
    pool = new PgPool({ connectionString: resolveDatabaseUrl() });
  }
  return pool;
}

export async function readFootballOfficialNewsLaneSummary(
  windowDays = 30,
  selectedTeamName: string | null = null
): Promise<FootballOfficialNewsLaneSummary> {
  const db = getPool();
  const normalizedSelectedTeamName = (selectedTeamName || '').trim() || null;

  const totalsResult = await db.query<OfficialNewsTotalsRow>(
    `
      with official_articles as (
        select external_id
        from public.news_articles
        where ${buildOfficialNewsArticleFilter('public.news_articles')}
      ),
      mentioned_articles as (
        select distinct nm.article_external_id
        from football.news_mentions nm
        join official_articles oa on oa.external_id = nm.article_external_id
      )
      select
        count(*)::text as article_count,
        count(ma.article_external_id)::text as linked_article_count
      from official_articles oa
      left join mentioned_articles ma on ma.article_external_id = oa.external_id
    `,
    [windowDays]
  );

  const mentionResult = await db.query<OfficialNewsMentionBreakdownRow>(
    `
      select
        nm.entity_type,
        count(*)::text as mention_count,
        count(distinct nm.article_external_id)::text as article_count
      from football.news_mentions nm
      join public.news_articles na on na.external_id = nm.article_external_id
      where ${buildOfficialNewsArticleFilter('na')}
      group by 1
      order by 1
    `,
    [windowDays]
  );

  const teamResult = await db.query<OfficialNewsTeamRow>(
    `
      with official_articles as (
        select
          na.external_id,
          split_part(na.source, ' official news', 1) as team
        from public.news_articles na
        where ${buildOfficialNewsArticleFilter('na')}
      ),
      mention_flags as (
        select
          nm.article_external_id,
          true as has_any,
          bool_or(nm.entity_type = 'team') as has_team
        from football.news_mentions nm
        join official_articles oa on oa.external_id = nm.article_external_id
        group by 1
      )
      select
        oa.team,
        count(distinct oa.external_id)::text as article_count,
        count(distinct oa.external_id) filter (where mf.has_any)::text as linked_article_count,
        count(distinct oa.external_id) filter (where mf.has_team)::text as team_mention_article_count
      from official_articles oa
      left join mention_flags mf on mf.article_external_id = oa.external_id
      group by 1
      order by count(distinct oa.external_id) desc, oa.team asc
      limit 25
    `,
    [windowDays]
  );

  const gapResult = await db.query<OfficialNewsGapRow>(
    `
      with official_articles as (
        select
          split_part(na.source, ' official news', 1) as team,
          na.source,
          na.title_original,
          na.url,
          na.publication_datetime,
          na.external_id
        from public.news_articles na
        where ${buildOfficialNewsArticleFilter('na')}
      ),
      mention_flags as (
        select
          nm.article_external_id,
          bool_or(nm.entity_type in ('person', 'competition')) as has_person_or_competition,
          bool_or(nm.entity_type = 'team') as has_team
        from football.news_mentions nm
        join official_articles oa on oa.external_id = nm.article_external_id
        group by 1
      )
      select
        oa.team,
        oa.source,
        oa.title_original,
        oa.url,
        oa.publication_datetime::text
      from official_articles oa
      join mention_flags mf on mf.article_external_id = oa.external_id
      where mf.has_person_or_competition
        and not mf.has_team
      order by oa.publication_datetime desc, oa.team asc
      limit 25
    `,
    [windowDays]
  );

  const totals = totalsResult.rows[0] || { article_count: '0', linked_article_count: '0' };
  let selectedTeam: FootballOfficialNewsLaneSummary['selectedTeam'] = null;

  if (normalizedSelectedTeamName) {
    const selectedTeamTotalsResult = await db.query<OfficialNewsSelectedTeamTotalsRow>(
      `
        with official_articles as (
          select
            na.external_id
          from public.news_articles na
          where ${buildOfficialNewsArticleFilter('na')}
            and split_part(na.source, ' official news', 1) = $2
        ),
        mention_flags as (
          select
            nm.article_external_id,
            true as has_any,
            bool_or(nm.entity_type = 'team') as has_team
          from football.news_mentions nm
          join official_articles oa on oa.external_id = nm.article_external_id
          group by 1
        )
        select
          count(*)::text as article_count,
          count(*) filter (where mf.has_any)::text as linked_article_count,
          count(*) filter (where mf.has_team)::text as team_mention_article_count
        from official_articles oa
        left join mention_flags mf on mf.article_external_id = oa.external_id
      `,
      [windowDays, normalizedSelectedTeamName]
    );

    const selectedTeamArticlesResult = await db.query<OfficialNewsSelectedTeamArticleRow>(
      `
        select
          na.source,
          na.title_original,
          na.url,
          na.publication_datetime::text,
          array_remove(array_agg(distinct nm.entity_type order by nm.entity_type), null) as entity_types
        from public.news_articles na
        left join football.news_mentions nm on nm.article_external_id = na.external_id
        where ${buildOfficialNewsArticleFilter('na')}
          and split_part(na.source, ' official news', 1) = $2
        group by na.external_id, na.source, na.title_original, na.url, na.publication_datetime
        order by na.publication_datetime desc, na.title_original asc
        limit 12
      `,
      [windowDays, normalizedSelectedTeamName]
    );

    const selectedTeamTotals = selectedTeamTotalsResult.rows[0] || {
      article_count: '0',
      linked_article_count: '0',
      team_mention_article_count: '0',
    };

    selectedTeam = {
      team: normalizedSelectedTeamName,
      officialArticles: Number.parseInt(selectedTeamTotals.article_count, 10) || 0,
      linkedArticles: Number.parseInt(selectedTeamTotals.linked_article_count, 10) || 0,
      teamMentionArticles: Number.parseInt(selectedTeamTotals.team_mention_article_count, 10) || 0,
      recentArticles: selectedTeamArticlesResult.rows.map((row) => ({
        source: row.source,
        title: row.title_original,
        url: row.url,
        publicationDatetime: row.publication_datetime,
        entityTypes: row.entity_types || [],
      })),
    };
  }

  return {
    generatedAt: new Date().toISOString(),
    windowDays,
    totals: {
      officialArticles: Number.parseInt(totals.article_count, 10) || 0,
      linkedArticles: Number.parseInt(totals.linked_article_count, 10) || 0,
    },
    mentionBreakdown: mentionResult.rows.map((row) => ({
      entityType: row.entity_type,
      mentions: Number.parseInt(row.mention_count, 10) || 0,
      articles: Number.parseInt(row.article_count, 10) || 0,
    })),
    topTeams: teamResult.rows.map((row) => ({
      team: row.team,
      officialArticles: Number.parseInt(row.article_count, 10) || 0,
      linkedArticles: Number.parseInt(row.linked_article_count, 10) || 0,
      teamMentionArticles: Number.parseInt(row.team_mention_article_count, 10) || 0,
    })),
    teamMentionGaps: gapResult.rows.map((row) => ({
      team: row.team,
      source: row.source,
      title: row.title_original,
      url: row.url,
      publicationDatetime: row.publication_datetime,
    })),
    selectedTeam,
  };
}
