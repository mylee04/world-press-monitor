import { NextRequest, NextResponse } from 'next/server';
import { requireRadarServiceAuth } from '@/lib/radar-service-auth';
import { getRadarServiceOpsSummary } from '@/lib/radar-service-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<Response> {
  if (process.env.RADAR_SERVICE_REQUIRE_AUTH !== 'false') {
    const unauthorized = requireRadarServiceAuth(req, 'read:ops');
    if (unauthorized) return unauthorized;
  }

  try {
    const snapshot = await getRadarServiceOpsSummary();
    return NextResponse.json(snapshot);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

