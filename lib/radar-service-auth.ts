import { NextRequest, NextResponse } from 'next/server';

function readRadarServiceKeys(): string[] {
  const raw = [process.env.RADAR_SERVICE_API_KEY, process.env.RADAR_SERVICE_API_KEYS]
    .filter(Boolean)
    .join(',');
  return raw
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

function extractToken(req: NextRequest): string {
  const authHeader = req.headers.get('authorization') || '';
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice(7).trim();
  }
  return (req.headers.get('x-api-key') || '').trim();
}

export function requireRadarServiceAuth(req: NextRequest): NextResponse | null {
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
  if (!token || !keys.includes(token)) {
    return NextResponse.json(
      {
        ok: false,
        error: 'unauthorized',
      },
      { status: 401 }
    );
  }

  return null;
}

