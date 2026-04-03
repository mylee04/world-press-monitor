#!/usr/bin/env bun
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

type AtlasFeed = {
  name: string;
  url: string | null;
  status?: string | null;
  checkedDate?: string | null;
  valid?: string | null;
  row?: number;
  enabled?: boolean;
};

type AtlasCountry = {
  name: string;
  code: string;
  feeds: AtlasFeed[];
};

type Atlas = {
  version: number;
  generatedAt: string;
  lastChecked: string;
  countries: AtlasCountry[];
};

const ATLAS_PATH = resolve(process.cwd(), 'data/rss-atlas.json');
const OUTPUT_PATH = resolve(process.cwd(), 'audits/rss_atlas_latest.json');

function main(): void {
  const raw = readFileSync(ATLAS_PATH, 'utf8');
  const atlas = JSON.parse(raw) as Atlas;

  if (!Array.isArray(atlas.countries)) {
    throw new Error(`Invalid atlas format in ${ATLAS_PATH}`);
  }

  const payload = {
    exportedAt: new Date().toISOString(),
    atlasFile: ATLAS_PATH,
    version: atlas.version,
    generatedAt: atlas.generatedAt,
    lastChecked: atlas.lastChecked,
    countries: atlas.countries.length,
    feeds: atlas.countries.reduce((total, country) => total + country.feeds.length, 0),
    noSourceFeeds: atlas.countries.reduce(
      (total, country) => total + country.feeds.filter((feed) => !feed.url).length,
      0
    ),
    disabledFeeds: atlas.countries.reduce(
      (total, country) => total + country.feeds.filter((feed) => feed.enabled === false).length,
      0
    ),
    atlas,
  };

  mkdirSync(resolve(process.cwd(), 'audits'), { recursive: true });
  writeFileSync(OUTPUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

  console.log(
    `wrote ${OUTPUT_PATH} with ${payload.countries} countries and ${payload.feeds} feeds`
  );
}

main();
