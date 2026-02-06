import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

type Broadcaster = 'SBS' | 'KBS' | 'MBC' | 'JTBC' | 'YTN';
type CandidateType = 'rss' | 'sitemap';

type Candidate = {
  name: Broadcaster;
  country: 'South Korea';
  type: CandidateType;
  candidateId: string;
  url: string;
};

type CheckResult = {
  name: Broadcaster;
  country: 'South Korea';
  type: CandidateType;
  candidateId: string;
  url: string;
  methodTried: 'HEAD+GET' | 'GET';
  status: 'ok_xml' | 'blocked' | 'not_found' | 'network_error' | 'unexpected_content' | 'http_error';
  httpCode: number | null;
  finalUrl: string | null;
  contentType: string | null;
  xmlDetected: boolean;
  note: string;
  checkedAt: string;
};

const CANDIDATES: Candidate[] = [
  { name: 'SBS', country: 'South Korea', type: 'rss', candidateId: 'rss_default', url: 'https://news.sbs.co.kr/news/rss.do' },
  { name: 'SBS', country: 'South Korea', type: 'rss', candidateId: 'rss_sitemap_param', url: 'https://news.sbs.co.kr/news/rss.do?cooper=SBSNEWS&plink=SITEMAP' },
  { name: 'SBS', country: 'South Korea', type: 'rss', candidateId: 'rss_section_01', url: 'https://news.sbs.co.kr/news/SectionRssFeed.do?sectionId=01&plink=RSSREADER' },
  { name: 'SBS', country: 'South Korea', type: 'sitemap', candidateId: 'sitemap_default', url: 'https://news.sbs.co.kr/news/sitemap.xml' },

  { name: 'KBS', country: 'South Korea', type: 'rss', candidateId: 'rss_news9_legacy', url: 'http://news.kbs.co.kr/rss/news9.xml' },
  { name: 'KBS', country: 'South Korea', type: 'rss', candidateId: 'rss_world_radio_en', url: 'http://world.kbs.co.kr/rss/rss_news.htm?lang=e' },
  { name: 'KBS', country: 'South Korea', type: 'sitemap', candidateId: 'sitemap_default', url: 'https://news.kbs.co.kr/sitemap.xml' },

  { name: 'MBC', country: 'South Korea', type: 'rss', candidateId: 'rss_news_00', url: 'https://imnews.imbc.com/rss/news/news_00.xml' },
  { name: 'MBC', country: 'South Korea', type: 'rss', candidateId: 'rss_news', url: 'https://imnews.imbc.com/rss/news.xml' },
  { name: 'MBC', country: 'South Korea', type: 'rss', candidateId: 'rss_google_site_fallback', url: 'https://news.google.com/rss/search?q=site:imnews.imbc.com&hl=ko&gl=KR&ceid=KR:ko' },
  { name: 'MBC', country: 'South Korea', type: 'sitemap', candidateId: 'sitemap_index', url: 'https://imnews.imbc.com/sitemap/sitemap_index.xml' },

  { name: 'JTBC', country: 'South Korea', type: 'rss', candidateId: 'rss_newsflash_guess', url: 'https://news.jtbc.co.kr/RSS/newsflash.xml' },
  { name: 'JTBC', country: 'South Korea', type: 'rss', candidateId: 'rss_newsflash_fs', url: 'https://fs.jtbc.co.kr/RSS/newsflash.xml' },
  { name: 'JTBC', country: 'South Korea', type: 'sitemap', candidateId: 'sitemap_index', url: 'https://news.jtbc.co.kr/sitemap/sitemap_index.xml' },

  { name: 'YTN', country: 'South Korea', type: 'rss', candidateId: 'rss_all', url: 'https://www.ytn.co.kr/rss/all.xml' },
  { name: 'YTN', country: 'South Korea', type: 'rss', candidateId: 'rss_news_guess', url: 'https://www.ytn.co.kr/rss/news.xml' },
  { name: 'YTN', country: 'South Korea', type: 'rss', candidateId: 'rss_google_site_fallback', url: 'https://news.google.com/rss/search?q=site:ytn.co.kr&hl=ko&gl=KR&ceid=KR:ko' },
  { name: 'YTN', country: 'South Korea', type: 'sitemap', candidateId: 'sitemap_index', url: 'https://www.ytn.co.kr/sitemap/sitemap_index.xml' }
];

const UA = 'Mozilla/5.0 (compatible; PressLabSourceVerifier/1.0; +https://presslab.local)';
const XML_MARKERS = ['<rss', '<feed', '<urlset', '<sitemapindex', '<?xml'];

function classify(code: number | null, xmlDetected: boolean, contentType: string | null, note: string): CheckResult['status'] {
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
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal, redirect: 'follow' });
  } finally {
    clearTimeout(timer);
  }
}

async function checkOne(candidate: Candidate): Promise<CheckResult> {
  const checkedAt = new Date().toISOString();

  try {
    let headResponse: Response | null = null;
    try {
      headResponse = await fetchWithTimeout(candidate.url, {
        method: 'HEAD',
        headers: {
          'User-Agent': UA,
          Accept: 'application/rss+xml, application/xml, text/xml, */*'
        }
      });
    } catch {
      headResponse = null;
    }

    const response = await fetchWithTimeout(candidate.url, {
      method: 'GET',
      headers: {
        'User-Agent': UA,
        Accept: 'application/rss+xml, application/xml, text/xml, */*',
        'Accept-Language': 'ko,en-US;q=0.8,en;q=0.7'
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
      methodTried: headResponse ? 'HEAD+GET' : 'GET',
      status: classify(response.status, xmlDetected, contentType, note),
      httpCode: response.status,
      finalUrl: response.url,
      contentType,
      xmlDetected,
      note,
      checkedAt
    };
  } catch (error) {
    const note = error instanceof Error ? error.message : String(error);
    return {
      ...candidate,
      methodTried: 'GET',
      status: 'network_error',
      httpCode: null,
      finalUrl: null,
      contentType: null,
      xmlDetected: false,
      note,
      checkedAt
    };
  }
}

function scoreStatus(status: CheckResult['status']): number {
  if (status === 'ok_xml') return 5;
  if (status === 'blocked') return 3;
  if (status === 'unexpected_content') return 2;
  if (status === 'http_error') return 1;
  if (status === 'not_found') return 0;
  return -1;
}

function choosePreferred(rows: CheckResult[]): Map<Broadcaster, CheckResult | null> {
  const map = new Map<Broadcaster, CheckResult | null>();
  const broadcasters: Broadcaster[] = ['SBS', 'KBS', 'MBC', 'JTBC', 'YTN'];

  for (const broadcaster of broadcasters) {
    const subset = rows
      .filter((row) => row.name === broadcaster)
      .sort((a, b) => scoreStatus(b.status) - scoreStatus(a.status));
    map.set(broadcaster, subset[0] || null);
  }

  return map;
}

function toMarkdown(results: CheckResult[]): string {
  const lines: string[] = [];
  lines.push('# KR Source HTTP Verification');
  lines.push('');
  lines.push(`- Generated at: ${new Date().toISOString()}`);
  lines.push(`- Total checked: ${results.length}`);
  lines.push('');
  lines.push('| Outlet | Candidate | Type | URL | Status | HTTP | XML | Note |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- |');

  for (const row of results) {
    lines.push(`| ${row.name} | ${row.candidateId} | ${row.type} | ${row.url} | ${row.status} | ${row.httpCode ?? '-'} | ${row.xmlDetected ? 'yes' : 'no'} | ${row.note.replace(/\|/g, '/')} |`);
  }

  const grouped = results.reduce<Record<string, number>>((acc, row) => {
    acc[row.status] = (acc[row.status] || 0) + 1;
    return acc;
  }, {});

  lines.push('');
  lines.push('## Status Counts');
  lines.push('');
  for (const [key, value] of Object.entries(grouped)) {
    lines.push(`- ${key}: ${value}`);
  }

  lines.push('');
  lines.push('## Preferred Candidate Per Broadcaster');
  lines.push('');
  lines.push('| Broadcaster | Candidate | Status | URL |');
  lines.push('| --- | --- | --- | --- |');

  const preferred = choosePreferred(results);
  for (const [name, row] of preferred.entries()) {
    if (!row) {
      lines.push(`| ${name} | - | no_result | - |`);
      continue;
    }
    lines.push(`| ${name} | ${row.candidateId} | ${row.status} | ${row.url} |`);
  }

  return `${lines.join('\n')}\n`;
}

async function main(): Promise<void> {
  const results: CheckResult[] = [];

  for (const candidate of CANDIDATES) {
    // Serial checks avoid accidental rate-limit bans.
    // eslint-disable-next-line no-await-in-loop
    const result = await checkOne(candidate);
    results.push(result);
  }

  const stamp = new Date().toISOString().slice(0, 10);
  const outJson = resolve(process.cwd(), `audits/kr_source_http_verification_${stamp}.json`);
  const outMd = resolve(process.cwd(), `audits/kr_source_http_verification_${stamp}.md`);

  writeFileSync(outJson, `${JSON.stringify(results, null, 2)}\n`, 'utf8');
  writeFileSync(outMd, toMarkdown(results), 'utf8');

  console.log(`Wrote ${outJson}`);
  console.log(`Wrote ${outMd}`);
}

void main();
