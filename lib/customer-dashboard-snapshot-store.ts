import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { CountryBenchmarkResponse } from '@/lib/benchmark-types';
import type { NewsApiDashboardSummaryResponse } from '@/lib/news-api';

const DASHBOARD_SUMMARY_SNAPSHOT_PATH = path.join(process.cwd(), 'data', 'dashboard-summary.snapshot.json');
const COUNTRY_BENCHMARK_SNAPSHOT_PATH = path.join(process.cwd(), 'data', 'country-benchmark.snapshot.json');

async function readJsonSnapshot<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw) as T | null;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export async function readDashboardSummarySnapshot(): Promise<NewsApiDashboardSummaryResponse | null> {
  return readJsonSnapshot<NewsApiDashboardSummaryResponse>(DASHBOARD_SUMMARY_SNAPSHOT_PATH);
}

export async function readCountryBenchmarkSnapshot(): Promise<CountryBenchmarkResponse | null> {
  return readJsonSnapshot<CountryBenchmarkResponse>(COUNTRY_BENCHMARK_SNAPSHOT_PATH);
}
