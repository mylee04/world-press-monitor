import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const README_PATH = resolve(process.cwd(), 'README.md');
const OUTPUT_PATH = resolve(process.cwd(), 'data/rss-atlas.json');

const SECTION_HEADER = /^###\s+(.+?)\s+\(([^)]+)\)$/;
const TABLE_HEADER = /^\|No\.\|Outlet\|RSS URL\|HTTP Status\|Checked Date\|Valid\?\|Ingested 24h\|$/;
const TABLE_SEPARATOR = /^\|---\|---\|---\|---\|---\|---\|---:?\|$/;
const TABLE_ROW = /^(\d+)\|([^|]+)\|([^|]+)\|([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)\|?$/;
const CHECKED_DATE_LINE = /^- Last checked:\s*(\d{2}\/\d{2}\/\d{4})/;

type AtlasFeed = {
  name: string;
  url: string | null;
  status: string | null;
  checkedDate: string | null;
  valid: string | null;
  row: number;
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

const source = readFileSync(README_PATH, 'utf8').split(/\r?\n/);

const found = source.find((line) => CHECKED_DATE_LINE.test(line));
const lastChecked = found ? (found.match(CHECKED_DATE_LINE)?.[1] || 'unknown') : 'unknown';

const countries: AtlasCountry[] = [];

for (let i = 0; i < source.length; i += 1) {
  const headingMatch = source[i].match(SECTION_HEADER);
  if (!headingMatch) continue;

  const countryName = headingMatch[1].trim();
  const countryCode = headingMatch[2].trim();
  if (!TABLE_HEADER.test((source[i + 1] || '').trim())) continue;
  if (!TABLE_SEPARATOR.test((source[i + 2] || '').trim())) continue;

  const feeds: AtlasFeed[] = [];
  let j = i + 3;
  while (j < source.length && /^\d+\|/.test(source[j])) {
    const rowMatch = source[j].match(TABLE_ROW);
    if (rowMatch) {
      const row = Number.parseInt(rowMatch[1], 10);
      const name = rowMatch[2].trim();
      const rawUrl = rowMatch[3].trim();
      const status = rowMatch[4].trim() || null;
      const checkedDate = rowMatch[5].trim() || null;
      const valid = rowMatch[6].trim() || null;
      const extracted = rawUrl.replace(/^<([^>]+)>$/, '$1').trim();
      const isNoSource = /^N\/A$/i.test(extracted) || extracted.length === 0;

      feeds.push({
        name,
        url: isNoSource ? null : extracted,
        status,
        checkedDate,
        valid,
        row,
      });
    }
    j += 1;
  }

  countries.push({
    name: countryName,
    code: countryCode,
    feeds,
  });

  i = j - 1;
}

const payload: Atlas = {
  version: 1,
  generatedAt: new Date().toISOString(),
  lastChecked,
  countries,
};

writeFileSync(OUTPUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
console.log(`wrote data/rss-atlas.json with ${countries.length} countries and ${countries.reduce((acc, country) => acc + country.feeds.length, 0)} feeds`);
