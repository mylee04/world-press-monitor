export type OpsSeverity = 'warn' | 'crit';
export type OpsStatus = 'green' | 'yellow' | 'red';

export type OpsThresholds = {
  minInserted1h: number;
  maxNoIngestMinutes: number;
  maxEndpointFailureRate1hPct: number;
  maxQueueNewTotal: number;
  maxWorkerStaleMinutes: number;
};

export type OpsMetrics = {
  inserted1h: number;
  noIngestMinutes: number | null;
  endpointFailureRate1hPct: number;
  queueNewTotal: number;
  workerStaleMinutes: number | null;
};

export type OpsAlert = {
  severity: OpsSeverity;
  code: string;
  message: string;
};

function toNumber(value: string, fallback: number): number {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

function toInt(value: string, fallback: number): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

export function loadOpsThresholds(
  getEnv: (key: string) => string
): OpsThresholds {
  return {
    minInserted1h: Math.max(0, toInt(getEnv('OPS_ALERT_MIN_INSERTED_1H'), 100)),
    maxNoIngestMinutes: Math.max(1, toInt(getEnv('OPS_ALERT_MAX_NO_INGEST_MINUTES'), 10)),
    maxEndpointFailureRate1hPct: Math.max(
      0,
      Math.min(
        100,
        toNumber(getEnv('OPS_ALERT_MAX_ENDPOINT_FAILURE_RATE_1H_PCT'), 15)
      )
    ),
    maxQueueNewTotal: Math.max(0, toInt(getEnv('OPS_ALERT_MAX_QUEUE_NEW_TOTAL'), 500)),
    maxWorkerStaleMinutes: Math.max(1, toInt(getEnv('OPS_ALERT_MAX_WORKER_STALE_MINUTES'), 25)),
  };
}

export function evaluateOpsStatus(
  metrics: OpsMetrics,
  thresholds: OpsThresholds
): { status: OpsStatus; alerts: OpsAlert[] } {
  const alerts: OpsAlert[] = [];

  if (metrics.inserted1h < thresholds.minInserted1h) {
    alerts.push({
      severity: 'crit',
      code: 'ingest_low_1h',
      message: `Ingest 1h ${metrics.inserted1h} < min ${thresholds.minInserted1h}`,
    });
  }

  if (metrics.noIngestMinutes === null) {
    alerts.push({
      severity: 'warn',
      code: 'ingest_no_heartbeat',
      message: 'Ingest heartbeat unavailable',
    });
  } else if (metrics.noIngestMinutes > thresholds.maxNoIngestMinutes * 2) {
    alerts.push({
      severity: 'crit',
      code: 'ingest_stale',
      message: `No ingest for ${metrics.noIngestMinutes.toFixed(1)}m > ${thresholds.maxNoIngestMinutes * 2}m`,
    });
  } else if (metrics.noIngestMinutes > thresholds.maxNoIngestMinutes) {
    alerts.push({
      severity: 'warn',
      code: 'ingest_stale',
      message: `No ingest for ${metrics.noIngestMinutes.toFixed(1)}m > ${thresholds.maxNoIngestMinutes}m`,
    });
  }

  if (metrics.endpointFailureRate1hPct > thresholds.maxEndpointFailureRate1hPct * 2) {
    alerts.push({
      severity: 'crit',
      code: 'endpoint_fail_rate_1h',
      message: `Endpoint fail 1h ${metrics.endpointFailureRate1hPct.toFixed(1)}% > ${
        thresholds.maxEndpointFailureRate1hPct * 2
      }%`,
    });
  } else if (metrics.endpointFailureRate1hPct > thresholds.maxEndpointFailureRate1hPct) {
    alerts.push({
      severity: 'warn',
      code: 'endpoint_fail_rate_1h',
      message: `Endpoint fail 1h ${metrics.endpointFailureRate1hPct.toFixed(1)}% > ${thresholds.maxEndpointFailureRate1hPct}%`,
    });
  }

  if (metrics.queueNewTotal > thresholds.maxQueueNewTotal * 2) {
    alerts.push({
      severity: 'crit',
      code: 'breaking_queue_backlog',
      message: `Queue backlog ${metrics.queueNewTotal} > ${thresholds.maxQueueNewTotal * 2}`,
    });
  } else if (metrics.queueNewTotal > thresholds.maxQueueNewTotal) {
    alerts.push({
      severity: 'warn',
      code: 'breaking_queue_backlog',
      message: `Queue backlog ${metrics.queueNewTotal} > ${thresholds.maxQueueNewTotal}`,
    });
  }

  if (metrics.workerStaleMinutes === null) {
    alerts.push({
      severity: 'warn',
      code: 'worker_stale',
      message: 'Worker heartbeat unavailable',
    });
  } else if (metrics.workerStaleMinutes > thresholds.maxWorkerStaleMinutes * 2) {
    alerts.push({
      severity: 'crit',
      code: 'worker_stale',
      message: `Worker stale ${metrics.workerStaleMinutes}m > ${thresholds.maxWorkerStaleMinutes * 2}m`,
    });
  } else if (metrics.workerStaleMinutes > thresholds.maxWorkerStaleMinutes) {
    alerts.push({
      severity: 'warn',
      code: 'worker_stale',
      message: `Worker stale ${metrics.workerStaleMinutes}m > ${thresholds.maxWorkerStaleMinutes}m`,
    });
  }

  const status: OpsStatus = alerts.some((alert) => alert.severity === 'crit')
    ? 'red'
    : alerts.some((alert) => alert.severity === 'warn')
      ? 'yellow'
      : 'green';

  return { status, alerts };
}
