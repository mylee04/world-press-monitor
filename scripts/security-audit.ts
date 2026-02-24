#!/usr/bin/env bun
import { spawnSync } from 'node:child_process';

type SecurityAuditResult = {
  available: boolean;
  status: number;
  stdout: string;
  stderr: string;
};
type NpmAuditSummary = {
  vulnerabilities: number;
  errorCode?: string;
  errorSummary?: string;
};

const shouldCheckDevDeps = !process.argv.includes('--production');
const isCiMode = process.argv.includes('--ci');
const commandTimeoutMs = 120000;
const npmAuditLevel = 'high';
const npmAuditArgs = ['audit', `--audit-level=${npmAuditLevel}`];

function runCommand(command: string, args: string[], silent = false): SecurityAuditResult {
  try {
    const proc = spawnSync(command, args, {
      encoding: 'utf8',
      stdio: silent ? 'ignore' : 'pipe',
      timeout: commandTimeoutMs
    });
    return {
      available: proc.error === undefined,
      status: proc.status ?? 1,
      stdout: String(proc.stdout ?? ''),
      stderr: String(proc.stderr ?? '')
    };
  } catch (error) {
    return {
      available: false,
      status: 124,
      stdout: '',
      stderr: error instanceof Error ? error.message : String(error)
    };
  }
}

function commandExists(command: string): boolean {
  const which = process.platform === 'win32'
    ? ['where', command]
    : ['which', command];
  const result = runCommand(which[0], [which[1]], true);
  return result.available && result.status === 0;
}

function printSecurityHeader(label: string): void {
  console.log(`\n[security-audit] ${label}`);
}

function runBunPmScan(): SecurityAuditResult | null {
  if (!commandExists('bun')) {
    return null;
  }

  const commandResult = runCommand('bun', ['pm', 'scan']);
  if (!commandResult.available) {
    return null;
  }

  if (commandResult.status !== 0) {
    const output = (commandResult.stderr + commandResult.stdout).toLowerCase();
    if (output.includes('no security scanner configured')) {
      console.log('[security-audit] bun pm scan available but scanner is not configured yet. Falling back to npm-based audit.');
      return null;
    }
    if (output.includes('unknown command')) {
      console.log('[security-audit] bun pm scan command not available. Falling back to npm-based audit.');
      return null;
    }
    return commandResult;
  }

  return commandResult;
}

function parseNpmAuditOutput(output: string): NpmAuditSummary | null {
  try {
    const parsed = JSON.parse(output);
    if (parsed?.error) {
      return {
        vulnerabilities: 0,
        errorCode: String(parsed.error.code ?? ''),
        errorSummary: String(parsed.error.summary ?? 'npm audit returned an error.')
      };
    }
    const metadata = parsed.metadata ?? {};
    const vulnerabilities = typeof metadata.vulnerabilities === 'number'
      ? metadata.vulnerabilities
      : parsed.vulnerabilities
        ? Object.keys(parsed.vulnerabilities).length
        : 0;
    return { vulnerabilities };
  } catch {
    return null;
  }
}

function runNpmAudit(): never {
  if (!commandExists('npm')) {
    console.error('[security-audit] npm is not installed.');
    process.exit(1);
  }

  const args = [...npmAuditArgs];
  if (!shouldCheckDevDeps) {
    args.push('--omit=dev');
  }
  if (isCiMode) {
    args.push('--json');
  }

  const auditResult = runCommand('npm', args);
  const output = auditResult.stdout || auditResult.stderr;
  if (output) {
    console.log(output.trim());
  }
  if (auditResult.status !== 0) {
    if (isCiMode) {
      const parsed = parseNpmAuditOutput(output);
      if (parsed && parsed.vulnerabilities > 0) {
        console.error(`[security-audit] npm audit found ${parsed.vulnerabilities} vulnerabilities.`);
        process.exit(1);
      }
      if (parsed?.errorCode) {
        const summary = parsed.errorSummary ?? 'unknown';
        console.error(`[security-audit] npm audit failed (${parsed.errorCode}): ${summary}`);
        process.exit(1);
      }
      console.error('[security-audit] npm audit returned non-zero status but vulnerabilities payload was not parseable.');
      process.exit(auditResult.status);
    }

    process.exit(auditResult.status);
  }
  process.exit(0);
}

function main(): void {
  printSecurityHeader('Starting dependency vulnerability scan');

  const bunScanResult = runBunPmScan();
  if (bunScanResult && bunScanResult.status === 0) {
    const output = (bunScanResult.stdout || bunScanResult.stderr).trim();
    if (output.length > 0) {
      console.log(output);
    }
    process.exit(0);
  }
  if (bunScanResult && bunScanResult.status !== 0) {
    const output = (bunScanResult.stdout || bunScanResult.stderr).trim();
    if (output.length > 0) {
      console.error(output);
    }
    process.exit(bunScanResult.status);
  }

  runNpmAudit();
}

main();
