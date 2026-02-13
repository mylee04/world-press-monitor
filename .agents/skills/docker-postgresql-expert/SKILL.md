---
name: docker-postgresql-expert
description: Expert workflow for Docker and PostgreSQL operations in development and production-like environments. Use when tasks involve Dockerfile or Docker Compose setup, container build/run/debug, PostgreSQL provisioning in Docker, connection failures, migrations, backup/restore, performance checks, SQL troubleshooting, or hardening and reliability improvements.
---

# Docker + PostgreSQL Expert

Use this as a coordinator skill when a task spans both container/runtime and database concerns.
If the task is mostly one domain, prefer:
- `docker-compose-troubleshooter` for Docker/Compose runtime issues.
- `postgresql-ops-runbook` for PostgreSQL operations and SQL safety.

## 1. Establish runtime context

Collect the minimum facts before changing anything:
- Identify runtime target: local dev, CI, staging, or production-like environment.
- Identify orchestration mode: single `docker run`, `docker compose`, or another orchestrator.
- Identify PostgreSQL version, image tag, mounted volumes, and network names.
- Identify credentials source: `.env`, secret manager, or injected runtime variables.

Prefer exact commands and outputs over assumptions.

## 2. Diagnose Docker first, then database

Use this order for incident handling:
1. Confirm container health and restarts.
2. Confirm network reachability and service DNS name.
3. Confirm PostgreSQL readiness and authentication.
4. Confirm application connection string and SSL mode.

Run targeted checks:
- `docker ps --format '{{.Names}}\t{{.Status}}\t{{.Ports}}'`
- `docker logs --tail=200 <container>`
- `docker inspect <container>` for mounts, env vars, and network settings.
- `docker exec -it <postgres-container> pg_isready -U <user> -d <db>`
- `docker exec -it <postgres-container> psql -U <user> -d <db> -c 'select now();'`

## 3. Apply safe PostgreSQL operations

Prefer reversible changes.
- Create schema updates through migrations, not ad-hoc manual edits.
- Use transactions for multi-step DDL/DML when possible.
- Before risky changes, create a backup or snapshot.
- After changes, verify row counts and query plans on critical paths.

For backup/restore in containers:
- Backup: `pg_dump -Fc -U <user> -d <db> > backup.dump`
- Restore: `pg_restore -U <user> -d <db> --clean --if-exists backup.dump`

For logical dump inside container:
- `docker exec <postgres-container> pg_dump -U <user> -d <db> -Fc > backup.dump`

## 4. Optimize for reliability

When tuning PostgreSQL in Docker:
- Pin image version; avoid floating `latest` tags.
- Persist data with named volumes or durable mounts.
- Set explicit `healthcheck` and dependency ordering.
- Keep shared memory and resource limits explicit.
- Monitor slow queries and add indexes based on `EXPLAIN (ANALYZE, BUFFERS)`.

When tuning Docker build/runtime:
- Use multi-stage builds.
- Keep images small and deterministic.
- Avoid embedding secrets in images.
- Keep Compose services explicit for networks, volumes, and restart policies.

## 5. Output format for each task

Return results with these sections:
- `Findings`: root cause or current state.
- `Changes`: exact file/command-level modifications.
- `Validation`: commands executed and expected/observed result.
- `Rollback`: concrete rollback steps for risky changes.

## 6. Guardrails

- Refuse destructive commands unless explicitly requested.
- Do not drop databases or volumes without confirmation.
- Redact secrets from logs and copied commands.
- Prefer least-privilege roles over superuser usage.
- If environment constraints block execution, provide the exact command for the user to run.
