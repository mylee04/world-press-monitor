# Promotion Policy Checklist

## Pre-apply

- Run dry-run script first:
  - `bun run promote:expansion`
- Review candidate set and expected coverage delta.

## Apply

- Apply with explicit intent:
  - `bun run promote:expansion:apply`
- Apply in limited batches when risk is unclear.

## Post-apply

- Re-run daily health/audit reports.
- Confirm failure rate does not materially worsen.
- Confirm desired country/source coverage improved.

## Rollback

- Revert policy changes for problematic sources quickly.
- Record source-level reason for revert.
