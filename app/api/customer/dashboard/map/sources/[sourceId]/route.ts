import { NextRequest, NextResponse } from 'next/server';
import { hasPortalServerApiProxyConfig, proxyCustomerApiRequest, readCustomerPortalSession } from '@/lib/customer-portal';
import { readMapSourceDetail } from '@/lib/map-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, context: { params: Promise<{ sourceId: string }> }) {
  try {
    const params = await context.params;
    const sourceId = decodeURIComponent(params.sourceId || '').trim();
    if (!sourceId) {
      return NextResponse.json(
        { message: 'Source id is required.' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    if (process.env.NODE_ENV !== 'production') {
      const session = await readCustomerPortalSession();
      if (!hasPortalServerApiProxyConfig() || !session.hasToken) {
        const payload = await readMapSourceDetail(sourceId);
        if (!payload) {
          return NextResponse.json(
            { message: 'Source not found.' },
            { status: 404, headers: { 'Cache-Control': 'no-store' } }
          );
        }
        return NextResponse.json(payload, { headers: { 'Cache-Control': 'no-store' } });
      }
    }

    return proxyCustomerApiRequest(request, `/api/map/sources/${encodeURIComponent(sourceId)}`);
  } catch (error: unknown) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'Failed to load source detail.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
