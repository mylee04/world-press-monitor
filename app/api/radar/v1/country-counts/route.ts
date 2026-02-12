import { NextRequest, NextResponse } from 'next/server';
import { requireRadarServiceAuth } from '@/lib/radar-service-auth';
import { getRadarServiceCountryCounts } from '@/lib/radar-service-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function toInt(raw: string | null, fallback: number, min: number, max: number): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

export async function GET(req: NextRequest): Promise<Response> {
  const unauthorized = requireRadarServiceAuth(req);
  if (unauthorized) return unauthorized;

  try {
    const { searchParams } = new URL(req.url);
    const hours = toInt(searchParams.get('hours'), 24, 1, 168);
    const counts = await getRadarServiceCountryCounts(hours);
    const total = counts.reduce((acc, item) => acc + item.count, 0);

    return NextResponse.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      windowHours: hours,
      total,
      countries: counts,
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

