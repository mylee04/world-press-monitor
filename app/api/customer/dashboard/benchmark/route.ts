import { NextResponse } from 'next/server';
import { readCountryBenchmark } from '@/lib/benchmark-store';
import { readCustomerPortalSession } from '@/lib/customer-portal';
import { PRIVATE_DASHBOARD_RESPONSE_CACHE_CONTROL } from '@/lib/dashboard-cache-control';

export const runtime = 'nodejs';

export async function GET() {
  const session = await readCustomerPortalSession();
  if (!session.hasToken) {
    return NextResponse.json(
      {
        error: 'unauthorized',
        message: 'A valid customer session is required.',
      },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const payload = await readCountryBenchmark();
  return NextResponse.json(payload, {
    headers: {
      'Cache-Control': PRIVATE_DASHBOARD_RESPONSE_CACHE_CONTROL,
    },
  });
}
