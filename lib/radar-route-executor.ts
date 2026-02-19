import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { requireRadarServiceAuth } from '@/lib/radar-service-auth';

type ErrorMessageProvider = (error: unknown) => string;

export type RadarGetRouteOptions<TParams, TResponse> = {
  req: NextRequest;
  scope: string;
  requireAuth?: boolean;
  parseParams: (searchParams: URLSearchParams) => TParams;
  runQuery: (params: TParams) => Promise<TResponse>;
  toResponse: (result: TResponse, params: TParams, req: NextRequest) => Response | Promise<Response>;
  getErrorMessage?: ErrorMessageProvider;
};

function defaultErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function executeRadarGetRoute<TParams, TResponse>(
  options: RadarGetRouteOptions<TParams, TResponse>
): Promise<Response> {
  const {
    req,
    scope,
    requireAuth = true,
    parseParams,
    runQuery,
    toResponse,
    getErrorMessage = defaultErrorMessage,
  } = options;

  if (requireAuth) {
    const unauthorized = requireRadarServiceAuth(req, scope);
    if (unauthorized) return unauthorized;
  }

  try {
    const params = parseParams(req.nextUrl.searchParams);
    const result = await runQuery(params);
    const response = await toResponse(result, params, req);
    return response;
  } catch (error) {
    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status: 500 }
    );
  }
}
