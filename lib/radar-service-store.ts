import { Pool } from 'pg';
import { getIngestionOpsSummary24h } from '@/lib/ingestion-store';

export type RadarServiceArticle = {
  id: string;
  title: string;
  description: string;
  link: string;
  source: string;
  country: string | null;
  countryCode: string | null;
  language: string | null;
  publishedAt: string;
  lastSeenAt: string;
  outletId: string | null;
  beat: string | null;
  qualityScore: number;
  publicationSource: string | null;
  summarySource: string | null;
  summaryOriginal: string | null;
  summaryEn: string | null;
  publicationVerified: boolean;
  summaryVerified: boolean;
  tags: string[];
};

export type RadarServiceCountryCount = {
  countryCode: string;
  country: string;
  count: number;
};

export type RadarServiceSourceRow = {
  source: string;
  countryCode: string | null;
  country: string | null;
  articles: number;
  lastSeenAt: string;
};

export type RadarServiceOpsSummary = {
  generatedAt: string;
  ingestion24h: Awaited<ReturnType<typeof getIngestionOpsSummary24h>>;
  countryCounts24h: RadarServiceCountryCount[];
};

let pool: Pool | null = null;

function getPool(): Pool {
  if (pool) return pool;
  const url = process.env.DATABASE_URL || '';
  if (!url) {
    throw new Error('DATABASE_URL is not configured');
  }
  pool = new Pool({ connectionString: url });
  return pool;
}

function toCode(input: string | null | undefined): string | null {
  const v = (input || '').trim();
  if (!v) return null;
  const low = v.toLowerCase();
  if (low === 'ar' || low.includes('argentin')) return 'AR';
  if (low === 'cl' || low.includes('chile')) return 'CL';
  if (low === 'uy' || low.includes('uruguay')) return 'UY';
  if (low === 'do' || low.includes('dominican')) return 'DO';
  if (low === 'us' || low.includes('united states') || low.includes('u.s.')) return 'US';
  if (v.length === 2) return v.toUpperCase();
  return null;
}

function normalizeCountryLabel(code: string | null, raw: string | null): string {
  if (code === 'AR') return 'Argentina';
  if (code === 'CL') return 'Chile';
  if (code === 'UY') return 'Uruguay';
  if (code === 'DO') return 'Dominican Republic';
  if (code === 'US') return 'United States';
  return (raw || 'Unknown').trim() || 'Unknown';
}

function buildCountryWhere(country?: string | null): { sql: string; params: string[] } {
  const c = (country || '').trim();
  if (!c) return { sql: '', params: [] };

  const code = toCode(c);
  const aliases: string[] = [];
  if (code === 'AR') aliases.push('AR', 'Argentina');
  else if (code === 'CL') aliases.push('CL', 'Chile');
  else if (code === 'UY') aliases.push('UY', 'Uruguay');
  else if (code === 'DO') aliases.push('DO', 'Dominican Republic', 'República Dominicana', 'Republica Dominicana');
  else if (code === 'US') aliases.push('US', 'United States', 'USA');
  else aliases.push(c);

  return { sql: ` and upper(coalesce(e.country, '')) = any($COUNTRY::text[])`, params: aliases.map((v) => v.toUpperCase()) };
}

export async function getRadarServiceArticles(input: {
  country?: string | null;
  source?: string | null;
  outletId?: string | null;
  hours: number;
  limit: number;
  offset: number;
}): Promise<{
  generatedAt: string;
  articles: RadarServiceArticle[];
  total: number;
}> {
  const db = getPool();
  const { country, source, outletId } = input;
  const hours = Math.max(1, Math.min(168, Math.floor(input.hours || 24)));
  const limit = Math.max(1, Math.min(1000, Math.floor(input.limit || 100)));
  const offset = Math.max(0, Math.floor(input.offset || 0));

  const countryClause = buildCountryWhere(country);

  const params: unknown[] = [String(hours)];
  let idx = params.length;
  let whereSql = ` where e.last_seen_at > now() - ($1::text || ' hours')::interval`;

  if (countryClause.sql) {
    idx += 1;
    whereSql += countryClause.sql.replace('$COUNTRY', `$${idx}`);
    params.push(countryClause.params);
  }
  if (source) {
    idx += 1;
    whereSql += ` and e.source = $${idx}`;
    params.push(source);
  }
  if (outletId) {
    idx += 1;
    whereSql += ` and i.outlet_id = $${idx}`;
    params.push(outletId);
  }

  idx += 1;
  const limitIdx = idx;
  params.push(limit);
  idx += 1;
  const offsetIdx = idx;
  params.push(offset);

  const articleQuery = `
    select
      e.external_id,
      e.url as link,
      coalesce(nullif(e.title_original, ''), i.title, e.url) as title,
      coalesce(e.summary_original, '') as description,
      e.summary_original,
      e.summary_en,
      e.source,
      e.country,
      e.language,
      e.publication_datetime as published_at,
      e.last_seen_at,
      e.publication_source,
      e.summary_source,
      e.publication_verified,
      e.summary_verified,
      e.quality_score,
      i.outlet_id,
      i.beat,
      i.tags
    from external_news_articles e
    left join ingested_articles i on i.link = e.url
    ${whereSql}
    order by e.publication_datetime desc
    limit $${limitIdx} offset $${offsetIdx}
  `;

  const countQuery = `
    select count(*)::int as total
    from external_news_articles e
    left join ingested_articles i on i.link = e.url
    ${whereSql}
  `;

  const [rowsResult, countResult] = await Promise.all([
    db.query(articleQuery, params),
    db.query(countQuery, params.slice(0, params.length - 2)),
  ]);

  const articles: RadarServiceArticle[] = rowsResult.rows.map((row) => {
    const code = toCode(row.country);
    const publishedAt = row.published_at ? new Date(row.published_at).toISOString() : new Date(0).toISOString();
    const lastSeenAt = row.last_seen_at ? new Date(row.last_seen_at).toISOString() : publishedAt;
    const tags = Array.isArray(row.tags) ? row.tags.filter((v: unknown) => typeof v === 'string') as string[] : [];
    return {
      id: String(row.external_id || row.link),
      title: String(row.title || ''),
      description: String(row.description || ''),
      link: String(row.link || ''),
      source: String(row.source || ''),
      country: row.country ? String(row.country) : null,
      countryCode: code,
      language: row.language ? String(row.language) : null,
      publishedAt,
      lastSeenAt,
      outletId: row.outlet_id ? String(row.outlet_id) : null,
      beat: row.beat ? String(row.beat) : null,
      qualityScore: Number(row.quality_score || 0),
      publicationSource: row.publication_source ? String(row.publication_source) : null,
      summarySource: row.summary_source ? String(row.summary_source) : null,
      summaryOriginal: row.summary_original ? String(row.summary_original) : null,
      summaryEn: row.summary_en ? String(row.summary_en) : null,
      publicationVerified: Boolean(row.publication_verified),
      summaryVerified: Boolean(row.summary_verified),
      tags,
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    articles,
    total: Number(countResult.rows[0]?.total || 0),
  };
}

export async function getRadarServiceCountryCounts(hours = 24): Promise<RadarServiceCountryCount[]> {
  const db = getPool();
  const clampedHours = Math.max(1, Math.min(168, Math.floor(hours || 24)));
  const result = await db.query<{
    country: string | null;
    count: string;
  }>(
    `
      select country, count(*)::text as count
      from external_news_articles
      where last_seen_at > now() - ($1::text || ' hours')::interval
      group by country
    `,
    [String(clampedHours)]
  );

  const merged = new Map<string, RadarServiceCountryCount>();
  for (const row of result.rows) {
    const code = toCode(row.country) || 'OTHER';
    const prev = merged.get(code);
    const nextCount = Number(row.count || 0) + (prev?.count || 0);
    merged.set(code, {
      countryCode: code,
      country: normalizeCountryLabel(code === 'OTHER' ? null : code, row.country ? String(row.country) : null),
      count: nextCount,
    });
  }

  return [...merged.values()].sort((a, b) => b.count - a.count || a.country.localeCompare(b.country));
}

export async function getRadarServiceSources(input: {
  hours: number;
  limit: number;
}): Promise<RadarServiceSourceRow[]> {
  const db = getPool();
  const hours = Math.max(1, Math.min(168, Math.floor(input.hours || 24)));
  const limit = Math.max(1, Math.min(1000, Math.floor(input.limit || 200)));

  const result = await db.query<{
    source: string;
    country: string | null;
    articles: string;
    last_seen_at: string;
  }>(
    `
      select
        source,
        max(country) as country,
        count(*)::text as articles,
        max(last_seen_at)::text as last_seen_at
      from external_news_articles
      where last_seen_at > now() - ($1::text || ' hours')::interval
      group by source
      order by count(*) desc, source asc
      limit $2
    `,
    [String(hours), limit]
  );

  return result.rows.map((row) => ({
    source: row.source,
    countryCode: toCode(row.country),
    country: row.country ? String(row.country) : null,
    articles: Number(row.articles || 0),
    lastSeenAt: row.last_seen_at ? new Date(row.last_seen_at).toISOString() : new Date().toISOString(),
  }));
}

export async function getRadarServiceOpsSummary(): Promise<RadarServiceOpsSummary> {
  const [ingestion24h, countryCounts24h] = await Promise.all([
    getIngestionOpsSummary24h(),
    getRadarServiceCountryCounts(24),
  ]);
  return {
    generatedAt: new Date().toISOString(),
    ingestion24h,
    countryCounts24h,
  };
}

