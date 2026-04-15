# Pre-production audit — ZavodGram messenger (2026-04-15)

## Verdict

**Not ready for production**.

The project has strong foundations (auth middleware, membership checks, safe-mode snapshot model), but there are multiple **blocker/high** risks in safe mode media isolation, channel access control, token handling, and runtime stability.

---

## Blockers

### 1) Safe mode media isolation can be bypassed via `/api/media/:id/attach`

**Why it is critical**

Media attached through `POST /api/media/:id/attach` is linked to a message, but `protectedBySafeMode` is never recalculated. In private/secret chat with active safe mode this allows creating media that is logically “inside safe mode”, but physically stored as unprotected snapshot (`protectedBySafeMode = false`).

**Evidence**

- In message creation flow, safe-mode media flag is explicitly set (`protectedBySafeMode: shouldLockMediaAfterSafeMode`).
- In attach flow, only `messageId` is updated.

**How to reproduce**

1. In PRIVATE/SECRET chat where `contentProtectionEnabled = true`, create a text-only message.
2. Upload media with `POST /api/media/upload`.
3. Attach media with `POST /api/media/:id/attach` to that message.
4. Turn safe mode off for the chat.
5. Download that media: access is still granted because snapshot flag was never set.

**How to fix**

- In attach route, load target message + chat type + `contentProtectionEnabled`, and set:
  - `protectedBySafeMode = true` for PRIVATE/SECRET + active protection.
- Prefer transaction: verify ownership + attach + safe-mode snapshot update atomically.
- Add tests for both flows: (a) `mediaIds` during send, (b) upload+attach flow.

---

### 2) Channel data disclosure and broken access control in `GET /api/chats/:id`

**Why it is critical**

Endpoint allows **any authenticated user** to fetch full channel object (including members list and profiles) even if user is not a channel member.

**How to reproduce**

1. Login as user A (not member of channel X).
2. Call `GET /api/chats/<channel_id_of_X>`.
3. Request succeeds for `chat.type === 'CHANNEL'` and returns `members` and user metadata.

**How to fix**

- Split behavior:
  - For public preview use dedicated route (`/public/:slug`) with minimal DTO.
  - For `/api/chats/:id`, require membership for all chat types.
- At minimum: if non-member + CHANNEL, return sanitized public payload without `members`.

---

## High severity

### 3) Access tokens are not revocable; WebSocket auth ignores blocked state

**Risk**

- `authMiddleware` checks Redis blocklist, but WS auth (`io.use`) validates only JWT signature.
- Admin block deletes sessions, but already-issued access token can stay valid until expiration, including WS connections.

**How to reproduce**

1. User gets access token and opens WebSocket.
2. Admin blocks user.
3. Existing WS token/session still works because socket auth has no `isUserBlocked`/session state verification.

**Fix**

- Reuse common auth service for HTTP + WS with block check.
- Add token version / denylist (jti) for instant revocation.
- Optionally force disconnect blocked users from active sockets.

---

### 4) `socketWindow` in-memory rate limiter can grow unbounded (memory leak risk)

**Risk**

Map keys are never cleaned. For long-lived process with many users/actions, memory usage monotonically grows.

**How to reproduce**

1. Generate many distinct userIds/actions over time.
2. Observe `socketWindow.size` increasing without reduction.

**Fix**

- Replace with Redis-based limiter (already used in HTTP).
- Or periodically evict expired keys with interval cleanup.

---

### 5) Media download accepts token in query string (`allowQueryToken: true`)

**Risk**

JWT in URL can leak via logs, referrer headers, browser history, proxies.

**How to reproduce**

1. Open `/api/media/:id/download?token=<jwt>` from browser.
2. Token appears in access logs/history and can be replayed.

**Fix**

- Remove query token support for user endpoints.
- Keep only `Authorization: Bearer` header.
- If temporary links are required, issue short-lived one-time signed URLs with separate secret.

---

### 6) MIME trust only on upload (no content signature validation)

**Risk**

Validation relies on `file.mimetype` from client; malicious content can masquerade as allowed type.

**How to reproduce**

1. Upload executable/polyglot file with forged allowed mimetype.
2. Backend stores file and serves it as inline content.

**Fix**

- Validate magic bytes (`file-type` or equivalent).
- Enforce strict `Content-Disposition: attachment` for risky types.
- Add malware scanning/quarantine for docs/archives where feasible.

---

### 7) Default insecure secrets in config

**Risk**

Fallback values (`change-me`, `change-me-refresh`) allow accidental insecure production deployment.

**Fix**

- Fail fast on boot in production if secrets are default/short.
- Add env schema validation (e.g. zod/envalid).

---

## Medium / Low recommendations

1. **Brute-force hardening**: add account-based throttling on login/recovery, suspicious activity alerts.
2. **`redis.keys()` in `cacheInvalidate`**: replace with `SCAN` to avoid blocking Redis under load.
3. **Status/observability**:
   - Add request-id and structured request logs.
   - Add metrics: auth failures, 4xx/5xx, WS connections, queue lag, Redis/DB latency.
   - Add error tracking (Sentry/OTEL).
4. **Resilience**:
   - Explicit degradation mode when Redis unavailable (rate limiter / online status / pubsub).
   - Background job supervision for Telegram mirror.
5. **Architecture**:
   - Move business logic out of route handlers to service layer.
   - Centralize permission checks in policy module.
6. **API quality**:
   - Standardize error mapping for multer/sharp/fetch timeouts.
   - Add explicit OpenAPI/contract tests for 401/403/404/429 behavior.

---

## Test coverage gaps (critical)

No automated tests were found.

Add at least:

1. Safe mode
   - message snapshot lock after disable;
   - media snapshot lock in both flows (`mediaIds` and `/attach`);
   - forwarding restrictions from protected history.
2. Access control
   - every chat/media endpoint for member/non-member/admin cases;
   - channel public/private visibility matrix.
3. Auth/session
   - block user -> access denied on HTTP and WS;
   - refresh rotation/replay behavior.
4. Files
   - type/size/magic-byte checks;
   - traversal/path normalization tests.
5. Load/realtime
   - chat fanout, reaction storm, typing storm, reconnect churn.

---

## Quick go/no-go checklist before release

- [ ] Fix blocker #1 (safe mode attach bypass) and blocker #2 (channel access control).
- [ ] Add regression tests for these two blockers.
- [ ] Implement WS blocked-user enforcement + token revocation strategy.
- [ ] Remove token-in-query for media.
- [ ] Add baseline metrics + alerting.

After those are done and validated in staging with load/security checks, reassess for production readiness.
