import { getNewsCacheMetrics } from '@/lib/news-cache-metrics';

export const runtime = 'edge';

export async function GET(): Promise<Response> {
  const metrics = await getNewsCacheMetrics();
  return Response.json({
    generatedAt: new Date().toISOString(),
    cache: metrics
  });
}
