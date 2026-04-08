import { NextRequest, NextResponse } from 'next/server';
import { OPS_LOGIN_PATH, OPS_SESSION_COOKIE } from '@/lib/ops-auth';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const response = NextResponse.redirect(new URL(OPS_LOGIN_PATH, request.url));
  response.cookies.set(OPS_SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 0,
    path: '/',
  });
  return response;
}
