import { createHash } from 'node:crypto';
import { Pool } from 'pg';

type QueueRow = {
  id: number;
  article_external_id: string;
  attempt_count: number;
  url: string;
  title_original: string | null;
  summary_original: string | null;
  summary_en: string | null;
  language: string | null;
};

export type RadarSummaryRunStats = {
  seeded: number;
  claimed: number;
  processed: number;
  completed: number;
  skipped: number;
  failed: number;
  retryScheduled: number;
  deferredByQuota: number;
  cooldownDeferred: number;
  providerUsage: {
    glm: number;
  };
  providerErrors: {
    auth401: number;
    rateLimited429: number;
    badRequest400: number;
    timeout: number;
    upstream5xx: number;
    unknown: number;
  };
  fetchOutcomes: {
    success: number;
    fallbackSuccess: number;
    blocked: number;
    rateLimited: number;
    paywall: number;
    timeout: number;
    network: number;
    nonHtml: number;
    httpOther: number;
    emptyContext: number;
  };
  errorSamples: string[];
};

const DEFAULT_BATCH_SIZE = 10;
const DEFAULT_MAX_ATTEMPTS = 4;
const DEFAULT_TIMEOUT_MS = 12000;
const DEFAULT_MAX_CONTEXT_CHARS = 3500;
const DEFAULT_MAX_SUMMARY_CHARS = 900;
const DEFAULT_GLM_DAILY_LIMIT = 15000;
const DEFAULT_COOLDOWN_MINUTES = 1;

function readIntEnv(name: string, fallback: number): number {
  const parsed = Number(process.env[name] || fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.floor(parsed);
}

function getPool(): Pool {
  const url = process.env.DATABASE_URL || '';
  if (!url) throw new Error('DATABASE_URL is not configured');
  return new Pool({ connectionString: url });
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function truncate(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return value.slice(0, Math.max(0, maxChars - 1)).trimEnd() + '…';
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return 'invalid-url';
  }
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  const raw = (text || '').trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>;
  } catch {
    const first = raw.indexOf('{');
    const last = raw.lastIndexOf('}');
    if (first >= 0 && last > first) {
      try {
        const parsed = JSON.parse(raw.slice(first, last + 1));
        if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>;
      } catch {
        return null;
      }
    }
  }
  return null;
}

function classifyProviderError(message: string): keyof RadarSummaryRunStats['providerErrors'] {
  const lower = message.toLowerCase();
  if (lower.includes('glm_http_401')) return 'auth401';
  if (lower.includes('glm_http_429')) return 'rateLimited429';
  if (lower.includes('glm_http_400')) return 'badRequest400';
  if (lower.includes('timeout') || lower.includes('aborted')) return 'timeout';
  if (lower.includes('glm_http_5')) return 'upstream5xx';
  return 'unknown';
}

function addErrorSample(stats: RadarSummaryRunStats, message: string): void {
  const sample = truncate(message || 'unknown_error', 220);
  if (stats.errorSamples.includes(sample)) return;
  if (stats.errorSamples.length >= 5) return;
  stats.errorSamples.push(sample);
}

function inferNeedsSummaryEn(language: string | null, summaryEn: string | null): boolean {
  const lang = (language || '').toLowerCase();
  const isNonEn = lang && !lang.startsWith('en');
  return Boolean(isNonEn && !normalizeText(summaryEn || ''));
}

function inferNeedsSummaryOriginal(summaryOriginal: string | null): boolean {
  return !normalizeText(summaryOriginal || '');
}

function extractJsonLdCandidates(html: string): string[] {
  const out: string[] = [];
  const scriptRegex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = scriptRegex.exec(html))) {
    const raw = (m[1] || '').trim();
    if (!raw) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }
    const queue: unknown[] = Array.isArray(parsed) ? [...parsed] : [parsed];
    while (queue.length > 0) {
      const item = queue.shift();
      if (!item || typeof item !== 'object') continue;
      const rec = item as Record<string, unknown>;
      for (const field of ['articleBody', 'description', 'text', 'headline']) {
        const value = rec[field];
        if (typeof value === 'string' && value.trim()) out.push(normalizeText(value));
      }
      for (const value of Object.values(rec)) {
        if (value && typeof value === 'object') queue.push(value);
      }
    }
  }
  return out;
}

function extractMetaDescription(html: string): string | null {
  const patterns = [
    /<meta[^>]+(?:property|name)=["']og:description["'][^>]+content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]+(?:property|name)=["']twitter:description["'][^>]+content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]+(?:property|name)=["']description["'][^>]+content=["']([^"']+)["'][^>]*>/i,
  ];
  for (const rx of patterns) {
    const m = html.match(rx);
    const value = normalizeText((m?.[1] || '').replace(/<[^>]+>/g, ' '));
    if (value.length > 80) return value;
  }
  return null;
}

function extractReadableText(html: string): string {
  const withoutNoise = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, ' ')
    .replace(/<form[\s\S]*?<\/form>/gi, ' ')
    .replace(/<(\/)?(p|div|section|article|main|h1|h2|h3|h4|h5|h6|li|br|tr|td|blockquote)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  return normalizeText(withoutNoise);
}

async function fetchContext(input: {
  url: string;
  fallbackText?: string | null;
  timeoutMs: number;
  maxChars: number;
}): Promise<{
  context: string | null;
  outcome: keyof RadarSummaryRunStats['fetchOutcomes'];
  httpStatus: number | null;
  usedFallback: boolean;
  contextSource: 'jsonld' | 'meta' | 'body' | 'fallback' | 'none';
  latencyMs: number;
}> {
  // Compliance default: do not fetch article pages. Use only feed-provided text already in DB.
  // This means outcomes are limited to fallbackSuccess / emptyContext.
  const fallback = normalizeText(input.fallbackText || '');
  if (fallback.length >= 80) {
    return {
      context: truncate(fallback, input.maxChars),
      outcome: 'fallbackSuccess',
      httpStatus: null,
      usedFallback: true,
      contextSource: 'fallback',
      latencyMs: 0,
    };
  }

  return {
    context: null,
    outcome: 'emptyContext',
    httpStatus: null,
    usedFallback: false,
    contextSource: 'none',
    latencyMs: 0,
  };
}

function buildPrompt(input: { title: string; context: string; maxSummaryChars: number }): string {
  const safeContext = truncate(input.context, 9000);
  return [
    'You are a newsroom assistant.',
    'Return JSON only with keys: summary_original, summary_en.',
    `Each summary must be <= ${input.maxSummaryChars} chars.`,
    'If original language is already English, summary_en can mirror summary_original.',
    `Title: ${input.title || 'Untitled'}`,
    'Context:',
    safeContext,
  ].join('\n');
}

async function requestGlmSummary(input: {
  apiKey: string;
  apiBaseUrl: string;
  model: string;
  prompt: string;
  timeoutMs: number;
}): Promise<{ summaryOriginal: string; summaryEn: string; modelUsed: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs);
  try {
    const response = await fetch(`${input.apiBaseUrl.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: input.model,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'Return strict JSON object only.' },
          { role: 'user', content: input.prompt },
        ],
      }),
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`glm_http_${response.status}: ${text.slice(0, 400)}`);
    }

    let parsed: Record<string, unknown> | null = null;
    let topLevel: Record<string, unknown> | null = null;
    try {
      const decoded = JSON.parse(text);
      if (decoded && typeof decoded === 'object') {
        topLevel = decoded as Record<string, unknown>;
      }
    } catch {
      topLevel = null;
    }

    if (topLevel) {
      const hasDirect = typeof topLevel.summary_original === 'string' || typeof topLevel.summary_en === 'string';
      if (hasDirect) {
        parsed = topLevel;
      } else {
        const maybeChoice = (topLevel.choices as Array<{ message?: { content?: unknown } }> | undefined)?.[0];
        const content = maybeChoice?.message?.content;
        if (typeof content === 'string') {
          parsed = parseJsonObject(content);
        } else if (Array.isArray(content)) {
          const joined = content
            .map((item) => (item && typeof item === 'object' ? String((item as { text?: unknown }).text || '') : ''))
            .join('\n');
          parsed = parseJsonObject(joined);
        }
      }
    }

    if (!parsed) {
      const raw = parseJsonObject(text);
      if (raw && (typeof raw.summary_original === 'string' || typeof raw.summary_en === 'string')) {
        parsed = raw;
      }
    }

    const summaryOriginal = normalizeText(String(parsed?.summary_original || ''));
    const summaryEn = normalizeText(String(parsed?.summary_en || ''));
    if (!summaryOriginal && !summaryEn) {
      throw new Error('glm_empty_summary');
    }
    return {
      summaryOriginal: summaryOriginal || summaryEn,
      summaryEn: summaryEn || summaryOriginal,
      modelUsed: input.model,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function ensureSchema(pool: Pool): Promise<void> {
  await pool.query(`
    create table if not exists radar_summary_queue (
      id bigserial primary key,
      article_external_id text not null unique references external_news_articles(external_id) on delete cascade,
      status text not null default 'pending',
      attempt_count integer not null default 0,
      next_retry_at timestamptz not null default now(),
      last_error text null,
      provider text null,
      model text null,
      started_at timestamptz null,
      completed_at timestamptz null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create index if not exists idx_radar_summary_queue_status_retry on radar_summary_queue(status, next_retry_at, id);
    create index if not exists idx_radar_summary_queue_updated on radar_summary_queue(updated_at desc);

    create table if not exists radar_summary_usage_daily (
      usage_date date not null,
      provider text not null,
      request_count integer not null default 0,
      updated_at timestamptz not null default now(),
      primary key (usage_date, provider)
    );

    create table if not exists radar_summary_fetch_logs (
      id bigserial primary key,
      queue_id bigint null references radar_summary_queue(id) on delete set null,
      article_external_id text null,
      domain text not null default 'unknown',
      attempt_count integer not null default 1,
      outcome text not null,
      failure_code text null,
      http_status integer null,
      used_fallback boolean not null default false,
      context_source text null,
      latency_ms integer null,
      created_at timestamptz not null default now()
    );
    create index if not exists idx_radar_summary_fetch_logs_created on radar_summary_fetch_logs(created_at desc);
    create index if not exists idx_radar_summary_fetch_logs_domain_created on radar_summary_fetch_logs(domain, created_at desc);
  `);
}

async function seedQueue(pool: Pool, limit: number): Promise<number> {
  const result = await pool.query(
    `
      insert into radar_summary_queue (article_external_id, status, next_retry_at, created_at, updated_at)
      select e.external_id, 'pending', now(), now(), now()
      from external_news_articles e
      left join radar_summary_queue q on q.article_external_id = e.external_id
      where q.article_external_id is null
        and e.last_seen_at > now() - interval '24 hours'
        and (
          coalesce(btrim(e.summary_original), '') = ''
          or (
            e.language is not null
            and lower(e.language) not like 'en%'
            and coalesce(btrim(e.summary_en), '') = ''
          )
        )
      order by e.last_seen_at desc
      limit $1
    `,
    [limit]
  );
  return result.rowCount || 0;
}

async function getUsageToday(pool: Pool): Promise<number> {
  const result = await pool.query<{ request_count: string }>(
    `
      select request_count::text
      from radar_summary_usage_daily
      where usage_date = current_date
        and provider = 'glm'
      limit 1
    `
  );
  return Number(result.rows[0]?.request_count || 0);
}

async function incrementUsage(pool: Pool, count = 1): Promise<void> {
  await pool.query(
    `
      insert into radar_summary_usage_daily (usage_date, provider, request_count, updated_at)
      values (current_date, 'glm', $1, now())
      on conflict (usage_date, provider) do update
      set request_count = radar_summary_usage_daily.request_count + excluded.request_count,
          updated_at = now()
    `,
    [count]
  );
}

async function claimQueue(pool: Pool, batch: number, maxAttempts: number): Promise<QueueRow[]> {
  const result = await pool.query<QueueRow>(
    `
      with to_claim as (
        select
          q.id,
          q.article_external_id,
          q.attempt_count,
          e.url,
          e.title_original,
          e.summary_original,
          e.summary_en,
          e.language
        from radar_summary_queue q
        join external_news_articles e on e.external_id = q.article_external_id
        where q.status in ('pending', 'error')
          and q.next_retry_at <= now()
          and q.attempt_count < $2
        order by q.next_retry_at asc, q.id asc
        limit $1
        for update skip locked
      )
      update radar_summary_queue q
      set status = 'processing',
          started_at = now(),
          updated_at = now()
      from to_claim c
      where q.id = c.id
      returning c.*
    `,
    [batch, maxAttempts]
  );
  return result.rows;
}

async function recordFetchLog(
  pool: Pool,
  input: {
    queueId: number;
    articleExternalId: string;
    domain: string;
    attemptCount: number;
    outcome: string;
    failureCode: string | null;
    httpStatus: number | null;
    usedFallback: boolean;
    contextSource: string | null;
    latencyMs: number | null;
  }
): Promise<void> {
  await pool.query(
    `
      insert into radar_summary_fetch_logs (
        queue_id, article_external_id, domain, attempt_count, outcome, failure_code, http_status, used_fallback, context_source, latency_ms, created_at
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, now())
    `,
    [
      input.queueId,
      input.articleExternalId,
      input.domain,
      input.attemptCount,
      input.outcome,
      input.failureCode,
      input.httpStatus,
      input.usedFallback,
      input.contextSource,
      input.latencyMs,
    ]
  );
}

export async function processRadarSummaryQueue(): Promise<RadarSummaryRunStats> {
  const pool = getPool();
  const batch = Math.max(1, readIntEnv('RADAR_SUMMARY_BATCH_SIZE', DEFAULT_BATCH_SIZE));
  const maxAttempts = Math.max(1, readIntEnv('RADAR_SUMMARY_MAX_ATTEMPTS', DEFAULT_MAX_ATTEMPTS));
  const timeoutMs = Math.max(2000, readIntEnv('RADAR_SUMMARY_TIMEOUT_MS', DEFAULT_TIMEOUT_MS));
  const maxContextChars = Math.max(500, readIntEnv('RADAR_SUMMARY_MAX_CONTEXT_CHARS', DEFAULT_MAX_CONTEXT_CHARS));
  const maxSummaryChars = Math.max(200, readIntEnv('RADAR_SUMMARY_MAX_SUMMARY_CHARS', DEFAULT_MAX_SUMMARY_CHARS));
  const glmDailyLimit = Math.max(0, readIntEnv('RADAR_SUMMARY_DAILY_GLM_LIMIT', DEFAULT_GLM_DAILY_LIMIT));
  const cooldownMinutes = Math.max(1, readIntEnv('RADAR_SUMMARY_RATE_LIMIT_COOLDOWN_MINUTES', DEFAULT_COOLDOWN_MINUTES));
  const glmApiKey = (process.env.GLM_API_KEY || '').trim();
  const glmModel = process.env.RADAR_GLM_MODEL || 'glm-4.7-flash';
  const glmApiBaseUrl = process.env.RADAR_GLM_API_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4';

  const stats: RadarSummaryRunStats = {
    seeded: 0,
    claimed: 0,
    processed: 0,
    completed: 0,
    skipped: 0,
    failed: 0,
    retryScheduled: 0,
    deferredByQuota: 0,
    cooldownDeferred: 0,
    providerUsage: { glm: 0 },
    providerErrors: {
      auth401: 0,
      rateLimited429: 0,
      badRequest400: 0,
      timeout: 0,
      upstream5xx: 0,
      unknown: 0,
    },
    fetchOutcomes: {
      success: 0,
      fallbackSuccess: 0,
      blocked: 0,
      rateLimited: 0,
      paywall: 0,
      timeout: 0,
      network: 0,
      nonHtml: 0,
      httpOther: 0,
      emptyContext: 0,
    },
    errorSamples: [],
  };

  try {
    await ensureSchema(pool);
    stats.seeded = await seedQueue(pool, Math.max(batch * 20, 200));
    const claimed = await claimQueue(pool, batch, maxAttempts);
    stats.claimed = claimed.length;

    let usageToday = await getUsageToday(pool);
    let cooldownActive = false;

    for (const row of claimed) {
      stats.processed += 1;
      const queueId = Number(row.id || 0);
      const attempt = Number(row.attempt_count || 0) + 1;
      const domain = extractDomain(row.url || '');

      if (cooldownActive) {
        await pool.query(
          `
            update radar_summary_queue
            set status = 'pending',
                next_retry_at = now() + make_interval(mins => $2),
                last_error = 'provider:rate_limited_cooldown',
                updated_at = now()
            where id = $1
          `,
          [queueId, cooldownMinutes]
        );
        stats.cooldownDeferred += 1;
        continue;
      }

      const fetchResult = await fetchContext({
        url: row.url,
        fallbackText: row.summary_original,
        timeoutMs,
        maxChars: maxContextChars,
      });
      stats.fetchOutcomes[fetchResult.outcome] += 1;

      await recordFetchLog(pool, {
        queueId,
        articleExternalId: row.article_external_id,
        domain,
        attemptCount: attempt,
        outcome: fetchResult.outcome,
        failureCode: fetchResult.outcome === 'success' || fetchResult.outcome === 'fallbackSuccess' ? null : fetchResult.outcome,
        httpStatus: fetchResult.httpStatus,
        usedFallback: fetchResult.usedFallback,
        contextSource: fetchResult.contextSource,
        latencyMs: fetchResult.latencyMs,
      });

      if (!fetchResult.context) {
        const retryable = attempt < maxAttempts && (
          fetchResult.outcome === 'timeout'
          || fetchResult.outcome === 'network'
          || fetchResult.outcome === 'rateLimited'
          || fetchResult.outcome === 'httpOther'
        );
        if (retryable) {
          const delay = Math.min(240, Math.pow(2, Math.max(0, attempt - 1)) * 5);
          await pool.query(
            `
              update radar_summary_queue
              set status = 'error',
                  attempt_count = $2,
                  next_retry_at = now() + make_interval(mins => $3),
                  last_error = $4,
                  updated_at = now()
              where id = $1
            `,
            [queueId, attempt, delay, `fetch:${fetchResult.outcome}`]
          );
          stats.retryScheduled += 1;
        } else {
          await pool.query(
            `
              update radar_summary_queue
              set status = 'skipped',
                  attempt_count = $2,
                  completed_at = now(),
                  last_error = $3,
                  updated_at = now()
              where id = $1
            `,
            [queueId, attempt, `fetch:${fetchResult.outcome}`]
          );
          stats.skipped += 1;
        }
        continue;
      }

      const needOriginal = inferNeedsSummaryOriginal(row.summary_original);
      const needEn = inferNeedsSummaryEn(row.language, row.summary_en);
      let summaryOriginal = normalizeText(row.summary_original || '');
      let summaryEn = normalizeText(row.summary_en || '');
      let provider = 'none';
      let modelUsed = '';
      let summarySource = 'article_meta';

      if (needOriginal || needEn) {
        if (!glmApiKey) {
          summaryOriginal = summaryOriginal || truncate(fetchResult.context, maxSummaryChars);
          if (!summaryEn && !needEn) summaryEn = summaryOriginal;
          summarySource = 'article_meta';
        } else if (usageToday >= glmDailyLimit) {
          await pool.query(
            `
              update radar_summary_queue
              set status = 'pending',
                  next_retry_at = now() + interval '60 minutes',
                  last_error = 'daily_quota_exhausted',
                  updated_at = now()
              where id = $1
            `,
            [queueId]
          );
          stats.deferredByQuota += 1;
          continue;
        } else {
          try {
            const glm = await requestGlmSummary({
              apiKey: glmApiKey,
              apiBaseUrl: glmApiBaseUrl,
              model: glmModel,
              prompt: buildPrompt({
                title: row.title_original || '',
                context: fetchResult.context,
                maxSummaryChars,
              }),
              timeoutMs,
            });
            provider = 'glm';
            modelUsed = glm.modelUsed;
            summarySource = 'ai_article';
            summaryOriginal = glm.summaryOriginal || summaryOriginal || truncate(fetchResult.context, maxSummaryChars);
            summaryEn = glm.summaryEn || summaryEn || summaryOriginal;
            usageToday += 1;
            stats.providerUsage.glm += 1;
            await incrementUsage(pool, 1);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const bucket = classifyProviderError(message);
            stats.providerErrors[bucket] += 1;
            addErrorSample(stats, message);

            if (bucket === 'rateLimited429') {
              cooldownActive = true;
              await pool.query(
                `
                  update radar_summary_queue
                  set status = 'pending',
                      next_retry_at = now() + make_interval(mins => $2),
                      last_error = 'provider:rate_limited_429',
                      updated_at = now()
                  where id = $1
                `,
                [queueId, cooldownMinutes]
              );
              stats.cooldownDeferred += 1;
              continue;
            }

            const retryable = attempt < maxAttempts;
            if (retryable) {
              const delay = Math.min(240, Math.pow(2, Math.max(0, attempt - 1)) * 5);
              await pool.query(
                `
                  update radar_summary_queue
                  set status = 'error',
                      attempt_count = $2,
                      next_retry_at = now() + make_interval(mins => $3),
                      last_error = $4,
                      updated_at = now()
                  where id = $1
                `,
                [queueId, attempt, delay, message.slice(0, 500)]
              );
              stats.retryScheduled += 1;
            } else {
              await pool.query(
                `
                  update radar_summary_queue
                  set status = 'error',
                      attempt_count = $2,
                      completed_at = now(),
                      last_error = $3,
                      updated_at = now()
                  where id = $1
                `,
                [queueId, attempt, message.slice(0, 500)]
              );
              stats.failed += 1;
            }
            continue;
          }
        }
      }

      const externalHash = createHash('sha256').update(String(row.article_external_id || '')).digest('hex');
      await pool.query(
        `
          update external_news_articles
          set
            summary_original = coalesce(nullif($2, ''), summary_original),
            summary_en = coalesce(nullif($3, ''), summary_en),
            summary_source = case
              when coalesce(nullif($2, ''), '') <> '' or coalesce(nullif($3, ''), '') <> ''
                then $4
              else summary_source
            end,
            summary_verified = summary_verified or (coalesce(nullif($2, ''), '') <> '' or coalesce(nullif($3, ''), '') <> ''),
            quality_score = greatest(quality_score, case when $4 = 'ai_article' then 70 else 45 end)
          where external_id = $1
             or external_id = $5
        `,
        [row.article_external_id, summaryOriginal, summaryEn, summarySource, externalHash]
      );

      await pool.query(
        `
          update radar_summary_queue
          set status = 'done',
              attempt_count = $2,
              provider = nullif($3, ''),
              model = nullif($4, ''),
              completed_at = now(),
              last_error = null,
              updated_at = now()
          where id = $1
        `,
        [queueId, attempt, provider, modelUsed]
      );
      stats.completed += 1;
    }

    return stats;
  } finally {
    await pool.end().catch(() => undefined);
  }
}
