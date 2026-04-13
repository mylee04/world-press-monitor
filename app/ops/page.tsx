import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { OpsExplorer } from '@/components/ops-explorer';
import { OpsLocalTimestamp } from '@/components/ops-local-timestamp';
import styles from '@/components/ops-page.module.css';
import type { CountryBenchmarkResponse } from '@/lib/benchmark-types';
import {
  readMapCountryMetricsFileSnapshot,
  readMapCountrySourcesFileSnapshot,
} from '@/lib/customer-map-snapshot-store';
import type { MapCountryMetricsResponse, MapCountrySourcesResponse } from '@/lib/map-types';
import { readMapCountryMetrics, readMapCountrySources } from '@/lib/map-store';
import {
  classifySourceDistribution,
  classifySourceEndpoint,
  classifySourceMethod,
  classifySourceSitemapKind,
  getSourceMeta,
  normalizeSourceKey,
} from '@/lib/map-store-source-meta';
import type { NewsApiDashboardSummaryResponse } from '@/lib/news-api';
import { isValidOpsSessionToken, OPS_LOGIN_PATH, OPS_SESSION_COOKIE } from '@/lib/ops-auth';
import { resolvePublisherInfo } from '@/lib/publisher-groups';
import type {
  SourceEndpointBreakdown,
  SourceEndpointProfile,
  SourceSitemapKind,
} from '@/lib/source-endpoint-classification';
import { buildDisplaySourceName } from '@/lib/source-display';
import rssAtlas from '@/data/rss-atlas.json';

type ApiHealthResponse = {
  status: string;
  checkedAt: string;
  storage: string;
  latencyMs: number | null;
  timeoutMs: number | null;
  reason?: string;
};

type Props = {
  searchParams?: Promise<{
    endpointCountry?: string | string[];
  }>;
};

type StrategyCountryRow = MapCountryMetricsResponse['countries'][number];
type ActiveSourceRow = MapCountrySourcesResponse['sources'][number];
type OpsCountryDrilldownRow = {
  source: string;
  publisher: string | null;
  method: ActiveSourceRow['method'];
  endpointProfile: SourceEndpointProfile;
  sitemapKind: SourceSitemapKind;
  pub24h: number;
  active24h: boolean;
  health: ActiveSourceRow['health'];
  rssUrl: string | null;
  sitemapUrl: string | null;
};

const ENDPOINT_PROFILE_LABELS: Record<SourceEndpointProfile, string> = {
  rss_only: 'RSS only',
  news_sitemap_only: 'News sitemap only',
  sitemap_index_only: 'Sitemap index only',
  other_sitemap_only: 'Other sitemap only',
  rss_plus_news_sitemap: 'RSS + news sitemap',
  rss_plus_sitemap_index: 'RSS + sitemap index',
  rss_plus_other_sitemap: 'RSS + other sitemap',
};

const SITEMAP_KIND_LABELS: Record<SourceSitemapKind, string> = {
  none: 'None',
  news_sitemap: 'News sitemap',
  sitemap_index: 'Sitemap index',
  other_sitemap: 'Other sitemap',
};

const ENDPOINT_PROFILE_PRIORITY: Record<SourceEndpointProfile, number> = {
  rss_only: 0,
  rss_plus_other_sitemap: 1,
  rss_plus_sitemap_index: 2,
  rss_plus_news_sitemap: 3,
  other_sitemap_only: 4,
  sitemap_index_only: 5,
  news_sitemap_only: 6,
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

function getSingleQueryValue(value: string | string[] | undefined): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const trimmed = (item || '').trim();
      if (trimmed) return trimmed;
    }
  }
  return null;
}

function getRunnableAtlasSourceStats(): { sourceNames: number; outletRows: number } {
  const atlas = rssAtlas as {
    countries?: Array<{
      feeds?: Array<{
        name?: string;
        url?: string | null;
        sitemapUrl?: string | null;
        enabled?: boolean;
      }>;
    }>;
  } | undefined;
  if (!atlas || !Array.isArray(atlas.countries)) {
    return { sourceNames: 0, outletRows: 0 };
  }

  const seen = new Set<string>();
  let outletRows = 0;
  for (const country of atlas.countries) {
    const feeds = Array.isArray(country?.feeds) ? country.feeds : [];
    for (const feed of feeds) {
      if (feed?.enabled === false) continue;
      const hasRssUrl = typeof feed?.url === 'string' && feed.url.trim().length > 0;
      const hasSitemapUrl = typeof feed?.sitemapUrl === 'string' && feed.sitemapUrl.trim().length > 0;
      if (!hasRssUrl && !hasSitemapUrl) continue;
      const name = (feed?.name || '').trim();
      if (!name) continue;
      outletRows += 1;
      seen.add(buildDisplaySourceName(name).toLowerCase());
    }
  }
  return {
    sourceNames: seen.size,
    outletRows,
  };
}

function formatSourceCount(count: number | undefined | null, total: number): string {
  if (typeof count !== 'number' || !Number.isFinite(count)) return 'Unavailable';
  if (!Number.isFinite(total) || total <= 0) return formatInt(count);
  return `${formatInt(count)} out of ${formatInt(total)}`;
}

function countNewsSitemapCapable(value: SourceEndpointBreakdown): number {
  return value.newsSitemapOnly + value.rssPlusNewsSitemap;
}

function countSitemapIndexCapable(value: SourceEndpointBreakdown): number {
  return value.sitemapIndexOnly + value.rssPlusSitemapIndex;
}

function countOtherSitemapCapable(value: SourceEndpointBreakdown): number {
  return value.otherSitemapOnly + value.rssPlusOtherSitemap;
}

function countAnySitemapCapable(value: SourceEndpointBreakdown): number {
  return countNewsSitemapCapable(value) + countSitemapIndexCapable(value) + countOtherSitemapCapable(value);
}

function computeConfiguredRssOnlyRatio(row: StrategyCountryRow): number {
  if (!row.configuredSources24h) return 0;
  return row.configuredEndpointBreakdown.rssOnly / row.configuredSources24h;
}

function computeActiveRssOnlyRatio(row: StrategyCountryRow): number {
  if (!row.activeSources24h) return 0;
  return row.endpointBreakdown24h.rssOnly / row.activeSources24h;
}

function computeNewsSitemapLeverageScore(row: StrategyCountryRow): number {
  const base = row.configuredEndpointBreakdown.rssOnly + row.endpointBreakdown24h.rssOnly;
  const ratioMultiplier = 0.5 + ((computeConfiguredRssOnlyRatio(row) + computeActiveRssOnlyRatio(row)) / 2);
  return Math.round(base * ratioMultiplier);
}

function parseTimestamp(value: string | null | undefined): number {
  if (!value) return Number.NEGATIVE_INFINITY;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

function hasCountryMetricsPayload(value: MapCountryMetricsResponse | null): value is MapCountryMetricsResponse {
  return Boolean(value && Array.isArray(value.countries) && value.countries.length > 0);
}

function hasCountrySourcesPayload(value: MapCountrySourcesResponse | null): value is MapCountrySourcesResponse {
  return Boolean(value && Array.isArray(value.sources) && value.sources.length > 0);
}

function pickFreshestCountryMetrics(
  primary: MapCountryMetricsResponse | null,
  fallback: MapCountryMetricsResponse | null
): MapCountryMetricsResponse | null {
  const primaryValid = hasCountryMetricsPayload(primary);
  const fallbackValid = hasCountryMetricsPayload(fallback);
  if (primaryValid && fallbackValid) {
    return parseTimestamp(primary.generatedAt) >= parseTimestamp(fallback.generatedAt) ? primary : fallback;
  }
  if (primaryValid) return primary;
  if (fallbackValid) return fallback;
  return primary || fallback;
}

function pickFreshestCountrySources(
  primary: MapCountrySourcesResponse | null,
  fallback: MapCountrySourcesResponse | null
): MapCountrySourcesResponse | null {
  const primaryValid = hasCountrySourcesPayload(primary);
  const fallbackValid = hasCountrySourcesPayload(fallback);
  if (primaryValid && fallbackValid) {
    return parseTimestamp(primary.generatedAt) >= parseTimestamp(fallback.generatedAt) ? primary : fallback;
  }
  if (primaryValid) return primary;
  if (fallbackValid) return fallback;
  return primary || fallback;
}

function findStrategyCountry(rows: StrategyCountryRow[], requestedCountry: string | null): StrategyCountryRow | null {
  if (!requestedCountry) return null;
  const target = requestedCountry.trim().toLowerCase();
  return rows.find((row) => row.country.trim().toLowerCase() === target) || null;
}

function buildOpsCountryHref(country: string): string {
  return `/ops/?endpointCountry=${encodeURIComponent(country)}#endpoint-drilldown`;
}

function buildOpsCountryDrilldownRows(
  country: string,
  activePayload: MapCountrySourcesResponse | null
): OpsCountryDrilldownRow[] {
  const atlas = rssAtlas as {
    countries?: Array<{
      name?: string;
      feeds?: Array<{
        name?: string;
        enabled?: boolean;
      }>;
    }>;
  } | undefined;

  const activeBySource = new Map<string, ActiveSourceRow>();
  for (const row of activePayload?.sources || []) {
    activeBySource.set(normalizeSourceKey(row.source), row);
  }

  const deduped = new Map<string, OpsCountryDrilldownRow>();
  const countryFeeds = atlas?.countries?.find((entry) => (entry.name || '').trim() === country)?.feeds || [];
  for (const feed of countryFeeds) {
    if (feed?.enabled === false) continue;
    const displaySource = buildDisplaySourceName(feed?.name || '');
    if (!displaySource) continue;
    const sourceKey = normalizeSourceKey(displaySource);
    if (deduped.has(sourceKey)) continue;

    const meta = getSourceMeta(displaySource);
    if (classifySourceDistribution(meta) === 'portal') continue;

    const activeRow = activeBySource.get(sourceKey) || null;
    const publisher = activeRow?.publisher || resolvePublisherInfo(displaySource, country).publisher || null;
    deduped.set(sourceKey, {
      source: displaySource,
      publisher,
      method: activeRow?.method || classifySourceMethod(meta),
      endpointProfile: activeRow?.endpointProfile || classifySourceEndpoint(meta),
      sitemapKind: activeRow?.sitemapKind || classifySourceSitemapKind(meta),
      pub24h: activeRow?.pub24h || 0,
      active24h: Boolean(activeRow),
      health: activeRow?.health || 'unknown',
      rssUrl: meta?.rssUrl || activeRow?.rssUrl || null,
      sitemapUrl: meta?.sitemapUrl || activeRow?.sitemapUrl || null,
    });
  }

  return [...deduped.values()].sort((left, right) => {
    const leftPriority = ENDPOINT_PROFILE_PRIORITY[left.endpointProfile];
    const rightPriority = ENDPOINT_PROFILE_PRIORITY[right.endpointProfile];
    if (leftPriority !== rightPriority) return leftPriority - rightPriority;
    if (right.active24h !== left.active24h) return Number(right.active24h) - Number(left.active24h);
    if (right.pub24h !== left.pub24h) return right.pub24h - left.pub24h;
    return left.source.localeCompare(right.source);
  });
}

export default async function OpsPage({ searchParams }: Props) {
  const cookieStore = await cookies();
  const token = cookieStore.get(OPS_SESSION_COOKIE)?.value;
  if (!isValidOpsSessionToken(token)) {
    redirect(OPS_LOGIN_PATH);
  }

  const headerList = await headers();
  const baseUrl = getBaseUrl(headerList);
  const params = (await searchParams) || {};
  const requestedEndpointCountry = getSingleQueryValue(params.endpointCountry);

  const [summary, benchmark, mapCountries, internalMapCountriesDb, internalMapCountriesFile, apiHealth] = await Promise.all([
    baseUrl ? fetchJson<NewsApiDashboardSummaryResponse>(`${baseUrl}/api/customer/dashboard/summary/`) : Promise.resolve(null),
    baseUrl ? fetchJson<CountryBenchmarkResponse>(`${baseUrl}/api/customer/benchmark/`) : Promise.resolve(null),
    baseUrl ? fetchJson<MapCountryMetricsResponse>(`${baseUrl}/api/customer/map/countries/?window=24h`) : Promise.resolve(null),
    readMapCountryMetrics('24h'),
    readMapCountryMetricsFileSnapshot('24h'),
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
  const internalMapCountries =
    pickFreshestCountryMetrics(internalMapCountriesDb, internalMapCountriesFile) || internalMapCountriesDb;
  const runnableAtlasStats = getRunnableAtlasSourceStats();
  const strategyRows = [...internalMapCountries.countries]
    .sort((left, right) => {
      const leftScore = computeNewsSitemapLeverageScore(left);
      const rightScore = computeNewsSitemapLeverageScore(right);
      if (rightScore !== leftScore) return rightScore - leftScore;
      const leftPrimary = left.configuredEndpointBreakdown.rssOnly;
      const rightPrimary = right.configuredEndpointBreakdown.rssOnly;
      if (rightPrimary !== leftPrimary) return rightPrimary - leftPrimary;
      return (right.configuredSources24h ?? 0) - (left.configuredSources24h ?? 0);
    });
  const selectedCountry = findStrategyCountry(strategyRows, requestedEndpointCountry);
  const [selectedCountrySourcesDb, selectedCountrySourcesFile] = selectedCountry
    ? await Promise.all([
        readMapCountrySources(selectedCountry.country, '24h'),
        readMapCountrySourcesFileSnapshot(selectedCountry.country, '24h'),
      ])
    : [null, null];
  const selectedCountrySources = pickFreshestCountrySources(selectedCountrySourcesDb, selectedCountrySourcesFile);
  const selectedCountryDrilldown = selectedCountry
    ? buildOpsCountryDrilldownRows(selectedCountry.country, selectedCountrySources)
    : [];

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
            <small><OpsLocalTimestamp value={summary?.generatedAt} /></small>
          </article>

          <article className={styles.statusCard}>
            <span className={styles.statusLabel}>Benchmark</span>
            <strong>{formatAge(benchmark?.generatedAt)}</strong>
            <p>{benchmark?.dataSource || 'Unavailable'}</p>
            <small><OpsLocalTimestamp value={benchmark?.generatedAt} /></small>
          </article>

          <article className={styles.statusCard}>
            <span className={styles.statusLabel}>Map 24h</span>
            <strong>{formatAge(mapCountries?.generatedAt)}</strong>
            <p>{mapCountries?.dataSource || mapCountries?.storage || 'Unavailable'}</p>
            <small><OpsLocalTimestamp value={mapCountries?.generatedAt} /></small>
          </article>
        </div>
      </section>

      <section className={styles.detailGrid}>
        <article className={styles.detailPanel}>
          <h2>Dashboard Summary</h2>
          <div className={styles.detailMeta}>
            <span className={styles.chip}>{summary?.dataSource || summary?.storage || 'unknown'}</span>
            <span className={styles.chip}><OpsLocalTimestamp value={summary?.generatedAt} /></span>
          </div>
          <p className={styles.detailNote}>
            Canonical rolling 24h totals from customer-visible <code>news_articles</code>.
          </p>
          <p className={styles.detailNote}>
            Checked-source denominator uses the runnable atlas universe: {formatInt(runnableAtlasStats.sourceNames)} source names across {formatInt(runnableAtlasStats.outletRows)} outlet rows.
          </p>
          <div className={styles.statList}>
            <div className={styles.statRow}>
              <span>Global inserted 24h</span>
              <strong>{formatInt(summary?.totals.inserted24h)}</strong>
            </div>
            <div className={styles.statRow}>
              <span>Global published 24h</span>
              <strong>{formatInt(summary?.totals.published24h)}</strong>
            </div>
            <div className={styles.statRow}>
              <span>Distinct worker-attempted sources 24h</span>
              <strong>{formatSourceCount(summary?.totals.checkedSources24h, runnableAtlasStats.sourceNames)}</strong>
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
            <span className={styles.chip}><OpsLocalTimestamp value={benchmark?.generatedAt} /></span>
          </div>
          <p className={styles.detailNote}>
            Country-ranked hourly snapshot totals. This is a benchmark lens, not the canonical product total.
          </p>
          <div className={styles.statList}>
            <div className={styles.statRow}>
              <span>Configured benchmark countries</span>
              <strong>{formatInt(benchmark?.totals?.countries)}</strong>
            </div>
            <div className={styles.statRow}>
              <span>Country-snapshot published 24h</span>
              <strong>{formatInt(benchmark?.totals?.hourlyPublished24h)}</strong>
            </div>
            <div className={styles.statRow}>
              <span>Country-snapshot inserted 24h</span>
              <strong>{formatInt(benchmark?.totals?.hourlyInserted24h)}</strong>
            </div>
          </div>
        </article>

        <article className={styles.detailPanel}>
          <h2>Map Snapshot</h2>
          <div className={styles.detailMeta}>
            <span className={styles.chip}>{mapCountries?.dataSource || mapCountries?.storage || 'unknown'}</span>
            <span className={styles.chip}><OpsLocalTimestamp value={mapCountries?.generatedAt} /></span>
          </div>
          <p className={styles.detailNote}>
            Direct-publisher map subset only. Portal-classified and off-map sources are excluded here.
          </p>
          <div className={styles.statList}>
            <div className={styles.statRow}>
              <span>Mapped direct-publisher published 24h</span>
              <strong>{formatInt(mapCountries?.totals?.pub24h)}</strong>
            </div>
            <div className={styles.statRow}>
              <span>Mapped active sources 24h</span>
              <strong>{formatInt(mapCountries?.totals?.activeSources24h)}</strong>
            </div>
            <div className={styles.statRow}>
              <span>Mapped active countries</span>
              <strong>{formatInt(mapCountries?.totals?.countries)}</strong>
            </div>
            <div className={styles.statRow}>
              <span>Mapped late share 24h</span>
              <strong>{formatPercent(mapCountries?.totals?.windows?.['24h']?.lateShare)}</strong>
            </div>
          </div>
        </article>

        <article className={styles.detailPanel}>
          <h2>Top Countries</h2>
          <div className={styles.detailMeta}>
            <span className={styles.chip}>{formatInt(summary?.preview.articleCount)} articles</span>
            <span className={styles.chip}><OpsLocalTimestamp value={summary?.latestDate} fallback="No date" /></span>
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

        <article className={`${styles.detailPanel} ${styles.widePanel}`} id="endpoint-strategy">
          <h2>Endpoint Strategy</h2>
          <div className={styles.detailMeta}>
            <span className={styles.chip}>Ops only</span>
            <span className={styles.chip}>{formatInt(strategyRows.length)} countries</span>
            <span className={styles.chip}><OpsLocalTimestamp value={internalMapCountries.generatedAt} /></span>
          </div>
          <p className={styles.detailNote}>
            Internal source-endpoint mix for sitemap expansion planning. This data is intentionally kept out of customer-facing dashboard, benchmark, and map responses.
          </p>
          <p className={styles.detailNote}>
            Leverage score is a heuristic: <code>(configured RSS-only + active 24h RSS-only) * concentration factor</code>. Higher means more upside from finding news sitemaps for existing RSS-only sources.
          </p>
          <div className={styles.bucketStrip}>
            <div className={styles.bucketCard}>
              <strong>{formatInt(internalMapCountries.totals.configuredEndpointBreakdown.rssOnly)}</strong>
              <span>Configured RSS-only</span>
            </div>
            <div className={styles.bucketCard}>
              <strong>{formatInt(countNewsSitemapCapable(internalMapCountries.totals.configuredEndpointBreakdown))}</strong>
              <span>Configured news sitemap capable</span>
            </div>
            <div className={styles.bucketCard}>
              <strong>{formatInt(countSitemapIndexCapable(internalMapCountries.totals.configuredEndpointBreakdown))}</strong>
              <span>Configured sitemap index capable</span>
            </div>
            <div className={styles.bucketCard}>
              <strong>{formatInt(countOtherSitemapCapable(internalMapCountries.totals.configuredEndpointBreakdown))}</strong>
              <span>Configured other sitemap capable</span>
            </div>
            <div className={styles.bucketCard}>
              <strong>{formatInt(internalMapCountries.totals.windows['24h'].endpointBreakdown.rssOnly)}</strong>
              <span>Active 24h RSS-only</span>
            </div>
            <div className={styles.bucketCard}>
              <strong>{formatInt(countNewsSitemapCapable(internalMapCountries.totals.windows['24h'].endpointBreakdown))}</strong>
              <span>Active 24h news sitemap capable</span>
            </div>
            <div className={styles.bucketCard}>
              <strong>{formatInt(countSitemapIndexCapable(internalMapCountries.totals.windows['24h'].endpointBreakdown))}</strong>
              <span>Active 24h sitemap index capable</span>
            </div>
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Country</th>
                  <th>Leverage</th>
                  <th>Configured</th>
                  <th>Configured RSS-only</th>
                  <th>RSS-only Ratio</th>
                  <th>Configured News Sitemap</th>
                  <th>Configured Index</th>
                  <th>Configured Any Sitemap</th>
                  <th>Active 24h RSS-only</th>
                  <th>Active 24h Any Sitemap</th>
                </tr>
              </thead>
              <tbody>
                {strategyRows.map((country) => (
                  <tr
                    key={country.country}
                    className={selectedCountry?.country === country.country ? styles.activeRow : undefined}
                  >
                    <td>
                      <Link className={styles.tableLink} href={buildOpsCountryHref(country.country)}>
                        <strong>{country.country}</strong>
                      </Link>
                      <span>{country.countryCode || 'No code'}</span>
                    </td>
                    <td>{formatInt(computeNewsSitemapLeverageScore(country))}</td>
                    <td>{formatInt(country.configuredSources24h)}</td>
                    <td>{formatInt(country.configuredEndpointBreakdown.rssOnly)}</td>
                    <td>{formatPercent(computeConfiguredRssOnlyRatio(country))}</td>
                    <td>{formatInt(countNewsSitemapCapable(country.configuredEndpointBreakdown))}</td>
                    <td>{formatInt(countSitemapIndexCapable(country.configuredEndpointBreakdown))}</td>
                    <td>{formatInt(countAnySitemapCapable(country.configuredEndpointBreakdown))}</td>
                    <td>{formatInt(country.endpointBreakdown24h.rssOnly)}</td>
                    <td>{formatInt(countAnySitemapCapable(country.endpointBreakdown24h))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <article className={`${styles.detailPanel} ${styles.widePanel}`} id="endpoint-drilldown">
          <h2>Country Drilldown</h2>
          {selectedCountry && selectedCountrySources ? (
            <>
              <div className={styles.detailMeta}>
                <span className={styles.chip}>{selectedCountry.country}</span>
                <span className={styles.chip}>Configured direct sources {formatInt(selectedCountry.configuredSources24h)}</span>
                <span className={styles.chip}>Active 24h {formatInt(selectedCountrySources.summary.activeSources24h)}</span>
                <span className={styles.chip}><OpsLocalTimestamp value={selectedCountrySources.generatedAt} /></span>
                <Link className={styles.chipLink} href="/ops/#endpoint-strategy">
                  Clear
                </Link>
              </div>
              <p className={styles.detailNote}>
                Configured direct-publisher sources for the selected country. <code>pub24h</code> and health fields are hydrated from the latest 24h active-source snapshot when available.
              </p>
              <div className={styles.bucketStrip}>
                <div className={styles.bucketCard}>
                  <strong>{formatInt(computeNewsSitemapLeverageScore(selectedCountry))}</strong>
                  <span>News sitemap leverage</span>
                </div>
                <div className={styles.bucketCard}>
                  <strong>{formatPercent(computeConfiguredRssOnlyRatio(selectedCountry))}</strong>
                  <span>Configured RSS-only ratio</span>
                </div>
                <div className={styles.bucketCard}>
                  <strong>{formatInt(selectedCountry.configuredEndpointBreakdown.rssOnly)}</strong>
                  <span>Configured RSS-only</span>
                </div>
                <div className={styles.bucketCard}>
                  <strong>{formatInt(countNewsSitemapCapable(selectedCountry.configuredEndpointBreakdown))}</strong>
                  <span>Configured news sitemap capable</span>
                </div>
                <div className={styles.bucketCard}>
                  <strong>{formatInt(countSitemapIndexCapable(selectedCountry.configuredEndpointBreakdown))}</strong>
                  <span>Configured sitemap index capable</span>
                </div>
                <div className={styles.bucketCard}>
                  <strong>{formatInt(selectedCountry.endpointBreakdown24h.rssOnly)}</strong>
                  <span>Active 24h RSS-only</span>
                </div>
                <div className={styles.bucketCard}>
                  <strong>{formatInt(countAnySitemapCapable(selectedCountry.endpointBreakdown24h))}</strong>
                  <span>Active 24h any sitemap</span>
                </div>
              </div>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Source</th>
                      <th>Publisher</th>
                      <th>Endpoint</th>
                      <th>Sitemap Kind</th>
                      <th>Method</th>
                      <th>Pub 24h</th>
                      <th>Health</th>
                      <th>URLs</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedCountryDrilldown.map((source) => (
                      <tr key={source.source}>
                        <td>
                          <strong>{source.source}</strong>
                          <span>{source.active24h ? 'Active 24h' : 'No 24h activity'}</span>
                        </td>
                        <td>{source.publisher || 'Unknown'}</td>
                        <td>{ENDPOINT_PROFILE_LABELS[source.endpointProfile]}</td>
                        <td>{SITEMAP_KIND_LABELS[source.sitemapKind]}</td>
                        <td>{source.method}</td>
                        <td>{formatInt(source.pub24h)}</td>
                        <td>{source.health}</td>
                        <td>
                          <strong>{source.rssUrl ? 'RSS' : 'No RSS'}</strong>
                          <span>{source.sitemapUrl ? 'Sitemap' : 'No sitemap'}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className={styles.emptyState}>
              Click a country in the endpoint strategy table to inspect configured sources, endpoint types, and recent 24h activity.
            </div>
          )}
        </article>
      </section>

      <OpsExplorer />
    </div>
  );
}
