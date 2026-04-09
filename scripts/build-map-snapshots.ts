#!/usr/bin/env bun

import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { buildMapCountryMetricsPayload } from '@/lib/map-country-metrics-builder';
import { buildMapCountrySourcesPayload } from '@/lib/map-country-sources-reader';
import { buildMapPublishersPayload } from '@/lib/map-publishers-builder';
import { readLatestHealthBySource, readWindowedSourceMetrics } from '@/lib/map-store-db';
import {
  writeMapCountryMetricsSnapshot,
  writeMapCountrySourcesSnapshot,
  writeMapPublishersSnapshot,
} from '@/lib/map-snapshot-store';
import { DEFAULT_MAP_WINDOW, MAP_WINDOWS, normalizeMapMetricWindow } from '@/lib/map-store-windows';
import type { MapCountrySourcesResponse, MapMetricWindow } from '@/lib/map-types';

function getMapCountryMetricsSnapshotPath(window: MapMetricWindow): string {
  return path.join(process.cwd(), 'data', `map-country-metrics.snapshot.${window}.json`);
}

function getMapPublishersSnapshotPath(window: MapMetricWindow): string {
  return path.join(process.cwd(), 'data', `map-publishers.snapshot.${window}.json`);
}

function getMapCountrySourcesSnapshotPath(window: MapMetricWindow): string {
  return path.join(process.cwd(), 'data', `map-country-sources.snapshot.${window}.json`);
}

function parseArgValue(flag: string): string | null {
  const inline = process.argv.find((token) => token.startsWith(`${flag}=`));
  if (inline) return inline.slice(flag.length + 1).trim() || null;
  const index = process.argv.indexOf(flag);
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1].trim() || null;
  return null;
}

function parseWindows(): MapMetricWindow[] {
  const rawWindow = parseArgValue('--window');
  if (!rawWindow) return MAP_WINDOWS;
  if (rawWindow === 'all') return MAP_WINDOWS;
  return [normalizeMapMetricWindow(rawWindow || DEFAULT_MAP_WINDOW)];
}

function parseMetricVersion(): string {
  return (parseArgValue('--metric-version') || 'v1').trim() || 'v1';
}

async function main(): Promise<void> {
  const windows = parseWindows();
  const metricVersion = parseMetricVersion();

  for (const window of windows) {
    const startedAt = Date.now();
    console.log(`[map-snapshots] build start window=${window} metricVersion=${metricVersion}`);

    const sourceMetricsStartedAt = Date.now();
    const [countryScopedMetricRows, sourceScopedMetricRows, healthBySource] = await Promise.all([
      readWindowedSourceMetrics(window, `coalesce(nullif(trim(country), ''), '') <> ''`),
      readWindowedSourceMetrics(window, `coalesce(nullif(trim(source), ''), '') <> ''`),
      readLatestHealthBySource(),
    ]);
    console.log(
      `[map-snapshots] source metrics loaded window=${window} countryRows=${countryScopedMetricRows.length} sourceRows=${sourceScopedMetricRows.length} healthRows=${healthBySource.size} elapsedMs=${Date.now() - sourceMetricsStartedAt}`
    );

    const countriesStartedAt = Date.now();
    const countries = await buildMapCountryMetricsPayload(window, {
      metricRows: countryScopedMetricRows,
      healthBySource,
    });
    await writeMapCountryMetricsSnapshot(countries, metricVersion);
    await writeFile(getMapCountryMetricsSnapshotPath(window), JSON.stringify(countries));
    console.log(
      `[map-snapshots] countries written window=${window} rows=${countries.countries.length} elapsedMs=${Date.now() - countriesStartedAt}`
    );

    const countrySourcesSnapshot: Record<string, MapCountrySourcesResponse> = {};
    const countrySourcesStartedAt = Date.now();
    for (const country of countries.countries) {
      const countryStartedAt = Date.now();
      const countrySources = await buildMapCountrySourcesPayload(country.country, window, {
        metricRows: sourceScopedMetricRows,
        healthBySource,
      });
      await writeMapCountrySourcesSnapshot(countrySources, metricVersion);
      countrySourcesSnapshot[country.country] = countrySources;
      console.log(
        `[map-snapshots] country sources written window=${window} country=${country.country} rows=${countrySources.sources.length} elapsedMs=${Date.now() - countryStartedAt}`
      );
    }
    await writeFile(getMapCountrySourcesSnapshotPath(window), JSON.stringify(countrySourcesSnapshot));
    console.log(
      `[map-snapshots] country sources snapshot written window=${window} countries=${countries.countries.length} elapsedMs=${Date.now() - countrySourcesStartedAt}`
    );

    const publishersStartedAt = Date.now();
    const publishers = await buildMapPublishersPayload(window, {
      metricRows: countryScopedMetricRows,
      healthBySource,
    });
    await writeMapPublishersSnapshot(publishers, metricVersion);
    await writeFile(getMapPublishersSnapshotPath(window), JSON.stringify(publishers));
    console.log(
      `[map-snapshots] publishers written window=${window} rows=${publishers.publishers.length} elapsedMs=${Date.now() - publishersStartedAt}`
    );

    console.log(`[map-snapshots] build done window=${window} elapsedMs=${Date.now() - startedAt}`);
  }
}

main().catch((error) => {
  console.error(`[map-snapshots] failed: ${error instanceof Error ? error.stack || error.message : String(error)}`);
  process.exitCode = 1;
});
