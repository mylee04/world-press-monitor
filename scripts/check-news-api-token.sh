#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/load-local-env.sh"
load_local_env

TOKEN_INPUT="${CHECK_TOKEN:-}"
PRINT_JSON=0

usage() {
  cat <<'EOF'
Usage:
  bash scripts/check-news-api-token.sh [--token <token>] [--json]

What it does:
  - loads local runtime env with scripts/load-local-env.sh
  - prints masked internal/admin token inventory
  - prints masked customer token policy inventory
  - if --token is supplied, checks whether it matches an internal token or a customer policy token

Examples:
  bash scripts/check-news-api-token.sh
  bash scripts/check-news-api-token.sh --token 'wpm_xxx...'
  CHECK_TOKEN='wpm_xxx...' bash scripts/check-news-api-token.sh --json
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --token)
      if [ $# -lt 2 ]; then
        echo "ERROR: --token requires a value." >&2
        exit 1
      fi
      TOKEN_INPUT="$2"
      shift 2
      ;;
    --json)
      PRINT_JSON=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "ERROR: Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

export CHECK_TOKEN_INPUT="${TOKEN_INPUT}"
export CHECK_TOKEN_PRINT_JSON="${PRINT_JSON}"

cd "${PROJECT_ROOT}"

node <<'NODE'
const crypto = require('crypto');

function parseList(raw) {
  return String(raw || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function parseFilterList(raw) {
  if (Array.isArray(raw)) {
    return raw.map((value) => String(value || '').trim()).filter(Boolean);
  }
  return parseList(raw);
}

function normalizeToken(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return '';
  return trimmed.replace(/^Bearer\s+/i, '').trim();
}

function maskToken(raw) {
  const token = normalizeToken(raw);
  if (!token) return '<missing>';
  if (token.length <= 8) return `${token.slice(0, 2)}...${token.slice(-2)}`;
  return `${token.slice(0, 4)}...${token.slice(-4)}`;
}

function tokenFingerprint(raw) {
  const token = normalizeToken(raw);
  if (!token) return '';
  return crypto.createHash('sha256').update(token).digest('hex').slice(0, 12);
}

function safeParsePolicies(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Invalid JSON' };
  }
}

function buildInventory() {
  const internalTokens = [];
  const seenInternal = new Set();

  for (const token of parseList(process.env.NEWS_API_TOKEN)) {
    const normalized = normalizeToken(token);
    if (!normalized) continue;
    const fingerprint = tokenFingerprint(normalized);
    if (seenInternal.has(fingerprint)) continue;
    seenInternal.add(fingerprint);
    internalTokens.push({
      source: 'NEWS_API_TOKEN',
      token: normalized,
      roles: ['read', 'admin'],
      maxLimit: 200,
    });
  }

  for (const token of parseList(process.env.NEWS_API_TOKENS)) {
    const normalized = normalizeToken(token);
    if (!normalized) continue;
    const fingerprint = tokenFingerprint(normalized);
    if (seenInternal.has(fingerprint)) continue;
    seenInternal.add(fingerprint);
    internalTokens.push({
      source: 'NEWS_API_TOKENS',
      token: normalized,
      roles: ['read', 'admin'],
      maxLimit: 200,
    });
  }

  const policiesRaw = safeParsePolicies(process.env.NEWS_API_TOKEN_POLICIES);
  if (!Array.isArray(policiesRaw)) {
    return { internalTokens, customerPolicies: [], policyParseError: policiesRaw.error || 'Invalid JSON' };
  }

  const customerPolicies = [];
  for (const item of policiesRaw) {
    if (!item || typeof item !== 'object') continue;
    const token = normalizeToken(item.token);
    if (!token) continue;

    const roles = parseFilterList(item.roles);
    const normalizedRoles = roles.length ? roles : ['read'];
    const maxLimitRaw = Number(item.maxLimit);
    const maxLimit = Number.isFinite(maxLimitRaw)
      ? Math.max(1, Math.min(5000, Math.floor(maxLimitRaw)))
      : (normalizedRoles.includes('admin') ? 5000 : 200);

    customerPolicies.push({
      token,
      tenant: String(item.tenant || '').trim() || null,
      roles: normalizedRoles,
      allowedCountries: parseFilterList(item.allowedCountries),
      allowedSources: parseFilterList(item.allowedSources),
      allowedSections: parseFilterList(item.allowedSections),
      allowedLanguages: parseFilterList(item.allowedLanguages),
      maxLimit,
    });
  }

  return { internalTokens, customerPolicies, policyParseError: null };
}

function summarizePolicy(policy, index) {
  return {
    index: index + 1,
    tokenHint: maskToken(policy.token),
    tokenFingerprint: tokenFingerprint(policy.token),
    tenant: policy.tenant || '<none>',
    roles: policy.roles.join(','),
    allowedCountries: policy.allowedCountries.length ? policy.allowedCountries.join('|') : '<all>',
    allowedSources: policy.allowedSources.length ? policy.allowedSources.join('|') : '<all>',
    allowedSections: policy.allowedSections.length ? policy.allowedSections.join('|') : '<all>',
    allowedLanguages: policy.allowedLanguages.length ? policy.allowedLanguages.join('|') : '<all>',
    maxLimit: policy.maxLimit,
  };
}

function summarizeInternal(entry, index) {
  return {
    index: index + 1,
    source: entry.source,
    tokenHint: maskToken(entry.token),
    tokenFingerprint: tokenFingerprint(entry.token),
    roles: entry.roles.join(','),
    maxLimit: entry.maxLimit,
  };
}

function matchToken(token, inventory) {
  const normalized = normalizeToken(token);
  if (!normalized) return null;

  for (const [index, entry] of inventory.internalTokens.entries()) {
    if (entry.token === normalized) {
      return {
        kind: 'internal',
        entry: summarizeInternal(entry, index),
      };
    }
  }

  for (const [index, entry] of inventory.customerPolicies.entries()) {
    if (entry.token === normalized) {
      return {
        kind: 'customer',
        entry: summarizePolicy(entry, index),
      };
    }
  }

  return {
    kind: 'missing',
    tokenHint: maskToken(normalized),
    tokenFingerprint: tokenFingerprint(normalized),
  };
}

const inventory = buildInventory();
const tokenInput = normalizeToken(process.env.CHECK_TOKEN_INPUT || '');
const printJson = String(process.env.CHECK_TOKEN_PRINT_JSON || '') === '1';
const internalSummary = inventory.internalTokens.map(summarizeInternal);
const customerSummary = inventory.customerPolicies.map(summarizePolicy);
const match = tokenInput ? matchToken(tokenInput, inventory) : null;

if (printJson) {
  console.log(JSON.stringify({
    envFileSource: process.env.WPR_ENV_FILE_SOURCE || '',
    policyParseError: inventory.policyParseError,
    internalTokens: internalSummary,
    customerPolicies: customerSummary,
    match,
  }, null, 2));
  process.exit(0);
}

console.log(`Env sources: ${process.env.WPR_ENV_FILE_SOURCE || '<unknown>'}`);
if (inventory.policyParseError) {
  console.log(`Policy parse error: ${inventory.policyParseError}`);
}

console.log(`Internal/admin tokens: ${internalSummary.length}`);
for (const entry of internalSummary) {
  console.log(
    `  [${entry.index}] source=${entry.source} token=${entry.tokenHint} fp=${entry.tokenFingerprint} roles=${entry.roles} maxLimit=${entry.maxLimit}`
  );
}

console.log(`Customer token policies: ${customerSummary.length}`);
for (const entry of customerSummary) {
  console.log(
    `  [${entry.index}] token=${entry.tokenHint} fp=${entry.tokenFingerprint} tenant=${entry.tenant} roles=${entry.roles} countries=${entry.allowedCountries} sections=${entry.allowedSections} languages=${entry.allowedLanguages} maxLimit=${entry.maxLimit}`
  );
}

if (match) {
  if (match.kind === 'missing') {
    console.log(`Match result: NOT FOUND token=${match.tokenHint} fp=${match.tokenFingerprint}`);
  } else {
    const entry = match.entry;
    console.log(`Match result: FOUND kind=${match.kind} index=${entry.index} token=${entry.tokenHint} fp=${entry.tokenFingerprint}`);
    if (match.kind === 'internal') {
      console.log(`  source=${entry.source} roles=${entry.roles} maxLimit=${entry.maxLimit}`);
    } else {
      console.log(
        `  tenant=${entry.tenant} roles=${entry.roles} countries=${entry.allowedCountries} sections=${entry.allowedSections} languages=${entry.allowedLanguages} maxLimit=${entry.maxLimit}`
      );
    }
  }
} else {
  console.log('Match result: no token supplied');
}
NODE
