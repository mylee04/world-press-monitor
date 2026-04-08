import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import bundledCountryBenchmarkSnapshot from '@/data/country-benchmark.snapshot.json';
import bundledDashboardSummarySnapshot from '@/data/dashboard-summary.snapshot.json';
import type { CountryBenchmarkResponse } from '@/lib/benchmark-types';
import type { NewsApiDashboardSummaryResponse } from '@/lib/news-api';

const DASHBOARD_SUMMARY_SNAPSHOT_FILENAME = 'dashboard-summary.snapshot.json';
const COUNTRY_BENCHMARK_SNAPSHOT_FILENAME = 'country-benchmark.snapshot.json';
const DEFAULT_SUMMARY_SNAPSHOT_MAX_AGE_SECONDS = 2 * 60 * 60;
const DEFAULT_BENCHMARK_SNAPSHOT_MAX_AGE_SECONDS = 2 * 60 * 60;

function uniquePaths(paths: string[]): string[] {
  return [...new Set(paths.filter(Boolean))];
}

function getSnapshotRootDirectories(): string[] {
  return uniquePaths([
    process.cwd(),
    (process.env.WPR_PRIMARY_WORKTREE || '').trim(),
    (process.env.WPM_PRIMARY_WORKTREE || '').trim(),
  ]);
}

function getSnapshotPaths(fileName: string): string[] {
  return getSnapshotRootDirectories().map((rootDir) => path.join(rootDir, 'data', fileName));
}

function parsePositiveDurationSeconds(rawValue: string | undefined, fallbackSeconds: number): number {
  const parsed = Number.parseInt((rawValue || '').trim(), 10);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return fallbackSeconds;
}

function resolveSnapshotGeneratedAt(snapshot: { generatedAt?: string | null } | null | undefined): number | null {
  if (!snapshot?.generatedAt) {
    return null;
  }
  const timestamp = Date.parse(snapshot.generatedAt);
  return Number.isFinite(timestamp) ? timestamp : null;
}

async function readJsonSnapshot<T>(filePaths: string[]): Promise<T | null> {
  for (const filePath of filePaths) {
    try {
      const raw = await readFile(filePath, 'utf8');
      const parsed = JSON.parse(raw) as T | null;
      if (parsed && typeof parsed === 'object') {
        return parsed;
      }
    } catch {
      continue;
    }
  }
  return null;
}

function cloneBundledSnapshot<T>(payload: T | null | undefined): T | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  return JSON.parse(JSON.stringify(payload)) as T;
}

async function writeJsonSnapshot<T>(filePaths: string[], payload: T): Promise<void> {
  const raw = JSON.stringify(payload);
  await Promise.all(filePaths.map(async (filePath) => {
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, raw);
  }));
}

export async function readDashboardSummarySnapshot(): Promise<NewsApiDashboardSummaryResponse | null> {
  return (await readJsonSnapshot<NewsApiDashboardSummaryResponse>(getSnapshotPaths(DASHBOARD_SUMMARY_SNAPSHOT_FILENAME)))
    ?? cloneBundledSnapshot<NewsApiDashboardSummaryResponse>(
      bundledDashboardSummarySnapshot as unknown as NewsApiDashboardSummaryResponse
    );
}

export async function readCountryBenchmarkSnapshot(): Promise<CountryBenchmarkResponse | null> {
  return (await readJsonSnapshot<CountryBenchmarkResponse>(getSnapshotPaths(COUNTRY_BENCHMARK_SNAPSHOT_FILENAME)))
    ?? cloneBundledSnapshot<CountryBenchmarkResponse>(
      bundledCountryBenchmarkSnapshot as unknown as CountryBenchmarkResponse
    );
}

export async function writeDashboardSummarySnapshot(snapshot: NewsApiDashboardSummaryResponse): Promise<void> {
  await writeJsonSnapshot(getSnapshotPaths(DASHBOARD_SUMMARY_SNAPSHOT_FILENAME), snapshot);
}

export async function writeCountryBenchmarkSnapshot(snapshot: CountryBenchmarkResponse): Promise<void> {
  await writeJsonSnapshot(getSnapshotPaths(COUNTRY_BENCHMARK_SNAPSHOT_FILENAME), snapshot);
}

export function resolveDashboardSummarySnapshotMaxAgeMs(): number {
  return parsePositiveDurationSeconds(
    process.env.NEWS_API_DASHBOARD_SNAPSHOT_MAX_AGE_SECONDS || process.env.WPR_DASHBOARD_SNAPSHOT_MAX_AGE_SECONDS,
    DEFAULT_SUMMARY_SNAPSHOT_MAX_AGE_SECONDS
  ) * 1_000;
}

export function resolveCountryBenchmarkSnapshotMaxAgeMs(): number {
  return parsePositiveDurationSeconds(
    process.env.NEWS_API_BENCHMARK_SNAPSHOT_MAX_AGE_SECONDS || process.env.WPR_BENCHMARK_SNAPSHOT_MAX_AGE_SECONDS,
    DEFAULT_BENCHMARK_SNAPSHOT_MAX_AGE_SECONDS
  ) * 1_000;
}

export function isFreshDashboardSummarySnapshot(
  snapshot: NewsApiDashboardSummaryResponse | null | undefined,
  maxAgeMs = resolveDashboardSummarySnapshotMaxAgeMs()
): snapshot is NewsApiDashboardSummaryResponse {
  if (!snapshot || snapshot.storage !== 'postgres') {
    return false;
  }
  const generatedAt = resolveSnapshotGeneratedAt(snapshot);
  return generatedAt != null && Date.now() - generatedAt <= maxAgeMs;
}

export function isFreshCountryBenchmarkSnapshot(
  snapshot: CountryBenchmarkResponse | null | undefined,
  maxAgeMs = resolveCountryBenchmarkSnapshotMaxAgeMs()
): snapshot is CountryBenchmarkResponse {
  if (!snapshot || snapshot.storage !== 'postgres') {
    return false;
  }
  const generatedAt = resolveSnapshotGeneratedAt(snapshot);
  return generatedAt != null && Date.now() - generatedAt <= maxAgeMs;
}

export async function readFreshDashboardSummarySnapshot(
  maxAgeMs = resolveDashboardSummarySnapshotMaxAgeMs()
): Promise<NewsApiDashboardSummaryResponse | null> {
  const snapshot = await readDashboardSummarySnapshot();
  return isFreshDashboardSummarySnapshot(snapshot, maxAgeMs) ? snapshot : null;
}

export async function readFreshCountryBenchmarkSnapshot(
  maxAgeMs = resolveCountryBenchmarkSnapshotMaxAgeMs()
): Promise<CountryBenchmarkResponse | null> {
  const snapshot = await readCountryBenchmarkSnapshot();
  return isFreshCountryBenchmarkSnapshot(snapshot, maxAgeMs) ? snapshot : null;
}
