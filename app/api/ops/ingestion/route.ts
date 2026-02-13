import { NextRequest } from 'next/server';
import { getIngestionOpsSummary24h } from '@/lib/ingestion-store';
import { requireRadarServiceAuth } from '@/lib/radar-service-auth';

export const runtime = 'nodejs';

export async function GET(req: NextRequest): Promise<Response> {
  const unauthorized = requireRadarServiceAuth(req, 'read:ops');
  if (unauthorized) return unauthorized;

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
      failureRate24h: 0,
      externalArticles24h: 0,
      translatedTitleCoverage24h: 0,
      translatedSummaryCoverage24h: 0
    },
    topSources24h: []
  }));

  return Response.json(summary);
}
