#!/usr/bin/env bun

import { existsSync, mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const exposePublicExports = /^(1|true|yes)$/i.test(
  process.env.WPR_EXPOSE_PUBLIC_EXPORTS || process.env.WPM_EXPOSE_PUBLIC_EXPORTS || 'false'
);
const publicPath = resolve(process.cwd(), 'public');
const stagedPublicRootPath = resolve(process.cwd(), '.wpr-build-cache/public');
const legacyStagedPublicRootPath = resolve(process.cwd(), '.wpm-build-cache/public');
const legacyStagedPublicDataPath = resolve(process.cwd(), '.wpm-build-cache/public-data');
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

const movedPublicDataDirectories: Array<{ sourcePath: string; stagedPath: string }> = [];
let exitCode = 0;

try {
  if (existsSync(legacyStagedPublicDataPath)) {
    const legacyPublicDataPath = resolve(publicPath, 'data');
    if (!existsSync(legacyPublicDataPath)) {
      mkdirSync(dirname(legacyPublicDataPath), { recursive: true });
      renameSync(legacyStagedPublicDataPath, legacyPublicDataPath);
      console.log(`[customer-build] restored legacy backup to ${legacyPublicDataPath}`);
    }
  }

  for (const candidateRoot of [stagedPublicRootPath, legacyStagedPublicRootPath]) {
    for (const stagedPath of listMatchingDataDirectories(candidateRoot)) {
      const sourcePath = resolve(publicPath, stagedPath.slice(candidateRoot.length + 1));
      if (!existsSync(sourcePath)) {
        mkdirSync(dirname(sourcePath), { recursive: true });
        renameSync(stagedPath, sourcePath);
        console.log(`[customer-build] restored stale backup to ${sourcePath}`);
      }
    }
  }

  if (!exposePublicExports) {
    for (const sourcePath of listMatchingDataDirectories(publicPath)) {
      const stagedPath = resolve(stagedPublicRootPath, sourcePath.slice(publicPath.length + 1));
      rmSync(stagedPath, { recursive: true, force: true });
      mkdirSync(dirname(stagedPath), { recursive: true });
      renameSync(sourcePath, stagedPath);
      movedPublicDataDirectories.push({ sourcePath, stagedPath });
      console.log(`[customer-build] temporarily moved ${sourcePath} -> ${stagedPath}`);
    }
  }

  rmSync(outPath, { recursive: true, force: true });
  rmSync(resolve(process.cwd(), '.vercel/output'), { recursive: true, force: true });

  const result = spawnSync('node', [nextCliPath, 'build'], {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: process.env,
  });

  if (result.status !== 0) {
    exitCode = result.status ?? 1;
  }

  if (exitCode === 0 && !exposePublicExports) {
    stripExportedPublicData();
  } else if (exitCode === 0) {
    console.log('[customer-build] WPR_EXPOSE_PUBLIC_EXPORTS enabled; keeping exported /data files.');
  }
} finally {
  for (const { sourcePath, stagedPath } of movedPublicDataDirectories.reverse()) {
    if (existsSync(stagedPath)) {
      mkdirSync(dirname(sourcePath), { recursive: true });
      renameSync(stagedPath, sourcePath);
      console.log(`[customer-build] restored ${sourcePath}`);
    }
  }
}

if (exitCode !== 0) {
  process.exit(exitCode);
}
