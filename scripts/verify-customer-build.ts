#!/usr/bin/env bun

import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const roots = [
  resolve(process.cwd(), 'out'),
  resolve(process.cwd(), '.vercel/output/static'),
];

function findDataDirectories(rootPath: string): string[] {
  if (!existsSync(rootPath)) return [];
  return readdirSync(rootPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^data(\b|$| )/.test(entry.name))
    .map((entry) => resolve(rootPath, entry.name));
}

const findings = roots.flatMap((rootPath) => findDataDirectories(rootPath));

if (findings.length > 0) {
  console.error('[verify-customer-build] unexpected data directories found:');
  for (const finding of findings) {
    console.error(`- ${finding}`);
  }
  process.exit(1);
}

console.log('[verify-customer-build] no data* directories found in customer build outputs.');
