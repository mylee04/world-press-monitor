export type PersonDisplayNameContext = {
  entries: Array<readonly [string, string]>;
  byPersonId: Map<string, string>;
};

type PersonDisplayNameSeed = {
  personId: string;
  canonicalName: string;
};

function shouldNormalizeUpperNameToken(token: string): boolean {
  const stripped = token.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '');
  if (stripped.length < 2) return false;
  if (!/\p{L}/u.test(stripped)) return false;
  return stripped === stripped.toLocaleUpperCase() && stripped !== stripped.toLocaleLowerCase();
}

function titleCaseUpperToken(token: string): string {
  return token.replace(/\p{L}+/gu, (segment) => {
    if (!shouldNormalizeUpperNameToken(segment)) return segment;
    return `${segment.slice(0, 1).toLocaleUpperCase()}${segment.slice(1).toLocaleLowerCase()}`;
  });
}

export function toDisplayPersonName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed || !trimmed.includes(' ')) return trimmed;
  const parts = trimmed.split(/\s+/);
  let changed = false;
  const normalized = parts.map((part) => {
    if (!shouldNormalizeUpperNameToken(part)) return part;
    changed = true;
    return titleCaseUpperToken(part);
  });
  return changed ? normalized.join(' ') : trimmed;
}

export function buildPersonDisplayNameContext(seeds: PersonDisplayNameSeed[]): PersonDisplayNameContext {
  const byPersonId = new Map<string, string>();
  for (const seed of seeds) {
    if (!byPersonId.has(seed.personId)) {
      byPersonId.set(seed.personId, toDisplayPersonName(seed.canonicalName));
    }
  }

  const entries = [...new Set(seeds.map((seed) => seed.canonicalName))]
    .map((canonicalName) => [canonicalName, toDisplayPersonName(canonicalName)] as const)
    .filter(([canonicalName, displayName]) => canonicalName !== displayName)
    .sort((left, right) => right[0].length - left[0].length);

  return { entries, byPersonId };
}

export function replaceDisplayPersonNames(
  text: string | null,
  context: PersonDisplayNameContext
): string | null {
  if (!text) return text;
  let normalized = text;
  for (const [canonicalName, displayName] of context.entries) {
    if (normalized.includes(canonicalName)) {
      normalized = normalized.split(canonicalName).join(displayName);
    }
  }
  return normalized;
}
