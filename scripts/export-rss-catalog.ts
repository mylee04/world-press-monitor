import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

type AtlasFeed = {
  name: string;
  url: string | null;
  sitemapUrl?: string | null;
  status: string | null;
  checkedDate: string | null;
  valid: string | null;
  row: number;
  enabled?: boolean;
};

type AtlasCountry = {
  name: string;
  code: string;
  feeds: AtlasFeed[];
};

type Atlas = {
  countries: AtlasCountry[];
};

type AuditResult = {
  countryCode: string;
  outlet: string;
  url: string;
  httpCode: number | null;
  valid: boolean;
};

type AuditFile = {
  results?: AuditResult[];
};

const ATLAS_PATH = resolve(process.cwd(), 'data/rss-atlas.json');
const AUDIT_PATH = resolve(process.cwd(), 'audits/readme_rss_health_latest.json');
const OUTPUT_DIR = resolve(process.cwd(), 'data');
const CSV_PATH = resolve(OUTPUT_DIR, 'rss-catalog.csv');
const OPML_PATH = resolve(OUTPUT_DIR, 'rss-catalog.opml');

function loadAtlas(): Atlas {
  const raw = readFileSync(ATLAS_PATH, 'utf8');
  const parsed = JSON.parse(raw) as Atlas;
  if (!Array.isArray(parsed.countries)) {
    throw new Error(`Invalid atlas format in ${ATLAS_PATH}`);
  }
  return parsed;
}

function loadLatestAudit(): Map<string, AuditResult> {
  if (!existsSync(AUDIT_PATH)) {
    return new Map();
  }

  const parsed = JSON.parse(readFileSync(AUDIT_PATH, 'utf8')) as AuditFile;
  const map = new Map<string, AuditResult>();
  if (!Array.isArray(parsed.results)) {
    return map;
  }

  for (const result of parsed.results) {
    map.set(makeKey(result.countryCode, result.outlet, result.url), result);
  }

  return map;
}

function makeKey(countryCode: string, outlet: string, url: string): string {
  return `${countryCode}|${outlet}|${url}`;
}

function formatCsvValue(value: string): string {
  const needsQuote = /[",\n\r]/.test(value);
  if (!needsQuote) return value;
  return `"${value.replaceAll('"', '""')}"`;
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function getFeedHtml(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return '';
  }
}

function buildStatusText(auditResult: AuditResult | undefined, feed: AtlasFeed): string {
  if (!auditResult) {
    if (!feed.url) return 'needs verification';
    if (feed.valid) return feed.valid;
    return feed.status || 'needs verification';
  }
  if (auditResult.httpCode === null) return 'invalid (ERR)';
  return auditResult.valid ? 'valid' : 'invalid';
}

function buildCsvRows(atlas: Atlas, auditMap: Map<string, AuditResult>): string {
  const rows: string[] = [];
  rows.push('country_code,country_name,row,outlet,url,health_status,http_status,checked_at');

  for (const country of atlas.countries) {
    for (const feed of country.feeds) {
      if (feed.enabled === false) continue;
      const endpointUrl = feed.url?.trim() || feed.sitemapUrl?.trim() || '';
      if (!endpointUrl) continue;

      const audit = feed.url ? auditMap.get(makeKey(country.code, feed.name, feed.url)) : undefined;
      const status = buildStatusText(audit, feed);
      rows.push([
        formatCsvValue(country.code),
        formatCsvValue(country.name),
        formatCsvValue(String(feed.row)),
        formatCsvValue(feed.name),
        formatCsvValue(endpointUrl),
        formatCsvValue(status),
        formatCsvValue(audit?.httpCode !== undefined && audit?.httpCode !== null ? String(audit.httpCode) : 'N/A'),
        formatCsvValue(audit ? new Date().toISOString() : ''),
      ].join(','));
    }
  }

  return `${rows.join('\n')}\n`;
}

function buildOpml(atlas: Atlas, auditMap: Map<string, AuditResult>): string {
  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<opml version="1.1">',
    '  <head>',
    '    <title>PressLab RSS Atlas Catalog</title>',
    `    <dateCreated>${new Date().toUTCString()}</dateCreated>`,
    '    <ownerName>PressLab</ownerName>',
    '  </head>',
    '  <body>',
  ];

  for (const country of atlas.countries) {
    lines.push(
      `    <outline text="${escapeXml(`${country.name} (${country.code})`)}" title="${escapeXml(
        `${country.name} (${country.code})`
      )}">`
    );

    for (const feed of country.feeds) {
      if (feed.enabled === false) continue;
      const endpointUrl = feed.url?.trim() || feed.sitemapUrl?.trim() || '';
      if (!endpointUrl) continue;

      const audit = feed.url ? auditMap.get(makeKey(country.code, feed.name, feed.url)) : undefined;
      const status = buildStatusText(audit, feed);
      const title = escapeXml(`${feed.name} [${status}]`);
      const htmlUrl = escapeXml(getFeedHtml(endpointUrl));
      lines.push(
        `      <outline text="${title}" title="${title}" type="rss" xmlUrl="${escapeXml(endpointUrl)}" htmlUrl="${htmlUrl}"/>`
      );
    }

    lines.push('    </outline>');
  }

  lines.push('  </body>');
  lines.push('</opml>');
  return `${lines.join('\n')}\n`;
}

const atlas = loadAtlas();
const auditMap = loadLatestAudit();

mkdirSync(OUTPUT_DIR, { recursive: true });
writeFileSync(CSV_PATH, buildCsvRows(atlas, auditMap), 'utf8');
writeFileSync(OPML_PATH, buildOpml(atlas, auditMap), 'utf8');

console.log(`Wrote CSV: ${CSV_PATH}`);
console.log(`Wrote OPML: ${OPML_PATH}`);
