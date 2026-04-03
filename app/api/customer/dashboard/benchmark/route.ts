import { NextResponse } from 'next/server';
import { readCountryBenchmark } from '@/lib/benchmark-store';
import { PUBLIC_MAP_RESPONSE_CACHE_CONTROL } from '@/lib/dashboard-cache-control';

export const runtime = 'nodejs';

export async function GET() {
  const payload = await readCountryBenchmark();
  return NextResponse.json(payload, {
    headers: {
      'Cache-Control': PUBLIC_MAP_RESPONSE_CACHE_CONTROL,
    },
  });
}
