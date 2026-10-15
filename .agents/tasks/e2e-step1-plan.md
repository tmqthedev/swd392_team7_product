# Implementation Plan — E2E Step 1: Nền tảng local và CSDL

Scope: Step 1 only (local docker stack + unified data model + migration runner + repositories + background_job queue + tests). NO auth endpoints, RAG, interview engine, or scoring business logic (Steps 2–11). Table/column scaffolding and stub job handlers are in scope; later-step business logic is not.

All paths are inside the worktree `d:\Workspace\swd392_team7_product\.worktrees\e2e-step1-foundation`. Use `git -C <worktree>`.

## Discovered facts (grounding)

- `backend` is CommonJS Express 5. Scripts: `test` = `node --test "test/*Service.test.js"` (ONLY files matching `*Service.test.js` run under node:test), `test:e2e` = `jest --runInBand`, `test:all` = both, `start` = `node src/server.js`.
- **Test gating mechanism (reuse it):** node:test picks up only `test/*Service.test.js`. Jest (`test:e2e`) picks up `*.e2e.test.js`. So: pure-logic unit tests MUST be named `<name>Service.test.js` to run under `npm test` without Docker; Postgres-dependent integration tests MUST be named `<name>.e2e.test.js` and additionally self-skip when no `DATABASE_URL`/`TEST_DATABASE_URL` is set, so `npm run test:e2e` stays green without Docker.
- `src/db/createDatabase.js` exports `createDatabase(env)` → `PgDatabase` (real) or `InMemoryDatabase` (mock, when `env.dbMockMode`). `PgDatabase` has a public `.pool` (node-pg `Pool`), plus `.query`, `.withTransaction(cb)` (BEGIN/COMMIT/ROLLBACK), `.end()`. The migration runner MUST reuse `PgDatabase.pool` — do not create a second Pool.
- `src/config/env.js` reads `process.env` via `dotenv` + a `readBoolean` helper and exports a flat object (`port`, `awsRegion`, `awsMockMode`, `dbMockMode`, `databaseUrl`, `mockDbFile`, `audioBucket`, `lambdaFunctionName`, `dynamoTableName`, `transcribeOutputBucket`). EXTEND it; do not replace. No `if (local)` branches anywhere — behavior differs only by env values.
- `src/app.js` `createApp(overrides)` wires MVC and injects `database` for tests. Startup migrations must run from `src/server.js` (NOT `createApp`), so test injection and mock mode are unaffected.
- Repositories take the `db` object in the constructor and call `this.db.query(sql, params)` returning `{ rows, rowCount }`. Follow `src/repositories/topicRepository.js` style (static `UPDATABLE_COLUMNS` whitelist, dynamic `$n` SET builder).
- `src/db/mapDbError.js` maps pg error codes (23503/23505/23514/connection) to HTTP statuses; new repos inherit this automatically via `db.query`.
- Existing schema: `backend/db/schema.sql` defines `topic(topic_id, name)`, `rubric(rubric_id, max_score)`, `rubric_criterion`, `question(question_id, topic_id, rubric_id, content, status CHECK IN ('Active','Draft'))`. `backend/db/migrations/` has only `002_rubric_criterion.sql` (idempotent ALTERs). There is NO `001_*.sql` — baseline lives in `schema.sql`.
- No `docker-compose.yml`, no nginx config, no `.env.example` at repo root yet. Dockerfile at `backend/Dockerfile` (node:20-alpine, `npm ci --omit=dev`, copies `src`).
- The `evaluation` table used by `/evaluations` code is NOT in `schema.sql` (mock-mode only). Do not break `/evaluations` route startup; new scoring tables replace it going forward but its data need not migrate.

## Migration numbering decision

Baseline (`schema.sql`) + existing `002_rubric_criterion.sql` stay. New migrations continue the numeric sequence. The runner applies `schema.sql`-equivalent base tables idempotently via a `001_baseline.sql` that mirrors `schema.sql` (so a fresh DB bootstrapped purely by the runner is complete), then `002` (existing), then the new ones. Rationale: the runner is the single source of truth at startup ("Migration tự chạy khi backend khởi động"); keeping a numbered `001_baseline.sql` means the runner alone can build an empty database without depending on a separate `schema.sql` apply step. `schema.sql` is retained as human-facing reference and updated to match.

Files (exact names, applied in lexical/numeric order):
- `backend/db/migrations/001_baseline.sql` — NEW. Idempotent re-statement of current `schema.sql` (topic, rubric, rubric_criterion, question with the OLD status CHECK). All `CREATE TABLE IF NOT EXISTS` / `CREATE UNIQUE INDEX IF NOT EXISTS`.
- `backend/db/migrations/002_rubric_criterion.sql` — EXISTS, unchanged.
- `backend/db/migrations/003_extensions.sql` — NEW. `CREATE EXTENSION IF NOT EXISTS vector;`
- `backend/db/migrations/004_accounts.sql` — NEW. app_user, auth_session, password_token.
- `backend/db/migrations/005_subjects.sql` — NEW. subject, subject_lecturer, topic ALTER (add subject_id).
- `backend/db/migrations/006_materials.sql` — NEW. course_material, material_chunk (embedding vector(1024) + HNSW index).
- `backend/db/migrations/007_questions_rubrics.sql` — NEW. rubric ALTER (subject_id, is_locked, version, created_by), performance_level, question ALTERs + status enum relax + legacy data migration (Active→APPROVED, Draft→DRAFT), question_source_ref, question_generation_job.
- `backend/db/migrations/008_exam_viva.sql` — NEW. exam_session, exam_session_student, exam_session_examiner, viva_interview, assigned_question, qa_turn, transcript, processing_failure.
- `backend/db/migrations/009_scoring.sql` — NEW. viva_result, question_evaluation, criterion_score, score_adjustment.
- `backend/db/migrations/010_background_job.sql` — NEW. background_job.

> Numbering note: new content is split by domain for reviewability; each file is independently idempotent and transactional. If the implementer prefers to merge 004–010 into fewer files, the ordering constraints below (extensions before vector columns; subject before topic/rubric/material FKs; question/rubric before source_ref/evaluation; exam/viva before scoring) MUST be preserved.

---

## Ordered items

- [ ] 1. **Extend `env.js` with the full Step-1 env surface.**
      Add (via `process.env` + existing helpers, defaults chosen for local mock dev): `dynamodbEndpoint` (`DYNAMODB_ENDPOINT`), `s3Endpoint` (`S3_ENDPOINT`), `lambdaEndpoint` (`LAMBDA_ENDPOINT`), `smtpHost`/`smtpPort`/`smtpUser` (`SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`), `appBaseUrl` (`APP_BASE_URL`, default `http://localhost:8080`), `bedrockModelId` (`BEDROCK_MODEL_ID`), `bedrockEmbedModelId` (`BEDROCK_EMBED_MODEL_ID`), `jwtSecret` (`JWT_SECRET`), `materialsBucket` (`MATERIALS_BUCKET_NAME`), job-queue knobs `jobQueueConcurrency` (`JOB_QUEUE_CONCURRENCY`, default 2), `jobQueuePollIntervalMs` (`JOB_QUEUE_POLL_INTERVAL_MS`, default 1000), `jobMaxAttempts` (`JOB_MAX_ATTEMPTS`, default 3), and `migrationsDir` (`MIGRATIONS_DIR`, default resolved to `backend/db/migrations`). Keep all existing keys. No `if(local)` branches.
      Files: `backend/src/config/env.js`
      Verify: `cd backend; npm test` — existing `*Service.test.js` still pass (env is required indirectly; no regressions).

- [ ] 2. **Write `001_baseline.sql` mirroring current `schema.sql`.**
      Idempotent `CREATE TABLE IF NOT EXISTS` for topic, rubric, rubric_criterion, question (keep OLD status CHECK `IN ('Active','Draft')` here; it is relaxed later in 007) and the two unique indexes. This lets the runner build an empty DB with no separate schema.sql step.
      Files: `backend/db/migrations/001_baseline.sql`
      Verify: file is valid SQL; covered by the runner e2e in item 11 (fresh DB → all base tables exist).

- [ ] 3. **Create the migration runner reusing the existing pool.**
      `src/db/migrationRunner.js` exporting `runMigrations({ pool, dir, logger })`. Behavior: ensure `schema_migrations(version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT now())`; read `*.sql` files from `dir`, sort by numeric prefix ascending; for each not already in `schema_migrations`, run its SQL + the INSERT inside ONE transaction (BEGIN/COMMIT, ROLLBACK on error) on a dedicated client from `pool`; idempotent (re-run applies nothing). Also export a pure helper `orderMigrationFiles(filenames)` and `pendingMigrations(allVersions, appliedVersions)` so ordering logic is unit-testable without a DB.
      Files: `backend/src/db/migrationRunner.js`
      Verify: `cd backend; npm test` (unit test added in item 10 exercises `orderMigrationFiles`/`pendingMigrations`).

- [ ] 4. **Run migrations at backend startup, gated to real Postgres.**
      In `src/server.js`, before `app.listen`, if `!env.dbMockMode`: build the db via `createDatabase(env)`, and when it is a `PgDatabase`, call `runMigrations({ pool: db.pool, dir: env.migrationsDir, logger })`, awaiting completion before listening; on failure log and exit non-zero. In mock mode, skip (InMemoryDatabase has no pool). Keep `createApp()` untouched so tests/mock mode are unaffected. (Share the one db instance with `createApp` via the `database` override to avoid a second pool.)
      Files: `backend/src/server.js`
      Verify: `cd backend; npm test` and `npm run test:e2e` both still green without Docker (startup path not hit by tests); Dockerized check in item 12.

- [ ] 5. **Migration 003: pgvector extension.**
      `backend/db/migrations/003_extensions.sql`: `CREATE EXTENSION IF NOT EXISTS vector;`
      Files: `backend/db/migrations/003_extensions.sql`
      Verify: part of runner e2e (item 11) on the `pgvector/pgvector:pg16` image.

- [ ] 6. **Migration 004: accounts.**
      `app_user(user_id PK, code varchar UNIQUE, email varchar UNIQUE, full_name, password_hash, role CHECK IN ('ADMIN','LECTURER','STUDENT'), status CHECK IN ('ACTIVE','LOCKED') DEFAULT 'ACTIVE', failed_login_count int DEFAULT 0, locked_until timestamptz, last_login_at timestamptz, created_at)`.
      `auth_session(auth_session_id PK, user_id FK app_user, refresh_token_hash, expires_at, revoked_at, ip, user_agent, created_at)`.
      `password_token(password_token_id PK, user_id FK app_user, token_hash, purpose CHECK IN ('SET','RESET'), expires_at, used_at, created_at)`.
      Files: `backend/db/migrations/004_accounts.sql`
      Verify: runner e2e (item 11) asserts these tables exist.

- [ ] 7. **Migration 005: subjects + topic.subject_id.**
      `subject(subject_id PK, code UNIQUE, name)`. `subject_lecturer(subject_id FK, lecturer_id FK app_user, PRIMARY KEY/UNIQUE(subject_id,lecturer_id))`. `ALTER TABLE topic ADD COLUMN IF NOT EXISTS subject_id INTEGER REFERENCES subject(subject_id)`.
      Files: `backend/db/migrations/005_subjects.sql`
      Verify: runner e2e asserts `subject`, `subject_lecturer` exist and `topic.subject_id` column exists.

- [ ] 8. **Migration 006: materials + chunks + HNSW (depends on 003, 005).**
      `course_material(material_id PK, subject_id FK, topic_id FK topic, title, file_key, mime_type, size_bytes bigint, page_count int, status CHECK IN ('UPLOADED','PROCESSING','READY','FAILED') DEFAULT 'UPLOADED', error text, uploaded_by FK app_user, created_at)`.
      `material_chunk(chunk_id PK, material_id FK course_material ON DELETE CASCADE, chunk_no int, location text, content text, embedding vector(1024))` + `CREATE INDEX ... ON material_chunk USING hnsw (embedding vector_cosine_ops)`.
      Files: `backend/db/migrations/006_materials.sql`
      Verify: runner e2e asserts tables + HNSW index exist (query `pg_indexes`).

- [ ] 9. **Migration 007: questions + rubrics extension + performance_level + generation job + source refs + legacy status migration (depends on 003, 005).**
      `ALTER TABLE rubric ADD COLUMN IF NOT EXISTS subject_id INTEGER REFERENCES subject(subject_id), ADD is_locked boolean DEFAULT false, ADD version int DEFAULT 1, ADD created_by INTEGER REFERENCES app_user(user_id)`.
      `performance_level(performance_level_id PK, criterion_id FK rubric_criterion ON DELETE CASCADE, label, min_score numeric, max_score numeric, description, order_no int)`.
      `question_generation_job(generation_job_id PK, topic_id FK, material_ids JSONB/int[], requested_count int, bloom_distribution JSONB, language, status, generated_count int DEFAULT 0, error, requested_by FK app_user, created_at)`.
      Question ALTERs: `bloom_level CHECK IN ('REMEMBER','UNDERSTAND','APPLY','ANALYZE')`, `language`, `reference_answer text`, `key_points JSONB`, `source CHECK IN ('MANUAL','IMPORT','AI')`, `rationale JSONB`, `embedding vector(1024)`, `generation_job_id INTEGER REFERENCES question_generation_job`, `created_by/reviewed_by INTEGER REFERENCES app_user`, `reviewed_at timestamptz`, `review_note text`.
      Status migration (order matters): `UPDATE question SET status='APPROVED' WHERE status='Active'; UPDATE question SET status='DRAFT' WHERE status='Draft';` then `ALTER TABLE question DROP CONSTRAINT IF EXISTS chk_question_status; ALTER TABLE question ADD CONSTRAINT chk_question_status CHECK (status IN ('DRAFT','PENDING_REVIEW','APPROVED','REJECTED','ARCHIVED'));`
      `question_source_ref(question_source_ref_id PK, question_id FK question ON DELETE CASCADE, chunk_id FK material_chunk, excerpt text)`.
      Files: `backend/db/migrations/007_questions_rubrics.sql`
      Verify: runner e2e asserts new question columns + new status CHECK accepts 'APPROVED' and rejects 'Active'; legacy rows (seeded 'Active'/'Draft') become 'APPROVED'/'DRAFT'.

- [ ] 10. **Migration 008: exam sessions + viva (depends on 005, 007).**
      `exam_session(exam_session_id PK, subject_id FK, topic_id FK, title, language CHECK IN ('VI','EN'), main_question_count int, max_follow_ups_per_question int, answer_time_limit_sec int, think_time_sec int, opens_at, closes_at, status CHECK IN ('DRAFT','OPEN','CLOSED') DEFAULT 'DRAFT', created_by FK app_user, created_at)`.
      `exam_session_student(exam_session_id FK, student_id FK app_user, UNIQUE(exam_session_id, student_id))`.
      `exam_session_examiner(exam_session_id FK, lecturer_id FK app_user)`.
      `viva_interview(interview_id PK, exam_session_id FK, student_id FK app_user, status CHECK IN ('NOT_STARTED','IN_PROGRESS','PAUSED','COMPLETED','TERMINATED') DEFAULT 'NOT_STARTED', current_question_index int DEFAULT 0, current_follow_up_count int DEFAULT 0, started_at, deadline_at, ended_at, end_reason, client_ip)`.
      `assigned_question(assigned_question_id PK, interview_id FK viva_interview, question_id FK question, order_no int, is_asked boolean DEFAULT false)`.
      `qa_turn(qa_turn_id PK, interview_id FK, assigned_question_id FK, sequence_no int, turn_type CHECK IN ('MAIN','FOLLOW_UP'), follow_up_reason, question_text text, rationale JSONB, answer_text text, answer_audio_key, transcript_confidence numeric, asked_at, answer_started_at, answer_ended_at, timed_out boolean, status, response_latency_ms int, speech_duration_ms int, words_per_minute numeric, pause_count int)`.
      `transcript(transcript_id PK, interview_id FK, full_text text, is_complete boolean DEFAULT false)`.
      `processing_failure(processing_failure_id PK, interview_id FK, turn_id FK qa_turn, stage, error_code, message, retry_count int DEFAULT 0, resolved boolean DEFAULT false)`.
      Files: `backend/db/migrations/008_exam_viva.sql`
      Verify: runner e2e asserts all 8 tables + the qa_turn secondary-signal columns exist.

- [ ] 11. **Migration 009: scoring (depends on 008, 007).**
      `viva_result(result_id PK, interview_id FK UNIQUE, status CHECK IN ('PENDING','AI_SCORING','AI_SUGGESTED','FLAGGED','FINALIZED') DEFAULT 'PENDING', ai_total_score numeric, final_total_score numeric, finalized_by FK app_user, finalized_at)`.
      `question_evaluation(evaluation_id PK, result_id FK viva_result ON DELETE CASCADE, assigned_question_id FK assigned_question, ai_score numeric, final_score numeric, confidence numeric, strengths text, weaknesses text, missing_points JSONB, feedback text, flag_reason text, model_id, prompt_version)`.
      `criterion_score(criterion_score_id PK, evaluation_id FK question_evaluation ON DELETE CASCADE, criterion_id FK rubric_criterion, ai_level_id FK performance_level, ai_score numeric, ai_justification text, evidence JSONB, final_score numeric)`.
      `score_adjustment(score_adjustment_id PK, criterion_score_id FK criterion_score ON DELETE CASCADE, old_score numeric, new_score numeric, reason text, adjusted_by FK app_user, adjusted_at timestamptz DEFAULT now())`.
      Files: `backend/db/migrations/009_scoring.sql`
      Verify: runner e2e asserts all 4 tables + `viva_result.interview_id` is UNIQUE.

- [ ] 12. **Migration 010: background_job.**
      `background_job(job_id PK, type CHECK IN ('INGEST_MATERIAL','GENERATE_QUESTIONS','GRADE_INTERVIEW','SEND_EMAIL'), payload JSONB NOT NULL DEFAULT '{}', status CHECK IN ('PENDING','RUNNING','DONE','FAILED') DEFAULT 'PENDING', attempts int DEFAULT 0, max_attempts int, run_after timestamptz DEFAULT now(), locked_at timestamptz, last_error text, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now())` + index on `(status, run_after)` for claim scans.
      Files: `backend/db/migrations/010_background_job.sql`
      Verify: runner e2e asserts table + index exist.

- [ ] 13. **Update `schema.sql` to match the new model (reference parity).**
      Regenerate `backend/db/schema.sql` to reflect the final state (new question status CHECK, all new tables). Keep it as human-facing reference; the runner remains authoritative. Note at top that migrations are the source of truth.
      Files: `backend/db/schema.sql`
      Verify: visual/diff review; no runtime dependency.

- [ ] 14. **New repositories for core tables (same style as existing repos).**
      One module each, constructor takes `db`, methods use `this.db.query`:
      `appUserRepository.js` (create, findById, findByEmail, findByCode, updateLoginState, setStatus),
      `subjectRepository.js` (create, findById, list, addLecturer, listLecturers),
      `courseMaterialRepository.js` (create, findById, listBySubject, updateStatus),
      `questionGenerationJobRepository.js` (create, findById, updateStatus, incrementGenerated),
      `examSessionRepository.js` (create, findById, list, addStudent, addExaminer, setStatus),
      `vivaInterviewRepository.js` (create, findById, findByExamAndStudent, updateProgress, setStatus),
      `qaTurnRepository.js` (create, listByInterview, update),
      `vivaResultRepository.js` (create, findByInterview, setStatus, finalize),
      `backgroundJobRepository.js` (enqueue, findById, claimNext, markDone, markFailed — SQL used by the queue module in item 15).
      Files: `backend/src/repositories/appUserRepository.js`, `subjectRepository.js`, `courseMaterialRepository.js`, `questionGenerationJobRepository.js`, `examSessionRepository.js`, `vivaInterviewRepository.js`, `qaTurnRepository.js`, `vivaResultRepository.js`, `backgroundJobRepository.js` (all under `backend/src/repositories/`)
      Verify: `cd backend; npm test` — a new unit test (item 10-style) constructs each repo against a fake `db` stub and asserts the SQL/params shape for the key methods; CRUD paths exercised in the e2e in item 17.

- [ ] 15. **Background job queue module.**
      `src/jobs/jobQueue.js` exporting a `JobQueue` class: constructor `({ db, repository, env, logger })`; API: `enqueue(type, payload, { runAfter })`, `registerHandler(type, fn)`, `start()` (bounded worker loop, concurrency from `env.jobQueueConcurrency`, polls every `env.jobQueuePollIntervalMs`), `stop()`, and internal `claim()` using `SELECT ... FOR UPDATE SKIP LOCKED` + status→RUNNING+locked_at inside a transaction, `markDone`, `markFailed` (increment attempts; if `attempts < max_attempts` set status PENDING + `run_after = now() + backoff(attempts)` else FAILED). Export a PURE `computeBackoffMs(attempt, baseMs)` (exponential, e.g. `baseMs * 2^(attempt-1)`, capped) so retry/backoff is unit-testable without a DB. Register no-op stub handlers for INGEST_MATERIAL, GENERATE_QUESTIONS, GRADE_INTERVIEW, SEND_EMAIL (log-and-succeed; real logic is later steps). Jobs persist in Postgres so they survive restart.
      Files: `backend/src/jobs/jobQueue.js`, `backend/src/jobs/handlers.js` (stub handlers registered by type)
      Verify: `cd backend; npm test` — `jobQueueService.test.js` asserts `computeBackoffMs` ordering/cap and the PENDING-vs-FAILED decision in `markFailed` logic against a fake db; claim concurrency exercised in e2e (item 17).

- [ ] 16. **Unit tests (node --test, no Docker) for pure logic.**
      `test/migrationRunnerService.test.js` — `orderMigrationFiles` sorts by numeric prefix (001 < 002 < 010), `pendingMigrations` filters applied.
      `test/jobQueueService.test.js` — `computeBackoffMs` monotonic + capped; `markFailed` chooses retry vs FAILED by attempts; repo SQL-shape assertions.
      Files: `backend/test/migrationRunnerService.test.js`, `backend/test/jobQueueService.test.js`
      Verify: `cd backend; npm test` — all node:test files pass WITHOUT Docker; existing `questionService.test.js`, `rubricService.test.js`, `audioWorkflowService.test.js` still pass.

- [ ] 17. **Postgres-dependent integration test, gated.**
      `test/migrations.e2e.test.js` and `test/jobQueue.e2e.test.js` (Jest). Each: at top, `const DB_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL; (DB_URL ? describe : describe.skip)(...)`. Migrations test: connect a Pool to `DB_URL`, run `runMigrations`, assert every unified-model table + the vector/HNSW objects exist, assert idempotency (second run applies nothing), assert legacy status data-migration. Job-queue test: enqueue jobs, run the worker, assert claim-skip-locked (two concurrent claims don't take the same job), markDone/markFailed+backoff, and that a RUNNING job left by a crash can be re-claimed after restart. Document in README how to run: start compose Postgres, `TEST_DATABASE_URL=... npm run test:e2e`.
      Files: `backend/test/migrations.e2e.test.js`, `backend/test/jobQueue.e2e.test.js`
      Verify: `cd backend; npm run test:e2e` WITHOUT `TEST_DATABASE_URL` → these suites skip, existing e2e stay green; WITH compose Postgres + `TEST_DATABASE_URL` → they pass (documented, run in item 19 Dockerized check).

- [ ] 18. **docker-compose.yml + nginx + .env.example at repo root.**
      Services: `backend` (build `./backend`, env from compose, `depends_on: postgres` healthy), `postgres` (`pgvector/pgvector:pg16`, volume, healthcheck `pg_isready`), `dynamodb` (`amazon/dynamodb-local`, port 8000), `minio` (`minio/minio`, 9000/9001), `mailpit` (`axllent/mailpit`, 1025 SMTP + 8025 UI), `nginx` (front proxy to backend, publish 8080), and `stt` as a COMMENTED/placeholder stub (real image is Step 9 — compose must not block on it). Wire env per the plan table: `DATABASE_URL=postgres://.../`, `DYNAMODB_ENDPOINT=http://dynamodb:8000`, `S3_ENDPOINT=http://minio:9000`, `LAMBDA_ENDPOINT=http://stt:8080`, `SMTP_HOST=mailpit`, `SMTP_PORT=1025`, `APP_BASE_URL=http://localhost:8080`, `BEDROCK_MODEL_ID`/`BEDROCK_EMBED_MODEL_ID`, `AWS_MOCK_MODE`/`DB_MOCK_MODE=false`. `.env.example` documents EVERY variable (local + prod columns from the plan). No `if(local)` in code — only env values differ.
      Files: `docker-compose.yml`, `nginx/nginx.conf`, `.env.example` (all at worktree root)
      Verify: `docker compose config` parses without error (structural validation; does not require pulling images).

- [ ] 19. **Dockerized integration verification (documented, manual/CI).**
      Document and (where the environment allows) run: `docker compose up -d postgres`, then `cd backend; TEST_DATABASE_URL=postgres://... npm run test:e2e` → migration + job-queue e2e suites pass against real pgvector Postgres. Add a short "Local E2E (Dockerized)" section to README.
      Files: `README.md`
      Verify: `cd backend; npm test` (no Docker) green AND, with Docker available, the gated e2e suites pass against `pgvector/pgvector:pg16`.

## Verification summary (project real commands)
- Fast, no Docker: `cd backend; npm test` (node --test) and `cd backend; npm run test:e2e` (Jest; Postgres suites self-skip).
- Structural: `docker compose config`.
- Full integration (Docker): `docker compose up -d postgres` + `TEST_DATABASE_URL=... npm run test:e2e`.
- Do NOT weaken existing passing tests (`questionService`, `rubricService`, `audioWorkflowService`, `crud.e2e`, `workflow.e2e`).

## Files: create vs extend
- EXTEND: `backend/src/config/env.js`, `backend/src/server.js`, `backend/db/schema.sql`, `README.md`.
- EXISTS unchanged: `backend/db/migrations/002_rubric_criterion.sql`, `createDatabase.js`, `mapDbError.js`, `app.js` (createApp untouched).
- CREATE: all `backend/db/migrations/00{1,3..9}_*.sql` + `010_background_job.sql`, `backend/src/db/migrationRunner.js`, 9 new repositories, `backend/src/jobs/jobQueue.js` + `handlers.js`, 2 node:test unit files, 2 Jest e2e files, `docker-compose.yml`, `nginx/nginx.conf`, `.env.example`.
