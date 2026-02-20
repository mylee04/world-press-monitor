import {
  readNewsArticlesForApi,
  readNewsApiFilters,
  type NewsApiItem
} from '@/lib/ingestion-store';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

type NewsApiResponse = {
  storage: 'postgres' | 'disabled';
  generatedAt: string | null;
  total: number;
  params: {
    limit: number;
    offset: number;
    hours?: number;
    from?: string | null;
    to?: string | null;
    publicationFrom?: string | null;
    publicationTo?: string | null;
    sources: string[];
    countries: string[];
    sections: string[];
    languages: string[];
  };
  items: Array<NewsApiItem & { createdAt: string; updatedAt: string; publicationDatetime: string }>;
  reason?: string;
};

type NewsFiltersResponse = {
  storage: 'postgres' | 'disabled';
  reason?: string;
  filters: {
    countries: string[];
    languages: string[];
    sources: string[];
    sections: string[];
  };
};

type HealthResponse = {
  status: 'ok' | 'degraded';
  checkedAt: string;
  storage: 'postgres' | 'disabled';
  reason?: string;
};

type ApiError = {
  error: string;
  message: string;
};

function parseIntParam(value: string | null, fallback: number, min: number, max: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function parseDateParam(value: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    throw new Error('invalid-date');
  }
  return parsed.toISOString();
}

function parseListParam(value: string | null): string[] {
  if (!value) return [];
  return [...new Set(
    value
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0)
  )];
}

function getQueryList(searchParams: URLSearchParams, key: string): string[] {
  const values = searchParams.getAll(key);
  return [...new Set(values.flatMap((value) => parseListParam(value)))];
}

function corsHeaders(origin: string | null): Record<string, string> {
  const configured = process.env.NEWS_API_CORS_ORIGINS || '';
  if (!configured) return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'authorization,content-type'
  };

  const allowed = configured.split(',').map((candidate) => candidate.trim()).filter(Boolean);
  const allowAny = allowed.includes('*');
  const normalizedOrigin = origin?.trim();
  if (allowAny || (normalizedOrigin && allowed.includes(normalizedOrigin))) {
    return {
      'Access-Control-Allow-Origin': normalizedOrigin || '*',
      'Access-Control-Allow-Methods': 'GET,OPTIONS',
      'Access-Control-Allow-Headers': 'authorization,content-type'
    };
  }

  return {
    'Access-Control-Allow-Origin': 'null',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'authorization,content-type'
  };
}

type JsonResponse = {
  status: number;
  headers: Record<string, string>;
  body: string;
};

const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'PressLab News API',
    version: '1.0.0',
    description: 'Read-only API for News Articles ingested from RSS sources.'
  },
  servers: [
    {
      url: '/'
    }
  ],
  paths: {
    '/health': {
      get: {
        summary: 'Health check',
        responses: {
          200: {
            description: 'Service health'
          }
        }
      }
    },
    '/api/news': {
      get: {
        summary: 'List ingested news articles',
        parameters: [
          {
            name: 'limit',
            in: 'query',
            schema: { type: 'integer', minimum: 1, maximum: 200 },
            required: false,
            description: 'Max rows to return (1-200). Default 100.'
          },
          {
            name: 'offset',
            in: 'query',
            schema: { type: 'integer', minimum: 0 },
            required: false,
            description: 'Pagination offset.'
          },
          {
            name: 'hours',
            in: 'query',
            schema: { type: 'integer', minimum: 1, maximum: 720 },
            required: false,
            description: 'Window in hours (default 48).'
          },
          {
            name: 'from',
            in: 'query',
            schema: { type: 'string', format: 'date-time' },
            required: false,
            description: 'ISO datetime lower bound (UTC).'
          },
          {
            name: 'to',
            in: 'query',
            schema: { type: 'string', format: 'date-time' },
            required: false,
            description: 'ISO datetime upper bound (UTC).'
          },
          {
            name: 'source',
            in: 'query',
            schema: { type: 'string' },
            required: false,
            description: 'Optional source filter. Repeatable by comma-separated values.'
          },
          {
            name: 'country',
            in: 'query',
            schema: { type: 'string' },
            required: false,
            description: 'Optional country filter. Repeatable by comma-separated values.'
          },
          {
            name: 'section',
            in: 'query',
            schema: { type: 'string' },
            required: false,
            description: 'Optional section filter. Repeatable by comma-separated values.'
          },
          {
            name: 'language',
            in: 'query',
            schema: { type: 'string' },
            required: false,
            description: 'Optional language filter. Repeatable by comma-separated values.'
          },
          {
            name: 'publication_from',
            in: 'query',
            schema: { type: 'string', format: 'date-time' },
            required: false,
            description: 'Alias for publication_datetime lower bound (UTC).'
          },
          {
            name: 'publication_to',
            in: 'query',
            schema: { type: 'string', format: 'date-time' },
            required: false,
            description: 'Alias for publication_datetime upper bound (UTC).'
          }
        ],
        responses: {
          200: {
            description: 'Article list with metadata',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    storage: { type: 'string', enum: ['postgres', 'disabled'] },
                    generatedAt: { type: ['string', 'null'], format: 'date-time', nullable: true },
                    total: { type: 'integer' },
                    params: {
                      type: 'object',
                      properties: {
                        limit: { type: 'integer' },
                        offset: { type: 'integer' },
                        hours: { type: ['integer', 'null'] },
                        from: { type: ['string', 'null'], format: 'date-time' },
                        to: { type: ['string', 'null'], format: 'date-time' },
                        publicationFrom: { type: ['string', 'null'], format: 'date-time' },
                        publicationTo: { type: ['string', 'null'], format: 'date-time' },
                        sources: { type: 'array', items: { type: 'string' } },
                        countries: { type: 'array', items: { type: 'string' } },
                        sections: { type: 'array', items: { type: 'string' } },
                        languages: { type: 'array', items: { type: 'string' } }
                      }
                    },
                    items: {
                      type: 'array',
                      items: { type: 'object', additionalProperties: true }
                    }
                  }
                }
              }
            }
          },
          401: {
            description: 'Missing or invalid NEWS_API_TOKEN'
          },
          503: {
            description: 'Storage unavailable'
          }
        },
        security: [{ bearerAuth: [] }]
      }
    },
    '/api/filters': {
      get: {
        summary: 'Get available filter options for /api/news',
        responses: {
          200: {
            description: 'Filter options loaded from ingested articles',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    storage: { type: 'string', enum: ['postgres', 'disabled'] },
                    filters: {
                      type: 'object',
                      properties: {
                        countries: { type: 'array', items: { type: 'string' } },
                        languages: { type: 'array', items: { type: 'string' } },
                        sources: { type: 'array', items: { type: 'string' } },
                        sections: { type: 'array', items: { type: 'string' } }
                      }
                    },
                    reason: { type: 'string' }
                  }
                }
              }
            }
          },
          401: {
            description: 'Missing or invalid NEWS_API_TOKEN'
          },
          503: {
            description: 'Storage unavailable'
          }
        },
        security: [{ bearerAuth: [] }]
      }
    }
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'token'
      }
    }
  }
} as const;

const filtersCacheTtlMs = Math.max(
  5_000,
  (Number(process.env.NEWS_API_FILTERS_CACHE_TTL_SECONDS || '180') || 180) * 1_000
);
type FilterCacheEntry = {
  payload: NewsFiltersResponse;
  timestamp: number;
};
let filtersCache: FilterCacheEntry | null = null;

const docsHtml = `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>PressLab News API Docs</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css" />
    <style>
      body { margin: 0; }
      #swagger-ui { max-width: 1200px; margin: 0 auto; }
    </style>
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
    <script>
      window.onload = function () {
        SwaggerUIBundle({
          url: '/openapi.json',
          dom_id: '#swagger-ui',
          persistAuthorization: true
        });
      };
</script>
  </body>
</html>
`;

const playgroundHtml = `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>PressLab News API Playground</title>
    <style>
      :root {
        --bg: #0f172a;
        --panel: #111827;
        --text: #e5e7eb;
        --muted: #9ca3af;
        --accent: #38bdf8;
      }

      * {
        box-sizing: border-box;
      }
      body {
        margin: 0;
        background: linear-gradient(120deg, #020617, #0b1324 55%, #0f172a);
        color: var(--text);
        font-family: 'Inter', 'Segoe UI', Tahoma, sans-serif;
      }
      .wrap {
        max-width: 980px;
        margin: 0 auto;
        padding: 24px;
      }
      h1 {
        margin: 0 0 8px;
        font-size: 28px;
      }
      .sub {
        color: var(--muted);
        margin-bottom: 16px;
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 12px;
        margin-bottom: 12px;
      }
      label {
        display: block;
        margin-bottom: 8px;
        font-size: 12px;
        color: var(--muted);
      }
      input,
      select,
      button {
        width: 100%;
        border-radius: 10px;
        border: 1px solid #273244;
        background: var(--panel);
        color: var(--text);
        padding: 10px;
        font-size: 14px;
      }
      input::placeholder {
        color: #6b7280;
      }
      .actions {
        display: flex;
        gap: 8px;
        margin: 8px 0 12px;
      }
      .filter-actions {
        display: flex;
        gap: 6px;
        margin-bottom: 6px;
      }
      button {
        cursor: pointer;
        font-weight: 600;
      }
      .small-btn {
        width: auto;
        padding: 6px 10px;
        font-size: 12px;
        min-width: 80px;
      }
      .primary {
        background: linear-gradient(135deg, #2563eb, #7c3aed);
        border: none;
      }
      .secondary {
        background: #1f2937;
      }
      .status {
        font-size: 13px;
        color: var(--muted);
        margin: 8px 0;
      }
      .fieldsmall {
        font-size: 12px;
        margin-top: 6px;
        color: var(--muted);
        word-break: break-all;
      }
      pre {
        background: #030712dd;
        padding: 16px;
        border-radius: 12px;
        min-height: 220px;
        white-space: pre-wrap;
        border: 1px solid #273244;
      }
      .hidden {
        display: none;
      }
    </style>
  </head>
  <body>
    <div class="wrap">
      <h1>PressLab News API Playground</h1>
      <div class="sub">파라미터를 체크박스/드롭다운으로 고르고 가져온 데이터를 JSON/다운로드로 확인하세요.</div>

      <div>
        <label>API Base URL</label>
        <input id="baseUrl" value="" placeholder="예: https://world-press-monitor.onrender.com" />
      </div>
      <div>
        <label>Authorization Token</label>
        <input id="token" value="" placeholder="Bearer 또는 토큰만 입력" />
      </div>

      <div class="actions">
        <button class="primary" id="loadFiltersBtn">Load Filter Options</button>
      </div>

      <div class="grid">
        <div>
          <label>Countries (multi-select)</label>
          <div class="filter-actions">
            <button type="button" class="small-btn secondary" data-select-action="all" data-select-target="countries">전체 선택</button>
            <button type="button" class="small-btn secondary" data-select-action="clear" data-select-target="countries">전체 해제</button>
          </div>
          <select id="countries" multiple size="6"></select>
        </div>
        <div>
          <label>Languages (multi-select)</label>
          <div class="filter-actions">
            <button type="button" class="small-btn secondary" data-select-action="all" data-select-target="languages">전체 선택</button>
            <button type="button" class="small-btn secondary" data-select-action="clear" data-select-target="languages">전체 해제</button>
          </div>
          <select id="languages" multiple size="6"></select>
        </div>
        <div>
          <label>Sources (multi-select)</label>
          <div class="filter-actions">
            <button type="button" class="small-btn secondary" data-select-action="all" data-select-target="sources">전체 선택</button>
            <button type="button" class="small-btn secondary" data-select-action="clear" data-select-target="sources">전체 해제</button>
          </div>
          <select id="sources" multiple size="6"></select>
        </div>
        <div>
          <label>Sections (multi-select)</label>
          <div class="filter-actions">
            <button type="button" class="small-btn secondary" data-select-action="all" data-select-target="sections">전체 선택</button>
            <button type="button" class="small-btn secondary" data-select-action="clear" data-select-target="sections">전체 해제</button>
          </div>
          <select id="sections" multiple size="6"></select>
        </div>
      </div>

      <div class="grid">
        <div>
          <label>publication_from</label>
          <input id="publicationFrom" type="datetime-local" />
        </div>
        <div>
          <label>publication_to</label>
          <input id="publicationTo" type="datetime-local" />
        </div>
        <div>
          <label>hours</label>
          <input id="hours" type="number" min="1" max="720" value="48" />
        </div>
        <div>
          <label>limit</label>
          <input id="limit" type="number" min="1" max="200" value="100" />
        </div>
        <div>
          <label>offset</label>
          <input id="offset" type="number" min="0" value="0" />
        </div>
      </div>

      <div class="actions">
        <button class="primary" id="fetchBtn">Fetch</button>
        <button class="secondary" id="downloadBtn" disabled>Download JSON</button>
        <button class="secondary" id="downloadCsvBtn" disabled>Download CSV</button>
      </div>
      <div class="status" id="status">Ready</div>
      <div class="fieldsmall" id="urlLine">Query URL: </div>

      <pre id="result">No data yet.</pre>
    </div>

    <script>
      const storage = window.localStorage;
      const baseUrlInput = document.getElementById('baseUrl');
      const tokenInput = document.getElementById('token');
      const countriesSelect = document.getElementById('countries');
      const languagesSelect = document.getElementById('languages');
      const sourcesSelect = document.getElementById('sources');
      const sectionsSelect = document.getElementById('sections');
      const publicationFromInput = document.getElementById('publicationFrom');
      const publicationToInput = document.getElementById('publicationTo');
      const hoursInput = document.getElementById('hours');
      const limitInput = document.getElementById('limit');
      const offsetInput = document.getElementById('offset');
      const fetchBtn = document.getElementById('fetchBtn');
      const downloadBtn = document.getElementById('downloadBtn');
      const downloadCsvBtn = document.getElementById('downloadCsvBtn');
      const loadFiltersBtn = document.getElementById('loadFiltersBtn');
      const statusEl = document.getElementById('status');
      const urlLine = document.getElementById('urlLine');
      const resultEl = document.getElementById('result');

      const host = window.location.origin;
      const saved = {
        baseUrl: storage.getItem('wpm-playground-base') || host,
        token: storage.getItem('wpm-playground-token') || ''
      };
      baseUrlInput.value = saved.baseUrl;
      tokenInput.value = saved.token;

      let lastPayload = null;

      function getSelectedCsv(selectEl) {
        return Array.from(selectEl.selectedOptions)
          .map((option) => option.value)
          .filter(Boolean)
          .join(',');
      }

      function fillOptions(selectEl, items) {
        while (selectEl.firstChild) {
          selectEl.removeChild(selectEl.firstChild);
        }
        if (!items.length) {
          const option = document.createElement('option');
          option.value = '';
          option.textContent = 'No options';
          selectEl.appendChild(option);
          selectEl.disabled = true;
          return;
        }
        selectEl.disabled = false;
        for (const value of items) {
          const option = document.createElement('option');
          option.value = value;
          option.textContent = value;
          selectEl.appendChild(option);
        }
      }

      function setAllOptions(selectEl, selected) {
        for (const option of Array.from(selectEl.options)) {
          option.selected = selected;
        }
      }

      function wireFilterButtons() {
        for (const button of document.querySelectorAll('[data-select-action][data-select-target]')) {
          button.addEventListener('click', () => {
            const target = button.getAttribute('data-select-target');
            const action = button.getAttribute('data-select-action');
            const element = target ? document.getElementById(target) : null;
            if (!(element instanceof HTMLSelectElement)) return;
            setAllOptions(element, action === 'all');
          });
        }
      }

      function toIso(value) {
        if (!value) return '';
        const parsed = new Date(value);
        if (Number.isNaN(parsed.getTime())) return '';
        return parsed.toISOString();
      }

      function tokenHeader() {
        const raw = tokenInput.value.trim();
        if (!raw) return {};
        return raw.startsWith('Bearer ') ? { Authorization: raw } : { Authorization: `Bearer ${raw}` };
      }

      function filtersEndpoint() {
        const baseUrl = baseUrlInput.value.trim().replace(/\/+$/, '') || host;
        return `${baseUrl}/api/filters`;
      }

      async function loadFilterOptions() {
        const headers = {
          Accept: 'application/json',
          ...tokenHeader()
        };
        statusEl.textContent = 'Loading options...';
        try {
          const response = await fetch(filtersEndpoint(), { headers });
          const text = await response.text();
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${text}`);
          }
          const payload = JSON.parse(text);
          if (payload.storage === 'disabled') {
            throw new Error(`Storage disabled: ${payload.reason || 'storage unavailable'}`);
          }
          const filters = payload.filters || {};
          fillOptions(countriesSelect, filters.countries || []);
          fillOptions(languagesSelect, filters.languages || []);
          fillOptions(sourcesSelect, filters.sources || []);
          fillOptions(sectionsSelect, filters.sections || []);
          statusEl.textContent = 'Filter options loaded';
        } catch (error) {
          fillOptions(countriesSelect, []);
          fillOptions(languagesSelect, []);
          fillOptions(sourcesSelect, []);
          fillOptions(sectionsSelect, []);
          statusEl.textContent = String(error);
        }
      }

      function buildUrl() {
        const baseUrl = baseUrlInput.value.trim().replace(/\/+$/, '') || host;
        const params = new URLSearchParams();

        const countries = getSelectedCsv(countriesSelect);
        const languages = getSelectedCsv(languagesSelect);
        const sources = getSelectedCsv(sourcesSelect);
        const sections = getSelectedCsv(sectionsSelect);
        const limit = limitInput.value.trim();
        const offset = offsetInput.value.trim();
        const hours = hoursInput.value.trim();
        const publicationFrom = toIso(publicationFromInput.value);
        const publicationTo = toIso(publicationToInput.value);

        if (countries) params.set('country', countries);
        if (languages) params.set('language', languages);
        if (sources) params.set('source', sources);
        if (sections) params.set('section', sections);
        if (hours) params.set('hours', hours);
        if (limit) params.set('limit', limit);
        if (offset) params.set('offset', offset);
        if (publicationFrom) params.set('publication_from', publicationFrom);
        if (publicationTo) params.set('publication_to', publicationTo);

        const query = params.toString();
        return `${baseUrl}/api/news${query ? `?${query}` : ''}`;
      }

      async function fetchNews() {
        const apiUrl = buildUrl();
        urlLine.textContent = `Query URL: ${apiUrl}`;
        statusEl.textContent = 'Requesting...';
        downloadBtn.disabled = true;
        downloadCsvBtn.disabled = true;

        try {
          const headers = {
            ...tokenHeader(),
            Accept: 'application/json'
          };

          const response = await fetch(apiUrl, { headers });
      const text = await response.text();
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${text}`);
      }
      const payload = JSON.parse(text);
      lastPayload = payload;
      resultEl.textContent = JSON.stringify(payload, null, 2);
      const total = typeof payload.total === 'number' ? payload.total : 0;
      const returned = Array.isArray(payload.items) ? payload.items.length : 0;
          statusEl.textContent = `OK — total ${total}, returned ${returned}`;
          downloadBtn.disabled = false;
          downloadCsvBtn.disabled = false;
          storage.setItem('wpm-playground-base', baseUrlInput.value.trim() || window.location.origin);
          storage.setItem('wpm-playground-token', tokenInput.value.trim());
        } catch (error) {
          lastPayload = null;
          resultEl.textContent = String(error);
          statusEl.textContent = 'Failed';
          downloadBtn.disabled = true;
          downloadCsvBtn.disabled = true;
        }
      }

      function escapeCsvValue(value) {
        const asString = value === null || value === undefined ? '' : String(value);
        const normalized = asString.replace(/\r/g, ' ').replace(/\n/g, ' ');
        return `"${normalized.replace(/"/g, '""')}"`;
      }

      function downloadCsv() {
        if (!lastPayload || !Array.isArray(lastPayload.items)) return;
        const csvColumns = [
          'id',
          'source',
          'title',
          'snippet',
          'url',
          'country',
          'language',
          'section',
          'publicationDatetime',
          'createdAt',
          'updatedAt'
        ];
        const rows = [];
        rows.push(`# total,${typeof lastPayload.total === 'number' ? lastPayload.total : 0}`);
        rows.push(csvColumns.map((column) => escapeCsvValue(column)).join(','));
        for (const item of lastPayload.items) {
          rows.push(csvColumns.map((column) => escapeCsvValue(item[column])).join(','));
        }
        const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' });
        const href = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const ts = new Date().toISOString().replace(/[:.]/g, '-');
        a.href = href;
        a.download = `news-api-response-${ts}.csv`;
        a.click();
        URL.revokeObjectURL(href);
      }

      function downloadJson() {
        if (!lastPayload) return;
        const blob = new Blob([JSON.stringify(lastPayload, null, 2)], { type: 'application/json;charset=utf-8' });
        const href = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const ts = new Date().toISOString().replace(/[:.]/g, '-');
        a.href = href;
        a.download = `news-api-response-${ts}.json`;
        a.click();
        URL.revokeObjectURL(href);
      }

      fetchBtn.addEventListener('click', fetchNews);
      loadFiltersBtn.addEventListener('click', loadFilterOptions);
      downloadBtn.addEventListener('click', downloadJson);
      downloadCsvBtn.addEventListener('click', downloadCsv);
      wireFilterButtons();

      (async () => {
        loadFilterOptions();
      })();
    </script>
  </body>
</html>
`;

const docsResponse = {
  status: 200,
  headers: {
    'content-type': 'text/html; charset=utf-8',
    ...corsHeaders(null)
  },
  body: docsHtml
};

const playgroundResponse = {
  status: 200,
  headers: {
    'content-type': 'text/html; charset=utf-8',
    ...corsHeaders(null)
  },
  body: playgroundHtml
};

function jsonResponse(payload: unknown, status = 200, origin: string | null = null): JsonResponse {
  const headers = {
    ...corsHeaders(origin),
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  };
  return {
    status,
    headers,
    body: JSON.stringify(payload),
  };
}

function unauthorizedResponse(origin: string | null): JsonResponse {
  return jsonResponse(
    {
      error: 'unauthorized',
      message: 'Missing or invalid NEWS_API_TOKEN'
    },
    401,
    origin
  );
}

function getHeaderValue(headers: IncomingMessage['headers'], key: string): string {
  const value = headers[key.toLowerCase()];
  if (Array.isArray(value)) {
    return value[0] || '';
  }
  return value || '';
}

function isAuthorized(req: IncomingMessage): boolean {
  const token = process.env.NEWS_API_TOKEN?.trim() || '';
  const authHeader = getHeaderValue(req.headers, 'authorization').trim();
  return authHeader === `Bearer ${token}` || authHeader === token;
}

const port = Number(process.env.NEWS_API_PORT || '4100');
const host = process.env.NEWS_API_HOST || '0.0.0.0';
const requiredApiToken = process.env.NEWS_API_TOKEN?.trim() || '';

if (!requiredApiToken) {
  console.error('[api-news] NEWS_API_TOKEN is required. Set NEWS_API_TOKEN in environment before starting.');
  process.exit(1);
}

function sendJsonResponse(res: ServerResponse, response: JsonResponse): void {
  res.statusCode = response.status;
  for (const [key, value] of Object.entries(response.headers)) {
    res.setHeader(key, value);
  }
  res.end(response.body);
}

const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  if (!req.url) {
    sendJsonResponse(res, jsonResponse({ error: 'bad_request', message: 'Missing request URL.' }, 400, null));
    return;
  }

  const url = new URL(req.url, `http://${host}:${port}`);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const origin = getHeaderValue(req.headers, 'origin');

  if (req.method === 'OPTIONS') {
    sendJsonResponse(res, jsonResponse({}, 204, origin));
    return;
  }

  if (req.method !== 'GET') {
    sendJsonResponse(
      res,
      jsonResponse(
        {
          error: 'method_not_allowed',
          message: 'Only GET is supported.'
        },
        405,
        origin
      )
    );
    return;
  }

  if (path === '/health') {
    const health = await readNewsArticlesForApi({ limit: 1 });
    const response: HealthResponse = {
      status: health.storage === 'postgres' ? 'ok' : 'degraded',
      checkedAt: new Date().toISOString(),
      storage: health.storage,
      reason: health.reason
    };
    sendJsonResponse(res, jsonResponse(response, 200, origin));
    return;
  }

  if (path === '/openapi.json') {
    const spec = openApiSpec as Record<string, unknown>;
    sendJsonResponse(res, jsonResponse(spec, 200, origin));
    return;
  }

  if (path === '/docs') {
    res.statusCode = docsResponse.status;
    for (const [key, value] of Object.entries(docsResponse.headers)) {
      res.setHeader(key, value);
    }
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    } else {
      res.setHeader('Access-Control-Allow-Origin', '*');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'authorization,content-type');
    res.end(docsResponse.body);
    return;
  }

  if (path === '/playground' || path === '/ui') {
    res.statusCode = playgroundResponse.status;
    for (const [key, value] of Object.entries(playgroundResponse.headers)) {
      res.setHeader(key, value);
    }
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    } else {
      res.setHeader('Access-Control-Allow-Origin', '*');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'authorization,content-type');
    res.end(playgroundResponse.body);
    return;
  }

  if (path === '/api/filters') {
    if (!isAuthorized(req)) {
      sendJsonResponse(res, unauthorizedResponse(origin));
      return;
    }

    try {
      const now = Date.now();
      if (filtersCache && now - filtersCache.timestamp < filtersCacheTtlMs) {
        sendJsonResponse(res, jsonResponse(filtersCache.payload, 200, origin));
        return;
      }

      const filters = await readNewsApiFilters();
      if (filters.storage === 'disabled') {
        const payload: NewsFiltersResponse = {
          storage: 'disabled',
          reason: filters.reason || 'News storage is not available.',
          filters: {
            countries: [],
            languages: [],
            sources: [],
            sections: []
          }
        };
        sendJsonResponse(res, jsonResponse(payload, 503, origin));
        return;
      }

      const response: NewsFiltersResponse = {
        storage: 'postgres',
        reason: undefined,
        filters: filters.filters
      };
      filtersCache = {
        payload: response,
        timestamp: now
      };
      sendJsonResponse(res, jsonResponse(response, 200, origin));
    } catch (error) {
      console.error('[api-news] filters request failed', error);
      sendJsonResponse(
        res,
        jsonResponse(
          {
            error: 'internal_error',
            message: 'Failed to read filter options.'
          } satisfies ApiError,
          500,
          origin
        )
      );
    }
    return;
  }

  if (path === '/api/news') {
    if (!isAuthorized(req)) {
      sendJsonResponse(res, unauthorizedResponse(origin));
      return;
    }

    try {
      const sourceNames = getQueryList(url.searchParams, 'source');
      const countries = getQueryList(url.searchParams, 'country');
      const sections = getQueryList(url.searchParams, 'section');
      const languages = getQueryList(url.searchParams, 'language');
      const limit = parseIntParam(url.searchParams.get('limit'), 100, 1, 200);
      const offset = parseIntParam(url.searchParams.get('offset'), 0, 0, 100000);
      const legacyFrom = parseDateParam(url.searchParams.get('from'));
      const legacyTo = parseDateParam(url.searchParams.get('to'));
      const from = parseDateParam(url.searchParams.get('publication_from')) || legacyFrom;
      const to = parseDateParam(url.searchParams.get('publication_to')) || legacyTo;
      const hours = parseIntParam(url.searchParams.get('hours'), 48, 1, 720);

      if (from && to && new Date(from).getTime() > new Date(to).getTime()) {
        sendJsonResponse(
          res,
          jsonResponse(
            {
              error: 'invalid_range',
              message: '`from` must be <= `to`.'
            },
            400,
            origin
          )
        );
        return;
      }

      const news = await readNewsArticlesForApi({
        sourceNames,
        countries,
        sections,
        languages,
        limit,
        offset,
        publicationFrom: from,
        publicationTo: to,
        hours: from || to ? undefined : hours
      });

      if (news.storage === 'disabled') {
        const errorPayload: ApiError = {
          error: 'storage_unavailable',
          message: news.reason || 'News storage is not available.'
        };
        sendJsonResponse(res, jsonResponse(errorPayload, 503, origin));
        return;
      }

      const response: NewsApiResponse = {
        storage: news.storage,
        generatedAt: news.generatedAt,
        total: news.totalCount,
        params: {
          limit,
          offset,
          hours: from || to ? undefined : hours,
          publicationFrom: from,
          publicationTo: to,
          from,
          to,
          sources: sourceNames,
          countries,
          sections,
          languages
        },
        items: news.items
      };
      sendJsonResponse(res, jsonResponse(response, 200, origin));
    } catch (error) {
      if (error instanceof Error && error.message === 'invalid-date') {
        sendJsonResponse(
          res,
          jsonResponse(
            {
              error: 'invalid_date',
              message: '`from`/`to` or `publication_from`/`publication_to` must be valid ISO date strings.'
            },
            400,
            origin
          )
        );
        return;
      }

      console.error('[api-news] request failed', error);
      sendJsonResponse(
        res,
        jsonResponse(
          {
            error: 'internal_error',
            message: 'Failed to read news articles.'
          },
          500,
          origin
        )
      );
    }
    return;
  }

  sendJsonResponse(
    res,
    jsonResponse(
      {
        error: 'not_found',
        message: 'Endpoint not found.'
      },
      404,
      origin
    )
  );
});

server.listen(port, host, () => {
  console.log(`[api-news] listening on http://${host}:${port}`);
});
