import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import { OUTLET_FEEDS } from '../data/outlets';
import { evaluateOpsStatus, loadOpsThresholds } from '../lib/ops-alerts';

type WorkerSummary = {
  generatedAt: string;
  elapsedMs: number;
  worker: {
    outletsTotal: number;
    outletsSelected: number;
    outletOffset: number;
    nextOutletOffset: number;
    endpointsAttempted: number;
    endpointsOk: number;
    endpointsFailed: number;
    endpointFailureRate: number;
    uniqueItems: number;
    persisted: number;
    externalPersisted: number;
    diagnosticsPersisted: number;
  };
};

type Args = {
  dryRun: boolean;
};

const IN_SCOPE_COUNTRIES = new Set(['united states', 'argentina', 'chile', 'uruguay', 'latam']);
const WORKER_SUMMARY_PATH = resolve(process.cwd(), 'audits/ingest-worker-last.json');
const SKIP_GOOGLE_QUERY_MATRIX = (process.env.INGEST_SKIP_GOOGLE_QUERY_MATRIX || 'true').toLowerCase() !== 'false';
const SKIP_SEARCH_AGGREGATORS = (process.env.INGEST_SKIP_SEARCH_AGGREGATORS || 'true').toLowerCase() !== 'false';
let dotenvCache: Record<string, string> | null = null;

function parseArgs(): Args {
  return {
    dryRun: process.argv.includes('--dry-run')
  };
}

function loadDotenvMap(): Record<string, string> {
  if (dotenvCache) return dotenvCache;

  const out: Record<string, string> = {};
  const envFiles = [resolve(process.cwd(), '.env.local'), resolve(process.cwd(), '.env')];
  for (const file of envFiles) {
    if (!existsSync(file)) continue;
    const raw = readFileSync(file, 'utf8');
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx <= 0) continue;
      const key = trimmed.slice(0, idx).trim();
      let value = trimmed.slice(idx + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (key && value) out[key] = value;
    }
  }
  dotenvCache = out;
  return out;
}

function envValue(key: string): string {
  return process.env[key] || loadDotenvMap()[key] || '';
}

function normalizeCountryName(value: string): string {
  const trimmed = (value || '').trim();
  if (!trimmed) return 'global';
  if (trimmed.toLowerCase() === 'us') return 'united states';
  return trimmed.toLowerCase();
}

function inScopeOutlet(
  country: string,
  enabled: boolean,
  name: string,
  rssUrl?: string,
  sitemapUrl?: string
): boolean {
  if (!enabled) return false;
  if (SKIP_GOOGLE_QUERY_MATRIX && /^G (State|Metro) /i.test(name)) return false;
  if (
    SKIP_SEARCH_AGGREGATORS
    && (
      rssUrl?.includes('news.google.com/rss/search')
      || rssUrl?.includes('www.bing.com/news/search')
      || sitemapUrl?.includes('news.google.com/rss/search')
      || sitemapUrl?.includes('www.bing.com/news/search')
    )
  ) return false;
  return IN_SCOPE_COUNTRIES.has(normalizeCountryName(country));
}

function toNum(value: unknown): number {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function pct(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return (numerator / denominator) * 100;
}

function formatPct(numerator: number, denominator: number): string {
  return `${pct(numerator, denominator).toFixed(1)}%`;
}

function getDatabaseUrl(): string {
  const fromEnv = envValue('DATABASE_URL');
  if (!fromEnv) {
    throw new Error('Missing DATABASE_URL env var.');
  }
  return fromEnv;
}

function readWorkerSummary(): WorkerSummary | null {
  if (!existsSync(WORKER_SUMMARY_PATH)) return null;
  try {
    const raw = readFileSync(WORKER_SUMMARY_PATH, 'utf8');
    if (!raw.trim()) return null;
    return JSON.parse(raw) as WorkerSummary;
  } catch {
    return null;
  }
}

function truncateDiscord(content: string, max = 1900): string {
  if (content.length <= max) return content;
  return `${content.slice(0, max - 1)}…`;
}

async function postToDiscord(webhookUrl: string, content: string): Promise<void> {
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: truncateDiscord(content) })
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Discord webhook failed: ${response.status} ${response.statusText} - ${text}`);
  }
}

async function main(): Promise<void> {
  const args = parseArgs();
  const databaseUrl = getDatabaseUrl();
  const webhookUrl = envValue('DISCORD_WEBHOOK_URL');
  const thresholds = loadOpsThresholds(envValue);
  const pool = new Pool({ connectionString: databaseUrl });

  try {
    const configuredOutlets = OUTLET_FEEDS.filter((outlet) => inScopeOutlet(
      outlet.country,
      Boolean(outlet.defaultEnabled),
      outlet.name,
      outlet.rssUrl,
      outlet.sitemapUrl
    ));
    const configuredEndpoints = configuredOutlets.reduce((acc, outlet) => {
      return acc + (outlet.rssUrl ? 1 : 0) + (outlet.sitemapUrl ? 1 : 0);
    }, 0);

    const ingestResult = await pool.query<{
      inserted_1h: string;
      touched_1h: string;
      touched_24h: string;
      source_active_1h: string;
      source_active_24h: string;
      no_ingest_minutes: string;
    }>(`
      select
        count(*) filter (where created_at > now() - interval '1 hour')::text as inserted_1h,
        count(*) filter (where last_seen_at > now() - interval '1 hour')::text as touched_1h,
        count(*) filter (where last_seen_at > now() - interval '24 hours')::text as touched_24h,
        count(distinct source) filter (where last_seen_at > now() - interval '1 hour')::text as source_active_1h,
        count(distinct source) filter (where last_seen_at > now() - interval '24 hours')::text as source_active_24h,
        coalesce(extract(epoch from (now() - max(last_seen_at))) / 60.0, -1)::text as no_ingest_minutes
      from external_news_articles
    `);

    const endpointResult = await pool.query<{
      runs_1h: string;
      attempted_1h: string;
      failed_1h: string;
      parsed_1h: string;
      run_sources_1h: string;
      run_sources_24h: string;
    }>(`
      select
        count(*) filter (where ran_at > now() - interval '1 hour')::text as runs_1h,
        count(*) filter (where ran_at > now() - interval '1 hour' and attempted)::text as attempted_1h,
        count(*) filter (where ran_at > now() - interval '1 hour' and attempted and not ok)::text as failed_1h,
        coalesce(sum(parsed_count) filter (where ran_at > now() - interval '1 hour'), 0)::text as parsed_1h,
        count(distinct source) filter (where ran_at > now() - interval '1 hour')::text as run_sources_1h,
        count(distinct source) filter (where ran_at > now() - interval '24 hours')::text as run_sources_24h
      from ingestion_endpoint_runs
      where runner = 'worker'
    `);

    const qualityResult = await pool.query<{
      total_24h: string;
      title_original_ok: string;
      summary_original_ok: string;
      publication_datetime_ok: string;
      category_ok: string;
      country_ok: string;
      language_ok: string;
      source_ok: string;
      url_ok: string;
      title_en_ok: string;
      summary_en_ok: string;
      non_en_total: string;
      non_en_title_en_ok: string;
      non_en_summary_en_ok: string;
      publication_verified_ok: string;
      summary_verified_ok: string;
      summary_ai_article_ok: string;
      summary_article_meta_ok: string;
      avg_quality: string;
    }>(`
      select
        count(*)::text as total_24h,
        count(*) filter (where title_original is not null and btrim(title_original) <> '')::text as title_original_ok,
        count(*) filter (where summary_original is not null and btrim(summary_original) <> '')::text as summary_original_ok,
        count(*) filter (where publication_datetime is not null)::text as publication_datetime_ok,
        count(*) filter (where category is not null and btrim(category) <> '')::text as category_ok,
        count(*) filter (where country is not null and btrim(country) <> '')::text as country_ok,
        count(*) filter (where language is not null and btrim(language) <> '')::text as language_ok,
        count(*) filter (where source is not null and btrim(source) <> '')::text as source_ok,
        count(*) filter (where url is not null and btrim(url) <> '')::text as url_ok,
        count(*) filter (where title_en is not null and btrim(title_en) <> '')::text as title_en_ok,
        count(*) filter (where summary_en is not null and btrim(summary_en) <> '')::text as summary_en_ok,
        count(*) filter (where language is not null and btrim(language) <> '' and lower(language) not like 'en%')::text as non_en_total,
        count(*) filter (
          where language is not null
            and btrim(language) <> ''
            and lower(language) not like 'en%'
            and title_en is not null
            and btrim(title_en) <> ''
        )::text as non_en_title_en_ok,
        count(*) filter (
          where language is not null
            and btrim(language) <> ''
            and lower(language) not like 'en%'
            and summary_en is not null
            and btrim(summary_en) <> ''
        )::text as non_en_summary_en_ok,
        count(*) filter (where publication_verified)::text as publication_verified_ok,
        count(*) filter (where summary_verified)::text as summary_verified_ok,
        count(*) filter (where summary_source = 'ai_article')::text as summary_ai_article_ok,
        count(*) filter (where summary_source = 'article_meta')::text as summary_article_meta_ok,
        round(coalesce(avg(quality_score), 0), 1)::text as avg_quality
      from external_news_articles
      where last_seen_at > now() - interval '24 hours'
    `);

    const breakingResult = await pool.query<{
      breaking_1h: string;
      breaking_24h: string;
    }>(`
      select
        count(*) filter (where last_seen_at > now() - interval '1 hour' and tags ? 'breaking')::text as breaking_1h,
        count(*) filter (where last_seen_at > now() - interval '24 hours' and tags ? 'breaking')::text as breaking_24h
      from ingested_articles
    `);

    const queueResult = await pool.query<{
      queue_created_1h: string;
      queue_new_1h: string;
      queue_new_total: string;
    }>(`
      select
        count(*) filter (where created_at > now() - interval '1 hour')::text as queue_created_1h,
        count(*) filter (where status = 'new' and created_at > now() - interval '1 hour')::text as queue_new_1h,
        count(*) filter (where status = 'new')::text as queue_new_total
      from breaking_queue
    `);

    const socialResult = await pool.query<{
      social_posts_1h: string;
      social_breaking_1h: string;
    }>(`
      select
        count(*) filter (where created_at > now() - interval '1 hour')::text as social_posts_1h,
        count(*) filter (where created_at > now() - interval '1 hour' and is_breaking)::text as social_breaking_1h
      from social_breaking_posts
    `);

    const topSourcesResult = await pool.query<{ source: string; c: string }>(`
      select source, count(*)::text as c
      from external_news_articles
      where last_seen_at > now() - interval '1 hour'
      group by source
      order by count(*) desc, source asc
      limit 5
    `);

    const ingest = ingestResult.rows[0] || {
      inserted_1h: '0',
      touched_1h: '0',
      touched_24h: '0',
      source_active_1h: '0',
      source_active_24h: '0',
      no_ingest_minutes: '-1'
    };
    const endpoint = endpointResult.rows[0] || {
      runs_1h: '0',
      attempted_1h: '0',
      failed_1h: '0',
      parsed_1h: '0',
      run_sources_1h: '0',
      run_sources_24h: '0'
    };
    const quality = qualityResult.rows[0] || {
      total_24h: '0',
      title_original_ok: '0',
      summary_original_ok: '0',
      publication_datetime_ok: '0',
      category_ok: '0',
      country_ok: '0',
      language_ok: '0',
      source_ok: '0',
      url_ok: '0',
      title_en_ok: '0',
      summary_en_ok: '0',
      non_en_total: '0',
      non_en_title_en_ok: '0',
      non_en_summary_en_ok: '0',
      publication_verified_ok: '0',
      summary_verified_ok: '0',
      summary_ai_article_ok: '0',
      summary_article_meta_ok: '0',
      avg_quality: '0'
    };
    const breaking = breakingResult.rows[0] || { breaking_1h: '0', breaking_24h: '0' };
    const queue = queueResult.rows[0] || { queue_created_1h: '0', queue_new_1h: '0', queue_new_total: '0' };
    const social = socialResult.rows[0] || { social_posts_1h: '0', social_breaking_1h: '0' };
    const worker = readWorkerSummary();

    const inserted1h = toNum(ingest.inserted_1h);
    const noIngestMinutesRaw = toNum(ingest.no_ingest_minutes);
    const noIngestMinutes = noIngestMinutesRaw < 0 ? null : noIngestMinutesRaw;
    const touched1h = toNum(ingest.touched_1h);
    const touched24h = toNum(ingest.touched_24h);
    const sourceActive1h = toNum(ingest.source_active_1h);
    const sourceActive24h = toNum(ingest.source_active_24h);
    const runs1h = toNum(endpoint.runs_1h);
    const attempted1h = toNum(endpoint.attempted_1h);
    const failed1h = toNum(endpoint.failed_1h);
    const parsed1h = toNum(endpoint.parsed_1h);
    const total24h = toNum(quality.total_24h);
    const nonEnTotal = toNum(quality.non_en_total);
    const breaking1h = toNum(breaking.breaking_1h);
    const breaking24h = toNum(breaking.breaking_24h);
    const queueNew1h = toNum(queue.queue_new_1h);
    const queueNewTotal = toNum(queue.queue_new_total);
    const socialBreaking1h = toNum(social.social_breaking_1h);
    const endpointFailureRate1h = pct(failed1h, Math.max(attempted1h, 1));
    const breakingRatio1h = pct(breaking1h, Math.max(inserted1h, 1));
    const nonEnTitleCoveragePct = pct(toNum(quality.non_en_title_en_ok), Math.max(nonEnTotal, 1));
    const nonEnSummaryCoveragePct = pct(toNum(quality.non_en_summary_en_ok), Math.max(nonEnTotal, 1));
    const summaryAiArticlePct = pct(toNum(quality.summary_ai_article_ok), Math.max(total24h, 1));
    const summaryArticleMetaPct = pct(toNum(quality.summary_article_meta_ok), Math.max(total24h, 1));
    const summaryFeedOtherPct = Math.max(0, 100 - summaryAiArticlePct - summaryArticleMetaPct);
    const workerStaleMinutes = worker
      ? Math.max(0, Math.floor((Date.now() - new Date(worker.generatedAt).getTime()) / 60000))
      : null;
    const health = evaluateOpsStatus(
      {
        inserted1h,
        noIngestMinutes,
        endpointFailureRate1hPct: endpointFailureRate1h,
        queueNewTotal,
        nonEnTitleCoveragePct,
        nonEnSummaryCoveragePct,
        workerStaleMinutes,
      },
      thresholds
    );

    const topSources = topSourcesResult.rows
      .map((row) => `${row.source}:${toNum(row.c)}`)
      .join(' | ') || 'none';

    const workerLineEn = worker
      ? `- Worker(last): outlets ${worker.worker.outletsSelected}/${worker.worker.outletsTotal} · endpoints ${worker.worker.endpointsAttempted} (fail ${worker.worker.endpointsFailed}) · persisted ${worker.worker.persisted}/${worker.worker.externalPersisted} · ${Math.round(worker.elapsedMs / 1000)}s`
      : '- Worker(last): unavailable';
    const workerLineEs = worker
      ? `- Worker(ultimo): fuentes ${worker.worker.outletsSelected}/${worker.worker.outletsTotal} · endpoints ${worker.worker.endpointsAttempted} (fallas ${worker.worker.endpointsFailed}) · guardado ${worker.worker.persisted}/${worker.worker.externalPersisted} · ${Math.round(worker.elapsedMs / 1000)}s`
      : '- Worker(ultimo): no disponible';
    const alertLineEn = health.alerts.length > 0
      ? health.alerts.map((alert) => `[${alert.severity.toUpperCase()}] ${alert.message}`).join(' | ')
      : 'none';
    const alertLineEs = health.alerts.length > 0
      ? health.alerts.map((alert) => `[${alert.severity.toUpperCase()}] ${alert.message}`).join(' | ')
      : 'ninguna';

    const message = [
      `**PressLab Hourly Ops (US + LATAM) — ${new Date().toISOString()}**`,
      '',
      '**EN**',
      `- Status: ${health.status.toUpperCase()} · Alerts: ${alertLineEn}`,
      `- Ingest 1h: new ${inserted1h} · active ${touched1h} · parsed ${parsed1h} · gap ${noIngestMinutes === null ? 'n/a' : `${noIngestMinutes.toFixed(1)}m`} · endpoint fail ${endpointFailureRate1h.toFixed(1)}% (${failed1h}/${Math.max(attempted1h, 0)})`,
      `- Scope: configured outlets ${configuredOutlets.length} (${configuredEndpoints} endpoints) · active sources 1h ${sourceActive1h} · 24h ${sourceActive24h}`,
      `- Articles: 24h ${touched24h} · breaking 1h ${breaking1h} (${breakingRatio1h.toFixed(1)}%) · queue new 1h ${queueNew1h} (total ${queueNewTotal}) · social breaking 1h ${socialBreaking1h}`,
      `- Quality 24h: title ${formatPct(toNum(quality.title_original_ok), total24h)} · summary ${formatPct(toNum(quality.summary_original_ok), total24h)} · pub_dt ${formatPct(toNum(quality.publication_datetime_ok), total24h)} · category ${formatPct(toNum(quality.category_ok), total24h)}`,
      `- Coverage 24h: country ${formatPct(toNum(quality.country_ok), total24h)} · language ${formatPct(toNum(quality.language_ok), total24h)} · source ${formatPct(toNum(quality.source_ok), total24h)} · url ${formatPct(toNum(quality.url_ok), total24h)}`,
      `- Translation(non-en): title_en ${formatPct(toNum(quality.non_en_title_en_ok), nonEnTotal)} · summary_en ${formatPct(toNum(quality.non_en_summary_en_ok), nonEnTotal)} · verified(pub ${formatPct(toNum(quality.publication_verified_ok), total24h)}, summary ${formatPct(toNum(quality.summary_verified_ok), total24h)}) · avgQ ${Number(quality.avg_quality || 0).toFixed(1)}`,
      `- Summary source 24h: ai_article ${summaryAiArticlePct.toFixed(1)}% · article_meta ${summaryArticleMetaPct.toFixed(1)}% · feed/other ${summaryFeedOtherPct.toFixed(1)}%`,
      `- Top active 1h: ${topSources}`,
      workerLineEn,
      '',
      '**ES**',
      `- Estado: ${health.status.toUpperCase()} · Alertas: ${alertLineEs}`,
      `- Ingestion 1h: nuevas ${inserted1h} · activas ${touched1h} · parseadas ${parsed1h} · brecha ${noIngestMinutes === null ? 'n/d' : `${noIngestMinutes.toFixed(1)}m`} · fallo endpoints ${endpointFailureRate1h.toFixed(1)}% (${failed1h}/${Math.max(attempted1h, 0)})`,
      `- Alcance: fuentes configuradas ${configuredOutlets.length} (${configuredEndpoints} endpoints) · fuentes activas 1h ${sourceActive1h} · 24h ${sourceActive24h}`,
      `- Articulos: 24h ${touched24h} · breaking 1h ${breaking1h} (${breakingRatio1h.toFixed(1)}%) · cola nueva 1h ${queueNew1h} (total ${queueNewTotal}) · social breaking 1h ${socialBreaking1h}`,
      `- Calidad 24h: titulo ${formatPct(toNum(quality.title_original_ok), total24h)} · resumen ${formatPct(toNum(quality.summary_original_ok), total24h)} · pub_dt ${formatPct(toNum(quality.publication_datetime_ok), total24h)} · categoria ${formatPct(toNum(quality.category_ok), total24h)}`,
      `- Cobertura 24h: pais ${formatPct(toNum(quality.country_ok), total24h)} · idioma ${formatPct(toNum(quality.language_ok), total24h)} · fuente ${formatPct(toNum(quality.source_ok), total24h)} · url ${formatPct(toNum(quality.url_ok), total24h)}`,
      `- Traduccion(no-en): title_en ${formatPct(toNum(quality.non_en_title_en_ok), nonEnTotal)} · summary_en ${formatPct(toNum(quality.non_en_summary_en_ok), nonEnTotal)} · verificado(pub ${formatPct(toNum(quality.publication_verified_ok), total24h)}, summary ${formatPct(toNum(quality.summary_verified_ok), total24h)}) · avgQ ${Number(quality.avg_quality || 0).toFixed(1)}`,
      `- Origen resumen 24h: ai_article ${summaryAiArticlePct.toFixed(1)}% · article_meta ${summaryArticleMetaPct.toFixed(1)}% · feed/otros ${summaryFeedOtherPct.toFixed(1)}%`,
      `- Top activas 1h: ${topSources}`,
      workerLineEs,
      '',
      `- Breaking 24h total: ${breaking24h}`,
      `- Endpoint runs 1h: ${runs1h}`
    ].join('\n');

    if (args.dryRun) {
      console.log(message);
      return;
    }

    if (!webhookUrl) {
      throw new Error('Missing DISCORD_WEBHOOK_URL env var.');
    }
    const mention =
      health.status === 'green'
        ? ''
        : (envValue('DISCORD_OPS_ALERT_MENTION') || '').trim();
    const payload = mention ? `${mention}\n${message}` : message;
    await postToDiscord(webhookUrl, payload);
    console.log('Posted hourly ops summary to Discord.');
  } finally {
    await pool.end().catch(() => undefined);
  }
}

void main();
