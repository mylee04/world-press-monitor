import { NextRequest } from 'next/server';
import { proxyPortalServerApiRequest } from '@/lib/customer-portal';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  return proxyPortalServerApiRequest(request, '/api/filters');
}
