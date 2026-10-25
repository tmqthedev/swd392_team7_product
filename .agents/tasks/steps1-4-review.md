# AIVES E2E Steps 1–4 — Read-Only Code Review

Scope: correctness and security of the merged Step 1–4 code on `main` at
`d:\Workspace\swd392_team7_product`, checked against
`docs/e2e-plan-management.md`. Read-only; no files, migrations, git, or
servers were touched. Backend tests were NOT re-run (per instructions).

Commits reviewed (newest first): `dca0d6e` … `a42d99d` (Steps 1–4) on top of
scaffold `ae0232c`.

---

## 1. Overall verdict

**Steps 1–4 are sound enough to build Step 5 on.** The hard parts the plan calls
out are implemented correctly and defensively: scrypt password hashing with
per-user salt and constant-time compare, HMAC-JWT in httpOnly cookies with
hashed+rotated refresh sessions, enumeration-safe password reset, an enforced
server-side question state machine, grounding/dedup validation that actually
drops ungrounded AI drafts, prompt-injection-resistant LLM prompts, a Postgres
`FOR UPDATE SKIP LOCKED` job queue with retry/backoff, and additive,
idempotent, transactional migrations with the legacy status remap.

The gaps are not blockers but should be on the radar before Step 5 wires exams:

- **Subject-scope authorization is enforced inconsistently.** Materials and
  question-generation jobs check lecturer→subject assignment; the question bank
  (`/questions`) and rubrics (`/rubrics`) do NOT. Any authenticated LECTURER can
  read/edit/approve any subject's questions and edit any rubric. (MEDIUM)
- **Legacy scaffold routes `/evaluations`, `/topics`, and `/api/lecturer/*` are
  still mounted with NO auth at all**, and `/api/lecturer/*` is still used by the
  live frontend (Sessions / EvaluationReview) against a flat-file mock DB.
  (MEDIUM for the unauthenticated writes; the data is throwaway scaffold data.)
- A handful of LOW items (non-transactional AI-citation persistence, an unused
  HNSW index, lockout window keyed off `updated_at`).

Per-area ratings:

| # | Area | Rating |
|---|------|--------|
| 1 | Auth (Step 2) | **OK** (one MINOR: lockout window) |
| 2 | Question lifecycle + dup (Step 3) | **OK** |
| 3 | RAG grounding (Step 4) | **OK** (one LOW: citation tx) |
| 4 | Job queue (Step 1) | **OK** |
| 5 | Data model / migrations (001–013) | **OK** |
| 6 | Cross-cutting | **SIGNIFICANT ISSUE** (subject scope + unguarded legacy routes) |

---

## 2. Evidence by question

### 1. AUTH — OK (MINOR on lockout window)

**Passwords: scrypt, per-user salt, constant-time compare — YES.**
`backend/src/auth/passwordHasher.js:34-48` generates a fresh 16-byte random salt
per hash (`crypto.randomBytes(SALT_BYTES)`) and stores
`scrypt$N$r$p$<saltB64>$<hashB64>`. `verify` (`:50-73`) re-derives and compares
with `crypto.timingSafeEqual` after a length guard. No bcrypt; Node `crypto`
only, as the plan dictates.

**Access + refresh JWT in httpOnly+Secure+SameSite cookies — YES (with a caveat).**
`controllers/authController.js:10-30` sets both cookies with `httpOnly:true`,
`secure: env.cookieSecure`, `sameSite: env.cookieSameSite`, `path:'/'`. Defaults
in `config/env.js:42-43` are `COOKIE_SECURE=false` and `COOKIE_SAME_SITE=Lax` —
correct for local HTTP; **production must set `COOKIE_SECURE=true`** (plan says
Secure). The JWT is a hand-rolled HS256 JWS verified with `timingSafeEqual`
(`auth/tokenService.js:105-121`), signature-length-checked before compare.

**Only a HASH of the refresh token in `auth_session`, with rotation — YES.**
`services/authService.js:52-61` stores `sha256(refresh.token)` only; the raw
token lives only in the cookie. `refresh()` (`:107-125`) verifies the JWT, looks
up the session by hash (`findActiveByHash` filters `revoked_at IS NULL AND
expires_at > now()`, `repositories/authSessionRepository.js:17-26`), then
**revokes the old hash and mints a new pair** — true rotation.

**Password reset revokes all sessions + enumeration-safe — YES.**
`_consumePasswordToken` (`authService.js:160-180`) calls
`authSessionRepository.revokeAllForUser(record.user_id)` after a successful
reset. `forgotPassword` (`:137-157`) returns the same `{ok:true}` whether or not
the identifier matches, and only enqueues an email when a user is found — no
enumeration via response shape. (Timing side-channel is not mitigated, but that
is beyond the plan's stated bar.)

**5-attempts-in-15-min lockout — ENFORCED (MINOR semantics).**
Login throws `423 ACCOUNT_LOCKED` when `locked_until > now`
(`authService.js:73-78`). `_registerFailure` (`:101-116`) increments
`failed_login_count` and sets `locked_until = now + loginLockMinutes` once
`nextCount >= loginMaxFailures` (defaults 5 / 15 / 15, `env.js:44-46`).
**MINOR:** the rolling window is computed from `user.updated_at`
(`authService.js:103-108`), and `appUserRepository.update` bumps `updated_at` on
every write (`appUserRepository.js:70`). So (a) failures never "age out" as long
as they stay <15 min apart (a sliding, not fixed, window), and (b) an unrelated
admin edit to the user row resets the window clock. Lockout still triggers
correctly for a burst of 5; the edge cases are lenient, not exploitable.

**Origin/CSRF on state-changing requests — YES.**
`middleware/csrf.js:verifyOrigin` lets GET/HEAD/OPTIONS through and rejects any
other method whose `Origin` is not in the allow-list with `403
FORBIDDEN_ORIGIN`. Mounted globally in `app.js` as
`verifyOrigin([runtimeEnv.appBaseUrl])`. **Caveat by design:** when the
allow-list is empty the check is skipped (`csrf.js:20-23`) — fine for test
harnesses, and real deploys always set `APP_BASE_URL`.

**requireRole / requireSubjectScope actually block — PARTIAL.**
`requireRole` (`middleware/auth.js:52-59`) returns `403 FORBIDDEN` server-side
for the wrong role — real enforcement, not UI hiding; `/admin` is fully gated
(`routes/adminRoutes.js:14`), `/questions|/rubrics|/materials|
/question-generation-jobs` gate writes behind `requireRole('LECTURER')`.
`requireSubjectScope` (`auth.js:66-90`) is correctly written (ADMIN bypass,
LECTURER must be in `listSubjectIdsForLecturer`, else 403) **but is never wired
into any route.** See area 6 — subject isolation is therefore uneven.

### 2. QUESTION LIFECYCLE + DUP — OK

**State machine enforced server-side — YES.** `domain/questionStatus.js` is a
pure transition map; `TRANSITIONS` (`:10-16`) only permits legal forward moves
and `ARCHIVED` is terminal. `assertTransition` throws `409 INVALID_TRANSITION`.
`questionService.approve/reject/archive` (`services/questionService.js:159-205`)
each call `assertTransition(existing.status, …)` before writing, so illegal
transitions are rejected regardless of client input.

**Approve-requires-rubric / reject-requires-reason — YES.** `approve` throws
`409 RUBRIC_REQUIRED` when `rubric_id == null` (`questionService.js:165-170`);
`reject` throws `400 REASON_REQUIRED` on an empty/trimmed-empty reason
(`:177-183`) and stores it in `review_note`. `approveBatch` enforces the same
rubric rule atomically inside `db.withTransaction` (`:242-290`).

**Exact-dup hard block + ≥0.9 near-dup non-blocking — YES.**
`_assertNotDuplicate` (`:548-556`) throws `409 DUPLICATE_QUESTION` on normalized
exact match (checked BEFORE embedding). Near-dup
(`_detectNearDuplicateByTopic`, `:470-492`) scans same-subject embeddings via
`findSubjectEmbeddingsByTopic` and `cosineSimilarity`, returns a
non-blocking `warnings[]` with `NEAR_DUPLICATE_THRESHOLD = 0.9` — the question
is still persisted.

**Rubric lock prevents edits + clone bumps version — YES.**
`rubricService.updateRubric` throws `409 RUBRIC_LOCKED` when `is_locked`
(`services/rubricService.js:72-78`). `rubricRepository.clone`
(`repositories/rubricRepository.js:116-150`) copies criteria + performance
levels, sets `version = source.version + 1` and `is_locked = false`.
**Note (expected):** nothing sets `is_locked = true` yet because that happens
when an exam opens (Step 5), which is not built — so the lock path is currently
unreachable in normal flow. Not a defect for Steps 1–4.

### 3. RAG GROUNDING — OK (LOW: citation tx)

**Grounding drops ungrounded drafts — YES.**
`questionGenerationService._validateAndPersistDraft`
(`services/questionGenerationService.js:200-245`): for each citation it looks up
`R[chunkId]` (the retrieved-chunk map built by the handler) and `continue`s past
any citation whose chunk is not in `R`; it also whitespace/case-normalizes and
requires the excerpt to be a substring of the chunk content
(`normalizeForSubstring`, `:40-42`). If no citation survives
(`validCitations.length === 0`) the draft is dropped (returns `null`). Shape
checks also drop drafts missing content/bloom/3–5 key points/citations.

**AI questions persist as PENDING_REVIEW / source=AI with citations — YES.**
`:270-291` creates the question with `status:'PENDING_REVIEW'`, `source:'AI'`,
`generationJobId`, then inserts one `question_source_ref` per surviving citation.

**Mock embedding+LLM is the default; real Bedrock only behind a flag — YES.**
`config/env.js:9` defaults `AWS_MOCK_MODE=true`. Both factories short-circuit to
the mock when `env.awsMockMode` is set (`embedding/embeddingAdapter.js:14-16`,
`llm/llmAdapter.js:13-15`) and only build a Bedrock client when mock mode is off
AND `provider` is bedrock/titan/nova; unknown providers fall back to mock. The
Bedrock clients are constructed lazily (`bedrockLlmAdapter.js:_ensureClient`),
so even requiring the module makes no AWS call. Default/test path cannot reach
real AWS.

**Student/document text treated as data (prompt-injection) — YES.**
`bedrockLlmAdapter.js`: `SYSTEM_RULE` (`:19-25`) declares source material is
reference data and that instructions inside it must never be followed; each
chunk is wrapped in delimited `<<<CHUNK id>>> … <<<END CHUNK id>>>` blocks and
`sanitizeChunkContent` (`:88-90`) strips forged delimiter sequences so a
document can't close/impersonate a block. Output is forced through the
`emit_questions` tool (`toolChoice`), and the service re-validates grounding
regardless of what the model returns.

**No-text-layer upload rejected — YES.** `jobs/handlers.js` ingest handler sums
extracted characters and, below `MIN_EXTRACTED_CHARS = 20` (`:35`), marks the
material `FAILED` with "needs a text layer" and resolves WITHOUT throwing (so
the queue doesn't retry a scan that can never succeed). Parse failures are
handled the same way; transient errors (missing S3 object, embedding error)
rethrow for retry.

**DELETE 409 MATERIAL_IN_USE is a COUNT with INNER JOIN on material_chunk — YES.**
`courseMaterialRepository.countCitingQuestions`
(`repositories/courseMaterialRepository.js:84-93`):
`SELECT COUNT(*) FROM question_source_ref qsr JOIN material_chunk mc ON
mc.material_chunk_id = qsr.chunk_id WHERE mc.material_id = $1`. The INNER JOIN
drops `chunk_id IS NULL` rows (manual/import citations), so only genuine chunk
citations block the delete. `materialService.delete` throws `409
MATERIAL_IN_USE` when the count > 0 (`services/materialService.js:150-153`).

**LOW:** the question row and its `question_source_ref` inserts are not wrapped
in one transaction (`questionGenerationService.js:270-289`). A crash mid-loop
could leave a PENDING_REVIEW AI question with partial citations. Grounding
guarantees ≥1 valid citation was computed, so it's informational — matches the
NIT the Step-4 self-review already logged (`.agents/tasks/e2e-step4-rag/
verdict.json`).

### 4. JOB QUEUE — OK

**`SELECT … FOR UPDATE SKIP LOCKED` with retry/attempts/backoff + bounded
concurrency, Postgres-backed — YES.**
`backgroundJobRepository.claimNext` (`repositories/backgroundJobRepository.js:
39-56`) uses an inner `SELECT … WHERE status='PENDING' AND run_after<=now()
ORDER BY run_after FOR UPDATE SKIP LOCKED LIMIT 1` and atomically flips the row
to RUNNING, incrementing `attempts`. `JobQueue._claim` runs it inside
`db.withTransaction` so the row lock is held during the claim
(`jobs/jobQueue.js:120-123`). Concurrency is bounded by
`inFlight.size < this.concurrency` (`:101-110`, default 2). Failures compute
exponential backoff with a 60s cap (`computeBackoffMs`, `:18-22`) and
`markFailed` re-queues as PENDING with a future `run_after` until
`attempts >= max_attempts`, after which the row stays FAILED
(`backgroundJobRepository.js:markFailed`). All state is in the `background_job`
table, so in-flight work resumes after a restart (the plan's requirement).

Minor observation (not a defect): `_handleFailure` reads `job.attempts` from the
post-increment `RETURNING *` row, so the first retry's backoff uses attempt=1 →
~1s; acceptable.

### 5. DATA MODEL / MIGRATIONS (001–013) — OK

**Unified model tables + key columns present — YES.** The plan's "Mô hình dữ
liệu" tables are created across `004_accounts` (app_user, auth_session,
password_token), `005_subjects` (subject, subject_lecturer, topic.subject_id),
`006_materials` (course_material + status CHECK, material_chunk vector(1024) +
HNSW index), `007_questions_rubrics` (rubric +subject_id/is_locked/version/
created_by, performance_level, question_generation_job, question + bloom_level/
language/reference_answer/key_points/source/rationale/embedding/generation_job_id/
review fields with CHECKs, question_source_ref), `008_exam_viva`, `009_scoring`,
`010_background_job`. Spot-checked `006` and `007` directly; column names/types
match the plan.

**Runner idempotent + transactional — YES.** `src/db/migrationRunner.js` tracks
applied versions in `schema_migrations`, computes `pendingMigrations`, and runs
each pending file in its own `BEGIN … COMMIT` with `ROLLBACK` on error
(`:75-96`). Re-runs apply nothing.

**Legacy status remap — YES.** `007_questions_rubrics.sql:62-64` runs
`UPDATE question SET status='APPROVED' WHERE status='Active'` and `…='DRAFT'
WHERE status='Draft'` BEFORE relaxing the status CHECK to the five new values.

**No migration edits an already-applied earlier migration — CONFIRMED.** 011/012/
013 are purely additive (`ADD COLUMN IF NOT EXISTS`, `CREATE TABLE/INDEX IF NOT
EXISTS`, backfill UPDATEs). 012 adds only the question HNSW index; 013 denorms
`material_chunk.subject_id` + backfills. All idempotent; none rewrite 001–010.

**LOW:** the `idx_question_embedding` HNSW index (012) is currently unused —
near-dup runs in JS via `findSubjectEmbeddingsByTopic` + `cosineSimilarity`
(`questionRepository.js:140-154`), not an ANN query. Harmless, aspirational.

### 6. CROSS-CUTTING — SIGNIFICANT ISSUE

**Subject-scope contract is enforced unevenly (MEDIUM).** The plan is explicit:
"giảng viên chỉ thấy câu hỏi, kỳ thi, bài chấm của môn được gán" and "Quyền kiểm
tra ở middleware của backend theo vai trò và phạm vi môn."
- Enforced: `materialService._assertSubjectInScope`
  (`services/materialService.js:50-57`) and
  `questionGenerationService._assertSubjectInScope`
  (`services/questionGenerationService.js:72-79`) both check
  `subjectRepository.listSubjectIdsForLecturer`.
- NOT enforced: `questionService` has no subject/`createdBy` filter anywhere —
  `listQuestions`, `getQuestionById`, `createQuestion`, `update`, `approve`,
  `reject`, `archive`, `approveBatch` operate on any id for any authenticated
  LECTURER. `rubricService` likewise lets any LECTURER edit/clone/delete any
  rubric. The `requireSubjectScope` middleware exists but is wired nowhere.
  Result: cross-subject read and tampering by any lecturer. Not a blocker for a
  trusted-lecturer demo, but it contradicts the plan and should be closed before
  (or as part of) Step 5, when exams make subject isolation load-bearing.

**Unguarded legacy scaffold routes still wired (MEDIUM).** `app.js:207-209`
mounts `/topics`, `/evaluations`, and `/api/lecturer` with **no auth middleware
at all**:
- `/evaluations` → `evaluationController`/`EvaluationService` over a real
  `evaluation` table-style repo. The plan says `/evaluations` is superseded by
  `/results` (Step 8, not built).
- `/api/lecturer/:entity` → `lecturerDataController`, a flat-file CRUD over
  `backend/db/lecturer-data/{sessions,questions,rubrics}.json`
  (`controllers/lecturerDataController.js`). Fully unauthenticated read/write.
- `/topics` → `topicController`, unauthenticated.
These are the pre-existing scaffold's mock-DB endpoints. **They are NOT dead:**
the live frontend still calls `/api/lecturer/sessions` from `Sessions.jsx:15` and
`EvaluationReview.jsx:25/51/64`. So the lecturer Sessions and Evaluation pages
are still driven by the unauthenticated flat-file mock, not the new model. This
matters: it's an unauthenticated write surface, and it's a contract seam Step 5/8
must replace (`/exam-sessions`, `/results`) and then delete these routes +
`db/lecturer-data/*.json` + the scaffold pages. Until then, at minimum gate them
behind `requireAuth`.

**Did a later step break an earlier contract? No regressions found.** Steps 2–4
added routers alongside the scaffold without rewriting earlier migrations or auth
primitives; the auth building blocks are re-exported on `app.authContext` for
reuse. The only "contract" tension is the two bullets above (scope not applied to
Step-3 routes; legacy routes left open), both pre-existing/deferred rather than a
Step-N-broke-Step-M break.

**Secrets / committed .env — CLEAN.** `git ls-files` shows only `.env.example`
tracked; no `.env`, keys, or credentials committed. One thing to fix before
prod: `app.js:99` falls back to `JWT_SECRET='aives-dev-insecure-secret'` when
unset so mock/test boots work. That is fine for local but **must be a hard
failure in production** — recommend requiring `JWT_SECRET` when
`AWS_MOCK_MODE=false`/`NODE_ENV=production`. (LOW/MEDIUM depending on deploy
discipline.)

**Dead / contradictory code.** The legacy `/evaluations`, `/topics`,
`/api/lecturer` routes and `db/lecturer-data/*.json` are superseded-in-plan but
still live (above). The 012 HNSW index is unused (area 5). No contradictory logic
found in the new Step 1–4 code itself.

---

## 3. Prioritized issues

**HIGH** — none.

**MEDIUM**
1. **Apply subject-scope to the question bank and rubrics.** Thread the acting
   user into `questionService`/`rubricService` and filter reads + guard writes
   by lecturer→subject assignment (reuse `subjectRepository.
   listSubjectIdsForLecturer` or wire the existing `requireSubjectScope`).
   Needed for the plan's authorization model and before Step 5 exams.
2. **Gate or remove the unauthenticated legacy routes.** `/evaluations`,
   `/topics`, `/api/lecturer/*` are mounted with no auth and `/api/lecturer/*`
   is still the backing store for the live Sessions/EvaluationReview pages. At
   minimum add `requireAuth` now; plan to delete them (+ `db/lecturer-data/*`
   and the scaffold pages) when Step 5/8 ship `/exam-sessions` and `/results`.
3. **Fail hard on missing `JWT_SECRET` in production.** Replace the insecure
   dev fallback (`app.js:99`) with a startup assertion when not in mock/dev.

**LOW**
4. Wrap the AI question + its `question_source_ref` inserts in one
   `db.withTransaction` (`questionGenerationService.js:270-289`) for atomic
   citation persistence.
5. Harden the lockout window: track a dedicated `first_failed_at`/window anchor
   instead of relying on `updated_at`, so unrelated row updates don't reset it
   (`authService.js:103-108`).
6. Either use `idx_question_embedding` (ANN near-dup query) or drop the index to
   avoid implying behavior that isn't wired.
7. Document/enforce `COOKIE_SECURE=true` and a real `APP_BASE_URL` in the prod
   env (both default to local-dev-friendly values).

---

## 4. Could NOT verify by reading (needs running / out of scope)

- **Runtime test results.** Per instructions I did not re-run the suites; the
  "163 unit + 81 e2e, clean frontend build" claim is taken on trust from the
  task artifacts, not re-executed here.
- **Postgres-dependent SQL behavior.** `FOR UPDATE SKIP LOCKED` concurrency,
  pgvector `<=>` ranking in `findNearestForTopic`, HNSW index creation, and the
  JSONB round-trips were read, not executed against a live Postgres (the e2e
  suites self-skip offline).
- **Real Bedrock/Titan/Gmail/S3 paths.** Only the mock paths run offline; the
  real adapters' request/response shaping (`bedrockLlmAdapter`,
  `bedrockEmbeddingAdapter`, SMTP) is unverifiable without credentials.
- **PDF/DOCX/PPTX extraction quality** (`ingest/parseDocument.js`) — correctness
  of the text layer on real documents needs sample files.
- **Timing-based enumeration/side-channels** on login/forgot-password (response
  shape is enumeration-safe; wall-clock timing was not measured).
- **Whether `is_locked` is ever set true** — the setter belongs to the
  not-yet-built exam-open flow (Step 5), so the rubric-lock path can't be
  exercised end-to-end yet.
