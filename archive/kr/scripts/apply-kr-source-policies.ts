import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

type VerifyStatus = 'ok_xml' | 'blocked' | 'not_found' | 'network_error' | 'unexpected_content' | 'http_error';

type VerifyRow = {
  name: 'SBS' | 'KBS' | 'MBC' | 'JTBC' | 'YTN';
  type: 'rss' | 'sitemap';
  candidateId?: string;
  status: VerifyStatus;
  checkedAt: string;
};

type PolicyDecision = 'promote_keep_secondary' | 'deprecate_candidate' | 'hold_manual_review';

interface HistoryItem {
  lastDecision: PolicyDecision;
  consecutiveDeprecate: number;
  updatedAt: string;
}

type HistoryState = Record<string, HistoryItem>;

const BROADCASTER_TO_OUTLET: Record<string, string> = {
  SBS: 'SBS News KR',
  KBS: 'KBS News KR',
  MBC: 'MBC News KR',
  JTBC: 'JTBC News KR',
  YTN: 'YTN News KR'
};

function latestAuditFile(): string {
  const auditsDir = resolve(process.cwd(), 'audits');
  const candidates = readdirSync(auditsDir)
    .filter((name) => /^kr_source_http_verification_\d{4}-\d{2}-\d{2}\.json$/.test(name))
    .sort();

  if (candidates.length === 0) {
    throw new Error('No kr_source_http_verification_YYYY-MM-DD.json file found in audits/.');
  }

  return join(auditsDir, candidates[candidates.length - 1]);
}

function readRows(filePath: string): VerifyRow[] {
  const raw = readFileSync(filePath, 'utf8');
  return JSON.parse(raw) as VerifyRow[];
}

function decide(statuses: VerifyStatus[]): PolicyDecision {
  if (statuses.includes('ok_xml')) return 'promote_keep_secondary';

  const strongFailOnly = statuses.every((s) => s === 'not_found' || s === 'unexpected_content' || s === 'http_error');
  if (strongFailOnly && statuses.length > 0) return 'deprecate_candidate';

  return 'hold_manual_review';
}

function extractSetMembers(content: string, constName: string): string[] {
  const regex = new RegExp(`const ${constName} = new Set(?:<[^>]+>)?\\(\\[([\\s\\S]*?)\\]\\);`);
  const match = content.match(regex);
  if (!match) throw new Error(`Could not find set: ${constName}`);

  const body = match[1];
  return [...body.matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

function replaceSetMembers(content: string, constName: string, values: string[]): string {
  const regex = new RegExp(`const ${constName} = new Set(?:<[^>]+>)?\\(\\[([\\s\\S]*?)\\]\\);`);
  const sorted = [...new Set(values)].sort((a, b) => a.localeCompare(b));
  const formatted = sorted.map((v) => `  '${v}'`).join(',\n');
  const replacement = `const ${constName} = new Set([\n${formatted}\n]);`;
  return content.replace(regex, replacement);
}

function toStamp(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

function historyPath(): string {
  return resolve(process.cwd(), 'audits/kr_source_policy_history.json');
}

function readHistory(): HistoryState {
  const path = historyPath();
  if (!existsSync(path)) return {};
  const raw = readFileSync(path, 'utf8');
  return JSON.parse(raw) as HistoryState;
}

function writeHistory(history: HistoryState): void {
  writeFileSync(historyPath(), `${JSON.stringify(history, null, 2)}\n`, 'utf8');
}

function scoreStatus(status: VerifyStatus): number {
  if (status === 'ok_xml') return 5;
  if (status === 'blocked') return 3;
  if (status === 'unexpected_content') return 2;
  if (status === 'http_error') return 1;
  if (status === 'not_found') return 0;
  return -1;
}

function pickBestStatuses(rows: VerifyRow[]): Map<string, VerifyStatus[]> {
  const result = new Map<string, VerifyStatus[]>();

  for (const broadcaster of Object.keys(BROADCASTER_TO_OUTLET)) {
    const subset = rows
      .filter((row) => row.name === broadcaster)
      .sort((a, b) => scoreStatus(b.status) - scoreStatus(a.status));

    const top = subset.slice(0, 2).map((row) => row.status);
    result.set(broadcaster, top);
  }

  return result;
}

function main(): void {
  const apply = process.argv.includes('--apply');
  const auditPath = latestAuditFile();
  const rows = readRows(auditPath);
  const bestStatuses = pickBestStatuses(rows);

  const decisions: Array<{
    broadcaster: string;
    outlet: string;
    statuses: VerifyStatus[];
    decision: PolicyDecision;
    consecutiveDeprecate: number;
    autoDisabled: boolean;
  }> = [];

  const history = readHistory();

  for (const [broadcaster, outlet] of Object.entries(BROADCASTER_TO_OUTLET)) {
    const statuses = bestStatuses.get(broadcaster) || [];
    const decision = decide(statuses);
    const transientNetworkFailure = statuses.length > 0 && statuses.every((status) => status === 'network_error');

    const prev = history[outlet];
    const effectiveDecision = transientNetworkFailure && prev ? prev.lastDecision : decision;
    const nextDeprecate = transientNetworkFailure && prev
      ? prev.consecutiveDeprecate
      : effectiveDecision === 'deprecate_candidate'
        ? ((prev?.lastDecision === 'deprecate_candidate' ? prev.consecutiveDeprecate : 0) + 1)
        : 0;

    history[outlet] = {
      lastDecision: effectiveDecision,
      consecutiveDeprecate: nextDeprecate,
      updatedAt: new Date().toISOString()
    };

    decisions.push({
      broadcaster,
      outlet,
      statuses,
      decision: effectiveDecision,
      consecutiveDeprecate: nextDeprecate,
      autoDisabled: nextDeprecate >= 2
    });
  }

  const outletsPath = resolve(process.cwd(), 'data/outlets.ts');
  const original = readFileSync(outletsPath, 'utf8');
  const keepSecondary = new Set(extractSetMembers(original, 'KEEP_SECONDARY'));
  const manualReview = new Set(extractSetMembers(original, 'MANUAL_REVIEW'));
  const deprecatedOutlets = new Set(extractSetMembers(original, 'DEPRECATED_OUTLETS'));

  for (const item of decisions) {
    if (item.decision === 'promote_keep_secondary') {
      keepSecondary.add(item.outlet);
      manualReview.delete(item.outlet);
      deprecatedOutlets.delete(item.outlet);
      continue;
    }

    manualReview.add(item.outlet);
    keepSecondary.delete(item.outlet);

    if (item.autoDisabled) {
      deprecatedOutlets.add(item.outlet);
    }
  }

  let next = original;
  next = replaceSetMembers(next, 'KEEP_SECONDARY', [...keepSecondary]);
  next = replaceSetMembers(next, 'MANUAL_REVIEW', [...manualReview]);
  next = replaceSetMembers(next, 'DEPRECATED_OUTLETS', [...deprecatedOutlets]);

  if (apply) {
    if (next !== original) {
      writeFileSync(outletsPath, next, 'utf8');
    }
    writeHistory(history);
  }

  const stamp = toStamp();
  const reportPath = resolve(process.cwd(), `audits/kr_source_policy_actions_${stamp}.md`);
  const lines: string[] = [];
  lines.push('# KR Source Policy Actions');
  lines.push('');
  lines.push(`- Generated at: ${new Date().toISOString()}`);
  lines.push(`- Audit source: ${auditPath}`);
  lines.push(`- Mode: ${apply ? 'apply' : 'dry-run'}`);
  lines.push('');
  lines.push('| Broadcaster | Outlet | Top Statuses | Decision | Deprecate Streak | Auto Disabled |');
  lines.push('| --- | --- | --- | --- | --- | --- |');

  for (const item of decisions) {
    lines.push(`| ${item.broadcaster} | ${item.outlet} | ${item.statuses.join(', ') || '-'} | ${item.decision} | ${item.consecutiveDeprecate} | ${item.autoDisabled ? 'yes' : 'no'} |`);
  }

  lines.push('');
  lines.push('Decision semantics:');
  lines.push('- `promote_keep_secondary`: move to `KEEP_SECONDARY`, remove from `MANUAL_REVIEW`, clear deprecation.');
  lines.push('- `deprecate_candidate`: keep in `MANUAL_REVIEW`; if streak >= 2, add to `DEPRECATED_OUTLETS` (hidden from source list/presets).');
  lines.push('- `hold_manual_review`: keep in `MANUAL_REVIEW`; no auto-disable.');

  writeFileSync(reportPath, `${lines.join('\n')}\n`, 'utf8');

  console.log(`Wrote ${reportPath}`);
  if (apply) {
    console.log(`Updated ${outletsPath}`);
    console.log(`Updated ${historyPath()}`);
  } else {
    console.log('Dry-run only. Re-run with --apply to mutate data/outlets.ts and history.');
  }
}

main();
