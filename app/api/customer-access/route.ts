import { NextRequest, NextResponse } from 'next/server';
import {
  attachCustomerPortalSession,
  clearCustomerPortalSession,
  readCustomerPortalSession,
  validateCustomerPortalToken,
} from '@/lib/customer-portal';

export const runtime = 'nodejs';

export async function GET() {
  const session = await readCustomerPortalSession();
  return NextResponse.json(
    {
      apiConfigured: session.apiConfigured,
      hasToken: session.hasToken,
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { token?: string } | null;
  const token = typeof body?.token === 'string' ? body.token : '';
  const result = await validateCustomerPortalToken(token);

  if (!result.ok) {
    return clearCustomerPortalSession(
      NextResponse.json(
        {
          apiConfigured: true,
          hasToken: false,
          error: result.message || 'Customer token validation failed.',
        },
        { status: result.status, headers: { 'Cache-Control': 'no-store' } }
      )
    );
  }

  return attachCustomerPortalSession(
    NextResponse.json(
      {
        apiConfigured: true,
        hasToken: true,
      },
      { headers: { 'Cache-Control': 'no-store' } }
    ),
    token.trim()
  );
}

export async function DELETE() {
  return clearCustomerPortalSession(
    NextResponse.json(
      {
        apiConfigured: true,
        hasToken: false,
      },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  );
}
