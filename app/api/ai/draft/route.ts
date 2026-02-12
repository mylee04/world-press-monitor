import type { DraftRecord } from '@/lib/pipeline';

export const runtime = 'edge';

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_FIRECRAWL_BASE_URL = 'https://api.firecrawl.dev/v1';
const DEFAULT_GLM_BASE_URL = 'https://open.bigmodel.cn/api/paas/v4';

type DraftRequest = {
  title?: string;
  source?: string;
  link?: string;
  publishedAt?: string;
};

type DraftResponse = {
  headlineEs: string;
  bodyEs: string;
};

function fallbackDraft(payload: Required<Omit<DraftRequest, 'publishedAt'>> & { publishedAt: string }): DraftResponse {
  const dateLabel = payload.publishedAt ? new Date(payload.publishedAt).toISOString() : new Date().toISOString();
  return {
    headlineEs: payload.title,
    bodyEs: [
      `${payload.source} reportó una noticia de última hora.`,
      '',
      `Titular original: ${payload.title}`,
      `Fuente: ${payload.source}`,
      `Publicado: ${dateLabel}`,
      `Enlace: ${payload.link}`,
      '',
      'Borrador inicial en español. Verificar hechos y contexto antes de publicar.'
    ].join('\n')
  };
}

function sanitize(text: string): string {
  return text.replace(/\r/g, '').trim();
}

function envFlag(name: string, fallback = false): boolean {
  const raw = (process.env[name] || '').trim().toLowerCase();
  if (!raw) return fallback;
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

function envInt(name: string, fallback: number, min: number, max: number): number {
  const parsed = Number(process.env[name] || fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function parseCsvSet(value: string): Set<string> {
  return new Set(
    (value || '')
      .split(',')
      .map((v) => v.trim().toLowerCase())
      .filter(Boolean)
  );
}

function extractDomain(link: string): string {
  try {
    return new URL(link).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

function normalizeText(value: string): string {
  return (value || '').replace(/\s+/g, ' ').trim();
}

function truncate(value: string, maxChars: number): string {
  const text = value || '';
  if (text.length <= maxChars) return text;
  return text.slice(0, Math.max(0, maxChars - 1)).trimEnd() + '…';
}

function safeParseJsonObject(raw: string): Record<string, unknown> | null {
  const text = (raw || '').trim();
  if (!text) return null;
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  } catch {
    // Best-effort salvage if model returns extra text.
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        const parsed = JSON.parse(text.slice(start, end + 1));
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
      } catch {
        return null;
      }
    }
  }
  return null;
}

function firecrawlScrapeUrl(baseUrl: string): string {
  const base = (baseUrl || DEFAULT_FIRECRAWL_BASE_URL).replace(/\/+$/, '');
  if (base.endsWith('/scrape')) return base;
  if (base.endsWith('/v1')) return `${base}/scrape`;
  return `${base}/v1/scrape`;
}

async function fetchFullTextViaFirecrawl(input: {
  apiKey: string;
  baseUrl: string;
  url: string;
  timeoutMs: number;
  maxChars: number;
}): Promise<{ text: string | null; error?: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs);
  try {
    const response = await fetch(firecrawlScrapeUrl(input.baseUrl), {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${input.apiKey}`,
      },
      body: JSON.stringify({
        url: input.url,
        formats: ['markdown', 'text'],
        onlyMainContent: true,
      }),
    });
    const json = await response.json().catch(() => null) as any;
    if (!response.ok) {
      const msg = typeof json?.error === 'string' ? json.error : `firecrawl_http_${response.status}`;
      return { text: null, error: msg };
    }

    // Tolerate multiple Firecrawl response shapes.
    const data = json?.data ?? json?.result ?? json;
    const candidates: string[] = [];
    for (const key of ['markdown', 'content', 'text', 'html']) {
      const value = data?.[key];
      if (typeof value === 'string' && value.trim()) candidates.push(value);
    }
    const picked = candidates.sort((a, b) => b.length - a.length)[0] || '';
    const normalized = normalizeText(picked.replace(/<[^>]+>/g, ' '));
    if (normalized.length < 600) {
      return { text: null, error: 'firecrawl_empty_or_short' };
    }
    return { text: truncate(normalized, input.maxChars) };
  } catch (error) {
    const msg = error instanceof Error && error.name === 'AbortError' ? 'firecrawl_timeout' : 'firecrawl_network';
    return { text: null, error: msg };
  } finally {
    clearTimeout(timeout);
  }
}

async function requestGlmDraft(input: {
  apiKey: string;
  baseUrl: string;
  model: string;
  title: string;
  source: string;
  link: string;
  publishedAt: string;
  context: string;
  timeoutMs: number;
}): Promise<DraftResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs);
  try {
    const response = await fetch(`${(input.baseUrl || DEFAULT_GLM_BASE_URL).replace(/\/+$/, '')}/chat/completions`, {
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
          {
            role: 'system',
            content: [
              'You are a LATAM newsroom editor writing Spanish neutral.',
              'Do NOT translate or copy sentences verbatim; restate facts in your own words.',
              'Avoid direct quotes. If facts are uncertain, say so explicitly.',
              'Return strict JSON only with keys: headlineEs, bodyEs.',
              'bodyEs should be 2-5 short paragraphs.'
            ].join(' '),
          },
          {
            role: 'user',
            content: [
              `Title: ${input.title}`,
              `Source: ${input.source}`,
              `PublishedAt: ${input.publishedAt || 'unknown'}`,
              `Link: ${input.link}`,
              '',
              'Context (publicly retrievable):',
              input.context,
            ].join('\n'),
          },
        ],
      }),
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`glm_http_${response.status}: ${text.slice(0, 200)}`);
    }

    let parsed: Record<string, unknown> | null = null;
    try {
      const top = JSON.parse(text) as any;
      if (top && typeof top === 'object') {
        if (typeof top.headlineEs === 'string' || typeof top.bodyEs === 'string') {
          parsed = top as Record<string, unknown>;
        } else {
          const content = top?.choices?.[0]?.message?.content;
          if (typeof content === 'string') parsed = safeParseJsonObject(content);
        }
      }
    } catch {
      parsed = safeParseJsonObject(text);
    }

    const headlineEs = sanitize(String(parsed?.headlineEs || ''));
    const bodyEs = sanitize(String(parsed?.bodyEs || ''));
    if (!headlineEs || !bodyEs) {
      throw new Error('glm_empty_draft');
    }
    return { headlineEs, bodyEs };
  } finally {
    clearTimeout(timeout);
  }
}

export async function POST(req: Request): Promise<Response> {
  const body = await req.json().catch(() => null) as DraftRequest | null;
  const title = sanitize(body?.title || '');
  const source = sanitize(body?.source || '');
  const link = sanitize(body?.link || '');
  const publishedAt = sanitize(body?.publishedAt || '');

  if (!title || !source || !link) {
    return Response.json({ error: 'title, source, link are required' }, { status: 400 });
  }

  const fallback = fallbackDraft({ title, source, link, publishedAt });

  // Breaking-only fulltext (no storage): Firecrawl -> GLM.
  // Policy: no paywall/bot-protection bypass. If blocked/short/failed, fall back to existing logic.
  const fulltextEnabled = envFlag('WRITING_FULLTEXT_ENABLED', false);
  const allowedDomains = parseCsvSet(process.env.WRITING_FULLTEXT_ALLOWED_DOMAINS || '');
  const domain = extractDomain(link);
  const firecrawlKey = (process.env.FIRECRAWL_API_KEY || '').trim();
  const glmKey = (process.env.GLM_API_KEY || '').trim();
  const shouldTryFulltext =
    fulltextEnabled
    && Boolean(domain)
    && allowedDomains.size > 0
    && allowedDomains.has(domain)
    && Boolean(firecrawlKey)
    && Boolean(glmKey);

  if (shouldTryFulltext) {
    try {
      const timeoutMs = envInt('WRITING_FULLTEXT_TIMEOUT_MS', 15000, 2000, 60000);
      const maxChars = envInt('WRITING_FULLTEXT_MAX_CHARS', 12000, 2000, 40000);
      const firecrawlBase = (process.env.FIRECRAWL_API_BASE_URL || DEFAULT_FIRECRAWL_BASE_URL).trim();
      const glmBase = (process.env.RADAR_GLM_API_BASE_URL || DEFAULT_GLM_BASE_URL).trim();
      const glmModel = (process.env.WRITING_GLM_MODEL || process.env.RADAR_GLM_MODEL || 'glm-4.7-flash').trim();

      const scraped = await fetchFullTextViaFirecrawl({
        apiKey: firecrawlKey,
        baseUrl: firecrawlBase,
        url: link,
        timeoutMs,
        maxChars,
      });

      if (scraped.text) {
        const draft = await requestGlmDraft({
          apiKey: glmKey,
          baseUrl: glmBase,
          model: glmModel,
          title,
          source,
          link,
          publishedAt,
          context: scraped.text,
          timeoutMs,
        });
        return Response.json({ ...draft, source: 'glm_fulltext' });
      }
    } catch {
      // Fall through to existing path.
    }
  }

  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) {
    return Response.json({ ...fallback, source: 'fallback' });
  }

  const system = [
    'Eres redactor de una agencia de noticias latinoamericana.',
    'Escribe en español neutro, estilo informativo, sin especulación.',
    'Devuelve JSON estricto con keys: headlineEs, bodyEs.',
    'El body debe ser un borrador breve de 2-4 párrafos.'
  ].join(' ');

  const userPrompt = [
    `Title: ${title}`,
    `Source: ${source}`,
    `PublishedAt: ${publishedAt || 'unknown'}`,
    `Link: ${link}`,
    'Crea un borrador periodístico en español usando solo los datos disponibles.',
    'Si faltan datos, dilo explícitamente y no inventes.'
  ].join('\n');

  try {
    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${groqKey}`
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userPrompt }
        ]
      })
    });
    if (!response.ok) {
      return Response.json({ ...fallback, source: 'fallback' });
    }
    const json = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const raw = json.choices?.[0]?.message?.content || '';
    const parsed = JSON.parse(raw) as Partial<DraftResponse>;
    const headlineEs = sanitize(parsed.headlineEs || fallback.headlineEs);
    const bodyEs = sanitize(parsed.bodyEs || fallback.bodyEs);
    return Response.json({ headlineEs, bodyEs, source: 'llm' });
  } catch {
    return Response.json({ ...fallback, source: 'fallback' });
  }
}
