import { GET as dashboardMapCountriesGet } from '@/app/api/customer/dashboard/map/countries/route';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  return dashboardMapCountriesGet(request as never);
}
