#!/usr/bin/env bun
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type HealthSummary = {
  countries?: number;
  checkedFeeds?: number;
  valid?: number;
  invalid?: number;
  skippedNoSource?: number;
  failureReasons?: Record<string, number>;
};

type HealthReport = {
  generatedAt?: string;
  runtimeBlocked?: boolean;
  summary?: HealthSummary;
};

type AutoRepairReport = {
  generatedAt?: string;
  summary?: {
    total?: number;
    autoApply?: number;
    review?: number;
    byKind?: Record<string, number>;
  };
};

type Hard403BacklogReport = {
  generatedAt?: string;
  summary?: {
    total?: number;
    byAction?: Record<string, number>;
  };
};

type StaleWatchlistReport = {
  generatedAt?: string;
  summary?: {
    total?: number;
    watch?: number;
    disableCandidate?: number;
    autoDisable?: number;
    highValueHold?: number;
    futureDatedHold?: number;
    exemptArchive?: number;
    safeDisableNow?: number;
  };
};

const HEALTH_PATH = resolve(process.cwd(), 'audits/readme_rss_health_latest.json');
const AUTO_REPAIR_PATH = resolve(process.cwd(), 'audits/rss_auto_repair_candidates_latest.json');
const HARD_403_PATH = resolve(process.cwd(), 'audits/rss_hard_403_backlog_latest.json');
const STALE_PATH = resolve(process.cwd(), 'audits/rss_stale_watchlist_latest.json');
const SAFE_DISABLE_PATH = resolve(process.cwd(), 'audits/rss_safe_disable_now_latest.json');

const WEBHOOK_ENV_KEYS = [
  'RSS_OPS_DAILY_DISCORD_WEBHOOK_URL',
  'RSS_HEALTH_DISCORD_WEBHOOK_URL',
  'DISCORD_WEBHOOK_URL',
];
const USERNAME = process.env.RSS_OPS_DAILY_DISCORD_USERNAME || 'RSS 운영 요약';
const MENTION = process.env.RSS_OPS_DAILY_DISCORD_MENTION || '';
const TIMEOUT_MS = clampInt(process.env.RSS_OPS_DAILY_DISCORD_TIMEOUT_MS, 1000, 20000, 5000);

function clampInt(raw: string | undefined, min: number, max: number, fallback: number): number {
  const parsed = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function pickWebhookUrl(): string {
  for (const key of WEBHOOK_ENV_KEYS) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return '';
}

function readJsonIfExists<T>(filePath: string): T | null {
  if (!existsSync(filePath)) return null;
  return JSON.parse(readFileSync(filePath, 'utf8')) as T;
}

function topFailureReasons(map: Record<string, number> | undefined, limit: number): string {
  if (!map) return '없음';
  const rows = Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
  if (rows.length === 0) return '없음';
  return rows.map(([reason, count]) => `${reason} ${count}`).join(', ');
}

function topKinds(map: Record<string, number> | undefined, limit: number): string {
  if (!map) return '없음';
  const rows = Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
  if (rows.length === 0) return '없음';
  return rows.map(([kind, count]) => `${kind} ${count}`).join(', ');
}

function buildDescription(
  health: HealthReport | null,
  autoRepair: AutoRepairReport | null,
  hard403: Hard403BacklogReport | null,
  stale: StaleWatchlistReport | null
): string {
  const lines: string[] = [];

  if (health?.summary) {
    lines.push(
      `헬스체크: 검사 ${health.summary.checkedFeeds ?? 0} / 정상 ${health.summary.valid ?? 0} / 실패 ${health.summary.invalid ?? 0}`
    );
    if (health.runtimeBlocked) {
      lines.push('런타임 차단 감지: 예');
    }
    lines.push(`주요 실패: ${topFailureReasons(health.summary.failureReasons, 4)}`);
  } else {
    lines.push('헬스체크: 결과 없음');
  }

  if (autoRepair?.summary) {
    lines.push(
      `자동복구: 총 ${autoRepair.summary.total ?? 0} / 자동적용 ${autoRepair.summary.autoApply ?? 0} / 리뷰 ${autoRepair.summary.review ?? 0}`
    );
    lines.push(`자동복구 유형: ${topKinds(autoRepair.summary.byKind, 4)}`);
  } else {
    lines.push('자동복구: 결과 없음');
  }

  if (hard403?.summary) {
    const byAction = hard403.summary.byAction || {};
    lines.push(
      `403 백로그: 총 ${hard403.summary.total ?? 0} / WAF 검토 ${byAction.MANUAL_WAF_REVIEW ?? 0} / canonical 후보 ${byAction.CANONICAL_SWAP_CANDIDATE ?? 0} / scope 검토 ${byAction.MANUAL_SCOPE_CHANGE_REVIEW ?? 0}`
    );
  } else {
    lines.push('403 백로그: 결과 없음');
  }

  if (stale?.summary) {
    lines.push(
      `stale: watch ${stale.summary.watch ?? 0} / candidate ${stale.summary.disableCandidate ?? 0} / auto-disable ${stale.summary.autoDisable ?? 0}`
    );
    lines.push(
      `stale 예외: hold ${stale.summary.highValueHold ?? 0} / future ${stale.summary.futureDatedHold ?? 0} / archive ${stale.summary.exemptArchive ?? 0} / safe-disable-now ${stale.summary.safeDisableNow ?? 0}`
    );
  } else {
    lines.push('stale: 결과 없음');
  }

  return lines.join('\n');
}

async function postDiscord(payload: unknown, webhookUrl: string): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`discord_webhook_http_${response.status}: ${body.slice(0, 400)}`);
    }
  } finally {
    clearTimeout(timeout);
  }
}

async function main(): Promise<void> {
  const webhookUrl = pickWebhookUrl();
  if (!webhookUrl) {
    console.log('[rss-ops-daily-discord] SKIP: no webhook configured');
    return;
  }

  const health = readJsonIfExists<HealthReport>(HEALTH_PATH);
  const autoRepair = readJsonIfExists<AutoRepairReport>(AUTO_REPAIR_PATH);
  const hard403 = readJsonIfExists<Hard403BacklogReport>(HARD_403_PATH);
  const stale = readJsonIfExists<StaleWatchlistReport>(STALE_PATH);
  const safeDisable = readJsonIfExists<{ total?: number }>(SAFE_DISABLE_PATH);

  const description = buildDescription(health, autoRepair, hard403, stale);
  const timestamp =
    stale?.generatedAt ||
    hard403?.generatedAt ||
    autoRepair?.generatedAt ||
    health?.generatedAt ||
    new Date().toISOString();

  const payload = {
    username: USERNAME,
    content: MENTION || undefined,
    embeds: [
      {
        title: 'RSS 일일 운영 요약',
        description,
        color: 0x2563eb,
        timestamp,
        fields: [
          {
            name: '국가 / 피드',
            value: `${health?.summary?.countries ?? 0}개국 / ${health?.summary?.checkedFeeds ?? 0}개 검사`,
            inline: true,
          },
          {
            name: '자동복구',
            value: `자동적용 ${autoRepair?.summary?.autoApply ?? 0} / 리뷰 ${autoRepair?.summary?.review ?? 0}`,
            inline: true,
          },
          {
            name: '즉시 비활성화 후보',
            value: `${safeDisable?.total ?? stale?.summary?.safeDisableNow ?? 0}`,
            inline: true,
          },
        ],
        footer: {
          text: 'Daily RSS health / stale / auto-repair',
        },
      },
    ],
  };

  await postDiscord(payload, webhookUrl);
  console.log('[rss-ops-daily-discord] Discord notification sent.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
