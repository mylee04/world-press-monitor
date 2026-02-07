const DEFAULT_INTERVAL_SEC = 300;
const DEFAULT_BASE_URL = 'http://localhost:3000';

function getEnv(name: string): string {
  return (process.env[name] || '').trim();
}

function buildWarmUrl(): string {
  const explicit = getEnv('NEWS_WARM_URL');
  const base = explicit || `${getEnv('APP_BASE_URL') || DEFAULT_BASE_URL}/api/news-warm`;
  const token = getEnv('NEWS_WARM_TOKEN');
  if (!token) return base;
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}token=${encodeURIComponent(token)}`;
}

async function warmOnce(url: string): Promise<void> {
  const started = Date.now();
  const response = await fetch(url);
  const elapsed = Date.now() - started;
  const text = await response.text();
  if (!response.ok) {
    console.error(`[warm] fail status=${response.status} elapsedMs=${elapsed}`);
    console.error(text.slice(0, 400));
    return;
  }
  const body = JSON.parse(text) as { warm?: { requests: number; success: number; failed: number; totalItems: number }; elapsedMs?: number };
  console.log(
    `[warm] ok elapsedMs=${elapsed} apiElapsedMs=${body.elapsedMs || 0} requests=${body.warm?.requests || 0} success=${body.warm?.success || 0} failed=${body.warm?.failed || 0} totalItems=${body.warm?.totalItems || 0}`
  );
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const once = args.includes('--once');
  const intervalSec = Math.max(60, Number.parseInt(getEnv('NEWS_WARM_INTERVAL_SEC') || `${DEFAULT_INTERVAL_SEC}`, 10) || DEFAULT_INTERVAL_SEC);
  const url = buildWarmUrl();

  if (once) {
    await warmOnce(url);
    return;
  }

  console.log(`[warm] loop start interval=${intervalSec}s url=${url.replace(/token=[^&]+/, 'token=***')}`);
  for (;;) {
    try {
      await warmOnce(url);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[warm] loop error: ${message}`);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalSec * 1000));
  }
}

void main();
