import type { Metadata } from 'next';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { OpsExplorer } from '@/components/ops-explorer';
import styles from '@/components/ops-page.module.css';
import type { CountryBenchmarkResponse } from '@/lib/benchmark-types';
import type { MapCountryMetricsResponse } from '@/lib/map-types';
import type { NewsApiDashboardSummaryResponse } from '@/lib/news-api';
import { isValidOpsSessionToken, OPS_LOGIN_PATH, OPS_SESSION_COOKIE } from '@/lib/ops-auth';

type ApiHealthResponse = {
  status: string;
  checkedAt: string;
  storage: string;
  latencyMs: number | null;
  timeoutMs: number | null;
  reason?: string;
};

export const metadata: Metadata = {
  title: 'Ops | World Press Radar',
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

function getBaseUrl(headerList: Headers): string | null {
  const host = headerList.get('x-forwarded-host') || headerList.get('host');
  if (!host) return null;
  const protocol =
    headerList.get('x-forwarded-proto') ||
    (host.includes('localhost') || host.includes('127.0.0.1') ? 'http' : 'https');
  return `${protocol}://${host}`;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T | null> {
  try {
    const response = await fetch(url, {
      cache: 'no-store',
      ...init,
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return 'Unavailable';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(parsed);
}

function formatAge(value: string | null | undefined): string {
  if (!value) return 'No timestamp';
  const parsed = new Date(value).getTime();
  if (Number.isNaN(parsed)) return 'No timestamp';
  const deltaMs = Date.now() - parsed;
  const totalMinutes = Math.max(0, Math.floor(deltaMs / 60000));
  if (totalMinutes < 1) return 'just now';
  if (totalMinutes < 60) return `${totalMinutes}m ago`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours < 24) return minutes > 0 ? `${hours}h ${minutes}m ago` : `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatInt(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'Unavailable';
  return value.toLocaleString();
}

function formatPercent(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'Unavailable';
  return `${(value * 100).toFixed(1)}%`;
}

export default async function OpsPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(OPS_SESSION_COOKIE)?.value;
  if (!isValidOpsSessionToken(token)) {
    redirect(OPS_LOGIN_PATH);
  }

  const headerList = await headers();
  const baseUrl = getBaseUrl(headerList);

  const [summary, benchmark, mapCountries, apiHealth] = await Promise.all([
    baseUrl ? fetchJson<NewsApiDashboardSummaryResponse>(`${baseUrl}/api/customer/dashboard/summary/`) : Promise.resolve(null),
    baseUrl ? fetchJson<CountryBenchmarkResponse>(`${baseUrl}/api/customer/benchmark/`) : Promise.resolve(null),
    baseUrl ? fetchJson<MapCountryMetricsResponse>(`${baseUrl}/api/customer/map/countries/?window=24h`) : Promise.resolve(null),
    (() => {
      const apiBase = process.env.WPR_INTERNAL_API_BASE_URL || process.env.WORLDPRESSRADAR_API_BASE_URL;
      const apiToken = process.env.WORLDPRESSRADAR_API_TOKEN || process.env.NEWS_API_TOKEN;
      if (!apiBase || !apiToken) return Promise.resolve(null);
      const healthUrl = new URL('/health', apiBase).toString();
      return fetchJson<ApiHealthResponse>(healthUrl, {
        headers: {
          Authorization: `Bearer ${apiToken}`,
        },
      });
    })(),
  ]);

  return (
    <div className={`page-stack ops-page-root ${styles.root}`}>
      <section className={styles.hero}>
        <div className={styles.heroTop}>
          <div className={styles.heroCopy}>
            <div className="eyebrow">Private Ops</div>
            <h1>WPR operations watch.</h1>
            <p>Hidden internal panel for checking ingest freshness, upstream health, and snapshot drift without exposing anything in the public nav.</p>
          </div>
          <form method="post" action="/api/ops/logout/">
            <button className={styles.logoutButton} type="submit">
              Lock Ops
            </button>
          </form>
        </div>

        <div className={styles.statusGrid}>
          <article className={styles.statusCard}>
            <span className={styles.statusLabel}>
              API Health
            </span>
            <strong className={apiHealth?.status === 'ok' ? styles.statusOk : styles.statusWarn}>
              {apiHealth?.status || 'unknown'}
            </strong>
            <p>{apiHealth?.storage || 'No upstream health response'}</p>
            <small>{apiHealth ? `${apiHealth.latencyMs ?? 'n/a'} ms · ${formatAge(apiHealth.checkedAt)}` : 'Health endpoint unavailable'}</small>
          </article>

          <article className={styles.statusCard}>
            <span className={styles.statusLabel}>Dashboard</span>
            <strong>{formatAge(summary?.generatedAt)}</strong>
            <p>{summary?.dataSource || summary?.storage || 'Unavailable'}</p>
            <small>{formatDateTime(summary?.generatedAt)}</small>
          </article>

          <article className={styles.statusCard}>
            <span className={styles.statusLabel}>Benchmark</span>
            <strong>{formatAge(benchmark?.generatedAt)}</strong>
            <p>{benchmark?.dataSource || 'Unavailable'}</p>
            <small>{formatDateTime(benchmark?.generatedAt)}</small>
          </article>

          <article className={styles.statusCard}>
            <span className={styles.statusLabel}>Map 24h</span>
            <strong>{formatAge(mapCountries?.generatedAt)}</strong>
            <p>{mapCountries?.storage || 'Unavailable'}</p>
            <small>{formatDateTime(mapCountries?.generatedAt)}</small>
          </article>
        </div>
      </section>

      <section className={styles.detailGrid}>
        <article className={styles.detailPanel}>
          <h2>Dashboard Summary</h2>
          <div className={styles.detailMeta}>
            <span className={styles.chip}>{summary?.dataSource || summary?.storage || 'unknown'}</span>
            <span className={styles.chip}>{formatDateTime(summary?.generatedAt)}</span>
          </div>
          <div className={styles.statList}>
            <div className={styles.statRow}>
              <span>Inserted 24h</span>
              <strong>{formatInt(summary?.totals.inserted24h)}</strong>
            </div>
            <div className={styles.statRow}>
              <span>Published 24h</span>
              <strong>{formatInt(summary?.totals.published24h)}</strong>
            </div>
            <div className={styles.statRow}>
              <span>Sources checked 24h</span>
              <strong>{formatInt(summary?.totals.checkedSources24h)}</strong>
            </div>
            <div className={styles.statRow}>
              <span>31d rows window</span>
              <strong>{formatInt(summary?.totals.rowsWindow)}</strong>
            </div>
          </div>
        </article>

        <article className={styles.detailPanel}>
          <h2>Benchmark Window</h2>
          <div className={styles.detailMeta}>
            <span className={styles.chip}>{benchmark?.dataSource || 'unknown'}</span>
            <span className={styles.chip}>{formatDateTime(benchmark?.generatedAt)}</span>
          </div>
          <div className={styles.statList}>
            <div className={styles.statRow}>
              <span>Countries</span>
              <strong>{formatInt(benchmark?.totals?.countries)}</strong>
            </div>
            <div className={styles.statRow}>
              <span>Hourly published 24h</span>
              <strong>{formatInt(benchmark?.totals?.hourlyPublished24h)}</strong>
            </div>
            <div className={styles.statRow}>
              <span>Hourly inserted 24h</span>
              <strong>{formatInt(benchmark?.totals?.hourlyInserted24h)}</strong>
            </div>
          </div>
        </article>

        <article className={styles.detailPanel}>
          <h2>Map Snapshot</h2>
          <div className={styles.detailMeta}>
            <span className={styles.chip}>{mapCountries?.storage || 'unknown'}</span>
            <span className={styles.chip}>{formatDateTime(mapCountries?.generatedAt)}</span>
          </div>
          <div className={styles.statList}>
            <div className={styles.statRow}>
              <span>Published 24h</span>
              <strong>{formatInt(mapCountries?.totals?.pub24h)}</strong>
            </div>
            <div className={styles.statRow}>
              <span>Active sources 24h</span>
              <strong>{formatInt(mapCountries?.totals?.activeSources24h)}</strong>
            </div>
            <div className={styles.statRow}>
              <span>Active countries</span>
              <strong>{formatInt(mapCountries?.totals?.countries)}</strong>
            </div>
            <div className={styles.statRow}>
              <span>Late share 24h</span>
              <strong>{formatPercent(mapCountries?.totals?.windows?.['24h']?.lateShare)}</strong>
            </div>
          </div>
        </article>

        <article className={styles.detailPanel}>
          <h2>Top Countries</h2>
          <div className={styles.detailMeta}>
            <span className={styles.chip}>{formatInt(summary?.preview.articleCount)} articles</span>
            <span className={styles.chip}>{summary?.latestDate || 'No date'}</span>
          </div>
          <div className={styles.topCountryList}>
            {(summary?.preview.topCountries || []).slice(0, 6).map((country) => (
              <div className={styles.topCountryRow} key={country.country}>
                <strong>{country.country}</strong>
                <span>{formatInt(country.count)}</span>
              </div>
            ))}
          </div>
        </article>
      </section>

      <OpsExplorer />
    </div>
  );
}
