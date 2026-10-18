# Implementation Plan — Step 2: Đăng nhập và phân quyền (auth + roles + admin + email)

All paths are absolute under the worktree `d:\Workspace\swd392_team7_product\.worktrees\e2e-step2-auth` (hereafter `<WT>`).
Worktree git: `git -C d:\Workspace\swd392_team7_product\.worktrees\e2e-step2-auth`.
Backend commands run in `<WT>\backend`; frontend commands run in `<WT>\frontend`.

## Key design decisions (grounded in the codebase)

- **Next migration number is `011`** — `<WT>\backend\db\migrations` already contains `001`..`010_background_job.sql`. The runner (`src/db/migrationRunner.js`) orders by numeric prefix and records applied versions in `schema_migrations`; never edit an applied file. New auth columns live in `011_auth_step2.sql`.
- **JWT = built-in Node `crypto` HMAC-SHA256, no external JWT library.** Rationale (put in a comment in `tokenService.js`): refresh tokens are already stored server-side as a hash in `auth_session` (migration 004), access tokens are short-lived and verified statelessly, and the project already mandates Node `crypto` for password hashing (scrypt, no bcrypt). A hand-rolled `base64url(header).base64url(payload).HMAC` token keeps the dependency surface minimal and consistent, and avoids the known HS256 performance regression in `jsonwebtoken@9.0.2`. Tokens carry `{ sub, role, type: 'access'|'refresh', iat, exp, jti }`; verification checks signature (constant-time compare) and `exp`.
- **Password hashing = `crypto.scryptSync`/`scrypt`** with a per-user random 16-byte salt, stored as `scrypt$N$r$p$<saltB64>$<hashB64>` in `app_user.password_hash`. Minimum 8 characters enforced in the service. Verification uses `crypto.timingSafeEqual`.
- **New dependencies, pinned to exact versions** (added to `<WT>\backend\package.json` `dependencies`, installed with `npm install`):
  - `nodemailer` → `7.0.9` (real SMTP email).
  - `exceljs` → `4.4.0` (streaming XLSX read for student import; chosen over `xlsx` for active maintenance and a clean worksheet API).
  - `cookie-parser` → `1.4.7` (read httpOnly cookies in Express 5).
  No new frontend dependencies — React 19 + react-router 7 + `fetch` are sufficient.
- **Service testing strategy:** `InMemoryDatabase` (`src/db/createDatabase.js`) throws on any SQL it does not hard-code, so new auth/admin SQL cannot run through it. Unit tests therefore inject **fake repository objects** into the services (the `createApp` factory and every service already take injected repos), following the existing `*Service.test.js` convention with `node --test`. Real SQL is exercised only by the Postgres-gated Jest e2e suite, which self-skips when `TEST_DATABASE_URL`/`DATABASE_URL` is unset.
- **createApp wiring pattern:** `src/app.js` builds each resource as `repository → service → controller → createXRouter(controller)` with `overrides.*` escape hatches, then `app.use('/path', router)`. New `/auth` and `/admin` routers follow this exact shape. Add `cookie-parser` and the Origin-check (CSRF) middleware before the routers; mount `requireAuth`/`requireRole`/`requireSubjectScope` as route-level guards.
- **Roles** in the DB are `ADMIN | LECTURER | STUDENT` (migration 004 CHECK). The frontend mock used lowercase `lecturer|student`; the real `AuthContext` stores the server role verbatim and route guards compare against uppercase constants, with a small mapping for the existing `/lecturer` and `/student` route prefixes.

## Backend

- [ ] 1. Add migration `011_auth_step2.sql` for the Step-2 columns the auth/admin logic needs that 004/005 do not yet have.
      Add to `app_user`: `must_change_password BOOLEAN NOT NULL DEFAULT false`, `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()` (use `ADD COLUMN IF NOT EXISTS`). Add an index `CREATE INDEX IF NOT EXISTS idx_auth_session_user ON auth_session (user_id)` and `CREATE INDEX IF NOT EXISTS idx_password_token_user ON password_token (user_id)`. Do NOT recreate app_user/auth_session/password_token/subject/subject_lecturer — they exist in 004/005.
      Files: `<WT>\backend\db\migrations\011_auth_step2.sql`
      Verify: `npm run test:e2e` with a Postgres `TEST_DATABASE_URL` set re-runs migrations idempotently and the new columns exist; offline the suite self-skips (still exit 0). Also confirm `orderMigrationFiles` picks `011` last.

- [ ] 2. Add JWT/auth env keys to `src/config/env.js` and document them in `<WT>\.env.example`.
      Add `jwtAccessTtlSec` (default 900), `jwtRefreshTtlSec` (default 604800), `cookieSecure` (readBoolean `COOKIE_SECURE`, default false locally), `cookieSameSite` (default `'Lax'`), `smtpFrom` (default `'AIVES <no-reply@aives.local>'`), `smtpSecure` (readBoolean, default false), `passwordSetTtlHours` (72), `passwordResetTtlMinutes` (30), `loginMaxFailures` (5), `loginWindowMinutes` (15), `loginLockMinutes` (15). Follow the existing `process.env.X || default` / `readBoolean` pattern. Keep `jwtSecret` (already present). Add the matching commented lines to `.env.example`.
      Files: `src/config/env.js`, `<WT>\.env.example`
      Verify: `node -e "console.log(require('./src/config/env').jwtAccessTtlSec)"` in `<WT>\backend` prints `900`.

- [ ] 3. Create `src/auth/passwordHasher.js` (scrypt) and `src/auth/tokenService.js` (HMAC JWT) as pure, dependency-light modules.
      `passwordHasher`: `hash(plain)` → formatted string, `verify(plain, stored)` → bool (timing-safe), `assertStrong(plain)` (min 8 chars, throws 400). `tokenService`: `sign({ sub, role, type }, { secret, ttlSec })`, `verify(token, { secret })` → payload or throws 401, plus `randomToken()`/`sha256(token)` helpers for refresh/password tokens. Include the JWT-choice rationale comment from the design decisions above.
      Files: `src/auth/passwordHasher.js`, `src/auth/tokenService.js`
      Verify: `node --test "test/passwordHasherService.test.js" "test/tokenServiceService.test.js"` (added in step 10) pass.

- [ ] 4. Extend `src/repositories/appUserRepository.js` and add session/token repositories — do not duplicate existing methods.
      `AppUserRepository`: add `findByEmailOrCode(identifier)`, `update(id, patch)` (whitelist code/email/full_name/role/status/must_change_password/password_hash/updated_at), `list({ role })`, `countByRole(role)`. Keep `create`, `updateLoginState`, `setStatus`.
      New `src/repositories/authSessionRepository.js`: `create({ userId, refreshTokenHash, expiresAt, ip, userAgent })`, `findActiveByHash(hash)` (not revoked, not expired), `revoke(id)`, `revokeAllForUser(userId)`.
      New `src/repositories/passwordTokenRepository.js`: `create({ userId, tokenHash, purpose, expiresAt })`, `findActiveByHash(hash, purpose)`, `markUsed(id)`, `invalidateActiveForUser(userId, purpose)`.
      New `src/repositories/subjectLecturerRepository.js` (or extend `subjectRepository.js`): `setLecturers(subjectId, lecturerIds)` (replace set in a transaction), `listSubjectIdsForLecturer(lecturerId)`, plus subject `update(id, patch)` and `remove(id)`.
      Files: `src/repositories/appUserRepository.js`, `src/repositories/authSessionRepository.js`, `src/repositories/passwordTokenRepository.js`, `src/repositories/subjectRepository.js`
      Verify: Postgres-gated e2e (step 15) covers the SQL; offline, services that use these are unit-tested with fakes. `npm test` stays green.

- [ ] 5. Create `src/services/authService.js` implementing the full auth lifecycle via injected repositories + `passwordHasher` + `tokenService` + `clock`.
      Methods and behavior:
      - `login({ identifier, password, ip, userAgent })`: look up by email OR code; if `locked_until` is in the future → 423/401 locked; verify password; on failure increment `failed_login_count`, and when failures ≥ `loginMaxFailures` within `loginWindowMinutes` set `locked_until = now + loginLockMinutes`; on success reset counters, set `last_login_at`, mint access+refresh tokens, store `sha256(refresh)` in `auth_session`. Returns tokens + user.
      - `refresh({ refreshToken })`: verify token, look up active session by hash, rotate (revoke old, create new), mint new access. Reuse/!found → 401.
      - `logout({ refreshToken })`: revoke the matching session (idempotent).
      - `me({ userId })`: return safe user (no `password_hash`).
      - `forgotPassword({ email })`: if user exists, invalidate prior RESET tokens, create a single-use RESET token (30-min), enqueue SEND_EMAIL; **always** return the same 200 shape (no account enumeration).
      - `resetPassword({ token, newPassword })`: validate active RESET token, `assertStrong`, set hash, `markUsed`, `revokeAllForUser`.
      - `setPassword({ token, newPassword })`: same but purpose SET (72-hour), clears `must_change_password`.
      - `changePassword({ userId, currentPassword, newPassword })`: verify current, set new, revoke other sessions.
      Files: `src/services/authService.js`
      Verify: `node --test "test/authService.test.js"` (step 10) passes, covering lockout, rotation, enumeration-safe forgot, single-use token reuse rejection.

- [ ] 6. Create the `/auth` router/controller and the authorization middleware, then wire both into `createApp`.
      `src/controllers/authController.js`: handlers for `POST /auth/login`, `/auth/logout`, `/auth/refresh`, `GET /auth/me`, `POST /auth/forgot-password`, `/auth/reset-password`, `/auth/set-password`, `PUT /auth/password`. Set/clear access+refresh cookies with `httpOnly: true, secure: env.cookieSecure, sameSite: env.cookieSameSite, path: '/'`.
      `src/routes/authRoutes.js`: `createAuthRouter(controller, { requireAuth })` — `/me` and `/password` require auth; the rest are public.
      `src/middleware/auth.js`: `createAuthMiddleware({ tokenService, env, appUserRepository })` exposing `requireAuth` (reads access cookie → `req.user`), `requireRole(...roles)` (403 on mismatch), `requireSubjectScope({ param, subjectLecturerRepository })` (ADMIN bypass; LECTURER must be assigned to the subject; else 403). `src/middleware/csrf.js`: `verifyOrigin(allowedOrigins)` — reject non-GET/HEAD/OPTIONS whose `Origin` is absent or not allowed (based on `env.appBaseUrl`).
      In `src/app.js`: `app.use(cookieParser())` after `express.json()`, `app.use(verifyOrigin(...))`, build auth repos+service+controller+middleware (with `overrides.*`), `app.use('/auth', createAuthRouter(...))`. Export the middleware factory from the app context so `/admin` and later steps reuse it.
      Files: `src/controllers/authController.js`, `src/routes/authRoutes.js`, `src/middleware/auth.js`, `src/middleware/csrf.js`, `src/app.js`
      Verify: `node --test "test/authMiddlewareService.test.js"` (step 10) passes; `npm test` green. Runtime behavior of cookies/Origin is verified in the Postgres e2e (step 15) and must be checked live, not assumed.

- [ ] 7. Wire real email sending through the SEND_EMAIL background job handler.
      `src/services/emailService.js`: `createEmailService({ env })` returning `{ sendMail({ to, subject, html, text }) }` backed by a lazily-created `nodemailer` transport (`host: env.smtpHost, port: env.smtpPort, secure: env.smtpSecure`, auth only when `env.smtpUser` set — Mailpit needs none). Add `renderSetPasswordEmail(link)` / `renderResetPasswordEmail(link)` builders using `env.appBaseUrl`.
      Replace the SEND_EMAIL stub in `src/jobs/handlers.js`: `registerDefaultHandlers(queue, { logger, emailService })` registers a real SEND_EMAIL handler that reads `job.payload` (`{ to, subject, html, text }`) and calls `emailService.sendMail`; keep the other three as stubs. The handler must throw on send failure so the queue retries with backoff.
      `authService`/admin enqueue SEND_EMAIL jobs (via `backgroundJobRepository.enqueue`) carrying the rendered link; never put plaintext passwords in the payload.
      Files: `src/services/emailService.js`, `src/jobs/handlers.js`
      Verify: `node --test "test/emailJobHandlerService.test.js"` (step 10) passes using a fake `emailService` (asserts payload mapping + retry-on-throw). Real SMTP delivery to Mailpit (`:8025`) is a runtime check during implementation, not an offline assumption.

- [ ] 8. Create the admin domain: subject CRUD + lecturer assignment, user management, and all-or-nothing Excel student import.
      `src/services/adminService.js`:
      - Users: `createLecturer({ code, email, fullName })` (role LECTURER, no password, enqueue SET-password email), `updateUser(id, patch)`, `lockUser(id)`/`unlockUser(id)` (set status + clear `locked_until` on unlock), `resendSetupLink(id)` (new SET token + email), `listUsers({ role })`.
      - `importStudents(buffer)`: parse XLSX with `exceljs`, expect columns **student code, full name, email**; validate the ENTIRE file first (required fields, email format, in-file + DB duplicate code/email) collecting `{ row, errors[] }`; if ANY row is invalid, write NOTHING and return `{ ok: false, errors }`; otherwise insert all users (role STUDENT, enqueue SET emails) and return `{ ok: true, created }`.
      - Subjects: `createSubject`, `updateSubject`, `deleteSubject`, `listSubjects`, `assignLecturers(subjectId, lecturerIds)`.
      `src/controllers/adminController.js` + `src/routes/adminRoutes.js`: `/admin/users` (GET list, POST create, PUT `:id`, POST `:id/lock`, `:id/unlock`, `:id/resend-setup`), `POST /admin/users/import` (multipart or base64 body — read raw buffer), `/admin/subjects` (GET/POST, PUT `:id`, DELETE `:id`), `PUT /admin/subjects/:id/lecturers`. Guard the whole router with `requireAuth` + `requireRole('ADMIN')`.
      Wire into `createApp` with `overrides.*`.
      Files: `src/services/adminService.js`, `src/controllers/adminController.js`, `src/routes/adminRoutes.js`, `src/app.js`
      Verify: `node --test "test/adminService.test.js"` (step 10) passes, especially the import all-or-nothing path (one bad row ⇒ zero writes, per-row errors returned).

- [ ] 9. Add the `create-admin` CLI and npm script.
      `src/cli/createAdmin.js`: read `--code --email --full-name --password` from argv (fallback to interactive `readline` prompts), `assertStrong` the password, hash with `passwordHasher`, insert via `AppUserRepository.create({ role: 'ADMIN', status: 'ACTIVE' })` against a real DB from `createDatabase(env)` (requires `DB_MOCK_MODE=false` + `DATABASE_URL`); refuse to create a second ADMIN if one already exists unless `--force`. Add `"create-admin": "node src/cli/createAdmin.js"` to `backend/package.json` scripts.
      Files: `src/cli/createAdmin.js`, `<WT>\backend\package.json`
      Verify: `node src/cli/createAdmin.js --help` prints usage and exits 0 (no DB write). Full create path is a runtime check against local Postgres.

- [ ] 10. Add backend unit tests following the `*Service.test.js` + `node --test` convention, using injected fakes.
      Files: `<WT>\backend\test\passwordHasherService.test.js`, `tokenServiceService.test.js`, `authService.test.js`, `authMiddlewareService.test.js`, `emailJobHandlerService.test.js`, `adminService.test.js`
      Cover: scrypt round-trip + weak-password rejection; token sign/verify + tamper/expiry rejection; login lockout after 5 failures, refresh rotation, forgot-password enumeration safety, single-use reset-token reuse rejection; `requireRole`/`requireSubjectScope` allow/deny; SEND_EMAIL handler payload mapping + retry-on-throw; Excel import all-or-nothing.
      Verify: `npm test` in `<WT>\backend` runs all `test/*Service.test.js` and passes.

## Frontend

- [ ] 11. Replace the mock `AuthContext` with a real session backed by `GET /auth/me`.
      `src/context/AuthContext.jsx`: on mount, `fetch(me)` with `credentials: 'include'`; expose `{ user, loading, login(identifier,password), logout(), refresh() }`. `login` POSTs `/auth/login` then re-fetches `/auth/me`; `logout` POSTs `/auth/logout`. Store the server `user` (incl. uppercase `role`). Fix `src/config/api.js` to use `import.meta.env.VITE_API_BASE_URL` (Vite) with the `http://localhost:3000` fallback. Add a tiny `src/services/authApi.js` wrapper that always sends `credentials: 'include'` and checks `Origin`-safe methods.
      Files: `src/context/AuthContext.jsx`, `src/config/api.js`, `src/services/authApi.js`
      Verify: `npm run build` in `<WT>\frontend` succeeds.

- [ ] 12. Enforce role-aware routing and real login/forgot/set-reset pages.
      `src/App.jsx`: `ProtectedRoute` reads `user`+`loading`, redirects to `/` when unauthenticated, and compares against the required uppercase role (map `/lecturer`→LECTURER, `/student`→STUDENT, add `/admin`→ADMIN). Show a loading state while `me` resolves. Update `Login.jsx` to a real email/code + password form plus a "forgot password" link; add `src/pages/ForgotPassword.jsx`, `src/pages/SetPassword.jsx` (consumes `?token=` for SET/RESET), and `src/pages/ChangePassword.jsx` (logged-in). Update `Sidebar.jsx`/`Topbar.jsx` to use the real `user` (role/name) and the real `logout`.
      Files: `src/App.jsx`, `src/pages/Login.jsx`, `src/pages/ForgotPassword.jsx`, `src/pages/SetPassword.jsx`, `src/pages/ChangePassword.jsx`, `src/components/Sidebar.jsx`, `src/components/Topbar.jsx`
      Verify: `npm run build` succeeds; `npm run lint` (oxlint) has no new errors.

- [ ] 13. Add the Admin area UI (users, create lecturer, import students, subjects, assign lecturers).
      `src/pages/admin/Users.jsx` (list, create-lecturer modal, lock/unlock, resend setup, import-students upload with per-row error table), `src/pages/admin/Subjects.jsx` (CRUD + assign-lecturers), and an `/admin` route group in `App.jsx` guarded for ADMIN. Reuse `src/components/ui` (`Button`, `Input`, `Card`, `Table`, `Badge`, `Modal`, `Feedback`). Keep user-facing strings in the frontend's existing language (English UI copy, as in current pages).
      Files: `src/pages/admin/Users.jsx`, `src/pages/admin/Subjects.jsx`, `src/App.jsx`, `src/components/Sidebar.jsx`
      Verify: `npm run build` succeeds; `npm run lint` clean.

## Integration & verification

- [ ] 14. Install backend deps and run the full backend unit suite.
      Files: (none — dependency install only)
      Verify: `npm install` in `<WT>\backend` installs `nodemailer@7.0.9`, `exceljs@4.4.0`, `cookie-parser@1.4.7`; `npm test` passes all `test/*Service.test.js`.

- [ ] 15. Confirm the Postgres-gated e2e stays self-skipping offline and (when Postgres is available) exercises the real auth/admin SQL.
      Files: optionally extend `<WT>\backend\test\*.e2e.test.js` with an auth/admin flow (login→me→refresh→logout, admin create-lecturer, import all-or-nothing) guarded by the same `TEST_DATABASE_URL ? describe : describe.skip` pattern as `migrations.e2e.test.js`.
      Verify: `npm run test:e2e` in `<WT>\backend` with no DB env exits 0 with suites skipped; with `TEST_DATABASE_URL` set against `pgvector/pgvector:pg16` the new flow passes.

- [ ] 16. Build the frontend and lint.
      Files: (none)
      Verify: `npm install` then `npm run build` and `npm run lint` in `<WT>\frontend` all exit 0.

## Needs runtime verification during implementation (do not assume from reading code)
- Express 5 cookie read/write via `cookie-parser` and the httpOnly/SameSite/Secure flags actually round-trip (login sets cookies, `/auth/me` reads them). Verify with a live request, not by inspection.
- Origin/CSRF middleware does not block the frontend's own same-origin requests behind nginx (`:8080`) while rejecting cross-origin writes.
- `nodemailer@7.0.9` actually delivers to Mailpit (`SMTP_HOST=mailpit`, port 1025, no auth) and the mail appears at `http://localhost:8025`.
- `exceljs@4.4.0` parses the real student template buffer and the all-or-nothing rollback writes nothing on a bad row (confirm against Postgres, since the in-memory DB cannot run these inserts).
- Migration `011` applies cleanly and idempotently on top of `001`..`010` against `pgvector/pgvector:pg16`.
- The `create-admin` CLI inserts exactly one ADMIN and refuses a duplicate.

## Scope fence
Steps 3–8 (question-bank RAG, interview engine, scoring) are OUT of scope. Only the reusable `requireRole`/`requireSubjectScope` middleware is exposed for later steps to consume.
