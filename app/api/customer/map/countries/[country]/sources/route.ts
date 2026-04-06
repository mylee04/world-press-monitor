import { GET as dashboardCountrySourcesGet } from '@/app/api/customer/dashboard/map/countries/[country]/sources/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: { params: Promise<{ country: string }> }) {
  return dashboardCountrySourcesGet(request as never, context);
}
