import { NextRequest, NextResponse } from 'next/server';
import { requireRadarServiceAuth } from '@/lib/radar-service-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 10;

async function handle(req: NextRequest): Promise<Response> {
  const unauthorized = requireRadarServiceAuth(req, 'write:ingest');
  if (unauthorized) return unauthorized;

  return NextResponse.json({
    ok: true,
    operation: 'fetch_auth_ping',
    scope: 'write:ingest',
    generatedAt: new Date().toISOString(),
  });
}

export async function GET(req: NextRequest): Promise<Response> {
  return handle(req);
}

export async function POST(req: NextRequest): Promise<Response> {
  return handle(req);
}
