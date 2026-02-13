import { processRadarSummaryQueue, type RadarSummaryRunStats } from '../lib/radar-summary-worker';

function formatSummary(stats: RadarSummaryRunStats): string {
  const parts: string[] = [
    `seeded=${stats.seeded}`,
    `claimed=${stats.claimed}`,
    `processed=${stats.processed}`,
    `completed=${stats.completed}`,
    `skipped=${stats.skipped}`,
    `failed=${stats.failed}`,
    `retry=${stats.retryScheduled}`,
    `deferredByQuota=${stats.deferredByQuota}`,
    `cooldown=${stats.cooldownDeferred}`,
    `providerUsage(glm=${stats.providerUsage.glm}, gemini=${stats.providerUsage.gemini})`,
  ];
  return parts.join(' ');
}

async function main(): Promise<void> {
  const generatedAt = new Date().toISOString();
  const summary = await processRadarSummaryQueue();
  const line = `[radar-summary] ${generatedAt} ${formatSummary(summary)}`;

  console.log(line);
  if (summary.errorSamples.length > 0) {
    for (const sample of summary.errorSamples) {
      console.log(`[radar-summary] sample_error: ${sample}`);
    }
  }
}

main().catch((error) => {
  console.error('[radar-summary] failed');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
