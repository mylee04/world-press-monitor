import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { readCountryBenchmark } from '@/lib/benchmark-store';
import { buildDisabledCountryBenchmarkResponse } from '@/lib/benchmark-store-shaping';
import { readNewsDashboardSummary } from '@/lib/ingestion-store';
import type { NewsApiDashboardSummaryResponse } from '@/lib/news-api';

type SummaryBuildResult = Omit<NewsApiDashboardSummaryResponse, 'reason'> & {
  reason?: string;
};

function normalizeDashboardSummarySnapshot(summary: Awaited<ReturnType<typeof readNewsDashboardSummary>>): NewsApiDashboardSummaryResponse {
  return {
    storage: summary.storage,
    generatedAt: summary.generatedAt,
    windowDays: summary.windowDays,
    latestHours: summary.latestHours,
    latestDate: summary.latestDate,
    previewDate: summary.previewDate,
    totals: summary.totals,
    sectionTotals: summary.sectionTotals,
    recentDates: summary.recentDates,
    topicSampleSize: summary.topicSampleSize,
    topicGroups: summary.topicGroups,
    sourceCategoryCoverage: summary.sourceCategoryCoverage,
    preview: {
      articleCount: summary.preview.articleCount,
      topCountries: summary.preview.topCountries
        .filter((item): item is { country: string; count: number } => Boolean(item.country))
        .map((item) => ({
          country: item.country,
          countryCode: null,
          count: item.count,
        })),
      headlines: summary.preview.headlines.map((item) => ({
        ...item,
        countryCode: null,
      })),
    },
  };
}

function buildDisabledDashboardSummarySnapshot(reason: string | undefined): SummaryBuildResult {
  return {
    storage: 'disabled',
    generatedAt: null,
    windowDays: 31,
    latestHours: 24,
    latestDate: null,
    previewDate: null,
    totals: {
      rowsWindow: 0,
      inserted24h: 0,
      published24h: 0,
      checkedSources24h: 0,
    },
    sectionTotals: {},
    recentDates: [],
    topicSampleSize: 0,
    topicGroups: [],
    sourceCategoryCoverage: {
      categorizedArticles: 0,
      uncategorizedArticles: 0,
      distinctCategories: 0,
      topCategories: [],
    },
    preview: {
      articleCount: 0,
      topCountries: [],
      headlines: [],
    },
    reason: reason || 'Dashboard summary storage is unavailable.',
  };
}

async function main() {
  const summaryPath = path.join(process.cwd(), 'data', 'dashboard-summary.snapshot.json');
  const benchmarkPath = path.join(process.cwd(), 'data', 'country-benchmark.snapshot.json');
  const result: Record<string, unknown> = {};
  let failed = false;

  try {
    const summary = await readNewsDashboardSummary();
    const snapshot = summary.storage === 'postgres'
      ? normalizeDashboardSummarySnapshot(summary)
      : buildDisabledDashboardSummarySnapshot(summary.reason);

    await writeFile(summaryPath, JSON.stringify(snapshot));
    result.summary = {
      storage: snapshot.storage,
      generatedAt: snapshot.generatedAt,
      rowsWindow: snapshot.totals.rowsWindow,
      previewDate: snapshot.previewDate,
      reason: snapshot.reason,
      path: summaryPath,
    };
  } catch (error: unknown) {
    failed = true;
    const reason = error instanceof Error ? error.message : 'Failed to build dashboard summary snapshot.';
    const snapshot = buildDisabledDashboardSummarySnapshot(reason);
    await writeFile(summaryPath, JSON.stringify(snapshot));
    result.summary = {
      storage: snapshot.storage,
      generatedAt: snapshot.generatedAt,
      rowsWindow: snapshot.totals.rowsWindow,
      previewDate: snapshot.previewDate,
      reason: snapshot.reason,
      path: summaryPath,
    };
    result.summaryError = reason;
  }

  try {
    const benchmark = await readCountryBenchmark();
    const benchmarkSnapshot = benchmark.storage === 'postgres'
      ? benchmark
      : buildDisabledCountryBenchmarkResponse();

    if (benchmark.reason) {
      benchmarkSnapshot.reason = benchmark.reason;
    }

    await writeFile(benchmarkPath, JSON.stringify(benchmarkSnapshot));
    result.benchmark = {
      storage: benchmarkSnapshot.storage,
      generatedAt: benchmarkSnapshot.generatedAt,
      countries: benchmarkSnapshot.totals.countries,
      hourlyPublished24h: benchmarkSnapshot.totals.hourlyPublished24h,
      reason: benchmarkSnapshot.reason,
      path: benchmarkPath,
    };
  } catch (error: unknown) {
    failed = true;
    const reason = error instanceof Error ? error.message : 'Failed to build country benchmark snapshot.';
    const benchmarkSnapshot = buildDisabledCountryBenchmarkResponse();
    benchmarkSnapshot.reason = reason;

    await writeFile(benchmarkPath, JSON.stringify(benchmarkSnapshot));
    result.benchmark = {
      storage: benchmarkSnapshot.storage,
      generatedAt: benchmarkSnapshot.generatedAt,
      countries: benchmarkSnapshot.totals.countries,
      hourlyPublished24h: benchmarkSnapshot.totals.hourlyPublished24h,
      reason: benchmarkSnapshot.reason,
      path: benchmarkPath,
    };
    result.benchmarkError = reason;
  }

  console.log(JSON.stringify(result, null, 2));
  if (failed) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('[build-customer-dashboard-snapshots] failed:', error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
