import { NextRequest, NextResponse } from 'next/server';
import { requireRadarServiceAuth } from '@/lib/radar-service-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function handle(req: NextRequest): Promise<Response> {
  const unauthorized = requireRadarServiceAuth(req, 'write:ingest');
  if (unauthorized) return unauthorized;

  try {
    const url = new URL('/api/radar/fetch', req.nextUrl.origin);
    req.nextUrl.searchParams.forEach((value, key) => url.searchParams.set(key, value));

    const response = await fetch(url.toString(), {
      method: req.method,
      headers: {
        Authorization: req.headers.get('authorization') || '',
      },
      cache: 'no-store',
    });

    const payload = await response.json().catch(() => ({}));
    return NextResponse.json(payload, { status: response.status });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest): Promise<Response> {
  return handle(req);
}

export async function POST(req: NextRequest): Promise<Response> {
  return handle(req);
}
