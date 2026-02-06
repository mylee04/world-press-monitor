import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { OUTLET_FEEDS } from '../data/outlets';

type Status = 'ok_xml' | 'blocked' | 'not_found' | 'network_error' | 'unexpected_content' | 'http_error';

interface Candidate {
  outletId: string;
  source: string;
  country: string;
  language: string;
  method: 'rss' | 'sitemap';
  url: string;
}

interface Result extends Candidate {
  status: Status;
  httpCode: number | null;
  finalUrl: string | null;
  contentType: string | null;
  xmlDetected: boolean;
  note: string;
  checkedAt: string;
}

const XML_MARKERS = ['<rss', '<feed', '<urlset', '<sitemapindex', '<?xml'];
const UA = 'Mozilla/5.0 (compatible; PressLabLATAMVerifier/1.0; +https://presslab.local)';

function isLatamCountry(country: string): boolean {
  const c = country.trim().toLowerCase();
  return c === 'chile' || c === 'argentina' || c === 'uruguay' || c === 'latam' || c === 'latin america';
}

function buildCandidates(): Candidate[] {
  const candidates: Candidate[] = [];
  for (const outlet of OUTLET_FEEDS) {
    if (!isLatamCountry(outlet.country)) continue;
    if (outlet.rssUrl) {
      candidates.push({
        outletId: outlet.id,
        source: outlet.name,
        country: outlet.country,
        language: outlet.language || 'es',
        method: 'rss',
        url: outlet.rssUrl
      });
    }
    if (outlet.sitemapUrl) {
      candidates.push({
        outletId: outlet.id,
        source: outlet.name,
        country: outlet.country,
        language: outlet.language || 'es',
        method: 'sitemap',
        url: outlet.sitemapUrl
      });
    }
  }
  return candidates;
}

function classify(code: number | null, xmlDetected: boolean, contentType: string | null, note: string): Status {
  if (code === null) return 'network_error';
  if (code === 404 || code === 410) return 'not_found';
  if (code === 401 || code === 403 || code === 406 || code === 429) return 'blocked';
  if (code >= 400) return 'http_error';
  if (xmlDetected) return 'ok_xml';
  const contentLooksXml = contentType?.includes('xml') || contentType?.includes('rss') || false;
  if (contentLooksXml) return 'ok_xml';
  if (note.includes('empty body')) return 'unexpected_content';
  return 'unexpected_content';
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 15000): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal, redirect: 'follow' });
  } finally {
    clearTimeout(timeout);
  }
}

async function checkOne(candidate: Candidate): Promise<Result> {
  const checkedAt = new Date().toISOString();

  try {
    const response = await fetchWithTimeout(candidate.url, {
      method: 'GET',
      headers: {
        'User-Agent': UA,
        Accept: 'application/rss+xml, application/xml, text/xml, */*',
        'Accept-Language': 'es-419,es;q=0.9,en;q=0.7'
      }
    });

    const contentType = response.headers.get('content-type');
    const body = await response.text();
    const bodyLower = body.slice(0, 800).toLowerCase();
    const xmlDetected = XML_MARKERS.some((marker) => bodyLower.includes(marker));
    const note = body.length === 0
      ? 'empty body'
      : xmlDetected
        ? 'xml markers detected'
        : `non-xml response snippet: ${bodyLower.replace(/\s+/g, ' ').slice(0, 120)}`;

    return {
      ...candidate,
      status: classify(response.status, xmlDetected, contentType, note),
      httpCode: response.status,
      finalUrl: response.url,
      contentType,
      xmlDetected,
      note,
      checkedAt
    };
  } catch (error) {
    return {
      ...candidate,
      status: 'network_error',
      httpCode: null,
      finalUrl: null,
      contentType: null,
      xmlDetected: false,
      note: error instanceof Error ? error.message : String(error),
      checkedAt
    };
  }
}

function toMarkdown(results: Result[]): string {
  const lines: string[] = [];
  lines.push('# LATAM Source HTTP Verification');
  lines.push('');
  lines.push(`- Generated at: ${new Date().toISOString()}`);
  lines.push(`- Total endpoints checked: ${results.length}`);
  lines.push('');

  const grouped = results.reduce<Record<string, number>>((acc, row) => {
    acc[row.status] = (acc[row.status] || 0) + 1;
    return acc;
  }, {});

  lines.push('## Status Counts');
  lines.push('');
  for (const [status, count] of Object.entries(grouped)) {
    lines.push(`- ${status}: ${count}`);
  }

  lines.push('');
  lines.push('| Source | Country | Method | Status | HTTP | XML | URL | Note |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- |');

  for (const row of results) {
    lines.push(`| ${row.source} | ${row.country} | ${row.method} | ${row.status} | ${row.httpCode ?? '-'} | ${row.xmlDetected ? 'yes' : 'no'} | ${row.url} | ${row.note.replace(/\|/g, '/')} |`);
  }

  return `${lines.join('\n')}\n`;
}

async function main(): Promise<void> {
  const candidates = buildCandidates();
  const results: Result[] = [];

  for (const candidate of candidates) {
    // serial by design to avoid aggressive rate-limit bursts
    // eslint-disable-next-line no-await-in-loop
    results.push(await checkOne(candidate));
  }

  const stamp = new Date().toISOString().slice(0, 10);
  const jsonPath = resolve(process.cwd(), `audits/latam_source_http_verification_${stamp}.json`);
  const mdPath = resolve(process.cwd(), `audits/latam_source_http_verification_${stamp}.md`);

  writeFileSync(jsonPath, `${JSON.stringify(results, null, 2)}\n`, 'utf8');
  writeFileSync(mdPath, toMarkdown(results), 'utf8');

  console.log(`Wrote ${jsonPath}`);
  console.log(`Wrote ${mdPath}`);
}

void main();
