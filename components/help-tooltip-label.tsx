'use client';

type HelpTooltipLabelProps = {
  label: string;
  description: string;
};

export const BENCHMARK_COLUMN_HELP = {
  published24h: 'Rolling 24-hour observed article count grouped by source country and publication time.',
  fresh24h: 'Articles that were both published and first seen by our pipeline within the same rolling 24-hour window.',
  late24h: 'Articles first seen in the latest 24 hours whose publication time was already older than 24 hours.',
  lateShare: 'Late 24h divided by inserted 24h. Higher values usually mean delayed discovery or stale backfill-like arrivals.',
  activeSources: 'Distinct sources with at least one observed article in the rolling 24-hour window.',
  top5Share: 'Share of the country total contributed by the top 5 sources. Higher values mean output is more concentrated.',
  prevDayPublished: 'Observed article count in the latest completed daily benchmark bucket.',
  prevDayActive: 'Distinct sources active in the latest completed daily benchmark bucket.',
  prevDayTop5: 'Top 5 source concentration for the latest completed daily benchmark bucket.',
  benchmarkSnapshotFreshness: 'Shows how recently the hourly benchmark snapshot was generated and which completed UTC day the current daily benchmark uses.',
  benchmarkRoleSplit: 'Use Dashboard for current rolling 24-hour operations and category mix. Use Benchmark for fixed-period country comparison across the available lenses.',
  benchmarkHourlyLens: 'The current rolling 24-hour comparison lens. The bucket is shown as a UTC hour marker, and the sub-line shows the full local time window used for ranking.',
  benchmarkComparisonPeriods: 'Benchmark supports four comparison lenses: rolling 24-hour, latest completed UTC day, current week bucket, and current calendar month bucket.',
  benchmarkDailyBucket: 'The latest completed UTC day used for daily country ranking. This is a fixed completed-day bucket, not a partial day in progress.',
  benchmarkOutput: 'Observed article output for the selected benchmark lens. Sub-lines show fresh and late counts inside the same lens.',
  benchmarkFreshness: 'Fresh rate is fresh divided by published. Late share is late divided by inserted. Together they show how real-time or delayed the observed flow is.',
  benchmarkCoverage: 'Coverage is inferred from active source breadth. For week and month views, the source figure is the average active sources per day.',
  benchmarkConcentration: 'Concentration reflects how much of the total comes from the biggest publishers. Lower Top 5 and Top 1 shares indicate a broader market.',
  benchmarkConfidence: 'A heuristic benchmark-read label based on output scale, source breadth, concentration, and delay. It is a reliability hint for the benchmark, not a quality judgment on the country.',
} as const;

export function HelpTooltipLabel({ label, description }: HelpTooltipLabelProps) {
  return (
    <span className="help-label">
      <span>{label}</span>
      <span className="help-tooltip-wrap">
        <button
          type="button"
          className="help-badge"
          aria-label={`Explain ${label}`}
        >
          ?
        </button>
        <span role="tooltip" className="help-tooltip">
          {description}
        </span>
      </span>
    </span>
  );
}
