import type { NewsSection, SectionClassification } from '@/lib/types';

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_GROQ_MODEL = 'llama-3.1-8b-instant';
const DEFAULT_TRIGGER_CONFIDENCE = 0.72;
const DEFAULT_AI_MIN_CONFIDENCE = 0.58;
const CLASSIFY_MAX_TITLE_CHARS = 260;
const CLASSIFY_MAX_SUMMARY_CHARS = 1800;

type ClassifyParams = {
  title: string;
  fallbackSection?: NewsSection;
  summary?: string;
};

type CachedSectionClassification = {
  result: SectionClassification;
  expiresAt: number;
};

const AI_CLASSIFIER_CACHE = new Map<string, CachedSectionClassification>();

const SHOULD_USE_AI_CLASSIFIER = (process.env.BEAT_CLASSIFIER_ENABLED || 'true').toLowerCase() !== 'false';
const AI_TRIGGER_CONFIDENCE = clampEnvFloat('BEAT_CLASSIFIER_TRIGGER_CONFIDENCE', DEFAULT_TRIGGER_CONFIDENCE, 0.0, 0.99);
const AI_MIN_CONFIDENCE = clampEnvFloat('BEAT_CLASSIFIER_MIN_AI_CONFIDENCE', DEFAULT_AI_MIN_CONFIDENCE, 0.01, 1.0);
const AI_CACHE_TTL_MS = envInt('BEAT_CLASSIFIER_CACHE_TTL_MS', 6 * 60 * 60 * 1000, 60 * 60 * 1000);
const AI_TIMEOUT_MS = envInt('BEAT_CLASSIFIER_AI_TIMEOUT_MS', 3500, 500);
const AI_CONCURRENCY = Math.max(1, Math.min(64, envInt('BEAT_CLASSIFIER_AI_CONCURRENCY', 8, 1, 64)));

let aiConcurrentCalls = 0;
const aiCallQueue: Array<() => void> = [];

type KeywordMap = Record<string, NewsSection>;

const HIGH_PRIORITY: KeywordMap = {
  election: 'politics',
  elections: 'politics',
  vote: 'politics',
  voting: 'politics',
  parliament: 'politics',
  senate: 'politics',
  congress: 'politics',
  governor: 'politics',
  mayor: 'politics',
  minister: 'politics',
  president: 'politics',
  ministry: 'politics',
  policy: 'politics',
  sanctions: 'politics',
  ceasefire: 'politics',
  tariff: 'business',
  inflation: 'business',
  cpi: 'business',
  recession: 'business',
  gdp: 'business',
  rates: 'business',
  jobs: 'business',
  employment: 'business',
  layoffs: 'business',
  earnings: 'business',
  stocks: 'business',
  market: 'business',
  markets: 'business',
  oil: 'business',
  gas: 'business',
  bitcoin: 'business',
  ai: 'tech',
  llm: 'tech',
  chip: 'tech',
  chips: 'tech',
  startup: 'tech',
  startups: 'tech',
  software: 'tech',
  cloud: 'tech',
  semiconductors: 'tech',
  datacenter: 'tech',
  datacenters: 'tech',
  cybersecurity: 'security',
  ransomware: 'security',
  malware: 'security',
  war: 'security',
  strike: 'security',
  climate: 'climate',
  wildfire: 'climate',
  flood: 'climate',
  hurricane: 'climate',
  eleccion: 'politics',
  elecciones: 'politics',
  congreso: 'politics',
  senado: 'politics',
  presidente: 'politics',
  gobierno: 'politics',
  ministerio: 'politics',
  economia: 'business',
  inflación: 'business',
  inflacion: 'business',
  mercado: 'business',
  mercados: 'business',
  finanzas: 'business',
  negocio: 'business',
  negocios: 'business',
  bolsa: 'business',
  tecnología: 'tech',
  tecnologia: 'tech',
  ciberseguridad: 'security'
};

const MEDIUM_PRIORITY: KeywordMap = {
  regulation: 'politics',
  campaign: 'politics',
  diplomacy: 'politics',
  treaty: 'politics',
  budget: 'business',
  investment: 'business',
  revenue: 'business',
  merger: 'business',
  acquisition: 'business',
  'open source': 'tech',
  smartphone: 'tech',
  telecom: 'tech',
  breach: 'security',
  military: 'security',
  emissions: 'climate',
  drought: 'climate',
  presupuesto: 'business',
  inversión: 'business',
  inversion: 'business',
  campaña: 'politics',
  regulacion: 'politics',
  regulación: 'politics',
  nube: 'tech',
  militar: 'security'
};

const SHORT_KEYWORDS = new Set(['ai', 'war', 'gdp']);
const regexCache = new Map<string, RegExp>();

function getKeywordRegex(keyword: string): RegExp {
  let regex = regexCache.get(keyword);
  if (!regex) {
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    regex = SHORT_KEYWORDS.has(keyword) ? new RegExp(`\\b${escaped}\\b`, 'i') : new RegExp(escaped, 'i');
    regexCache.set(keyword, regex);
  }
  return regex;
}

function matchMap(title: string, map: KeywordMap): { section: NewsSection; keyword: string } | null {
  for (const [keyword, section] of Object.entries(map)) {
    if (getKeywordRegex(keyword).test(title)) {
      return { section, keyword };
    }
  }
  return null;
}

export function classifySectionByKeyword(title: string, fallbackSection: NewsSection = 'general'): SectionClassification {
  const high = matchMap(title, HIGH_PRIORITY);
  if (high) {
    return {
      section: high.section,
      confidence: 0.84,
      source: 'keyword',
      reason: `Matched high-priority keyword: ${high.keyword}`
    };
  }

  const medium = matchMap(title, MEDIUM_PRIORITY);
  if (medium) {
    return {
      section: medium.section,
      confidence: 0.72,
      source: 'keyword',
      reason: `Matched medium-priority keyword: ${medium.keyword}`
    };
  }

  return { section: fallbackSection, confidence: 0.51, source: 'keyword', reason: 'Fell back to outlet default section' };
}

export async function classifySection(params: ClassifyParams): Promise<SectionClassification> {
  const title = (params.title || '').trim();
  const summary = (params.summary || '').trim();
  const fallbackSection = params.fallbackSection || 'general';

  const keywordResult = classifySectionByKeyword(title, fallbackSection);
  if (!SHOULD_USE_AI_CLASSIFIER || !title) return keywordResult;
  if (keywordResult.confidence >= AI_TRIGGER_CONFIDENCE) return keywordResult;

  const groqKey = process.env.GROQ_API_KEY?.trim();
  if (!groqKey) return keywordResult;

  const cacheKey = buildCacheKey(title, summary, fallbackSection);
  const cached = readCache(cacheKey);
  if (cached) return cached;

  const aiResult = await withAiConcurrency(() => callGroqClassifier(groqKey, title, summary, fallbackSection));
  const finalResult = aiResult && aiResult.confidence > keywordResult.confidence ? aiResult : keywordResult;
  writeCache(cacheKey, finalResult);
  return finalResult;
}

async function withAiConcurrency<T>(fn: () => Promise<T>): Promise<T> {
  await acquireAiSlot();
  try {
    return await fn();
  } finally {
    releaseAiSlot();
  }
}

function acquireAiSlot(): Promise<void> {
  if (aiConcurrentCalls < AI_CONCURRENCY) {
    aiConcurrentCalls += 1;
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    aiCallQueue.push(resolve);
  });
}

function releaseAiSlot(): void {
  const next = aiCallQueue.shift();
  if (next) {
    next();
  } else {
    aiConcurrentCalls = Math.max(0, aiConcurrentCalls - 1);
  }
}

function envInt(name: string, fallback: number, min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY): number {
  const raw = process.env[name];
  const parsed = Number.parseInt(raw || '', 10);
  if (!Number.isFinite(parsed)) return fallback;
  const clamped = Math.max(min, Math.min(max, parsed));
  return clamped;
}

function clampEnvFloat(name: string, fallback: number, min = 0, max = 1): number {
  const raw = process.env[name];
  const parsed = Number.parseFloat(raw || '');
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function normalizeText(value: string): string {
  return value
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .slice(0, CLASSIFY_MAX_SUMMARY_CHARS);
}

function parseSection(value: string): NewsSection {
  if (value === 'politics' || value === 'business' || value === 'tech' || value === 'security' || value === 'climate' || value === 'world' || value === 'general') {
    return value;
  }
  return 'general';
}

function buildCacheKey(title: string, summary: string, fallbackSection: NewsSection): string {
  const source = `${fallbackSection}|${normalizeText(title)}|${normalizeText(summary).slice(0, CLASSIFY_MAX_SUMMARY_CHARS)}`;
  return source;
}

function readCache(key: string): SectionClassification | null {
  const entry = AI_CLASSIFIER_CACHE.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    AI_CLASSIFIER_CACHE.delete(key);
    return null;
  }
  return entry.result;
}

function writeCache(key: string, result: SectionClassification): void {
  AI_CLASSIFIER_CACHE.set(key, {
    result,
    expiresAt: Date.now() + AI_CACHE_TTL_MS
  });
  if (AI_CLASSIFIER_CACHE.size > 2000) {
    const firstKey = AI_CLASSIFIER_CACHE.keys().next().value;
    if (firstKey !== undefined) AI_CLASSIFIER_CACHE.delete(firstKey);
  }
}

async function callGroqClassifier(apiKey: string, title: string, summary: string, fallbackSection: NewsSection): Promise<SectionClassification | null> {
  const payload = {
    model: process.env.BEAT_CLASSIFIER_GROQ_MODEL || DEFAULT_GROQ_MODEL,
    temperature: 0,
    max_tokens: 180,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: [
          'Classify newsroom headlines into one section.',
          'Allowed sections: politics, business, tech, security, climate, world, general.',
          'Use the headline first, then short summary as context.',
          'Return strict JSON object only.',
          'Schema: {"section":"...","confidence":0.0,"reason":"..."}.'
        ].join(' ')
      },
      {
        role: 'user',
        content: `headline: ${normalizeText(title).slice(0, CLASSIFY_MAX_TITLE_CHARS)}\nsummary: ${normalizeText(summary) || 'n/a'}\nfallback: ${fallbackSection}`
      }
    ]
  } satisfies Record<string, unknown>;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

  try {
    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    if (!response.ok) return null;

    const data = await response.json();
    const raw = data?.choices?.[0]?.message?.content;
    const parsed = safeJsonParse(raw);
    if (!parsed) return null;

    const section = parseSection((String(parsed.section || '').toLowerCase()).trim());
    const confidence = Number(parsed.confidence);
    if (!Number.isFinite(confidence) || confidence < AI_MIN_CONFIDENCE) return null;

    return {
      section,
      confidence: Math.max(0, Math.min(1, confidence)),
      source: 'llm',
      reason: String(parsed.reason || 'LLM classified headline section')
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function safeJsonParse(value: unknown): { section?: string; confidence?: number; reason?: string } | null {
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(raw.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}
