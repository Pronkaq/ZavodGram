# ZavodGram pre-production short roadmap

## Wave 1 — Critical security fixes (immediately)
1. Enforce fail-fast config for secrets in production (`JWT_SECRET`, `JWT_REFRESH_SECRET`, `ENCRYPTION_KEY`).
2. Stop storing refresh tokens in plaintext; store only SHA-256 hash in sessions.
3. Remove query-token auth from media download endpoints (header-only bearer).
4. Prevent safe-mode leakage in notifications by storing protected placeholder only.
5. Add anti-enumeration and per-account throttling for password recovery flow.

## Wave 2 — Abuse resistance and scaling (next 1-2 sprints)
1. Move WebSocket rate limit from in-memory map to Redis-backed limiter.
2. Block suspended users in WebSocket auth path (same policy as HTTP middleware).
3. Harden auth/recovery limits with per-account + IP + cooldown policies.
4. Restrict Docker-exposed infra ports (Postgres/Redis internal only).

## Wave 3 — Production readiness baseline
1. Add readiness endpoint with DB/Redis checks (`/ready`) and keep `/health` lightweight.
2. Add structured security/audit logging for auth/recovery/admin actions.
3. Add e2e regression suite for: auth, recovery, safe mode, media ACL, websocket events.
4. Wire backup/migration playbook and secret management policy (Vault/SSM/KMS).
