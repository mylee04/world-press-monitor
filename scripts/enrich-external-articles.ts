import { Pool } from 'pg';

const DEFAULT_BATCH = 800;
const DEFAULT_TIMEOUT_MS = 7000;
const DEFAULT_CONCURRENCY = 16;
const DEFAULT_AI_MAX_ITEMS = 600;
const DEFAULT_AI_MIN_BODY_CHARS = 500;
const DEFAULT_AI_MODEL = 'gemini-2.0-flash-lite';
const DEFAULT_AI_CATEGORIES = 'politics,business,tech,security,climate,world,general,life,event,criminal';
const DEFAULT_TRANSLATE_LANGS = 'es';
const DEFAULT_TRANSLATE_MAX_ITEMS = 500;

const DATE_REGEXES = [
  /<meta[^>]+(?:property|name)=["']article:published_time["'][^>]+content=["']([^"']+)["'][^>]*>/i,
  /<meta[^>]+(?:property|name)=["']og:published_time["'][^>]+content=["']([^"']+)["'][^>]*>/i,
  /<meta[^>]+(?:property|name)=["']parsely-pub-date["'][^>]+content=["']([^"']+)["'][^>]*>/i,
  /<meta[^>]+(?:property|name)=["']pubdate["'][^>]+content=["']([^"']+)["'][^>]*>/i,
  /<meta[^>]+(?:property|name)=["']date["'][^>]+content=["']([^"']+)["'][^>]*>/i,
  /<time[^>]+datetime=["']([^"']+)["'][^>]*>/i,
  /"datePublished"\s*:\s*"([^"]+)"/i,
  /"dateCreated"\s*:\s*"([^"]+)"/i
];

const SUMMARY_REGEXES = [
  /<meta[^>]+(?:property|name)=["']og:description["'][^>]+content=["']([^"']+)["'][^>]*>/i,
  /<meta[^>]+(?:property|name)=["']twitter:description["'][^>]+content=["']([^"']+)["'][^>]*>/i,
  /<meta[^>]+(?:property|name)=["']description["'][^>]+content=["']([^"']+)["'][^>]*>/i
];

type Row = {
  external_id: string;
  url: string;
  publication_datetime: string;
  category: string;
  language: string | null;
  title_original: string;
  title_en: string | null;
  author_name: string | null;
  author_email: string | null;
  summary_en: string | null;
  summary_original: string | null;
  summary_source: string | null;
};

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  const parsed = Number.parseInt(raw || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function envCsvSet(name: string, fallbackCsv: string): Set<string> {
  const raw = process.env[name]?.trim() || fallbackCsv;
  return new Set(
    raw
      .split(',')
      .map((v) => v.trim().toLowerCase())
      .filter(Boolean)
  );
}

function normalizeLang(value: string | null): string {
  const raw = (value || '').trim().toLowerCase();
  if (!raw) return '';
  const base = raw.split(/[-_]/)[0] || raw;
  return base;
}

function normalizeDate(value: string): string | null {
  const ts = new Date((value || '').trim()).getTime();
  if (!Number.isFinite(ts)) return null;
  return new Date(ts).toISOString();
}

function cleanText(value: string): string {
  return (value || '')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeSummaryText(input: string): string {
  return (input || '').replace(/\s+/g, ' ').trim().slice(0, 1600);
}

function normalizeArticleText(input: string): string {
  return (input || '').replace(/\s+/g, ' ').trim().slice(0, 12000);
}

function extractJsonObject(text: string): string | null {
  const raw = (text || '').trim();
  if (!raw) return null;
  if (raw.startsWith('{') && raw.endsWith('}')) return raw;

  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) {
    const candidate = fenced[1].trim();
    if (candidate.startsWith('{') && candidate.endsWith('}')) return candidate;
  }

  const first = raw.indexOf('{');
  const last = raw.lastIndexOf('}');
  if (first >= 0 && last > first) return raw.slice(first, last + 1);
  return null;
}

function safeParseModelJson<T extends Record<string, unknown>>(text: string): T | null {
  const candidate = extractJsonObject(text);
  if (!candidate) return null;
  try {
    return JSON.parse(candidate) as T;
  } catch {
    return null;
  }
}

function parseMeta(html: string): { publicationDatetime: string | null; summary: string | null } {
  let publicationDatetime: string | null = null;
  for (const rx of DATE_REGEXES) {
    const m = html.match(rx);
    if (!m?.[1]) continue;
    const dt = normalizeDate(m[1]);
    if (dt) {
      publicationDatetime = dt;
      break;
    }
  }

  let summary: string | null = null;
  for (const rx of SUMMARY_REGEXES) {
    const m = html.match(rx);
    if (!m?.[1]) continue;
    const txt = cleanText(m[1]);
    if (txt) {
      summary = txt.slice(0, 1600);
      break;
    }
  }

  return { publicationDatetime, summary };
}

function stripHtmlForText(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, ' ')
    .replace(/<form[\s\S]*?<\/form>/gi, ' ')
    .replace(/<(\/)?(p|div|section|article|main|h1|h2|h3|h4|h5|h6|li|br|tr|td|blockquote)\b[^>]*>/gi, '\n');
}

function htmlToReadableText(html: string): string {
  return normalizeArticleText(cleanText(stripHtmlForText(html)));
}

function extractJsonLdArticleBody(html: string): string | null {
  const scriptRegex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  const bodies: string[] = [];

  const collect = (node: unknown): void => {
    if (!node) return;
    if (typeof node === 'string') return;
    if (Array.isArray(node)) {
      node.forEach((item) => collect(item));
      return;
    }
    if (typeof node !== 'object') return;
    const obj = node as Record<string, unknown>;
    const articleBody = obj.articleBody;
    if (typeof articleBody === 'string') {
      const cleaned = normalizeArticleText(cleanText(articleBody));
      if (cleaned.length >= 200) bodies.push(cleaned);
    }
    Object.values(obj).forEach((value) => collect(value));
  };

  let match: RegExpExecArray | null = null;
  while ((match = scriptRegex.exec(html))) {
    const raw = (match[1] || '').trim();
    if (!raw) continue;
    try {
      collect(JSON.parse(raw));
    } catch {
      // Ignore malformed JSON-LD blocks.
    }
  }

  if (!bodies.length) return null;
  bodies.sort((a, b) => b.length - a.length);
  return bodies[0];
}

function extractArticleText(html: string): string {
  const candidates: string[] = [];

  const jsonLdBody = extractJsonLdArticleBody(html);
  if (jsonLdBody) candidates.push(jsonLdBody);

  const articleRegex = /<article\b[\s\S]*?<\/article>/gi;
  let articleMatch: RegExpExecArray | null = null;
  let articleCount = 0;
  while ((articleMatch = articleRegex.exec(html)) && articleCount < 8) {
    const text = htmlToReadableText(articleMatch[0]);
    if (text.length >= 300) candidates.push(text);
    articleCount += 1;
  }

  const mainRegex = /<main\b[\s\S]*?<\/main>/gi;
  let mainMatch: RegExpExecArray | null = null;
  let mainCount = 0;
  while ((mainMatch = mainRegex.exec(html)) && mainCount < 6) {
    const text = htmlToReadableText(mainMatch[0]);
    if (text.length >= 300) candidates.push(text);
    mainCount += 1;
  }

  const contentRegex =
    /<(?:div|section)[^>]+(?:id|class)=["'][^"']*(?:article-body|story-body|entry-content|post-content|content-body|article-content|c-article-body|article__content|article__body)[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|section)>/gi;
  let contentMatch: RegExpExecArray | null = null;
  let contentCount = 0;
  while ((contentMatch = contentRegex.exec(html)) && contentCount < 10) {
    const text = htmlToReadableText(contentMatch[1] || '');
    if (text.length >= 240) candidates.push(text);
    contentCount += 1;
  }

  const bodyMatch = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch?.[1]) {
    const text = htmlToReadableText(bodyMatch[1]);
    if (text.length >= 300) candidates.push(text);
  }

  if (!candidates.length) return '';
  candidates.sort((a, b) => b.length - a.length);
  return candidates[0];
}

function parseJsonLdAuthor(html: string): { authorName: string | null; authorEmail: string | null } {
  const scriptRegex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;

  function traverse(node: any): { name: string | null; email: string | null } {
    if (!node || typeof node !== 'object') return { name: null, email: null };
    if (Array.isArray(node)) {
      for (const child of node) {
        const found = traverse(child);
        if (found.name || found.email) return found;
      }
      return { name: null, email: null };
    }

    const author = (node as any).author;
    if (author) {
      const found = traverse(author);
      if (found.name || found.email) return found;
    }

    const name = typeof (node as any).name === 'string' ? cleanText((node as any).name) : null;
    const emailRaw =
      typeof (node as any).email === 'string'
        ? (node as any).email
        : typeof (node as any).contactPoint?.email === 'string'
          ? (node as any).contactPoint.email
          : null;
    const email = emailRaw ? emailRaw.replace(/^mailto:/i, '').trim().toLowerCase() : null;

    if (name || email) return { name: name || null, email: email || null };

    for (const value of Object.values(node)) {
      const nested = traverse(value);
      if (nested.name || nested.email) return nested;
    }
    return { name: null, email: null };
  }

  while ((match = scriptRegex.exec(html)) !== null) {
    const raw = (match[1] || '').trim();
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      const found = traverse(parsed);
      if (found.name || found.email) {
        return { authorName: found.name, authorEmail: found.email };
      }
    } catch {
      continue;
    }
  }

  return { authorName: null, authorEmail: null };
}

function parseAuthorMeta(html: string): { authorName: string | null; authorEmail: string | null } {
  const authorMetaRegexes = [
    /<meta[^>]+(?:name|property)=["']author["'][^>]+content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]+(?:name|property)=["']article:author["'][^>]+content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]+(?:name|property)=["']parsely-author["'][^>]+content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]+(?:name|property)=["']byl["'][^>]+content=["']([^"']+)["'][^>]*>/i
  ];
  let authorName: string | null = null;
  for (const rx of authorMetaRegexes) {
    const m = html.match(rx);
    if (m?.[1]) {
      const txt = cleanText(m[1]).replace(/^by\s+/i, '').trim();
      if (txt) {
        authorName = txt.slice(0, 160);
        break;
      }
    }
  }

  const mailtoMatch = html.match(/mailto:([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i);
  const inlineEmailMatch = html.match(/\b([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})\b/i);
  const authorEmail = (mailtoMatch?.[1] || inlineEmailMatch?.[1] || '').toLowerCase() || null;

  if (!authorName) {
    const byline = html.match(/<[^>]+class=["'][^"']*(?:byline|author|article-author)[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i);
    if (byline?.[1]) {
      const txt = cleanText(byline[1]).replace(/^by\s+/i, '').trim();
      if (txt) authorName = txt.slice(0, 160);
    }
  }

  return { authorName, authorEmail };
}

function shouldUseAiForCategory(category: string, allowed: Set<string>): boolean {
  const normalized = (category || '').trim().toLowerCase();
  return normalized.length > 0 && allowed.has(normalized);
}

async function fetchHtml(url: string, timeoutMs: number): Promise<string | null> {
  let t: ReturnType<typeof setTimeout> | null = null;
  try {
    const ctrl = new AbortController();
    t = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'PressLabBot/1.0 (+https://presslab.local)',
        Accept: 'text/html,application/xhtml+xml'
      }
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    if (t) clearTimeout(t);
  }
}

async function generateGeminiSummary(params: {
  apiKey: string;
  model: string;
  title: string;
  language: string | null;
  category: string;
  sourceUrl: string;
  articleText: string;
  metaSummary: string | null;
}): Promise<{ summaryOriginal: string | null; summaryEn: string | null }> {
  const languageHint =
    params.language === 'es' ? 'Spanish' : params.language === 'en' ? 'English' : 'same language as title';

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    params.model
  )}:generateContent?key=${encodeURIComponent(params.apiKey)}`;

  const prompt = [
    'You are a newsroom summarizer.',
    'Return ONLY valid JSON object with keys: summary_original, summary_en.',
    'Rules:',
    '- Keep each summary to 2 concise factual sentences.',
    '- No speculation. No clickbait.',
    '- Prioritize facts from article body. Ignore promotional snippets.',
    '- summary_original should be in the article language.',
    '- summary_en should be in English.',
    `Language hint: ${languageHint}.`,
    `Category: ${params.category}.`,
    `URL: ${params.sourceUrl}`,
    `Title: ${params.title}`,
    `Meta summary (fallback context): ${(params.metaSummary || '').slice(0, 1000)}`,
    `Article body (clean text, may be truncated): ${params.articleText.slice(0, 12000)}`
  ].join('\n');

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: 'application/json'
      }
    })
  });

  if (!res.ok) return { summaryOriginal: null, summaryEn: null };
  const data = (await res.json()) as any;
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text || typeof text !== 'string') return { summaryOriginal: null, summaryEn: null };

  const parsed = safeParseModelJson<{ summary_original?: string; summary_en?: string }>(text);
  if (!parsed) {
    return { summaryOriginal: null, summaryEn: null };
  }
  return {
    summaryOriginal: normalizeSummaryText(parsed.summary_original || ''),
    summaryEn: normalizeSummaryText(parsed.summary_en || '')
  };
}

async function translateToEnglishGemini(params: {
  apiKey: string;
  model: string;
  titleOriginal: string;
  summaryOriginal: string | null;
}): Promise<{ titleEn: string | null; summaryEn: string | null }> {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    params.model
  )}:generateContent?key=${encodeURIComponent(params.apiKey)}`;

  const prompt = [
    'You are a newsroom translation assistant.',
    'Return ONLY valid JSON with keys: title_en, summary_en.',
    'Translate into natural journalistic English.',
    'Do not add facts not present in input.',
    `Title original: ${params.titleOriginal}`,
    `Summary original: ${params.summaryOriginal || ''}`
  ].join('\n');

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: 'application/json'
      }
    })
  });

  if (!res.ok) return { titleEn: null, summaryEn: null };
  const data = (await res.json()) as any;
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text || typeof text !== 'string') return { titleEn: null, summaryEn: null };

  const parsed = safeParseModelJson<{ title_en?: string; summary_en?: string }>(text);
  if (!parsed) {
    return { titleEn: null, summaryEn: null };
  }
  const titleEn = normalizeSummaryText(parsed.title_en || '');
  const summaryEn = normalizeSummaryText(parsed.summary_en || '');
  return {
    titleEn: titleEn || null,
    summaryEn: summaryEn || null
  };
}

async function runWithConcurrency<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  let i = 0;
  async function lane(): Promise<void> {
    while (i < items.length) {
      const idx = i;
      i += 1;
      await worker(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => lane()));
}

async function main(): Promise<void> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error('Missing DATABASE_URL');
  }
  const batch = envInt('EXTERNAL_ENRICH_BATCH', DEFAULT_BATCH);
  const timeoutMs = envInt('EXTERNAL_ENRICH_TIMEOUT_MS', DEFAULT_TIMEOUT_MS);
  const concurrency = envInt('EXTERNAL_ENRICH_CONCURRENCY', DEFAULT_CONCURRENCY);
  const aiMaxItems = envInt('EXTERNAL_ENRICH_AI_MAX_ITEMS', DEFAULT_AI_MAX_ITEMS);
  const aiMinBodyChars = envInt('EXTERNAL_ENRICH_AI_MIN_BODY_CHARS', DEFAULT_AI_MIN_BODY_CHARS);
  const aiEnabled = (process.env.EXTERNAL_ENRICH_AI_ENABLED || 'true').toLowerCase() !== 'false';
  const aiKey = process.env.GEMINI_API_KEY || '';
  const aiModel = process.env.GEMINI_MODEL || DEFAULT_AI_MODEL;
  const aiCategories = envCsvSet('EXTERNAL_ENRICH_AI_CATEGORIES', DEFAULT_AI_CATEGORIES);
  const translateEnabled = (process.env.EXTERNAL_ENRICH_TRANSLATE_ENABLED || 'true').toLowerCase() !== 'false';
  const translateLangs = envCsvSet('EXTERNAL_ENRICH_TRANSLATE_LANGS', DEFAULT_TRANSLATE_LANGS);
  const translateMaxItems = envInt('EXTERNAL_ENRICH_TRANSLATE_MAX_ITEMS', DEFAULT_TRANSLATE_MAX_ITEMS);
  const canUseAi = aiEnabled && Boolean(aiKey);
  const canTranslate = translateEnabled && Boolean(aiKey);

  const pool = new Pool({ connectionString: dbUrl });
  try {
    const rowsRes = await pool.query<Row>(
      `
      select external_id, url, publication_datetime, category, language, title_original, title_en, author_name, author_email, summary_en, summary_original, summary_source
      from external_news_articles
      where last_seen_at > now() - interval '24 hours'
        and (
          publication_verified = false
          or summary_verified = false
          or author_verified = false
          or author_name is null
          or summary_original is null
          or btrim(summary_original) = ''
          or (
            language is not null
            and btrim(language) <> ''
            and lower(language) not like 'en%'
            and (
              title_en is null
              or btrim(title_en) = ''
              or summary_en is null
              or btrim(summary_en) = ''
            )
          )
          or coalesce(summary_source, 'feed') <> 'ai_article'
        )
      order by
        case when
          language is not null
          and btrim(language) <> ''
          and lower(language) not like 'en%'
          and (
            title_en is null
            or btrim(title_en) = ''
            or summary_en is null
            or btrim(summary_en) = ''
          ) then 0 else 1 end,
        case when coalesce(summary_source, 'feed') <> 'ai_article' then 0 else 1 end,
        last_seen_at desc
      limit $1
    `,
      [batch]
    );

    const rows = rowsRes.rows;
    if (!rows.length) {
      console.log('[enrich-external] nothing to enrich');
      return;
    }

    let updated = 0;
    let attempted = 0;
    let aiAttempted = 0;
    let aiUpdated = 0;
    let translationAttempted = 0;
    let translationUpdated = 0;

    await runWithConcurrency(rows, concurrency, async (row) => {
      attempted += 1;
      const html = await fetchHtml(row.url, timeoutMs);
      if (!html) return;
      const meta = parseMeta(html);
      const articleText = extractArticleText(html);
      const authorMeta = parseAuthorMeta(html);
      const authorJsonLd = parseJsonLdAuthor(html);

      const nextPub = meta.publicationDatetime || row.publication_datetime;
      let nextSummaryOriginal = meta.summary || row.summary_original || null;
      const baseLang = normalizeLang(row.language);
      let nextSummaryEn = row.summary_en || null;
      let nextTitleEn = row.title_en || (baseLang === 'en' ? row.title_original : null);
      const nextAuthorName =
        authorJsonLd.authorName
        || authorMeta.authorName
        || row.author_name
        || null;
      const nextAuthorEmail =
        authorJsonLd.authorEmail
        || authorMeta.authorEmail
        || row.author_email
        || null;

      const eligibleForAi =
        canUseAi
        && aiAttempted < aiMaxItems
        && shouldUseAiForCategory(row.category, aiCategories)
        && articleText.length >= aiMinBodyChars
        && (
          !nextSummaryOriginal
          || nextSummaryOriginal.length < 120
          || (row.summary_source || '') !== 'ai_article'
        );

      let aiSummaryUsed = false;
      if (eligibleForAi) {
        aiAttempted += 1;
        const ai = await generateGeminiSummary({
          apiKey: aiKey,
          model: aiModel,
          title: row.title_original,
          language: row.language,
          category: row.category,
          sourceUrl: row.url,
          articleText,
          metaSummary: meta.summary
        }).catch(() => ({ summaryOriginal: null, summaryEn: null }));

        if (ai.summaryOriginal || ai.summaryEn) {
          nextSummaryOriginal = ai.summaryOriginal || nextSummaryOriginal;
          nextSummaryEn = ai.summaryEn || nextSummaryEn;
          aiSummaryUsed = true;
          aiUpdated += 1;
        }
      }

      const eligibleForTranslation =
        canTranslate
        && translationAttempted < translateMaxItems
        && Boolean(baseLang)
        && baseLang !== 'en'
        && translateLangs.has(baseLang)
        && (!nextSummaryEn || !nextTitleEn);

      if (eligibleForTranslation) {
        translationAttempted += 1;
        const tr = await translateToEnglishGemini({
          apiKey: aiKey,
          model: aiModel,
          titleOriginal: row.title_original,
          summaryOriginal: nextSummaryOriginal
        }).catch(() => ({ titleEn: null, summaryEn: null }));

        if (tr.titleEn || tr.summaryEn) {
          nextTitleEn = tr.titleEn || nextTitleEn;
          nextSummaryEn = tr.summaryEn || nextSummaryEn;
          translationUpdated += 1;
        }
      }

      const pubVerified = Boolean(meta.publicationDatetime);
      const summaryFromMeta = Boolean(meta.summary && meta.summary.length >= 120);
      const summaryFromBody = Boolean(nextSummaryOriginal && nextSummaryOriginal.length >= 120);
      const summaryVerified = aiSummaryUsed || summaryFromMeta || summaryFromBody;
      const authorVerified = Boolean(nextAuthorName || nextAuthorEmail);
      const summarySource = aiSummaryUsed
        ? 'ai_article'
        : summaryFromMeta
        ? 'article_meta'
        : summaryFromBody
        ? 'ai_summary'
        : (row.summary_source || 'feed');
      const authorSource = authorVerified ? 'article_meta' : 'feed';
      const qualityScore = (pubVerified ? 45 : 25) + (aiSummaryUsed ? 45 : (summaryVerified ? 30 : 15)) + (authorVerified ? 10 : 0);

      await pool.query(
        `
        update external_news_articles
        set publication_datetime = $2,
            publication_source = case when $3 then 'article_meta' else publication_source end,
            publication_verified = publication_verified or $3,
            summary_original = coalesce(nullif($4, ''), summary_original),
            summary_en = coalesce(nullif($5, ''), summary_en),
            summary_source = case when $6 then $7 else summary_source end,
            summary_verified = summary_verified or $6,
            quality_score = greatest(quality_score, $8),
            title_en = coalesce(nullif($9, ''), title_en),
            author_name = coalesce(nullif($10, ''), author_name),
            author_email = coalesce(nullif($11, ''), author_email),
            author_source = case when $12 then $13 else author_source end,
            author_verified = author_verified or $12,
            last_seen_at = now()
        where external_id = $1
        `,
        [
          row.external_id,
          nextPub,
          pubVerified,
          nextSummaryOriginal || '',
          nextSummaryEn || '',
          summaryVerified,
          summarySource,
          qualityScore,
          nextTitleEn || '',
          nextAuthorName || '',
          nextAuthorEmail || '',
          authorVerified,
          authorSource
        ]
      );
      updated += 1;
    });

    console.log(
      `[enrich-external] attempted=${attempted} updated=${updated} ai_attempted=${aiAttempted} ai_updated=${aiUpdated} translation_attempted=${translationAttempted} translation_updated=${translationUpdated} batch=${rows.length} concurrency=${concurrency} ai_enabled=${canUseAi} translate_enabled=${canTranslate}`
    );
  } finally {
    await pool.end();
  }
}

void main();
