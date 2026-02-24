#!/usr/bin/env bun
import { execSync } from 'node:child_process';

type StagedCheckResult = {
  invalidFiles: string[];
  stagedFiles: string[];
};

const SENSITIVE_PATTERNS = [
  /^\.env(\..*)?$/,
  /^\.envrc$/,
  /\.(pem|key|pfx|p12|cer|crt)$/i,
  /(^|\/)config\/(.*\.(env|pem|key|p12|pfx|crt))$/i,
];

function listStagedFiles(): string[] {
  try {
    const output = execSync('git diff --cached --name-only', { encoding: 'utf8' });
    return output
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  } catch (error) {
    throw new Error(`Unable to read staged files: ${(error as Error).message}`);
  }
}

function isSensitivePath(path: string): boolean {
  return SENSITIVE_PATTERNS.some((pattern) => pattern.test(path));
}

function run(): StagedCheckResult {
  const stagedFiles = listStagedFiles();
  const invalidFiles = stagedFiles.filter(isSensitivePath);

  return { invalidFiles, stagedFiles };
}

function main(): void {
  const { stagedFiles, invalidFiles } = run();

  if (invalidFiles.length > 0) {
    console.error('[BLOCK] Refusing to commit sensitive staged files:');
    for (const file of invalidFiles) {
      console.error(`- ${file}`);
    }
    console.error('Remove these files from staging and add secure alternatives before retrying.');
    process.exit(1);
  }

  if (stagedFiles.length === 0) {
    console.log('[OK] No staged files to validate.');
  } else {
    console.log(`[OK] git:check-env-staged passed for ${stagedFiles.length} staged file(s).`);
  }
}

main();

