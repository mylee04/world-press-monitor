import { NextResponse } from 'next/server';
import { readCustomerPortalSession } from '@/lib/customer-portal';
import { readMapPublishers } from '@/lib/map-store';

export const runtime = 'nodejs';

function allowLocalPreview(): boolean {
  return process.env.NODE_ENV !== 'production';
}

export async function GET() {
  const session = await readCustomerPortalSession();
  if (!allowLocalPreview() && !session.hasToken) {
    return NextResponse.json(
      { message: 'A valid customer session is required.' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  try {
    const payload = await readMapPublishers();
    return NextResponse.json(payload, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error: unknown) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'Failed to load publisher map metrics.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
