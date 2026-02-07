import { getIngestionOpsSummary24h } from '@/lib/ingestion-store';

export const runtime = 'nodejs';

export async function GET(): Promise<Response> {
  const summary = await getIngestionOpsSummary24h().catch(() => ({
    storage: 'disabled' as const,
    generatedAt: new Date().toISOString(),
    totals: {
      uniqueItems24h: 0,
      sourceCount24h: 0,
      seenTotal24h: 0,
      duplicateCandidates24h: 0,
      duplicateRate24h: 0,
      endpointRuns24h: 0,
      failedRuns24h: 0,
      failureRate24h: 0
    },
    topSources24h: []
  }));

  return Response.json(summary);
}
