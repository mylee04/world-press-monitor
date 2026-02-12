import { NextRequest, NextResponse } from 'next/server';
import { requireRadarServiceAuth } from '@/lib/radar-service-auth';
import { getRadarServiceOpsSummary } from '@/lib/radar-service-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<Response> {
  const unauthorized = requireRadarServiceAuth(req);
  if (unauthorized) return unauthorized;

  try {
    const summary = await getRadarServiceOpsSummary();
    return NextResponse.json({
      ok: true,
      ...summary,
    });
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

