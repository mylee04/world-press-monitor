import { Client } from 'pg';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type Args = {
  apply: boolean;
  all: boolean;
};

const DB_SCHEMA_PATH = resolve(process.cwd(), 'db/schema.sql');
const APPLY = process.argv.includes('--apply');
const PURGE_ALL = process.argv.includes('--all');
const url = process.env.DATABASE_URL;

const LEGACY_HINT_TABLES = new Set([
  'drafts',
  'distribution_content',
  'social_breaking_posts',
  'breaking_queue',
]);

const SAFE_SKIP_TABLES = new Set([
  '__drizzle_migrations',
  'schema_migrations',
]);

function parseCreateTableNames(sql: string): Set<string> {
  const regex = /create table if not exists\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/gi;
  const tables = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = regex.exec(sql)) !== null) {
    tables.add(m[1].toLowerCase());
  }
  return tables;
}

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

async function getPublicTables(client: Client): Promise<string[]> {
  const result = await client.query<{ tablename: string }>(
    `
      select tablename
      from pg_tables
      where schemaname = 'public'
      order by tablename;
    `,
  );
  return result.rows.map((r) => r.tablename);
}

function pickLegacyTargets(
  tables: string[],
  expected: Set<string>,
  args: Args,
): Array<{ table: string; reason: string }> {
  const targets: Array<{ table: string; reason: string }> = [];

  for (const table of tables) {
    const lower = table.toLowerCase();

    if (SAFE_SKIP_TABLES.has(lower)) continue;

    if (args.all) {
      if (!expected.has(lower)) {
        targets.push({ table, reason: 'not in current schema.sql' });
      }
      continue;
    }

    if (LEGACY_HINT_TABLES.has(lower)) {
      targets.push({ table, reason: 'known legacy table' });
    }
  }

  return targets;
}

async function main(): Promise<void> {
  if (!url) {
    throw new Error('DATABASE_URL is required. Set env and run again.');
  }

  const args: Args = {
    apply: APPLY,
    all: PURGE_ALL,
  };

  const schemaText = readFileSync(DB_SCHEMA_PATH, 'utf8');
  const expectedTables = parseCreateTableNames(schemaText);

  const client = new Client({ connectionString: url });
  await client.connect();

  try {
    const tables = await getPublicTables(client);
    const targets = pickLegacyTargets(tables, expectedTables, args);

    if (targets.length === 0) {
      console.log('No legacy tables detected for the selected mode.');
      return;
    }

    console.log(`Mode: ${args.all ? 'purge-all-non-schema' : 'legacy-hint-only'}`);
    console.log(`Current tables: ${tables.length}`);
    console.log(`Legacy targets: ${targets.length}`);

    for (const t of targets) {
      console.log(`  - ${t.table} (${t.reason})`);
    }

    if (!args.apply) {
      console.log('Dry-run mode: no tables were dropped.');
      console.log('Run with --apply to drop these tables:');
      console.log(`  bun scripts/purge-legacy-db-tables.ts --apply${args.all ? ' --all' : ''}`);
      return;
    }

    for (const { table } of targets) {
      await client.query(`drop table if exists ${quoteIdent(table)} cascade`);
      console.log(`Dropped: ${table}`);
    }

    console.log('Legacy cleanup complete.');
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
