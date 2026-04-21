export type FreshnessState = 'fresh' | 'monitor' | 'stale' | 'unknown';

export type FreshnessThreshold = {
  monitorDays: number;
  staleDays: number;
};

export const FOOTBALL_WORLD_CUP_FRESHNESS_THRESHOLDS = {
  officialAppearance: {
    monitorDays: 3,
    staleDays: 7,
  },
  currentStatus: {
    monitorDays: 2,
    staleDays: 3,
  },
  storyline: {
    monitorDays: 3,
    staleDays: 5,
  },
} satisfies Record<string, FreshnessThreshold>;

export function classifyFreshnessAgeDays(
  ageDays: number | null | undefined,
  threshold: FreshnessThreshold
): FreshnessState {
  if (ageDays == null || !Number.isFinite(ageDays)) return 'unknown';
  if (ageDays > threshold.staleDays) return 'stale';
  if (ageDays > threshold.monitorDays) return 'monitor';
  return 'fresh';
}

export function diffDaysFromNow(value: string | null | undefined): number | null {
  if (!value) return null;
  const ts = Date.parse(value);
  if (!Number.isFinite(ts)) return null;
  return Math.floor((Date.now() - ts) / 86_400_000);
}
