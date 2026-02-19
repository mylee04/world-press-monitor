import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type ParsedSchema = {
  tables: Map<string, Set<string>>;
  indexes: Map<string, string>; // indexName -> table
};

const SQL_SCHEMA_FILE = resolve(process.cwd(), 'db/schema.sql');
const STORE_FILE = resolve(process.cwd(), 'lib/ingestion-store.ts');
const STRICT = process.argv.includes('--strict');

function readText(path: string): string {
  return readFileSync(path, 'utf8');
}

function parseCreateTableColumns(sql: string): Map<string, Set<string>> {
  const createTableRegex = /create table if not exists\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([\s\S]*?)\);/gi;
  const tables = new Map<string, Set<string>>();

  let match: RegExpExecArray | null;
  while ((match = createTableRegex.exec(sql)) !== null) {
    const tableName = match[1].toLowerCase();
    const body = match[2] || '';
    const cols = new Set<string>();

    const lines = body
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => line.replace(/\s+/g, ' '));

    for (const line of lines) {
      if (/^constraint\b/i.test(line) || /^primary\b/i.test(line) || /^unique\b/i.test(line) || /^check\b/i.test(line) || /^foreign\b/i.test(line) || /^exclude\b/i.test(line)) {
        continue;
      }
      const columnName = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\b/);
      if (columnName) {
        cols.add(columnName[1].toLowerCase());
      }
    }

    tables.set(tableName, cols);
  }

  return tables;
}

function parseCreateIndexes(sql: string): Map<string, string> {
  const createIndexRegex = /create index if not exists\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+on\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi;
  const indexes = new Map<string, string>();
  let match: RegExpExecArray | null;

  while ((match = createIndexRegex.exec(sql)) !== null) {
    indexes.set(match[1].toLowerCase(), match[2].toLowerCase());
  }

  return indexes;
}

function extractEnsureSchemaSql(storeText: string): string {
  const queryBlocks = [...storeText.matchAll(/db\.query\(\s*`([\s\S]*?)`\s*\)/g)];
  if (queryBlocks.length === 0) {
    throw new Error('No db.query(`...`) blocks found in lib/ingestion-store.ts');
  }

  const tables = queryBlocks.map((m) => m[1]).join('\n');
  return tables;
}

function applyAlterColumns(sql: string, tables: Map<string, Set<string>>): void {
  const alterAddColumnRegex = /alter table\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+add column if not exists\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi;
  let match: RegExpExecArray | null;

  while ((match = alterAddColumnRegex.exec(sql)) !== null) {
    const tableName = match[1].toLowerCase();
    const columnName = match[2].toLowerCase();
    const cols = tables.get(tableName);
    if (!cols) {
      tables.set(tableName, new Set<string>([columnName]));
    } else {
      cols.add(columnName);
    }
  }
}

function listDifferences(
  expected: Map<string, Set<string>>,
  actual: Map<string, Set<string>>,
): string[] {
  const lines: string[] = [];
  const allTables = new Set<string>([...expected.keys(), ...actual.keys()]);

  const expectedTables = [...expected.keys()].sort();
  const actualTables = [...actual.keys()].sort();

  for (const table of actualTables) {
    if (!expected.has(table)) {
      lines.push(`table_only_in_ensure: ${table}`);
    }
  }

  for (const table of expectedTables) {
    if (!actual.has(table)) {
      lines.push(`table_missing_in_ensure: ${table}`);
      continue;
    }

    const expectedCols = expected.get(table) || new Set();
    const actualCols = actual.get(table) || new Set();

    for (const col of expectedCols) {
      if (!actualCols.has(col)) {
        lines.push(`column_missing_in_ensure: ${table}.${col}`);
      }
    }

    for (const col of actualCols) {
      if (!expectedCols.has(col)) {
        lines.push(`column_not_in_schema_sql: ${table}.${col}`);
      }
    }
  }

  return lines;
}

function compareIndexes(schemaIndexes: Map<string, string>, ensureIndexes: Map<string, string>): string[] {
  const lines: string[] = [];
  const ensureIdx = new Set(ensureIndexes.keys());
  const schemaIdx = new Set(schemaIndexes.keys());

  for (const idx of schemaIdx) {
    if (!ensureIdx.has(idx)) {
      lines.push(`index_missing_in_ensure: ${idx} (table ${schemaIndexes.get(idx)})`);
    }
  }

  for (const idx of ensureIdx) {
    if (!schemaIdx.has(idx)) {
      lines.push(`index_only_in_ensure: ${idx}`);
    }
  }

  return lines;
}

function run(): void {
  const schemaText = readText(SQL_SCHEMA_FILE);
  const storeText = readText(STORE_FILE);

  const schemaTables = parseCreateTableColumns(schemaText);
  const schemaIndexes = parseCreateIndexes(schemaText);

  const ensureSql = extractEnsureSchemaSql(storeText);
  const ensureTables = parseCreateTableColumns(ensureSql);
  const ensureIndexes = parseCreateIndexes(ensureSql);
  applyAlterColumns(ensureSql, ensureTables);

  const tableColDiffs = listDifferences(schemaTables, ensureTables);
  const indexDiffs = compareIndexes(schemaIndexes, ensureIndexes);

  const hasDiffs = tableColDiffs.length + indexDiffs.length > 0;

  console.log('Schema sync check summary');
  console.log(`  schema tables: ${schemaTables.size}`);
  console.log(`  ensure tables: ${ensureTables.size}`);
  console.log(`  schema indexes: ${schemaIndexes.size}`);
  console.log(`  ensure indexes: ${ensureIndexes.size}`);

  if (!hasDiffs) {
    console.log('Status: OK (schema-alignment appears consistent)');
    return;
  }

  console.log('Differences:');
  for (const line of [...tableColDiffs, ...indexDiffs]) {
    console.log(`  - ${line}`);
  }

  if (STRICT) {
    process.exitCode = 1;
    return;
  }

  const critical = tableColDiffs.some((line) => line.startsWith('table_missing_in_ensure:') || line.startsWith('column_missing_in_ensure:'));
  if (critical) {
    console.log('Result: Drift detected (non-strict mode; consider --strict for fail-fast).');
    return;
  }

  console.log('Result: Drift is only advisory (extra tables/indexes or additional columns in ensure).');
}

run();
