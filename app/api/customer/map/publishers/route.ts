import { GET as dashboardMapPublishersGet } from '@/app/api/customer/dashboard/map/publishers/route';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  return dashboardMapPublishersGet(request as never);
}
