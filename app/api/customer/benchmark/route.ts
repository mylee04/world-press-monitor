import { GET as dashboardBenchmarkGet } from '@/app/api/customer/dashboard/benchmark/route';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  return dashboardBenchmarkGet(request as never);
}
