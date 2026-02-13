---
name: docker-compose-troubleshooter
description: Diagnose and fix Docker and Docker Compose issues for local dev and CI environments. Use when tasks involve container startup failures, port collisions, healthcheck failures, network connectivity between services, volume mount issues, image build/runtime debugging, or reliable Compose service configuration.
---

# Docker Compose Troubleshooter

Use this skill for Docker-first incidents. Focus on container and network correctness before application-level debugging.

## Workflow

1. Confirm runtime state.
- Run `docker compose ps` and `docker ps --format '{{.Names}}\t{{.Status}}\t{{.Ports}}'`.
- Capture failing services, restart loops, and port bindings.

2. Validate logs and health.
- Run `docker compose logs --tail=200 <service>`.
- Check healthcheck status and restart policy.
- Confirm expected environment variables are present.

3. Validate connectivity and mounts.
- Inspect service network and DNS name resolution.
- Confirm volume mounts and file permissions for bind mounts.
- Verify host port conflicts before changing Compose config.

4. Apply minimal safe fixes.
- Prefer explicit `depends_on` with health conditions where appropriate.
- Pin image tags; avoid `latest`.
- Keep network and volume declarations explicit.
- Avoid destructive cleanup unless user explicitly asks.

5. Validate and report.
- Re-run `docker compose ps` and target smoke checks.
- Provide `Findings`, `Changes`, `Validation`, `Rollback`.

## References

- For triage and failure patterns: `references/triage-checklist.md`
- For safe compose templates: `references/compose-hardening-checklist.md`
