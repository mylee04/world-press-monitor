#!/usr/bin/env bun

import { existsSync, readdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const nextCliPath = resolve(process.cwd(), 'node_modules/next/dist/bin/next');
const outPath = resolve(process.cwd(), 'out');

function listMatchingDataDirectories(rootPath: string): string[] {
  if (!existsSync(rootPath)) return [];
  return readdirSync(rootPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^data(\b|$| )/.test(entry.name))
    .map((entry) => resolve(rootPath, entry.name));
}

function stripExportedPublicData(): void {
  const targetRoots = [
    resolve(process.cwd(), 'public'),
    resolve(process.cwd(), 'out'),
    resolve(process.cwd(), '.vercel/output/static'),
  ];

  for (const targetRoot of targetRoots) {
    for (const target of listMatchingDataDirectories(targetRoot)) {
      rmSync(target, { recursive: true, force: true });
      console.log(`[customer-build] removed ${target}`);
    }
  }
}

rmSync(outPath, { recursive: true, force: true });
rmSync(resolve(process.cwd(), '.vercel/output'), { recursive: true, force: true });
stripExportedPublicData();

const result = spawnSync('node', [nextCliPath, 'build'], {
  cwd: process.cwd(),
  stdio: 'inherit',
  env: process.env,
});

if ((result.status ?? 1) !== 0) {
  process.exit(result.status ?? 1);
}

stripExportedPublicData();
