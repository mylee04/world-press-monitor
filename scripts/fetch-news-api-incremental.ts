import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

type CursorState = {
  lastTo: string;
  processedAt: string;
};

type ApiNewsItem = {
  id: string;
  source: string;
  title: string;
  snippet: string | null;
  url: string;
  country: string | null;
  language: string | null;
  section: string | null;
  publicationDatetime: string;
  createdAt: string;
  updatedAt: string;
};

type ApiNewsResponse = {
  storage: 'postgres' | 'disabled';
  generatedAt: string | null;
  params: {
    limit: number;
    offset: number;
    hours?: number;
    from?: string | null;
    to?: string | null;
    sources: string[];
    countries: string[];
    sections: string[];
  };
  items: ApiNewsItem[];
  reason?: string;
};

function toIsoDate(value: string, fallback: Date): string {
  const parsed = new Date(value);
  if (Number.isFinite(parsed.getTime())) {
    return parsed.toISOString();
  }
  return fallback.toISOString();
}

function numberEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  const parsed = Number(raw);
  if (!raw || !Number.isFinite(parsed)) return fallback;
  return parsed;
}

function listFromEnv(name: string): string[] {
  const raw = process.env[name] || '';
  return [...new Set(
    raw
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
  )];
}

async function loadState(statePath: string, fallbackFrom: string): Promise<CursorState> {
  if (!existsSync(statePath)) {
    return {
      lastTo: fallbackFrom,
      processedAt: new Date().toISOString()
    };
  }

  try {
    const raw = await readFile(statePath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<CursorState>;
    const lastTo = parsed.lastTo || fallbackFrom;
    const processedAt = parsed.processedAt || new Date().toISOString();
    return { lastTo, processedAt };
  } catch {
    return {
      lastTo: fallbackFrom,
      processedAt: new Date().toISOString()
    };
  }
}

async function saveState(statePath: string, state: CursorState): Promise<void> {
  await writeFile(statePath, `${JSON.stringify(state)}\n`, 'utf8');
}

function buildQuery(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    search.set(key, String(value));
  }
  return search.toString();
}

async function main() {
  const base = process.env.NEWS_API_BASE_URL || 'http://127.0.0.1:4100';
  const token = process.env.NEWS_API_TOKEN || '';
  const countryFilters = listFromEnv('NEWS_API_COUNTRY_FILTER');
  const sourceFilters = listFromEnv('NEWS_API_SOURCE_FILTER');
  const sectionFilters = listFromEnv('NEWS_API_SECTION_FILTER');
  const limit = Math.max(1, Math.min(200, numberEnv('NEWS_API_PAGE_LIMIT', 100)));
  const overlapSeconds = Math.max(0, numberEnv('NEWS_API_OVERLAP_SECONDS', 120));
  const runMode = (process.env.NEWS_API_OUTPUT_MODE || 'json').toLowerCase();
  const stateFile = process.env.NEWS_API_CURSOR_FILE || join(process.cwd(), '.wpm-news-api-cursor.json');

  const fallbackFromDate = new Date(Date.now() - 60 * 60 * 1000);
  const state = await loadState(stateFile, fallbackFromDate.toISOString());
  const toDate = new Date();
  const fromDate = new Date(new Date(state.lastTo).getTime() - overlapSeconds * 1000);

  const paramsBase = {
    ...(countryFilters.length ? { country: countryFilters.join(',') } : {}),
    ...(sourceFilters.length ? { source: sourceFilters.join(',') } : {}),
    ...(sectionFilters.length ? { section: sectionFilters.join(',') } : {}),
    from: toIsoDate(fromDate.toISOString(), fallbackFromDate),
    to: toIsoDate(toDate.toISOString(), toDate),
    limit
  };

  const headers: Record<string, string> = {};
  if (token) {
    headers.authorization = `Bearer ${token}`;
  }

  let offset = 0;
  let maxCreatedAt: string | null = null;
  const seen = new Set<string>();
  const collected: ApiNewsItem[] = [];

  while (true) {
    const query = buildQuery({
      ...paramsBase,
      offset
    });
    const endpoint = `${base.replace(/\/+$/, '')}/api/news?${query}`;
    const response = await fetch(endpoint, { headers });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`API request failed ${response.status}: ${body}`);
    }

    const payload = (await response.json()) as ApiNewsResponse;
    if (payload.storage === 'disabled') {
      throw new Error(payload.reason || 'API storage unavailable');
    }

    const batch = payload.items.filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });

    if (runMode === 'ndjson') {
      for (const item of batch) {
        console.log(JSON.stringify(item));
      }
    } else if (batch.length > 0) {
      collected.push(...batch);
    }

    for (const item of batch) {
      if (!maxCreatedAt || new Date(item.createdAt).getTime() > new Date(maxCreatedAt).getTime()) {
        maxCreatedAt = item.createdAt;
      }
    }

    if (batch.length < limit) {
      break;
    }
    offset += limit;
  }

  if (runMode === 'json') {
    console.log(JSON.stringify({ items: collected }, null, 2));
  } else if (runMode === 'summary') {
    for (const item of collected) {
      console.log(`${item.createdAt}\t${item.source}\t${item.title}\t${item.url}`);
    }
  }

  if (!maxCreatedAt) {
    maxCreatedAt = toIsoDate(state.lastTo, toDate);
  }

  await saveState(stateFile, {
    lastTo: maxCreatedAt,
    processedAt: new Date().toISOString()
  });

  console.log(`saved cursor => ${stateFile}`);
  console.log(`window: ${paramsBase.from} ~ ${paramsBase.to}`);
  console.log(`fetched: ${collected.length}`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[fetch-news-api-incremental] ${message}`);
  process.exit(1);
});
