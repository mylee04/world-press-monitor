---
name: postgresql-ops-runbook
description: Operate and troubleshoot PostgreSQL safely in application environments. Use when tasks involve connection/auth errors, migrations, data fixes, backup/restore, index/performance tuning, query plan analysis, or production-safe database change workflows.
---

# PostgreSQL Ops Runbook

Use this skill for database-first tasks. Prioritize safety, reversibility, and measurable validation.

## Workflow

1. Establish context.
- Confirm environment (dev/staging/prod-like), PostgreSQL version, and critical tables.
- Confirm change type: read-only diagnosis, migration, data patch, or restore.

2. Diagnose before modifying.
- Validate connectivity/auth first (`pg_isready`, `psql`).
- Capture current state with focused SQL and counts.
- For performance work, capture `EXPLAIN (ANALYZE, BUFFERS)` baseline.

3. Apply safe changes.
- Prefer migration files over ad-hoc schema edits.
- Use transactions for multi-step operations when possible.
- Add `WHERE` guards and row-count checks for data updates/deletes.
- Create backup/snapshot path before risky operations.

4. Validate and communicate.
- Re-run health SQL and affected query paths.
- Report `Findings`, `Changes`, `Validation`, `Rollback`.

## References

- For incident triage SQL: `references/incident-sql-checklist.md`
- For migration/data safety: `references/change-safety-checklist.md`
- For backup/restore playbook: `references/backup-restore-checklist.md`
