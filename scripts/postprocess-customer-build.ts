#!/usr/bin/env bun

import { existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const exposePublicExports = /^(1|true|yes)$/i.test(process.env.WPM_EXPOSE_PUBLIC_EXPORTS || 'false');
const publicDataPath = resolve(process.cwd(), 'public/data');
const stagedPublicDataPath = resolve(process.cwd(), '.wpm-build-cache/public-data');
const nextCliPath = resolve(process.cwd(), 'node_modules/next/dist/bin/next');
const outPath = resolve(process.cwd(), 'out');

function stripExportedPublicData(): void {
  const targets = [
    resolve(process.cwd(), 'out/data'),
    resolve(process.cwd(), '.vercel/output/static/data'),
  ];

  for (const target of targets) {
    if (!existsSync(target)) continue;
    rmSync(target, { recursive: true, force: true });
    console.log(`[customer-build] removed ${target}`);
  }
}

let movedPublicData = false;

try {
  if (!existsSync(publicDataPath) && existsSync(stagedPublicDataPath)) {
    mkdirSync(dirname(publicDataPath), { recursive: true });
    renameSync(stagedPublicDataPath, publicDataPath);
    console.log(`[customer-build] restored stale backup to ${publicDataPath}`);
  }

  if (!exposePublicExports && existsSync(publicDataPath)) {
    rmSync(stagedPublicDataPath, { recursive: true, force: true });
    mkdirSync(dirname(stagedPublicDataPath), { recursive: true });
    renameSync(publicDataPath, stagedPublicDataPath);
    movedPublicData = true;
    console.log(`[customer-build] temporarily moved ${publicDataPath} -> ${stagedPublicDataPath}`);
  }

  rmSync(outPath, { recursive: true, force: true });

  const result = spawnSync('node', [nextCliPath, 'build'], {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: process.env,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }

  if (!exposePublicExports) {
    stripExportedPublicData();
  } else {
    console.log('[customer-build] WPM_EXPOSE_PUBLIC_EXPORTS enabled; keeping exported /data files.');
  }
} finally {
  if (movedPublicData && existsSync(stagedPublicDataPath)) {
    mkdirSync(dirname(publicDataPath), { recursive: true });
    renameSync(stagedPublicDataPath, publicDataPath);
    console.log(`[customer-build] restored ${publicDataPath}`);
  }
}
