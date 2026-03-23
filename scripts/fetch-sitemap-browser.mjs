import { gunzipSync } from 'node:zlib';
import { chromium } from 'playwright';

function normalizeXmlPayload(payload) {
  const trimmed = String(payload || '').trim();
  const xmlStart = trimmed.search(/<(?:\?xml|rss|feed|urlset|sitemapindex)\b/i);
  return xmlStart >= 0 ? trimmed.slice(xmlStart) : trimmed;
}

const url = process.argv[2];
if (!url) {
  console.error('missing_url');
  process.exit(2);
}

const browser = await chromium.launch({ headless: false });
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  const target = new URL(url);

  const ensureOriginContext = async () => {
    await page.goto(`${target.origin}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  };

  if (url.toLowerCase().endsWith('.gz')) {
    await ensureOriginContext();
    const base64 = await page.evaluate(async (targetUrl) => {
      const response = await fetch(String(targetUrl));
      const buffer = await response.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = '';
      const chunkSize = 0x8000;
      for (let index = 0; index < bytes.length; index += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
      }
      return btoa(binary);
    }, url);
    process.stdout.write(gunzipSync(Buffer.from(base64, 'base64')).toString('utf8'));
  } else {
    await ensureOriginContext();

    const payload = await page.evaluate(async (targetUrl) => {
      const response = await fetch(String(targetUrl));
      return await response.text();
    }, url);
    const normalizedPayload = normalizeXmlPayload(payload);
    if (/<(?:\?xml|rss|feed|urlset|sitemapindex)\b/i.test(normalizedPayload) && !normalizedPayload.includes('...')) {
      process.stdout.write(normalizedPayload);
      process.exit(0);
    }

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    const bodyText = normalizeXmlPayload((await page.textContent('body')) || '');
    if (/<(?:\?xml|rss|feed|urlset|sitemapindex)\b/i.test(bodyText)) {
      process.stdout.write(bodyText);
      process.exit(0);
    }

    process.stdout.write(normalizedPayload);
  }
} finally {
  await browser.close();
}
