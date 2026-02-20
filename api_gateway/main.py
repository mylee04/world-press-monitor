from __future__ import annotations

import os

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field, field_validator


APP_NAME = "WPM News API Gateway"
DEFAULT_NEWS_API_BASE_URL = os.getenv("NEWS_API_DEFAULT_BASE_URL", "http://127.0.0.1:4100").rstrip("/")
DEFAULT_GATEWAY_PORT = int(os.getenv("WPM_API_GATEWAY_PORT", "8000"))
DEFAULT_GATEWAY_HOST = os.getenv("WPM_API_GATEWAY_HOST", "0.0.0.0")

raw_origins = os.getenv("API_GATEWAY_CORS_ORIGINS", "*")
_origins = [value.strip() for value in raw_origins.split(",") if value.strip()]
ALLOWED_ORIGINS = ["*"] if "*" in _origins or not _origins else _origins


app = FastAPI(
    title=APP_NAME,
    description="Browser-friendly test UI + proxy for WPM news API",
    version="1.1.0",
    docs_url="/docs",
)


app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _build_query(payload: "NewsFetchPayload") -> dict[str, str | int]:
    params: dict[str, str | int] = {
        "limit": payload.limit,
        "offset": payload.offset,
        "hours": payload.hours,
    }
    if payload.source:
        params["source"] = payload.source
    if payload.country:
        params["country"] = payload.country
    if payload.section:
        params["section"] = payload.section
    if payload.from_at:
        params["from"] = payload.from_at
    if payload.to_at:
        params["to"] = payload.to_at
    return params


class NewsFetchPayload(BaseModel):
    api_key: str = Field(min_length=1, description="NEWS_API_TOKEN")
    api_base_url: str = Field(default=DEFAULT_NEWS_API_BASE_URL, description="WPM API base URL")
    limit: int = Field(default=100, ge=1, le=500)
    offset: int = Field(default=0, ge=0)
    hours: int = Field(default=48, ge=1, le=720)
    source: str = Field(default="", description="comma-separated source list")
    country: str = Field(default="", description="comma-separated country list")
    section: str = Field(default="", description="comma-separated section list")
    from_at: str | None = Field(default=None, description="created_at from (ISO)")
    to_at: str | None = Field(default=None, description="created_at to (ISO)")

    @field_validator("api_key")
    @classmethod
    def validate_api_key(cls, value: str) -> str:
        value = (value or "").strip()
        if not value:
            raise ValueError("api_key is required")
        return value

    @field_validator("api_base_url")
    @classmethod
    def validate_base_url(cls, value: str) -> str:
        value = (value or "").strip()
        if not value:
            raise ValueError("api_base_url is required")
        return value.rstrip("/")


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "service": "wpm-news-gateway",
        "target": DEFAULT_NEWS_API_BASE_URL,
        "listening": {
            "host": DEFAULT_GATEWAY_HOST,
            "port": DEFAULT_GATEWAY_PORT,
        },
    }


@app.get("/", response_class=HTMLResponse)
async def index():
    return """
    <!doctype html>
    <html>
      <head>
        <meta charset='utf-8' />
        <meta name='viewport' content='width=device-width, initial-scale=1' />
        <title>WPM News API Tester</title>
        <style>
          :root {
            --bg: #0f172a;
            --panel: #1e293b;
            --panel2: #020617;
            --text: #e2e8f0;
            --muted: #94a3b8;
            --blue: #2563eb;
            --line: #334155;
            --error: #fca5a5;
          }
          * { box-sizing: border-box; }
          body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; margin: 0; padding: 2rem; background: var(--bg); color: var(--text); }
          h1 { margin: 0 0 1rem; color: #f8fafc; }
          .grid { display: grid; gap: 0.6rem; max-width: 1040px; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); }
          label { display: block; font-size: 12px; color: var(--muted); margin-bottom: 4px; }
          input, button, textarea { width: 100%; box-sizing: border-box; padding: 8px; border-radius: 8px; border: 1px solid var(--line); background: var(--panel); color: var(--text); }
          textarea { height: 72px; resize: vertical; }
          .actions { margin-top: 0.8rem; }
          button { background: var(--blue); border-color: var(--blue); cursor: pointer; font-weight: 600; }
          pre { background: var(--panel2); padding: 1rem; border-radius: 8px; overflow: auto; max-height: 540px; border: 1px solid var(--line); white-space: pre-wrap; }
          .row { grid-column: 1 / -1; }
          .note { color: var(--muted); font-size: 13px; margin-top: 0.8rem; }
          .error { color: var(--error); }
          .toolbar { display: flex; align-items: center; gap: 0.6rem; margin-top: 0.2rem; }
          .toolbar button { width: auto; padding: 8px 14px; }
          .small { color: var(--muted); font-size: 11px; margin-top: 0.2rem; }
        </style>
      </head>
      <body>
        <h1>WPM News API Tester</h1>
        <p class='note'>WPM API 토큰을 입력하고, 필터를 지정한 뒤 <b>Fetch Articles</b>를 누르면 응답 JSON을 바로 확인할 수 있습니다.</p>
        <div class='grid'>
          <div>
            <label>API Base URL</label>
            <input id='base' value='""" + DEFAULT_NEWS_API_BASE_URL + """' />
          </div>
          <div>
            <label>API Key</label>
            <input id='apiKey' type='password' placeholder='NEWS_API_TOKEN' />
          </div>
          <div>
            <label>Limit</label>
            <input id='limit' value='10' />
          </div>
          <div>
            <label>Offset</label>
            <input id='offset' value='0' />
          </div>
          <div>
            <label>Hours (from/to 비워두면 사용)</label>
            <input id='hours' value='48' />
          </div>
          <div>
            <label>Source(s) comma-separated</label>
            <input id='source' placeholder='ex. CBS News,Reuters' />
          </div>
          <div>
            <label>Country(s) comma-separated</label>
            <input id='country' placeholder='ex. US,UK' />
          </div>
          <div>
            <label>Section(s) comma-separated</label>
            <input id='section' placeholder='ex. world,business' />
          </div>
          <div>
            <label>From (ISO datetime)</label>
            <input id='from' placeholder='2026-02-19T00:00:00.000Z' />
          </div>
          <div>
            <label>To (ISO datetime)</label>
            <input id='to' placeholder='2026-02-19T01:00:00.000Z' />
          </div>
          <div class='row actions'>
            <div class='toolbar'>
              <button id='runBtn'>Fetch Articles</button>
              <button id='clearBtn' type='button'>Clear Token</button>
            </div>
            <div class='small'>요청은 브라우저 콘솔/개발 서버 콘솔에서 token이 저장됩니다.</div>
          </div>
          <div class='row'>
            <label>Response</label>
            <textarea id='preview' readonly>API 호출 결과가 여기 표시됩니다.</textarea>
            <pre id='output'>{ "message": "Run request to see output" }</pre>
          </div>
        </div>

        <script>
          const elements = {
            base: document.getElementById('base'),
            apiKey: document.getElementById('apiKey'),
            limit: document.getElementById('limit'),
            offset: document.getElementById('offset'),
            hours: document.getElementById('hours'),
            source: document.getElementById('source'),
            country: document.getElementById('country'),
            section: document.getElementById('section'),
            from: document.getElementById('from'),
            to: document.getElementById('to'),
            runBtn: document.getElementById('runBtn'),
            clearBtn: document.getElementById('clearBtn'),
            preview: document.getElementById('preview'),
            output: document.getElementById('output')
          };

          const TOKEN_KEY = 'wpm-news-api-token';
          elements.apiKey.value = localStorage.getItem(TOKEN_KEY) || '';
          elements.preview.value = `Try: GET ${elements.base.value.replace(/\\/$/, '')}/api/news?limit=${elements.limit.value}&hours=${elements.hours.value}`;

          function makePayload() {
            return {
              api_base_url: elements.base.value.trim(),
              api_key: elements.apiKey.value.trim(),
              limit: Number(elements.limit.value || 10),
              offset: Number(elements.offset.value || 0),
              hours: Number(elements.hours.value || 48),
              source: elements.source.value.trim(),
              country: elements.country.value.trim(),
              section: elements.section.value.trim(),
              from_at: elements.from.value.trim() || null,
              to_at: elements.to.value.trim() || null
            };
          }

          function updateOutput(value, isError = false) {
            elements.output.textContent = JSON.stringify(value, null, 2);
            elements.output.className = isError ? 'error' : '';
          }

          elements.runBtn.addEventListener('click', async () => {
            const payload = makePayload();
            localStorage.setItem(TOKEN_KEY, payload.api_key || '');
            elements.preview.value = `POST ${window.location.origin}/api/fetch`;
            elements.runBtn.disabled = true;
            updateOutput({ status: 'requesting' });
            try {
              const res = await fetch('/api/fetch', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(payload)
              });
              const text = await res.text();
              try {
                const json = JSON.parse(text);
                if (!res.ok) {
                  updateOutput(json, true);
                  return;
                }
                updateOutput(json);
                const count = json && Array.isArray(json.items) ? json.items.length : 0;
                elements.preview.value = `응답: ${res.status}, items=${count}, from=${json.params?.from || '-'}, to=${json.params?.to || '-'}, generatedAt=${json.generatedAt || '-'}`;
              } catch {
                updateOutput({ responseText: text }, true);
              }
            } catch (error) {
              updateOutput({ error: String(error) }, true);
            } finally {
              elements.runBtn.disabled = false;
            }
          });

          elements.clearBtn.addEventListener('click', () => {
            localStorage.removeItem(TOKEN_KEY);
            elements.apiKey.value = '';
          });
        </script>
      </body>
    </html>
    """


@app.post("/api/fetch")
async def fetch_news(payload: NewsFetchPayload):
    base_url = payload.api_base_url.rstrip("/")
    target_url = f"{base_url}/api/news"
    headers = {"Authorization": f"Bearer {payload.api_key}"}
    query = _build_query(payload)

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(target_url, headers=headers, params=query)
    except Exception as error:
        raise HTTPException(status_code=502, detail=f"Failed to connect to WPM API: {error}") from error

    if response.status_code == 401:
        raise HTTPException(status_code=401, detail="Invalid token for WPM API")
    if response.status_code >= 400:
        try:
            detail = response.json()
        except Exception:
            detail = response.text
        raise HTTPException(status_code=response.status_code, detail=detail)

    try:
        return response.json()
    except Exception as error:
        raise HTTPException(status_code=502, detail=f"Could not parse JSON from WPM API: {error}") from error
