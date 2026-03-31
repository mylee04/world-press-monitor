import { NextRequest, NextResponse } from 'next/server';
import { readCustomerPortalSession } from '@/lib/customer-portal';
import { readMapSourceDetail } from '@/lib/map-store';

export const runtime = 'nodejs';

function allowLocalPreview(): boolean {
  return process.env.NODE_ENV !== 'production';
}

export async function GET(_request: NextRequest, context: { params: Promise<{ sourceId: string }> }) {
  const session = await readCustomerPortalSession();
  if (!allowLocalPreview() && !session.hasToken) {
    return NextResponse.json(
      { message: 'A valid customer session is required.' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  try {
    const params = await context.params;
    const payload = await readMapSourceDetail(params.sourceId || '');
    if (!payload) {
      return NextResponse.json(
        { message: 'Source not found.' },
        { status: 404, headers: { 'Cache-Control': 'no-store' } }
      );
    }
    return NextResponse.json(payload, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error: unknown) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'Failed to load source detail.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
