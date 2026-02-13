import { NextRequest, NextResponse } from 'next/server';

type RadarScope =
  | 'read:articles'
  | 'read:sources'
  | 'read:ops'
  | 'read:all'
  | 'write:ingest'
  | 'write:summaries'
  | '*';

type KeyPolicy = {
  token: string;
  scopes: Set<RadarScope>;
};

const rateLimiter = new Map<string, { windowStartMs: number; count: number }>();

function parseScopes(raw: string): Set<RadarScope> {
  const values = raw
    .split(/[|;]/)
    .map((v) => v.trim())
    .filter(Boolean) as RadarScope[];
  return new Set(values.length > 0 ? values : ['*']);
}

function parseKeyPolicyEntry(entry: string): KeyPolicy | null {
  const trimmed = entry.trim();
  if (!trimmed) return null;
  const split = trimmed.indexOf(':');
  if (split === -1) return null;
  const token = trimmed.slice(0, split).trim();
  const scopesRaw = trimmed.slice(split + 1).trim();
  if (!token) return null;
  return { token, scopes: parseScopes(scopesRaw) };
}

function readRadarServiceKeys(): KeyPolicy[] {
  const policies: KeyPolicy[] = [];

  const raw = process.env.RADAR_SERVICE_API_KEYS || '';
  for (const part of raw.split(',')) {
    const parsed = parseKeyPolicyEntry(part);
    if (parsed) policies.push(parsed);
  }

  return policies;
}

function extractToken(req: NextRequest): string {
  const authHeader = req.headers.get('authorization') || '';
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice(7).trim();
  }
  return (req.headers.get('x-api-key') || '').trim();
}

function hasScope(scopes: Set<RadarScope>, required: RadarScope): boolean {
  if (scopes.has('*') || scopes.has('read:all')) return true;
  if (required === 'read:articles') return scopes.has('read:articles');
  if (required === 'read:sources') return scopes.has('read:sources');
  if (required === 'read:ops') return scopes.has('read:ops');
  if (required === 'write:ingest') return scopes.has('write:ingest');
  if (required === 'write:summaries') return scopes.has('write:summaries');
  return false;
}

function getRateLimitRpm(): number {
  const raw = Number(process.env.RADAR_SERVICE_RATE_LIMIT_RPM || 240);
  if (!Number.isFinite(raw)) return 240;
  return Math.max(10, Math.min(20000, Math.floor(raw)));
}

function isRateLimited(token: string): boolean {
  const now = Date.now();
  const minuteMs = 60_000;
  const maxPerMinute = getRateLimitRpm();
  const prev = rateLimiter.get(token);
  if (!prev || now - prev.windowStartMs >= minuteMs) {
    rateLimiter.set(token, { windowStartMs: now, count: 1 });
    return false;
  }
  prev.count += 1;
  rateLimiter.set(token, prev);
  return prev.count > maxPerMinute;
}

export function requireRadarServiceAuth(
  req: NextRequest,
  requiredScope: RadarScope = 'read:all'
): NextResponse | null {
  const keys = readRadarServiceKeys();
  if (keys.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        error: 'radar_service_key_not_configured',
      },
      { status: 500 }
    );
  }

  const token = extractToken(req);
  if (!token) {
    return NextResponse.json(
      {
        ok: false,
        error: 'unauthorized',
      },
      { status: 401 }
    );
  }

  const policy = keys.find((k) => k.token === token);
  if (!policy) {
    return NextResponse.json(
      {
        ok: false,
        error: 'unauthorized',
      },
      { status: 401 }
    );
  }

  if (!hasScope(policy.scopes, requiredScope)) {
    return NextResponse.json(
      {
        ok: false,
        error: 'forbidden_scope',
        requiredScope,
      },
      { status: 403 }
    );
  }

  if (isRateLimited(token)) {
    return NextResponse.json(
      {
        ok: false,
        error: 'rate_limited',
      },
      { status: 429 }
    );
  }

  return null;
}
