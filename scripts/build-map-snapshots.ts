#!/usr/bin/env bun

import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { buildMapCountryMetricsPayload } from '@/lib/map-country-metrics-builder';
import { buildMapCountrySourcesPayload } from '@/lib/map-country-sources-reader';
import { buildMapPublishersPayload } from '@/lib/map-publishers-builder';
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

    const countries = await buildMapCountryMetricsPayload(window);
    await writeMapCountryMetricsSnapshot(countries, metricVersion);
    await writeFile(getMapCountryMetricsSnapshotPath(window), JSON.stringify(countries));
    console.log(`[map-snapshots] countries written window=${window} rows=${countries.countries.length}`);

    const countrySourcesSnapshot: Record<string, MapCountrySourcesResponse> = {};
    for (const country of countries.countries) {
      const countrySources = await buildMapCountrySourcesPayload(country.country, window);
      await writeMapCountrySourcesSnapshot(countrySources, metricVersion);
      countrySourcesSnapshot[country.country] = countrySources;
      console.log(
        `[map-snapshots] country sources written window=${window} country=${country.country} rows=${countrySources.sources.length}`
      );
    }
    await writeFile(getMapCountrySourcesSnapshotPath(window), JSON.stringify(countrySourcesSnapshot));

    const publishers = await buildMapPublishersPayload(window);
    await writeMapPublishersSnapshot(publishers, metricVersion);
    await writeFile(getMapPublishersSnapshotPath(window), JSON.stringify(publishers));
    console.log(`[map-snapshots] publishers written window=${window} rows=${publishers.publishers.length}`);

    console.log(`[map-snapshots] build done window=${window} elapsedMs=${Date.now() - startedAt}`);
  }
}

main().catch((error) => {
  console.error(`[map-snapshots] failed: ${error instanceof Error ? error.stack || error.message : String(error)}`);
  process.exitCode = 1;
});
