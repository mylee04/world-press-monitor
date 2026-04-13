import { gunzipSync } from 'node:zlib';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

function normalizeXmlPayload(payload) {
  const trimmed = String(payload || '').trim();
  const xmlStart = trimmed.search(/<(?:\?xml|rss|feed|urlset|sitemapindex)\b/i);
  return xmlStart >= 0 ? trimmed.slice(xmlStart) : trimmed;
}

function isXmlPayload(payload) {
  return /<(?:\?xml|rss|feed|urlset|sitemapindex)\b/i.test(normalizeXmlPayload(payload));
}

function detectInterstitialState(payload) {
  const text = String(payload || '').toLowerCase();
  if (!text) return 'none';
  if (isXmlPayload(text)) return 'xml';
  if (
    text.includes('client challenge') ||
    text.includes('just a moment') ||
    text.includes('checking your browser') ||
    text.includes('security verification') ||
    text.includes('verify you are human') ||
    text.includes('javascript is disabled in your browser') ||
    text.includes('a required part of this site couldn’t load') ||
    text.includes('cf-chl') ||
    text.includes('__cf_bm') ||
    text.includes('cloudflare')
  ) {
    return 'challenge';
  }
  if (
    text.includes('access denied') ||
    text.includes('403 forbidden') ||
    text.includes("you don't have permission to access") ||
    text.includes('request blocked')
  ) {
    return 'blocked';
  }
  return 'none';
}

async function fetchTextInPage(page, targetUrl) {
  return await page.evaluate(async (url) => {
    const response = await fetch(String(url), { credentials: 'include' });
    return {
      status: response.status,
      contentType: response.headers.get('content-type') || '',
      text: await response.text(),
    };
  }, targetUrl);
}

async function fetchTextWithContextRequest(context, targetUrl) {
  const response = await context.request.get(String(targetUrl), {
    failOnStatusCode: false,
    maxRedirects: 5,
    timeout: 30000,
  });
  return {
    status: response.status(),
    contentType: response.headers()['content-type'] || '',
    text: await response.text(),
  };
}

async function fetchBase64InPage(page, targetUrl) {
  return await page.evaluate(async (url) => {
    const response = await fetch(String(url), { credentials: 'include' });
    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const chunkSize = 0x8000;
    for (let index = 0; index < bytes.length; index += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
    }
    return {
      status: response.status,
      contentType: response.headers.get('content-type') || '',
      base64: btoa(binary),
    };
  }, targetUrl);
}

async function readPagePayload(page) {
  const [content, bodyText, title] = await Promise.all([
    page.content().catch(() => ''),
    page.textContent('body').catch(() => ''),
    page.title().catch(() => ''),
  ]);
  return `${title}\n${content}\n${bodyText}`;
}

function isClosedTargetError(error) {
  const message = String(error && error.message ? error.message : error || '').toLowerCase();
  return (
    message.includes('target page, context or browser has been closed') ||
    message.includes('page has been closed') ||
    message.includes('browser has been closed') ||
    message.includes('context has been closed')
  );
}

async function waitForInterstitialToClear(page, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    let payload = '';
    try {
      payload = await readPagePayload(page);
    } catch (error) {
      if (isClosedTargetError(error)) throw error;
      payload = '';
    }
    const state = detectInterstitialState(payload);
    if (state !== 'challenge') return payload;
    try {
      await page.waitForTimeout(1000);
    } catch (error) {
      if (isClosedTargetError(error)) throw error;
      break;
    }
  }
  return await readPagePayload(page);
}

async function launchBrowserContext(headless, profileDir) {
  mkdirSync(profileDir, { recursive: true });
  const options = {
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
    viewport: { width: 1366, height: 900 },
    ignoreHTTPSErrors: true,
  };
  try {
    return await chromium.launchPersistentContext(profileDir, { channel: 'chrome', headless, ...options });
  } catch {
    return await chromium.launchPersistentContext(profileDir, { headless, ...options });
  }
}

async function navigateForChallenge(page, targetUrl, timeoutMs) {
  const target = new URL(targetUrl);
  const createFreshPage = async () => {
    try {
      return await page.context().newPage();
    } catch {
      return page;
    }
  };
  const bootstrapFromOrigin = async (candidatePage) => {
    try {
      await candidatePage.goto(`${target.origin}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await waitForInterstitialToClear(candidatePage, timeoutMs);
    } catch (error) {
      if (!isClosedTargetError(error)) throw error;
      const retryPage = await createFreshPage();
      await retryPage.goto(`${target.origin}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await waitForInterstitialToClear(retryPage, timeoutMs);
      return { response: null, page: retryPage };
    }
    return { response: null, page: candidatePage };
  };
  const retryAfterOriginBootstrap = async (candidatePage) => {
    const bootstrapped = await bootstrapFromOrigin(candidatePage);
    const activePage = bootstrapped.page;
    try {
      const response = await activePage.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await waitForInterstitialToClear(activePage, timeoutMs);
      return { response, page: activePage };
    } catch (error) {
      if (!isClosedTargetError(error)) throw error;
      const retryPage = await createFreshPage();
      await bootstrapFromOrigin(retryPage);
      const response = await retryPage.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await waitForInterstitialToClear(retryPage, timeoutMs);
      return { response, page: retryPage };
    }
  };
  try {
    const response = await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
    const payload = await waitForInterstitialToClear(page, timeoutMs);
    if (detectInterstitialState(payload) === 'challenge') {
      return await retryAfterOriginBootstrap(page);
    }
    return { response, page };
  } catch (error) {
    const errorMessage = String(error && error.message ? error.message : error);
    const currentUrl = page.url();
    const shouldBootstrapFromOrigin =
      currentUrl === 'about:blank' ||
      currentUrl.startsWith('chrome-error://') ||
      errorMessage.includes('ERR_TOO_MANY_REDIRECTS') ||
      isClosedTargetError(error);
    if (!shouldBootstrapFromOrigin) {
      throw error;
    }
    try {
      return await retryAfterOriginBootstrap(page);
    } catch {
      try {
        const retryPage = await page.context().newPage();
        return await retryAfterOriginBootstrap(retryPage);
      } catch {
        throw error;
      }
    }
  }
}

const url = process.argv[2];
if (!url) {
  console.error('missing_url');
  process.exit(2);
}

const headedEnv = (process.env.INGEST_BROWSER_SITEMAP_HEADED || process.env.PLAYWRIGHT_HEADED || '').trim().toLowerCase();
const interstitialTimeoutMs = Math.max(
  0,
  Number.parseInt(process.env.INGEST_BROWSER_SITEMAP_CHALLENGE_TIMEOUT_MS || '30000', 10) || 30000
);
const profileDir = resolve(process.cwd(), process.env.INGEST_BROWSER_SITEMAP_PROFILE_DIR || 'audits/browser-sitemap-profile');
const context = await launchBrowserContext(!(headedEnv === '1' || headedEnv === 'true' || headedEnv === 'yes'), profileDir);
try {
  const page = await context.newPage();

  if (url.toLowerCase().endsWith('.gz')) {
    const { page: activePage } = await navigateForChallenge(page, new URL(url).origin, interstitialTimeoutMs);
    const fetched = await fetchBase64InPage(activePage, url);
    process.stdout.write(gunzipSync(Buffer.from(fetched.base64, 'base64')).toString('utf8'));
  } else {
    const { response, page: activePage } = await navigateForChallenge(page, url, interstitialTimeoutMs);
    const pagePayload = normalizeXmlPayload(await readPagePayload(activePage));

    if (isXmlPayload(pagePayload) && !pagePayload.includes('...')) {
      process.stdout.write(pagePayload);
      process.exit(0);
    }

    if (response) {
      const responseText = await response.text().catch(() => '');
      const normalizedResponseText = normalizeXmlPayload(responseText);
      if (isXmlPayload(normalizedResponseText) && !normalizedResponseText.includes('...')) {
        process.stdout.write(normalizedResponseText);
        process.exit(0);
      }
    }

    const bodyText = normalizeXmlPayload((await activePage.textContent('body')) || '');
    if (isXmlPayload(bodyText)) {
      process.stdout.write(bodyText);
      process.exit(0);
    }

    const initialFetch = await fetchTextInPage(activePage, url).catch(() => ({ status: 0, contentType: '', text: '' }));
    const normalizedPayload = normalizeXmlPayload(initialFetch.text);
    if (isXmlPayload(normalizedPayload) && !normalizedPayload.includes('...')) {
      process.stdout.write(normalizedPayload);
      process.exit(0);
    }

    const finalFetch = await fetchTextInPage(activePage, url).catch(() => ({ status: 0, contentType: '', text: '' }));
    const normalizedFinalFetch = normalizeXmlPayload(finalFetch.text);
    if (isXmlPayload(normalizedFinalFetch) && !normalizedFinalFetch.includes('...')) {
      process.stdout.write(normalizedFinalFetch);
      process.exit(0);
    }

    const requestFetch = await fetchTextWithContextRequest(context, url).catch(() => null);
    const normalizedRequestFetch = normalizeXmlPayload(requestFetch?.text || '');
    if (isXmlPayload(normalizedRequestFetch) && !normalizedRequestFetch.includes('...')) {
      process.stdout.write(normalizedRequestFetch);
      process.exit(0);
    }

    process.stdout.write(normalizedPayload);
  }
} finally {
  await context.close();
}
