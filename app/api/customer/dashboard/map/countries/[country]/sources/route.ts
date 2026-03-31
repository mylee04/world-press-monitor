import { NextRequest, NextResponse } from 'next/server';
import { readCustomerPortalSession } from '@/lib/customer-portal';
import { readMapCountrySources } from '@/lib/map-store';

export const runtime = 'nodejs';

function allowLocalPreview(): boolean {
  return process.env.NODE_ENV !== 'production';
}

export async function GET(_request: NextRequest, context: { params: Promise<{ country: string }> }) {
  const session = await readCustomerPortalSession();
  if (!allowLocalPreview() && !session.hasToken) {
    return NextResponse.json(
      { message: 'A valid customer session is required.' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  try {
    const params = await context.params;
    const country = decodeURIComponent(params.country || '').trim();
    if (!country) {
      return NextResponse.json(
        { message: 'Country is required.' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      );
    }
    const payload = await readMapCountrySources(country);
    return NextResponse.json(payload, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error: unknown) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'Failed to load country sources.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
