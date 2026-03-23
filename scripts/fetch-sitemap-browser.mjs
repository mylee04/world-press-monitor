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
  if (url.toLowerCase().endsWith('.gz')) {
    const target = new URL(url);
    await page.goto(`${target.origin}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
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
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

    const bodyText = normalizeXmlPayload((await page.textContent('body')) || '');
    if (/<(?:\?xml|rss|feed|urlset|sitemapindex)\b/i.test(bodyText)) {
      process.stdout.write(bodyText);
      process.exit(0);
    }

    const payload = await page.evaluate(async (targetUrl) => {
      const response = await fetch(String(targetUrl));
      return await response.text();
    }, url);
    process.stdout.write(normalizeXmlPayload(payload));
  }
} finally {
  await browser.close();
}
