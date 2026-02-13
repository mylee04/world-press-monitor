# Docker/Compose Triage Checklist

## 1) Fast Status Snapshot

- `docker compose ps`
- `docker ps --format '{{.Names}}\t{{.Status}}\t{{.Ports}}'`
- `docker compose logs --tail=200 <service>`

## 2) Common Failure Signatures

- `bind: address already in use`: port collision on host.
- `connection refused` between services: wrong host/port or service not ready.
- `no such file or directory` in container: broken bind mount path.
- restart loop with exit code:
  - `137`: OOM/forced kill.
  - `1`: app startup failure or missing env.

## 3) Network Checks

- Ensure services share the same Compose network.
- Use service name for inter-container DNS (`postgres`, not `localhost`).
- Validate target port is container port, not host-mapped port.

## 4) Volume Checks

- Confirm host path exists for bind mounts.
- Confirm container user has file permissions.
- For stateful services, prefer named volumes in dev to avoid path drift.

## 5) Decision Rules

- If infra is red (container down/unhealthy), fix infra first.
- If infra is green and app fails, move to app/db diagnostics.
