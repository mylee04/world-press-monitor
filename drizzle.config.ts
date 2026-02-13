import fs from 'node:fs';
import path from 'node:path';
import type { Config } from 'drizzle-kit';

function loadDotenvLikeFile(filePath: string) {
  // Minimal .env parser to make drizzle-kit work when invoked via node (e.g. `npx drizzle-kit ...`).
  // Supports lines like KEY=value or KEY="value". Does not expand ${VARS}.
  if (!fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, 'utf8');
  for (const lineRaw of raw.split('\n')) {
    const line = lineRaw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;

    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (!key) continue;

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (process.env[key] === undefined) process.env[key] = value;
  }
}

// Try to load env vars from repo root for convenience.
const root = process.cwd();
loadDotenvLikeFile(path.join(root, '.env.local'));
loadDotenvLikeFile(path.join(root, '.env'));

export default {
  dialect: 'postgresql',
  schema: './db/drizzle/schema.ts',
  out: './db/drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL || '',
  },
} satisfies Config;
