# PostgreSQL Change Safety Checklist

## Pre-change

- Confirm target DB and schema.
- Take backup/snapshot path for rollback.
- Estimate impacted rows with `select count(*) ...`.
- For schema changes, verify migration order and dependency impact.

## During change

- Use transaction where safe.
- Add explicit `WHERE` clauses and dry-run selects before update/delete.
- Log exact SQL and affected row counts.
- Avoid long table locks during peak load.

## Post-change

- Re-run key counts and integrity checks.
- Re-run critical read/write path queries.
- Capture before/after latency where relevant.
- Document rollback command and execution condition.
