# PostgreSQL Backup/Restore Checklist

## Backup

- Logical dump (custom format):
  - `pg_dump -Fc -U <user> -d <db> > backup.dump`
- In Docker container:
  - `docker exec <postgres-container> pg_dump -Fc -U <user> -d <db> > backup.dump`

## Restore

- Restore with clean objects:
  - `pg_restore -U <user> -d <db> --clean --if-exists backup.dump`
- Restore into temp DB first for verification when risk is high.

## Verification

- Verify table counts for critical tables.
- Run representative app queries.
- Confirm constraints/indexes are present.

## Rollback

- Keep pre-change dump and command history.
- Define explicit rollback trigger (error rate, data mismatch, latency spike).
