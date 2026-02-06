import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

type HealthRow = {
  source: string;
  reviewDecision: string;
  failureRate: number;
  recent24h: number;
};

const AUDITS_DIR = resolve(process.cwd(), 'audits');
const HEALTH_PREFIX = 'us_latam_source_health_';
const HEALTH_SUFFIX = '.csv';
const OUTLETS_PATH = resolve(process.cwd(), 'data/outlets.ts');

function parseArgs(): { apply: boolean; minRecent: number; maxFailure: number } {
  const args = process.argv.slice(2);
  let apply = false;
  let minRecent = 5;
  let maxFailure = 0.2;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--apply') apply = true;
    if (arg === '--min-recent' && i + 1 < args.length) {
      minRecent = Number(args[i + 1]);
      i += 1;
    }
    if (arg === '--max-failure' && i + 1 < args.length) {
      maxFailure = Number(args[i + 1]);
      i += 1;
    }
  }
  return { apply, minRecent, maxFailure };
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      const next = line[i + 1];
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === ',' && !inQuotes) {
      out.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  out.push(current);
  return out;
}

function latestHealthCsv(): string {
  const files = readdirSync(AUDITS_DIR)
    .filter((f) => f.startsWith(HEALTH_PREFIX) && f.endsWith(HEALTH_SUFFIX))
    .sort();
  if (files.length === 0) {
    throw new Error('No us_latam_source_health CSV found. Run `bun run report:us-latam-health` first.');
  }
  return resolve(AUDITS_DIR, files[files.length - 1]);
}

function readHealthRows(path: string): HealthRow[] {
  const raw = readFileSync(path, 'utf8').trim();
  if (!raw) return [];
  const lines = raw.split('\n');
  if (lines.length <= 1) return [];

  const header = parseCsvLine(lines[0]);
  const sourceIdx = header.indexOf('source');
  const reviewIdx = header.indexOf('review_decision');
  const failIdx = header.indexOf('failure_rate');
  const recentIdx = header.indexOf('recent_24h');
  if (sourceIdx < 0 || reviewIdx < 0 || failIdx < 0 || recentIdx < 0) {
    throw new Error('Unexpected us_latam_source_health CSV format.');
  }

  return lines.slice(1).map((line) => {
    const cols = parseCsvLine(line);
    return {
      source: cols[sourceIdx] || '',
      reviewDecision: cols[reviewIdx] || '',
      failureRate: Number(cols[failIdx] || '1'),
      recent24h: Number(cols[recentIdx] || '0')
    };
  });
}

function replacePromotedSet(content: string, promotedNames: string[]): string {
  const blockRegex = /const PROMOTED_EXPANSION = new Set<string>\(\[[\s\S]*?\]\);/m;
  if (!blockRegex.test(content)) {
    throw new Error('Could not find PROMOTED_EXPANSION block in data/outlets.ts');
  }

  const lines = [
    'const PROMOTED_EXPANSION = new Set<string>([',
    ...promotedNames.map((name) => `  '${name}',`),
    ']);'
  ];
  return content.replace(blockRegex, lines.join('\n'));
}

function readCurrentPromotedNames(content: string): string[] {
  const blockRegex = /const PROMOTED_EXPANSION = new Set<string>\(\[([\s\S]*?)\]\);/m;
  const match = content.match(blockRegex);
  if (!match) {
    throw new Error('Could not find PROMOTED_EXPANSION block in data/outlets.ts');
  }
  return Array.from(match[1].matchAll(/'([^']+)'/g)).map((m) => m[1]);
}

function readAllExpansionNames(content: string): string[] {
  const blockRegex = /const ALL_EXPANSION_SOURCE_NAMES = new Set\(\[([\s\S]*?)\]\);/m;
  const match = content.match(blockRegex);
  if (!match) {
    throw new Error('Could not find ALL_EXPANSION_SOURCE_NAMES block in data/outlets.ts');
  }
  return Array.from(match[1].matchAll(/'([^']+)'/g)).map((m) => m[1]);
}

function toMarkdown(
  promotedThisRun: string[],
  exploratoryBefore: string[],
  exploratoryAfter: string[],
  promotedAfter: string[],
  csvPath: string,
  minRecent: number,
  maxFailure: number
): string {
  const lines: string[] = [];
  lines.push('# Expansion Promotion Decisions');
  lines.push('');
  lines.push(`- Generated at: ${new Date().toISOString()}`);
  lines.push(`- Source health file: ${csvPath}`);
  lines.push(`- Rule: exploratory_off_by_default AND recent_24h >= ${minRecent} AND failure_rate <= ${maxFailure}`);
  lines.push('');
  lines.push(`- Promoted this run: ${promotedThisRun.length}`);
  lines.push(`- Exploratory before apply: ${exploratoryBefore.length}`);
  lines.push(`- Exploratory after apply: ${exploratoryAfter.length}`);
  lines.push(`- Total promoted after apply: ${promotedAfter.length}`);
  lines.push('');
  lines.push('## Promoted This Run');
  lines.push('');
  for (const name of promotedThisRun) lines.push(`- ${name}`);
  lines.push('');
  lines.push('## Exploratory After Apply');
  lines.push('');
  for (const name of exploratoryAfter) lines.push(`- ${name}`);
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function main(): void {
  const { apply, minRecent, maxFailure } = parseArgs();
  const csvPath = latestHealthCsv();
  const rows = readHealthRows(csvPath);

  const exploratoryRows = rows.filter((row) => row.reviewDecision === 'exploratory_off_by_default');
  const promotedThisRun = exploratoryRows
    .filter((row) => row.recent24h >= minRecent && row.failureRate <= maxFailure)
    .map((row) => row.source)
    .sort((a, b) => a.localeCompare(b));

  const currentOutlets = readFileSync(OUTLETS_PATH, 'utf8');
  const allExpansionNames = readAllExpansionNames(currentOutlets);
  const currentPromoted = new Set(readCurrentPromotedNames(currentOutlets));
  const exploratoryBefore = exploratoryRows.map((row) => row.source).sort((a, b) => a.localeCompare(b));
  const nextPromoted = Array.from(new Set([...currentPromoted, ...promotedThisRun])).sort((a, b) => a.localeCompare(b));
  const exploratoryAfter = allExpansionNames
    .filter((name) => !nextPromoted.includes(name))
    .sort((a, b) => a.localeCompare(b));

  const stamp = new Date().toISOString().slice(0, 10);
  const decisionPath = resolve(process.cwd(), `audits/expansion_promotion_${stamp}.md`);
  if (!apply) {
    writeFileSync(
      decisionPath,
      toMarkdown(promotedThisRun, exploratoryBefore, exploratoryBefore, Array.from(currentPromoted).sort((a, b) => a.localeCompare(b)), csvPath, minRecent, maxFailure),
      'utf8'
    );
    console.log(`Wrote ${decisionPath}`);
    return;
  }

  const nextContent = replacePromotedSet(currentOutlets, nextPromoted);
  writeFileSync(OUTLETS_PATH, nextContent, 'utf8');
  writeFileSync(
    decisionPath,
    toMarkdown(promotedThisRun, exploratoryBefore, exploratoryAfter, nextPromoted, csvPath, minRecent, maxFailure),
    'utf8'
  );
  console.log(`Wrote ${decisionPath}`);
  console.log(`Updated ${OUTLETS_PATH} (new promotions this run: ${promotedThisRun.length}).`);
}

main();
