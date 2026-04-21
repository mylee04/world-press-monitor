import { NextRequest, NextResponse } from 'next/server';
import { buildPublicSnapshotCacheHeaders } from '@/lib/dashboard-cache-control';
import { readFootballOfficialNewsLaneSummary } from '@/lib/football-official-news-store';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const rawWindowDays = request.nextUrl.searchParams.get('days');
  const team = (request.nextUrl.searchParams.get('team') || '').trim() || null;
  const parsedWindowDays = rawWindowDays ? Number.parseInt(rawWindowDays, 10) : 30;
  const windowDays = Number.isFinite(parsedWindowDays) ? Math.min(90, Math.max(1, parsedWindowDays)) : 30;

  try {
    const summary = await readFootballOfficialNewsLaneSummary(windowDays, team);
    return NextResponse.json(summary, {
      status: 200,
      headers: buildPublicSnapshotCacheHeaders({ 'X-Data-Source': 'postgres-live' }),
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : 'Failed to load official World Cup news lane.',
      },
      {
        status: 500,
        headers: { 'Cache-Control': 'no-store' },
      }
    );
  }
}
