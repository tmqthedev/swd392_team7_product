# Reconciliation verification — `chore/reconcile-step5-fixes`

Date: 2026-10-16 · Worktree: `.worktrees/reconcile-step5-fixes` · Base: `main` @ `dca0d6e`

This note records how the two divergent branches were reconciled and the exact
verification that was run, so a reviewer can read the outcome without re-running
the suites.

## What was reconciled

Two branches diverged from `dca0d6e`:

- `chore/reconcile-step5-fixes` = `main` tip (Step 5 exam sessions): `bb3a1bc`
  (FEAT-001 JWT guard / legacy-mount auth / inline lecturer subject-scope),
  `ad4ee7c` (`/exam-sessions` domain), `00bdee0` (exam-sessions frontend).
- `fix/steps1-4-review` (peer-review fixes for Steps 1–4): H1 lifecycle, H2
  runnable stack (`/api` prefix + nginx SPA + `COPY db`), H3 role-gate reads,
  M1 stuck jobs, M2 lockout race, M3 generation idempotency, legacy-route
  gating, JWT_SECRET guard, chore cleanups, plus a shared
  `services/subjectScope.js` helper.

Resolution policy applied: **`fix/steps1-4-review` is the base of truth for the
three overlapping concerns** (subject-scope on question/rubric, legacy-route
gating, JWT_SECRET guard); `main`'s weaker `bb3a1bc` variants were discarded —
**without losing** Step 5's exam-session feature, which was adapted to the fix
branch's conventions.

Mechanics: `git merge fix/steps1-4-review` into `chore/reconcile-step5-fixes`,
every conflict resolved by hand per the policy.

## File-by-file resolution

| File | Resolution | Why |
|---|---|---|
| `backend/src/app.js` | Hand-merged. Kept fix branch's `/api/*` route prefixes, `legacyGuard` (requireAuth + requireRole LECTURER/ADMIN) on `/api/topics`, `/api/evaluations`, `/api/lecturer`, the shared `SubjectScope` wiring, and the inline JWT dev fallback. Added Step 5 exam-session wiring, mounted at **`/api/exam-sessions`**, passing it the shared `subjectScope`. | Overlap → peer-review wins; exam feature preserved and made consistent with `/api` + `subjectScope`. |
| `backend/src/services/questionService.js` | Took fix branch version whole. | main's change was only the discarded `bb3a1bc` inline scope; fix branch has that scope (via `subjectScope`) **plus** the H1 lifecycle fix main lacked. |
| `backend/src/services/rubricService.js` | Took fix branch version whole. | Same: main's change was only the discarded inline scope. |
| `backend/src/controllers/questionController.js` | Hand-merged to fix branch's version. | `create` now never trusts a client `createdBy` (peer-review LOW); other hunks were formatting-only. |
| `backend/src/controllers/rubricController.js` | Auto-merged = fix branch. | Non-conflicting. |
| `backend/src/config/env.js` | Auto-merged; carries BOTH additions. | fix branch's `jobLockTimeoutMs` + main's `ttsProvider` are on different lines. |
| `backend/src/services/examSessionService.js` | Reworked (main's file). Removed its inline `_assertSubjectInScope`; it now **reuses the shared `SubjectScope` helper** (constructed from `subjectRepository` when a `subjectScope` is not injected). `listSessions` still uses `subjectRepository.listSubjectIdsForLecturer` for its list query. | Policy: exam code must reuse the shared helper, not `bb3a1bc` inline logic. Behavior unchanged (ADMIN/undefined-user unrestricted, null subject unscoped, else 403 FORBIDDEN). |
| `backend/src/server.js` | Auto-merged = fix branch. | Carries the JWT guard (`JWT_SECRET is required when DB_MOCK_MODE is false`) + graceful SIGTERM/SIGINT drain (M1). |
| `backend/src/auth/resolveJwtSecret.js` | **Deleted** (+ its test `jwtSecretGuardService.test.js`). | main's discarded JWT-guard variant; the single surviving guard lives in `server.js`. |
| `backend/db/migrations/014_login_window.sql` | Kept as **014** (fix branch, `first_failed_at` for M2 lockout). | Migration collision resolution. |
| `backend/db/migrations/015_exam_session_step5.sql` | Renamed from main's `014_exam_session_step5.sql` to **015** (header comment updated). | Both migrations preserved with distinct numbers; migrations ≤013 untouched. |
| `backend/test/crud.e2e.test.js` | Took fix branch version whole. | Uses `/api/*` prefixes + 401/403 legacy-route assertions matching the reconciled routes; main's old-prefix variant would 404. |
| `backend/test/workflow.e2e.test.js` | Took fix branch version whole. | Same `/api/*` prefix reason. |
| `backend/test/questionScopeService.test.js`, `rubricScopeService.test.js` | Updated (main's bb3a1bc tests). Now construct the service with a `SubjectScope` built from the fake `subjectRepository` instead of passing `subjectRepository` directly. | The services take `subjectScope`; the asserted behavior (filter / 403 / ADMIN bypass) is unchanged. |
| `backend/test/legacyMountAuthService.test.js` | Updated (main's bb3a1bc test). `/topics`→`/api/topics`, `/evaluations`→`/api/evaluations`. | Offline legacy-gating guard, re-pointed at the reconciled prefixes. |
| `backend/test/examSessions.e2e.test.js` | Updated (main's test). `/exam-sessions`→`/api/exam-sessions`, legacy `/topics`,`/evaluations`→`/api/*`. | Match the reconciled `/api` mount. |
| `frontend/src/config/api.js` | Auto-merged = fix branch (`apiBaseUrl = '/api'`). | Overlap → peer-review convention. |
| `frontend/src/services/examSessionApi.js` | Unchanged (main). | Already uses `apiRequest('/exam-sessions')`, and `apiRequest` prepends `apiBaseUrl` (`/api`), so it resolves to `/api/exam-sessions` automatically — no edit needed. |

All other fix-branch files (jobs, authService, generation, Dockerfile, nginx,
docker-compose, `.dockerignore`, `.gitignore`, README, mock-database untrack)
and all other main exam-session files (controller, repository, routes, domain,
tts adapters, `App.jsx`, `Sidebar.jsx`, `Sessions.jsx`, `ExamSessions.jsx`)
merged without conflict and are preserved.

## Verification run (in `.worktrees/reconcile-step5-fixes`)

- **Backend unit** — `cd backend && npm install && npm test` (`node --test
  "test/*Service.test.js"`): **220 pass, 0 fail, 0 skipped.** Roughly the union
  of peer-review (~180) and Step 5 (~206) unit counts (the two branches shared
  the Steps 1–4 unit base, so the union is ~220, not ~386). Includes the Step 5
  exam-session unit suites (`examSessionService`, `examSessionStatusService`,
  `ttsAdapterService`) and the peer-review wrong-role/wrong-subject/lifecycle/
  lockout/jobs/generation suites (`subjectScopeService`, `questionScopeService`,
  `rubricScopeService`, `legacyMountAuthService`, `authService`,
  `jobQueueService`, `questionService`, `questionGenerationService`).
- **Backend e2e** — `cd backend && npm run test:e2e` (`jest --runInBand`):
  **87 pass, 21 skipped, 0 fail** (3 Postgres-backed suites — migrations,
  jobQueue, step4/exam-session DB e2e — self-skip because Postgres is offline).
- **Frontend** — `cd frontend && npm install && npm run build`: **compiles**
  (single ~506 kB JS chunk; only the pre-existing chunk-size advisory).
  `npm run lint` (oxlint): **0 errors, 23 warnings** (pre-existing dead imports
  / `set-state-in-effect` in scaffold + new pages).
- **Docker** — `docker compose config`: **parses (exit 0)**. The compose boot
  and the Postgres-backed suites were **NOT run** (not attempted here); the
  stack is NOT claimed to run end to end.

## Explicit confirmations

- **No peer-review fix lost:** H1 (lifecycle on create/update — fix
  `questionService` kept whole), H2 (`/api` prefix + nginx SPA + `COPY db` — all
  present), H3 (role-gated `/questions` + `/rubrics` reads), M1 (`requeueStale`
  + SIGTERM/SIGINT drain in `server.js`/`jobQueue`), M2 (atomic
  `registerLoginFailure` + `first_failed_at` migration 014), M3 (idempotent
  generation) all present and green.
- **Step 5 not lost:** `/exam-sessions` domain (now `/api/exam-sessions`),
  migration (now 015), mock TTS seam, `ExamSessions.jsx`, reworked
  `Sessions.jsx` all present; exam-session unit + e2e tests pass/skip correctly.
- **Exactly ONE JWT_SECRET guard:** `backend/src/server.js` only. main's
  `resolveJwtSecret.js` and its test were deleted.
- **Legacy routes gated exactly ONCE:** `legacyGuard` on `/api/topics`,
  `/api/evaluations`, `/api/lecturer` in `app.js`.
- **No route left on an old prefix:** every router mounts under `/api/*`; all
  tests reference `/api/*`.
- **No duplicated/conflicting subject-scope logic:** one `SubjectScope` helper;
  question, rubric and exam-session services all consume it; the `bb3a1bc`
  inline variants are gone.
- **Both migrations exist with distinct numbers:** `014_login_window.sql` and
  `015_exam_session_step5.sql`; migrations 001–013 untouched.

## Not verified / could not verify

- A full `docker compose up` boot and the Postgres-backed suites (Postgres /
  Docker daemon not started here). Every new SQL statement
  (`registerLoginFailure`, `requeueStale`, `deleteUnreviewedByGenerationJob`,
  migrations 014/015) therefore ran only in unit fakes, not against Postgres.
- Real Bedrock / SMTP / S3 / real TTS paths (mock adapters only).
