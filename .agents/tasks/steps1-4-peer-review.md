# AIVES Steps 1–4: peer review and QC of `steps1-4-review.md`

Date: 2026-10-16 · Commit: `main` @ `dca0d6e` · Reviewer: Claude Code (peer pass)

This is a second, independent pass over the Steps 1–4 code. It has two jobs:
check the claims in `.agents/tasks/steps1-4-review.md`, and run the QC that
review skipped. Unlike the first review, every finding below that says
**Reproduced** was confirmed with a live request or a test run, not only by
reading code.

---

## 1. Verdict on the original review

Most of what the original review checked is accurate: the crypto, the cookies,
the refresh-token hashing, the CSRF check, RAG grounding, the mock-by-default
adapters, `MATERIAL_IN_USE`, and the migration remap all hold up. **Its
bottom line does not.** "Sound enough to build Step 5 on" and "HIGH: none"
are wrong for these reasons:

- **Two of its "YES" claims are false.** The question state machine *can* be
  bypassed from the client (§3 H1). In-flight jobs do *not* resume after a
  restart (§3 M1).
- **It missed that the product can't be run end to end.** The Docker backend
  crashes on start, the SPA isn't served or reachable, and the default mock
  mode can't log anyone in (§3 H2). The plan requires every step to "tự chạy
  được bằng docker compose up" (run on its own with `docker compose up`).
- **It understated the scope gap.** Every authenticated user, **including
  STUDENTs**, can read the whole question bank with reference answers and key
  points, not just "any LECTURER" (§3 H3).

**Recommendation:** do not start Step 5 until H1–H3 are closed. All three are
small, contained fixes.

---

## 2. QC results (the runs the original review skipped)

| Check | Command | Result |
|---|---|---|
| Backend unit | `cd backend && npm test` | **163 / 163 pass** |
| Backend e2e | `npx jest --runInBand` | **81 pass, 14 skipped** (3 Postgres suites self-skip; Docker daemon not running on this machine) |
| Frontend lint | `cd frontend && npm run lint` | 0 errors, **24 warnings** (unused imports/vars in VivaSession, EvaluationReview, PendingReview, Questions; `set-state-in-effect` ×6) |
| Frontend build | `npm run build` | OK, 2329 modules, single 496 kB JS chunk |
| Live probes | backend booted in mock mode + supertest via `test/helpers/createTestContext` | see §3 |

The "163 unit + 81 e2e" figure the original review took on trust is now
confirmed. The Postgres-only suites (`migrations`, `jobQueue`, `step4` e2e) are
still **unverified**. They need `docker compose up -d postgres` and
`TEST_DATABASE_URL`.

---

## 3. Findings the original review missed

### HIGH

**H1. The question lifecycle can be bypassed through create/update.** Reproduced.

`POST /questions` and `PUT /questions/:id` accept any `status` value.
`_resolveCreateStatus` and `_validateUpdatePayload`
(`backend/src/services/questionService.js:630-660`) only check that the value
is in `STATUSES`. Neither calls `assertTransition`, and neither applies the
rubric rule. Probe results:

```
POST /questions {status:"APPROVED"} (no rubric)   -> 201, status APPROVED, rubricId null
POST /questions/:id/approve (same, via lifecycle) -> 409 RUBRIC_REQUIRED      (correct)
POST /questions/:id/archive                       -> 200 ARCHIVED
PUT  /questions/:id {status:"APPROVED"}           -> 200 APPROVED             (terminal state escaped)
```

The consequences are concrete:

- An AI `PENDING_REVIEW` question can be made exam-eligible with no review and no rubric.
- `ARCHIVED` is not terminal.
- `PUT {rubricId:null}` can strip the rubric from an `APPROVED` question.

Step 5 picks exam questions from `APPROVED` and Step 8 grades against the
rubric, so both would inherit bad data.

*Fix:* drop `status` from the create and update payloads. Create should
always produce `DRAFT` (or `APPROVED` only through the existing
complete-question default, with the rubric enforced). Status changes should
go only through `/approve`, `/reject`, `/archive` and `/approve-batch`. Reject
clearing `rubricId` on an `APPROVED` question.

**H2. The stack can't run end to end, locally or through compose.** Reproduced or confirmed by reading.

1. **The Docker backend exits at startup.** `backend/Dockerfile` copies only
   `src/`. `env.migrationsDir` resolves to `/app/db/migrations`
   (`config/env.js:51`), so `fs.readdirSync` in `runMigrations`
   (`db/migrationRunner.js:55`) throws ENOENT and `start()` calls
   `process.exit(1)`. *Fix:* `COPY db ./db`.
2. **nginx never serves the SPA.** `nginx/nginx.conf` proxies `/` to the
   backend, and the backend has no static serving. `GET /set-password?token=…`
   on the backend returns **404**. That is exactly where the set/reset
   password emails send users, because `APP_BASE_URL` is
   `http://localhost:8080`.
3. **The Vite dev server can't reach the API.** `config/api.js` defaults to
   the absolute `http://localhost:3000`, the backend has **no CORS handling**
   (a preflight returns no `Access-Control-Allow-*` headers), and
   `verifyOrigin` rejects the Vite origin: a `POST /auth/login` with
   `Origin: http://localhost:5173` returns **403 FORBIDDEN_ORIGIN**. The
   `vite.config.js` proxy only covers `/api`, but the Step 2–4 routes are
   mounted at `/auth`, `/questions`, `/materials` and so on.
4. **The default `npm start` (with `DB_MOCK_MODE=true`) can't log anyone
   in.** `POST /auth/login` returns `500 DATABASE_ERROR`, because
   `InMemoryDatabase` doesn't model `app_user`.

Taken together, the Step 2–4 frontend has never run against the backend. The
FEAT-003 notes in `e2e-step2-auth/features/FEAT-003.json` already list
"/auth/me round-trip", "CSRF Origin", and the "email link path" as unverified.

*Fix:* serve the built SPA from nginx (`location /` uses `try_files` to
`index.html`, and API prefixes go to the backend). Alternatively, put every
API route under `/api` and set the Vite proxy and `VITE_API_BASE_URL=''` to
match. That also lines up with the CloudFront `/api/*` behavior the plan
expects in Step 11.

**H3. Any authenticated user, students included, can read the full question bank and rubrics.** Reproduced.

`questionRoutes.js` and `rubricRoutes.js` guard reads with `requireAuth`
only. A STUDENT token gets **200** from both `GET /questions` and
`GET /rubrics`. The DTO (`questionService.js:48-58`) includes
`referenceAnswer` and `keyPoints`. For an oral-exam system, that means
students can see the answers before the exam. This makes the original
review's MEDIUM #1 more serious: the gap is cross-*role*, not only
cross-subject.

*Fix:* `requireRole('LECTURER','ADMIN')` on every `/questions` and `/rubrics`
read, plus the subject scope from the original review's MEDIUM #1.

### MEDIUM

**M1. A job interrupted mid-run stays stuck in RUNNING forever.** Confirmed by reading.

`claimNext` commits the RUNNING flip before the handler runs, and it only
selects `status='PENDING'` (`repositories/backgroundJobRepository.js:31-46`).
Nothing in `src/` resets stale RUNNING rows: no code reads `locked_at`, and
there is no reaper. `server.js` also has no SIGTERM/SIGINT handler that calls
`queue.stop()`. The e2e test that "proves" crash recovery
(`test/jobQueue.e2e.test.js:122-144`) performs the recovery sweep itself
with raw SQL.

The result: any restart or redeploy during an ingest or generation leaves the
`background_job` row RUNNING, the material `PROCESSING`, and the generation
job `RUNNING`, permanently. This contradicts the original review's §4 claim
that "in-flight work resumes after a restart".

*Fix:* on startup and periodically, run
`UPDATE background_job SET status='PENDING', locked_at=NULL WHERE status='RUNNING' AND locked_at < now() - interval '<timeout>'`.
Also drain the queue on SIGTERM.

**M2. Concurrent requests can bypass the login lockout.** Confirmed by reading.

`_registerFailure` (`services/authService.js:100-113`) reads
`failed_login_count` from the row it fetched before running scrypt, then
writes `prior + 1`. If N wrong-password requests run in parallel, they all
read the same count and all write `count+1`, so each batch advances the
counter by about 1. An attacker gets roughly `5 × batch-size` guesses before
the lock, and there is no rate limiter on `/auth/*`.

*Fix:* make the update atomic, for example
`UPDATE app_user SET failed_login_count = failed_login_count + 1 … RETURNING failed_login_count`,
and decide the lock from the returned value. While doing that, switch to the
existing but unused `appUserRepository.updateLoginState` (it doesn't bump
`updated_at`), or add a `first_failed_at` column. Either option also fixes the
original review's LOW #5.

**M3. Retrying question generation is not idempotent.** Confirmed by reading.

If `persistDrafts` fails partway, for example on an embedding or DB error on
draft k, questions 1…k-1 are already committed. The handler then marks the
job `FAILED` and rethrows (`jobs/handlers.js:224-236`), and the queue re-runs
the whole job. With a non-deterministic LLM (Step 9), the retry generates a
fresh set. The exact-duplicate check only catches verbatim text, so the
first run's partial questions stay orphaned, and `generated_count` reflects
only the last run. The job also shows `FAILED` to the UI while a retry is
still pending.

*Fix:* in one transaction at the start of the run, delete or archive the
existing questions with `generation_job_id = job.id`. Do this together with
the original review's LOW #4 (one transaction per question and its
citations). Keep the status `RUNNING`/`RETRYING` until attempts are
exhausted.

### LOW

- **The generation-job read is unscoped.** `GET /question-generation-jobs/:id`
  (`controllers/questionGenerationController.js:53-66`) has no subject or
  owner check, so any lecturer can read any job. Only `create` is scoped,
  which the original review didn't distinguish.
- **`createdBy` can be spoofed.** `questionController.create` (`:50-53`) only
  defaults `createdBy` from `req.user` when the body omits it.
- **ADMIN is locked out of materials and generation.** The routers use
  `requireRole('LECTURER')`, so the service-level "ADMIN bypass"
  (`materialService.js:50-51`, `questionGenerationService.js:63-64`) can
  never run. Either allow ADMIN at the router or remove the dead branch.
- **Single-use tokens can be raced.** `_consumePasswordToken`
  (`authService.js:178-195`) ignores the return value of `markUsed`. It is
  conditional on `used_at IS NULL`, so two parallel requests can both consume
  one reset token. `refresh()` has the same check-then-revoke pattern, so a
  replayed refresh token can mint two sessions. Check `rowCount` and fail on 0.
- **Password reset doesn't clear a lockout.** A user who resets their
  password is still locked out until `locked_until` passes.
- **Student import isn't transactional.** `adminService.importStudents`
  (`:260-273`) inserts row by row and enqueues an email per row. A mid-file
  failure, such as a uniqueness race, leaves a partial import with emails
  already queued. The DB email check is also case-sensitive
  (`findByEmail`), while the in-file dedupe lowercases.
- **Question uniqueness is global.** `uq_question_content_normalized`
  (`001_baseline.sql:26-27`) is unique across all subjects. Two subjects
  can't both have "What is normalization?", and the 409 also reveals that
  another subject has that question. Consider scoping it to the subject or
  topic.
- **Running the app modifies tracked files.** `backend/mock-database.json`
  and `backend/db/lecturer-data/*.json` are tracked, and the mock DB and
  `/api/lecturer/*` write to them. (A probe write dirtied `sessions.json`
  during this QC and was reverted.) Untrack them or move them under `.gitignore`.
- **Frontend lint warnings.** There are 24 warnings, mostly dead imports and
  state in the scaffold pages. It isn't blocking, but the FEAT-003 note
  describes these as "pre-existing", and new pages (PendingReview,
  Questions) now add their own.

---

## 4. Corrections to specific claims in `steps1-4-review.md`

| Original claim | Status | Evidence |
|---|---|---|
| §2 "illegal transitions are rejected regardless of client input" | **Wrong** | H1 probe: `PUT {status}` revives ARCHIVED, and `POST {status:APPROVED}` skips the rubric |
| §4 "in-flight work resumes after a restart" | **Wrong** | M1: no stale-RUNNING recovery in `src/`; the test does it manually |
| §6 "Any authenticated LECTURER can read/edit…" | **Understated** | H3: STUDENT also gets 200 on reads |
| §1/§6 "question-generation jobs check lecturer→subject" | **Partial** | Create only; `GET /:id` is unscoped |
| §6 legacy `/topics`, `/evaluations`, `/api/lecturer` unauthenticated | **Confirmed** | `POST /topics` and `POST /api/lecturer/sessions` both returned **201** with no cookie |
| §6 `JWT_SECRET` fallback at `app.js:99` | **Confirmed** | Line verified |
| §1 auth crypto, cookie flags, hashed rotation, enumeration-safe reset, CSRF | **Confirmed** | Read; the Origin check was also live-probed (403 on foreign or missing Origin) |
| §3 grounding, mock default, prompt sanitization, `MATERIAL_IN_USE` | **Confirmed** | Read |
| §5 migrations additive, legacy remap | **Confirmed by reading** | Not executed (no Postgres) |
| §4 of the original, "could not verify test results" | **Now verified** | 163/163 unit, 81/81 runnable e2e |

The line citations in the original review have drifted in places. For
example, in `questionGenerationService.js` the grounding code is at
`196-273` (not `200-245`), the persist step at `248-270` (not `270-291`), and
the scope check at `63-70` (not `72-79`). In `authService.js`, `refresh` is
at `115-133` and `forgotPassword` at `151-168`. The substance is unaffected.

---

## 5. Revised priority list (before Step 5)

1. **H1:** remove raw `status` from question create/update and keep the rubric invariant on `APPROVED`.
2. **H3, plus original MEDIUM #1:** role-gate `/questions` and `/rubrics` reads, then apply subject scope to the question bank and rubrics.
3. **H2:** `COPY db ./db` in the Dockerfile; serve the SPA from nginx or move the API under `/api`; get `docker compose up` to a real browser login, then do a manual smoke test (login, then upload, generate, review, approve).
4. **Original MEDIUM #2:** gate or remove `/topics`, `/evaluations`, `/api/lecturer/*`.
5. **M1:** stale-job reaper and graceful shutdown.
6. **M2:** atomic failed-login counter.
7. **M3 + original LOW #4:** idempotent, transactional generation persistence.
8. **Original MEDIUM #3:** fail hard on a missing `JWT_SECRET` outside mock mode.
9. The LOW items, as convenient.

H1, H3 and the role and scope gaps should each get a "wrong role / wrong
subject" e2e test, as the plan's testing section requires ("Mỗi route có test
sai vai trò và sai môn": every route has a wrong-role and a wrong-subject
test). That would have caught them.

## 6. Still not verified

- Postgres-backed suites and the 001→013 migration chain on a fresh database (Docker daemon unavailable here).
- A full `docker compose up` boot. H2.1 is inferred from the Dockerfile and path resolution, not from an actual container run.
- The real Bedrock, SMTP and S3 paths, and document-extraction quality, as in the original review.

---

## 7. Resolution status (branch `fix/steps1-4-review`)

| Finding | Status | Commit |
|---|---|---|
| H1 lifecycle bypass | Fixed: create refuses APPROVED/REJECTED/ARCHIVED, PUT status goes through `assertTransition` and only to DRAFT/PENDING_REVIEW, APPROVED keeps its rubric | `fix(questions)` |
| H3 + subject scope | Fixed: `/questions` and `/rubrics` reads need LECTURER/ADMIN; questions, rubrics and generation jobs scoped through `services/subjectScope.js`; `createdBy` taken from the session; ADMIN allowed on materials/generation routers | `fix(authz)` |
| H2 stack can't run | Fixed in code and config: routers under `/api`, nginx builds and serves the SPA, `db/` copied into the backend image, `apiBaseUrl` defaults to `/api`. **Not yet run in Docker** | `fix(stack)` |
| Legacy unauthenticated routes | Fixed: gated to LECTURER/ADMIN (not deleted) | `fix(stack)` |
| `JWT_SECRET` fallback | Fixed: server refuses to start with a real DB and no secret | `fix(stack)` |
| M1 stuck RUNNING jobs | Fixed: `requeueStale` on start and every minute, SIGTERM/SIGINT drain | `fix(jobs)` |
| M2 lockout race, token/refresh replay, reset keeps lockout | Fixed: atomic `registerLoginFailure` + `first_failed_at` (migration 014); tokens claimed before use | `fix(auth)` |
| M3 non-idempotent generation, original LOW #4 | Fixed: per-question transaction, retry cleans prior unreviewed AI questions, FAILED only when attempts are exhausted | `fix(generation)` |
| Case-sensitive email lookup, tracked `mock-database.json`, unused vars | Fixed | `chore` |
| Student import not transactional | **Deferred** (needs transaction clients threaded through 3 repositories; pre-validation already catches duplicates) | |
| `db/lecturer-data/*.json` tracked | **Deferred**: the legacy controller can't create the directory, so untracking would break fresh clones; goes away with Step 5/8 | |
| Global question-content uniqueness, unused HNSW index | **Deferred** (design decisions) | |

Verified after the fixes: backend 180 unit and 84 e2e pass (14 Postgres-only
skipped), frontend builds and lints with 0 errors, `docker compose config`
validates, the server boots in mock mode with the legacy routes returning 401
and refuses to start with a real DB and no `JWT_SECRET`. **Still unverified:**
every new SQL statement (`registerLoginFailure`, `requeueStale`,
`deleteUnreviewedByGenerationJob`, migration 014) and the Docker image builds,
because Docker and Postgres were unavailable here.
