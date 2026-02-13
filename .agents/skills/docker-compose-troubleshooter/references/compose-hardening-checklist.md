# Compose Hardening Checklist

## Build and Image

- Pin explicit image tags.
- Keep deterministic builds (lockfiles, pinned base images).
- Use multi-stage Dockerfiles when building app images.

## Runtime

- Add healthchecks for critical services.
- Set clear restart policy (`unless-stopped` or explicit choice).
- Keep env vars in `.env`/secret sources, never bake secrets into images.

## Networking

- Declare networks explicitly.
- Restrict exposed ports to only needed services.
- Use internal service names for service-to-service traffic.

## Storage

- Use named volumes for database persistence.
- Avoid destructive volume removal unless explicitly requested.
- Document backup/restore command path before risky changes.

## Validation

- Validate with `docker compose up -d` + health checks.
- Confirm app path works end to end after changes.
