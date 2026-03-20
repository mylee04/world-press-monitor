import { NextRequest, NextResponse } from 'next/server';

function isBlockedDataPath(pathname: string): boolean {
  const decodedPath = decodeURIComponent(pathname);
  return /^\/data(\b|[ /])/.test(decodedPath);
}

export function middleware(request: NextRequest) {
  if (isBlockedDataPath(request.nextUrl.pathname)) {
    return new NextResponse('Not Found', {
      status: 404,
      headers: {
        'Cache-Control': 'no-store',
      },
    });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
