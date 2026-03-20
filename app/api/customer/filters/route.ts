import { NextRequest } from 'next/server';
import { proxyCustomerApiRequest } from '@/lib/customer-portal';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  return proxyCustomerApiRequest(request, '/api/filters');
}
