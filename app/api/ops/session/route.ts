import { NextRequest, NextResponse } from 'next/server';
import {
  buildOpsSessionValue,
  isOpsConfigured,
  isValidOpsPassword,
  normalizeOpsRedirectPath,
  OPS_DEFAULT_PATH,
  OPS_LOGIN_PATH,
  OPS_SESSION_COOKIE,
} from '@/lib/ops-auth';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const password = String(formData.get('password') || '');
  const redirectTo = normalizeOpsRedirectPath(String(formData.get('redirectTo') || OPS_DEFAULT_PATH));
  const loginUrl = new URL(OPS_LOGIN_PATH, request.url);

  if (!isOpsConfigured()) {
    loginUrl.searchParams.set('error', 'config');
    return NextResponse.redirect(loginUrl);
  }

  if (!isValidOpsPassword(password)) {
    loginUrl.searchParams.set('error', 'invalid');
    return NextResponse.redirect(loginUrl);
  }

  const response = NextResponse.redirect(new URL(redirectTo, request.url));
  response.cookies.set(OPS_SESSION_COOKIE, buildOpsSessionValue(), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 14,
    path: '/',
  });
  return response;
}
