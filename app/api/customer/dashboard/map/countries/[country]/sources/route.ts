import { NextRequest, NextResponse } from 'next/server';
import { hasPortalServerApiProxyConfig, proxyCustomerApiRequest, readCustomerPortalSession } from '@/lib/customer-portal';
import { normalizeMapMetricWindow, readMapCountrySources } from '@/lib/map-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, context: { params: Promise<{ country: string }> }) {
  try {
    const params = await context.params;
    const country = decodeURIComponent(params.country || '').trim();
    if (!country) {
      return NextResponse.json(
        { message: 'Country is required.' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const window = normalizeMapMetricWindow(request.nextUrl.searchParams.get('window'));
    if (process.env.NODE_ENV !== 'production') {
      const session = await readCustomerPortalSession();
      if (!hasPortalServerApiProxyConfig() || !session.hasToken) {
        const payload = await readMapCountrySources(country, window);
        return NextResponse.json(payload, { headers: { 'Cache-Control': 'no-store' } });
      }
    }

    request.nextUrl.searchParams.set('window', window);
    return proxyCustomerApiRequest(request, `/api/map/countries/${encodeURIComponent(country)}/sources`);
  } catch (error: unknown) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'Failed to load country sources.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
