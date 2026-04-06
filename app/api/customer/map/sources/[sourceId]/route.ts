import { GET as dashboardSourceDetailGet } from '@/app/api/customer/dashboard/map/sources/[sourceId]/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: { params: Promise<{ sourceId: string }> }) {
  return dashboardSourceDetailGet(request as never, context);
}
