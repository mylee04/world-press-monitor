export type RadarScopeToken =
  | 'read:articles'
  | 'read:sources'
  | 'read:ops'
  | 'read:all'
  | 'write:ingest'
  | 'write:summaries'
  | '*';

type KeyPolicy = {
  token: string;
  scopes: Set<RadarScopeToken>;
};

function parseScopes(raw: string): Set<RadarScopeToken> {
  const values = raw
    .split(/[|;]/)
    .map((v) => v.trim())
    .filter(Boolean) as RadarScopeToken[];
  return new Set(values.length > 0 ? values : ['*']);
}

function parsePolicy(entry: string): KeyPolicy | null {
  const trimmed = entry.trim();
  if (!trimmed) return null;
  const split = trimmed.indexOf(':');
  if (split === -1) return null;
  const token = trimmed.slice(0, split).trim();
  const scopesRaw = trimmed.slice(split + 1).trim();
  if (!token || !scopesRaw) return null;
  return { token, scopes: parseScopes(scopesRaw) };
}

function hasScope(scopes: Set<RadarScopeToken>, required: RadarScopeToken): boolean {
  if (scopes.has('*') || scopes.has('read:all')) return true;
  if (required === 'read:articles') return scopes.has('read:articles');
  if (required === 'read:sources') return scopes.has('read:sources');
  if (required === 'read:ops') return scopes.has('read:ops');
  if (required === 'write:ingest') return scopes.has('write:ingest');
  if (required === 'write:summaries') return scopes.has('write:summaries');
  return false;
}

export function pickRadarTokenForScope(
  keysRaw: string,
  requiredScope: RadarScopeToken
): string | null {
  for (const part of (keysRaw || '').split(',')) {
    const policy = parsePolicy(part);
    if (!policy) continue;
    if (hasScope(policy.scopes, requiredScope)) return policy.token;
  }
  return null;
}

