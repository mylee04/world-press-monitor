import { Pool } from 'pg';
import { parseRssOrAtom } from '../lib/parsers';
import { DEFAULT_X_WATCH_ACCOUNTS, type XWatchAccount } from '../data/x-watchlists';
import { createRequire } from 'node:module';

const BREAKING_TERMS = [
  'breaking', 'urgent', 'developing', 'just in', 'alert', 'flash',
  'ultima hora', 'última hora', 'urgente', 'en vivo', 'atencion', 'atención'
];

const LATAM_TERMS = [
  'argentina', 'chile', 'uruguay', 'latam', 'latin america', 'latinoamerica',
  'buenos aires', 'santiago', 'montevideo', 'mercosur', 'andes'
];

const US_TERMS = [
  'united states', 'u.s.', 'us', 'usa', 'washington', 'congress', 'white house'
];

type FeedPost = {
  handle: string;
  country: string | null;
  title: string;
  link: string;
  publishedAt: string;
  description?: string;
};

function envCsv(name: string, fallback: string[]): string[] {
  const raw = (process.env[name] || '').trim();
  if (!raw) return fallback;
  return raw.split(',').map((v) => v.trim()).filter(Boolean);
}

function envInt(name: string, fallback: number): number {
  const raw = Number.parseInt(process.env[name] || '', 10);
  return Number.isFinite(raw) && raw > 0 ? raw : fallback;
}

function normalizeText(input: string): string {
  return (input || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function inferLanguage(text: string): string {
  const t = normalizeText(text);
  if (/[áéíóúñü¿¡]/i.test(text) || t.includes(' ultima hora') || t.includes(' urgente') || t.includes(' en vivo')) {
    return 'es';
  }
  return 'en';
}

function inferCountry(text: string): string | null {
  const t = normalizeText(text);
  if (t.includes('argentina') || t.includes('buenos aires')) return 'Argentina';
  if (t.includes('chile') || t.includes('santiago')) return 'Chile';
  if (t.includes('uruguay') || t.includes('montevideo')) return 'Uruguay';
  if (t.includes('latam') || t.includes('latin america') || t.includes('latinoamerica')) return 'LATAM';
  if (US_TERMS.some((term) => t.includes(term))) return 'United States';
  return null;
}

function postIdFromLink(link: string): string {
  const status = link.match(/status\/(\d+)/i)?.[1];
  if (status) return status;
  return link;
}

function scoreBreaking(text: string, handle: string, priorityHandles: Set<string>): { score: number; tags: string[] } {
  const t = normalizeText(text);
  let score = 0;
  const tags = new Set<string>();

  for (const term of BREAKING_TERMS) {
    if (t.includes(term)) {
      score += term === 'breaking' || term === 'última hora' || term === 'ultima hora' ? 40 : 25;
      tags.add('breaking_term');
      break;
    }
  }

  if (LATAM_TERMS.some((term) => t.includes(term))) {
    score += 20;
    tags.add('latam_entity');
  }
  if (US_TERMS.some((term) => t.includes(term))) {
    score += 15;
    tags.add('us_entity');
  }
  if (priorityHandles.has(handle.toLowerCase())) {
    score += 15;
    tags.add('priority_account');
  }

  return { score, tags: [...tags] };
}

async function fetchRss(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'PressLabBot/1.0 (+https://presslab.local)',
        Accept: 'application/rss+xml,application/xml,text/xml;q=0.9,*/*;q=0.8'
      },
      signal: AbortSignal.timeout(8000)
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

async function fetchHandlePosts(account: XWatchAccount, baseUrls: string[], perHandleLimit: number): Promise<FeedPost[]> {
  for (const base of baseUrls) {
    const cleanBase = base.replace(/\/$/, '');
    const candidates = [
      `${cleanBase}/${encodeURIComponent(account.handle)}/rss`,
      `${cleanBase}/twitter/user/${encodeURIComponent(account.handle)}`
    ];

    for (const rssUrl of candidates) {
      const xml = await fetchRss(rssUrl);
      if (!xml) continue;

      const parsed = parseRssOrAtom(xml, perHandleLimit);
      if (!parsed.length) continue;

      return parsed.map((item) => ({
        handle: account.handle,
        country: account.country || null,
        title: item.title,
        link: item.link,
        publishedAt: item.publishedAt,
        description: item.description || ''
      }));
    }
  }

  return [];
}

async function fetchPostsViaPlaywright(
  accounts: XWatchAccount[],
  perHandleLimit: number,
  timeoutMs: number,
  headless: boolean
): Promise<Map<string, FeedPost[]>> {
  const out = new Map<string, FeedPost[]>();
  if (!accounts.length) return out;

  const require = createRequire(import.meta.url);
  let playwright: any;
  try {
    playwright = require('playwright');
  } catch {
    console.warn('[x-breaking] playwright not installed, skipping browser fallback');
    return out;
  }

  const browser = await playwright.chromium.launch({ headless });
  try {
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'
    });

    for (const account of accounts) {
      const page = await context.newPage();
      try {
        await page.goto(`https://x.com/${encodeURIComponent(account.handle)}`, {
          waitUntil: 'domcontentloaded',
          timeout: timeoutMs
        });
        await page.waitForTimeout(2500);
        const posts = await page.$$eval('article', (articles: Element[], limit: number) => {
          const rows: Array<{ title: string; description: string; link: string; publishedAt: string }> = [];
          for (const article of articles) {
            const linkEl = article.querySelector('a[href*="/status/"]') as HTMLAnchorElement | null;
            const timeEl = article.querySelector('time') as HTMLElement | null;
            const href = linkEl?.getAttribute('href') || '';
            const dt = timeEl?.getAttribute('datetime') || '';
            if (!href || !dt) continue;
            const text = (article.textContent || '').replace(/\s+/g, ' ').trim();
            if (!text) continue;
            rows.push({
              title: text.slice(0, 220),
              description: text.slice(0, 1200),
              link: href.startsWith('http') ? href : `https://x.com${href}`,
              publishedAt: new Date(dt).toISOString()
            });
            if (rows.length >= limit) break;
          }
          return rows;
        }, perHandleLimit);

        if (posts.length > 0) {
          out.set(
            account.handle.toLowerCase(),
            posts.map((p: { title: string; description: string; link: string; publishedAt: string }) => ({
              handle: account.handle,
              country: account.country || null,
              title: p.title,
              link: p.link,
              publishedAt: p.publishedAt,
              description: p.description
            }))
          );
        }
      } catch {
        // no-op
      } finally {
        await page.close().catch(() => undefined);
      }
    }
    await context.close().catch(() => undefined);
  } finally {
    await browser.close().catch(() => undefined);
  }
  return out;
}

function buildDiscordMessage(newBreaking: Array<{ handle: string; title: string; link: string; score: number }>): string {
  const top = newBreaking.slice(0, 8).map((x) => `- @${x.handle} (${x.score}) ${x.title}\n  ${x.link}`).join('\n');
  return [
    `**PressLab X Breaking Watch — ${new Date().toISOString()}**`,
    `- New breaking posts: ${newBreaking.length}`,
    top || '- (none)'
  ].join('\n');
}

async function postDiscord(webhook: string, content: string): Promise<void> {
  await fetch(webhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: content.slice(0, 1800) })
  });
}

async function ensureSchema(pool: Pool): Promise<void> {
  await pool.query(`
    create table if not exists social_breaking_posts (
      id bigserial primary key,
      provider text not null default 'x',
      account_handle text not null,
      post_id text not null,
      post_url text not null,
      author_name text null,
      published_at timestamptz not null,
      title text not null,
      content text null,
      language text null,
      country text null,
      tags jsonb not null default '[]'::jsonb,
      breaking_score integer not null default 0,
      is_breaking boolean not null default false,
      created_at timestamptz not null default now(),
      unique(provider, post_id)
    );
    create table if not exists breaking_queue (
      id bigserial primary key,
      source_kind text not null default 'social_x',
      source_ref text not null unique,
      title text not null,
      link text not null,
      summary text null,
      language text null,
      country text null,
      status text not null default 'new',
      priority integer not null default 0,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create index if not exists idx_social_breaking_posts_created_at on social_breaking_posts(created_at desc);
    create index if not exists idx_social_breaking_posts_breaking on social_breaking_posts(is_breaking, created_at desc);
    create index if not exists idx_breaking_queue_status_created on breaking_queue(status, created_at desc);
  `);
}

async function main(): Promise<void> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('Missing DATABASE_URL');

  const baseUrls = envCsv('X_NITTER_BASE_URLS', [
    'https://nitter.net',
    'https://nitter.poast.org',
    'https://nitter.privacydev.net',
    'https://nitter.1d4.us'
  ]);
  const rssHubBases = envCsv('X_RSSHUB_BASE_URLS', [
    'https://rsshub.app',
    'https://rsshub.rssforever.com',
    'https://rsshub.feeded.xyz'
  ]);
  const allBases = [...new Set([...baseUrls, ...rssHubBases])];
  const handles = envCsv('X_BREAKING_HANDLES', DEFAULT_X_WATCH_ACCOUNTS.map((a) => a.handle));
  const accountByHandle = new Map(DEFAULT_X_WATCH_ACCOUNTS.map((a) => [a.handle.toLowerCase(), a]));
  const accounts: XWatchAccount[] = handles.map((handle) => {
    const known = accountByHandle.get(handle.toLowerCase());
    if (known) return known;
    return { handle, country: 'LATAM', priority: false };
  });
  const perHandleLimit = envInt('X_BREAKING_PER_HANDLE_LIMIT', 12);
  const threshold = envInt('X_BREAKING_SCORE_THRESHOLD', 55);
  const maxAgeHours = envInt('X_BREAKING_MAX_AGE_HOURS', 24);
  const playwrightEnabled = (process.env.X_PLAYWRIGHT_ENABLED || 'true').toLowerCase() !== 'false';
  const playwrightMaxAccounts = envInt('X_PLAYWRIGHT_MAX_ACCOUNTS', 10);
  const playwrightTimeoutMs = envInt('X_PLAYWRIGHT_TIMEOUT_MS', 18000);
  const playwrightHeadless = (process.env.X_PLAYWRIGHT_HEADLESS || 'true').toLowerCase() !== 'false';
  const playwrightPriorityOnly = (process.env.X_PLAYWRIGHT_PRIORITY_ONLY || 'true').toLowerCase() !== 'false';
  const defaultPriority = accounts.filter((a) => a.priority).map((a) => a.handle);
  const priorityHandles = new Set(envCsv('X_BREAKING_PRIORITY_HANDLES', defaultPriority).map((h) => h.toLowerCase()));

  const pool = new Pool({ connectionString: dbUrl });
  try {
    await ensureSchema(pool);

    const fetchedByAccount = await Promise.all(accounts.map((account) => fetchHandlePosts(account, allBases, perHandleLimit)));
    const postsByHandle = new Map<string, FeedPost[]>();
    fetchedByAccount.forEach((posts, idx) => {
      postsByHandle.set(accounts[idx].handle.toLowerCase(), posts);
    });

    let playwrightFetched = 0;
    if (playwrightEnabled) {
      const emptyAccounts = accounts.filter((account) => {
        const hasPosts = (postsByHandle.get(account.handle.toLowerCase()) || []).length > 0;
        if (hasPosts) return false;
        if (!playwrightPriorityOnly) return true;
        return Boolean(account.priority);
      });
      const targets = emptyAccounts.slice(0, playwrightMaxAccounts);
      if (targets.length > 0) {
        const fallbackMap = await fetchPostsViaPlaywright(targets, perHandleLimit, playwrightTimeoutMs, playwrightHeadless);
        for (const target of targets) {
          const key = target.handle.toLowerCase();
          const existing = postsByHandle.get(key) || [];
          if (existing.length > 0) continue;
          const fallback = fallbackMap.get(key) || [];
          if (fallback.length > 0) {
            postsByHandle.set(key, fallback);
            playwrightFetched += fallback.length;
          }
        }
      }
    }

    const cutoffMs = Date.now() - maxAgeHours * 60 * 60 * 1000;
    const allPosts = [...postsByHandle.values()]
      .flat()
      .filter((post) => {
        const ts = new Date(post.publishedAt).getTime();
        return Number.isFinite(ts) && ts >= cutoffMs;
      });
    const zeroAccounts = accounts.filter((account) => (postsByHandle.get(account.handle.toLowerCase()) || []).length === 0).length;
    let inserted = 0;
    let newBreaking = 0;
    const newBreakingRows: Array<{ handle: string; title: string; link: string; score: number }> = [];

    for (const post of allPosts) {
      const text = `${post.title} ${post.description || ''}`;
      const { score, tags } = scoreBreaking(text, post.handle, priorityHandles);
      const isBreaking = score >= threshold;
      const language = inferLanguage(text);
      const country = post.country || inferCountry(text);
      const postId = postIdFromLink(post.link);

      const insertedRes = await pool.query<{ id: number }>(
        `
        insert into social_breaking_posts (
          provider, account_handle, post_id, post_url, author_name, published_at,
          title, content, language, country, tags, breaking_score, is_breaking
        ) values (
          'x', $1, $2, $3, $4, $5,
          $6, $7, $8, $9, $10::jsonb, $11, $12
        )
        on conflict (provider, post_id) do nothing
        returning id
        `,
        [
          post.handle,
          postId,
          post.link,
          post.handle,
          post.publishedAt,
          post.title,
          post.description || null,
          language,
          country,
          JSON.stringify(tags),
          score,
          isBreaking
        ]
      );

      if (!insertedRes.rowCount) continue;
      inserted += 1;

      if (isBreaking) {
        newBreaking += 1;
        newBreakingRows.push({ handle: post.handle, title: post.title, link: post.link, score });

        await pool.query(
          `
          insert into breaking_queue (
            source_kind, source_ref, title, link, summary, language, country, status, priority
          ) values (
            'social_x', $1, $2, $3, $4, $5, $6, 'new', $7
          )
          on conflict (source_ref) do nothing
          `,
          [
            `x:${postId}`,
            post.title,
            post.link,
            post.description || null,
            language,
            country,
            score
          ]
        );
      }
    }

    const webhook = process.env.DISCORD_WEBHOOK_URL || '';
    if (webhook && newBreakingRows.length > 0) {
      const message = buildDiscordMessage(newBreakingRows);
      await postDiscord(webhook, message);
    }

    console.log(
      `[x-breaking] handles=${accounts.length} fetched=${allPosts.length} inserted=${inserted} new_breaking=${newBreaking} zero_accounts=${zeroAccounts} playwright_fetched=${playwrightFetched} threshold=${threshold}`
    );
  } finally {
    await pool.end();
  }
}

void main();
