#!/usr/bin/env bun
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const commitRefInput = process.argv[2] ?? 'HEAD';
const changelogPath = 'CHANGELOG.md';

if (!/^(?:[a-fA-F0-9]{7,40}|HEAD|[\w./~^-]+)$/.test(commitRefInput)) {
  throw new Error(`Invalid commit reference: ${commitRefInput}`);
}

function runGit(args: string[]): string {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

function safeFile(content: string): string {
  return content
    .split('\n')
    .map((line) => `  - ${line}`)
    .join('\n')
    .trimEnd();
}

const commitRef = commitRefInput;
const show = runGit([
  'show',
  '-s',
  '--format=%H%n%h%n%s%n%b%n%an%n%ad',
  '--date=format:%Y-%m-%d %H:%M:%S %z',
  commitRef
]);
const lines = show.split('\n');
const commitFull = lines[0];
const commitShort = lines[1];
const subject = lines[2] ?? '';
const bodyRaw = lines.slice(3, -2).join('\n').trim();
const author = lines[lines.length - 2] ?? 'unknown';
const dateRaw = lines[lines.length - 1] ?? '';

const fileChanges = runGit(['diff-tree', '--no-commit-id', '--name-status', '-r', commitRef, '--']);
const fileList = fileChanges
  .split('\n')
  .filter((line) => line.trim().length > 0)
  .map((line) => {
    const [status, file] = line.split('\t');
    return `${status}\t${file}`;
  });

const stats = runGit(['show', '--stat', '--oneline', '--pretty=format:', commitRef, '--']);
const escapedDate = dateRaw.trim();

if (!existsSync(changelogPath)) {
  const seed = [
    '# Changelog',
    '',
    '기록 규칙:',
    '- 커밋마다 `CHANGELOG.md` 맨 위에 최신 항목이 쌓입니다.',
    '- 새 항목은 실행할 때마다 자동으로 현재 커밋 정보를 기반으로 추가됩니다.',
    '',
    '## Unreleased',
    ''
  ].join('\n');
  writeFileSync(changelogPath, `${seed}\n`, 'utf8');
}

const current = readFileSync(changelogPath, 'utf8');
const entryAnchor = `### [${commitShort}] ${subject}`;
if (current.includes(entryAnchor)) {
  process.stdout.write(`CHANGELOG already contains ${commitShort}. Skipping.\n`);
  process.exit(0);
}

const bodySection = bodyRaw
  ? `\n  - Message:\n${safeFile(bodyRaw)}\n`
  : '';

const fileSection = fileList.length > 0
  ? `  - Changed files:\n${fileList.map((line) => `    - ${line}`).join('\n')}`
  : '  - No file changes (merge or empty commit)';

const statSection = stats
  ? `  - Git stat:\n${safeFile(stats)}`
  : '';

const newEntry = [
  `### [${commitShort}] ${subject}`,
  `- Commit: ${commitFull}`,
  `- Date: ${escapedDate}`,
  `- Author: ${author}`,
  fileSection,
  bodySection,
  statSection,
  ''
].filter(Boolean).join('\n');

const unreleasedHeader = '## Unreleased\n';
if (!current.includes(unreleasedHeader)) {
  throw new Error(`CHANGELOG.md format invalid: expected \"${unreleasedHeader}\" section.`);
}

const marker = unreleasedHeader;
const updated = current.replace(
  `${marker}`,
  `${marker}\n${newEntry}\n`
);

writeFileSync(changelogPath, updated, 'utf8');
process.stdout.write(`Appended CHANGELOG entry for ${commitShort}\n`);
