# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

AIVES: an AI-assisted oral exam (viva) platform. Lecturers build a question bank (manual, Excel import, or RAG-generated from uploaded course materials), students answer by voice, and the AI suggests rubric-based grades. Product and design docs, mostly in Vietnamese, are in `docs/` (PRD, SRS, SDS, `e2e-plan-management.md`). The plan is delivered in numbered "Steps". Per-step task tracking (plan, features, reviews) lives in `.agents/tasks/<step>/`, and commits are prefixed `feat(stepN)` / `chore(stepN)`.

Top-level parts:
- `backend/`: Express 5 API (CommonJS, Node 20). This is where most of the work happens.
- `frontend/`: React 19 + Vite + react-router SPA (ESM, plain JSX, no TypeScript).
- `lambda/`: STT Lambda image `lambda/stt/` (Step 9); the old Transcribe/Polly handlers were removed in Step 11.
- `infrastructure/terraform/`: AWS infra: EC2 t4g.small + Docker (backend + pgvector), CloudFront, S3, DynamoDB, ECR, STT Lambda, SSM, OIDC deploy role (Step 11).
- `docker-compose.prod.yml` + `scripts/` + `Makefile`: prod stack on EC2, SSM env fetch, pg_dump backups, aws-stop/start, db-restore.
- `docker-compose.yml` + `nginx/`: the local stack.
- The root-level `*.py`/`*.js` patch scripts and `out*.txt` / `docs_extracted.txt` are one-off scratch files, not part of the app.

## Commands

Backend (run from `backend/`):
```bash
npm start                 # node src/server.js
npm test                  # node:test unit suites: test/*Service.test.js ONLY
npm run test:e2e          # Jest + supertest: test/**/*.e2e.test.js (runInBand)
npm run test:all
node --test test/questionService.test.js          # single unit file
npx jest test/materials.e2e.test.js -t "uploads"  # single e2e file / test name
npm run create-admin -- --email admin@aives.local --password secret123   # needs real DB
```
- Two test runners split by filename. Unit tests use `node:test` + `node:assert/strict` and **must be named `*Service.test.js`**, or `npm test` won't pick them up. E2E suites use Jest and must be named `*.e2e.test.js`.
- Jest maps `uuid` (ESM-only v13) to `test/helpers/uuidStub.js`.
- The Postgres-backed suites (`migrations`, `jobQueue`, `step4`, `examSessions`, `interviewEngine` e2e) self-skip unless `TEST_DATABASE_URL` is set. To run them: `docker compose up -d postgres`, then `TEST_DATABASE_URL=postgres://aives:aives@localhost:5432/aives npm run test:e2e` (in PowerShell: `$env:TEST_DATABASE_URL='...'`).

Frontend (run from `frontend/`): `npm run dev`, `npm run build`, `npm run lint` (oxlint). There are no frontend tests.

Full local stack (from the repo root): `docker compose up`. It runs pgvector Postgres, the backend, DynamoDB Local, MinIO, Mailpit and nginx. The app is at http://localhost:8080, Mailpit at :8025 and the MinIO console at :9001. `docker compose config` validates the file without starting anything.

## Architecture

### Environment-driven, never `if (local)`
Local and production run the same code and differ only by env values (see `.env.example`, read in `backend/src/config/env.js`). Do not add environment-name branches. The key switches:
- `DB_MOCK_MODE` (default `true`): when true, uses `InMemoryDatabase` (JSON-file persisted to `backend/mock-database.json`). When false, uses `PgDatabase` and numbered migrations auto-run at startup.
- `AWS_MOCK_MODE` (default `true`): in-memory S3/DynamoDB/Lambda (`services/awsClients.js`), and it forces mock embedding and LLM adapters regardless of provider settings.
- `EMBEDDING_PROVIDER` / `LLM_PROVIDER` (`mock` | `bedrock`): choose the Titan embedding adapter and the Nova LLM adapter when not in AWS mock mode. Factories are in `src/embedding/embeddingAdapter.js` and `src/llm/llmAdapter.js`. `TTS_PROVIDER` (`mock` | `google`) and `STT_PROVIDER` (`mock` | `lambda`) follow the same pattern (`src/tts/ttsAdapter.js`, `src/stt/sttAdapter.js`). Mocks are deterministic, and they are the only path tests exercise.

### Routing
Every backend router is mounted under `/api` (`/api/auth`, `/api/questions`, `/api/materials`, ...); only `/health` is at the root. In the compose stack nginx serves the built SPA and proxies `/api/` to the backend, and the Vite dev server proxies `/api` too, so the frontend is always same-origin (`apiBaseUrl` defaults to `/api`). The legacy `/api/topics`, `/api/evaluations` and `/api/lecturer` routes require a signed-in LECTURER or ADMIN.

### Backend layering and DI
Requests flow route → controller → service → repository (raw SQL via `db.query` / `db.withTransaction`). All wiring happens in `createApp(overrides)` in `src/app.js`. **Every dependency can be replaced through `overrides`**, and that's how tests inject fakes. When you add a feature, wire it there with the same `overrides.x || new X(...)` pattern.

`src/server.js` adds the parts that only exist with a real DB: it runs migrations, then starts `JobQueue` and registers handlers using `app.jobContext`.

### Mock DB limits
`InMemoryDatabase` (`src/db/createDatabase.js`) pattern-matches a fixed set of SQL strings, and only for the legacy question/rubric/topic/evaluation tables. It throws `Unsupported in-memory SQL` for anything else. Auth, admin, materials, background jobs and generation need real Postgres at runtime. Their tests inject in-memory fake repositories through `createApp` overrides (see `test/materials.e2e.test.js`) rather than extending `InMemoryDatabase`. E2E suites use `test/helpers/createTestContext.js`, which points the mock DB at a temp file so the real `mock-database.json` is never touched, and mints auth cookies with `authCookie(role)`.

### Database & migrations
`backend/db/migrations/NNN_name.sql` are applied in numeric order by `src/db/migrationRunner.js`, which is idempotent and tracks applied versions. Add a new numbered file rather than editing applied ones. Postgres uses `pgvector`: `material_chunk` has an HNSW index, and question embeddings are indexed for near-duplicate detection (cosine ≥ 0.9 warns, exact normalized-content duplicates are blocked). `db/schema.sql` is a reference snapshot. `mapDbError` translates PG error codes (23505/23503) into HTTP errors.

### Background jobs
There is no Step Functions or SQS. Jobs are rows in a Postgres `background_job` table, claimed with `FOR UPDATE SKIP LOCKED`, and retried with exponential backoff up to `JOB_MAX_ATTEMPTS` (`src/jobs/jobQueue.js`). Request-time services never hold a queue handle. They receive an `enqueueJob(type, payload)` port backed by `BackgroundJobRepository`. Handlers live in `src/jobs/handlers.js` (`SEND_EMAIL`, `INGEST_MATERIAL`, `GENERATE_QUESTIONS`, `GRADE_INTERVIEW`). Convention: **throw for transient failures** so the queue retries. For terminal content failures, mark the entity `FAILED` and return normally.

### RAG pipeline (Step 4)
1. Material upload (PDF/PPTX/DOCX, text layer required, no OCR) goes to S3, and an `INGEST_MATERIAL` job is enqueued.
2. The ingest job runs `ingest/parseDocument` → `ingest/chunkText` → embed → `material_chunk`.
3. Question generation enqueues `GENERATE_QUESTIONS`, which retrieves chunks, calls the LLM, validates grounding, and persists questions as `PENDING_REVIEW` with source refs (`question_source_ref`).
4. Lecturers then approve, edit or reject them.

Question lifecycle rules are in `src/domain/questionStatus.js`. Only approved questions can enter exams.

### Interview engine (Step 6)
Engine only: there is **no interview transport yet** (no `/api/interviews` routes, no Socket.IO). Step 7 wires the public methods of `app.interviewContext.interviewService` (`startOrResume`, `getCurrentState`, `markQuestionPlayed`, `appendPartialTranscript`, `submitAnswer`).
- Modules: `services/interviewService.js` (the engine), `interview/*` (pure pieces: `decideNextStep`, `followUpDecision`, `groundingValidator`, `rationaleBuilder`, `studentView`, `pickQuestions`, `sessionContextStore`), `domain/interviewStatus.js`, `stt/*` (STT seam), `llm/followUpPrompt.js` + `decideFollowUp` on the LLM adapters. The Step 5 TTS seam is reused.
- Start: a per-student random pick of `main_question_count` APPROVED questions of the exam topic (`random` is injectable), stored as `assigned_question.order_no`; their rubrics are locked. `deadline_at = started_at + exam_session.session_time_limit_sec`, capped at `closes_at`, computed once and persisted.
- Decision order after each answer (do not reorder): (1) session deadline passed → end; (2) empty answer → next main question; (3) the LLM proposes a follow-up AND `max_follow_ups_per_question` is not reached → follow-up; (4) otherwise next main question, and when none remain → end. The LLM is retried once on error/timeout/invalid JSON; a second failure moves on to the next main question and writes a `processing_failure` row. The exam never stops because of a provider.
- On end: COMPLETED, transcript persisted, `viva_result` PENDING created, `GRADE_INTERVIEW` enqueued (grading itself is Step 8).
- Postgres is the source of truth. The DynamoDB SessionContext (`clients.sessionStore`, item key `interview#<id>`, TTL attribute `expiresAt`) holds current turn, deadlines, partial transcript segments and covered key points; it is rebuilt from Postgres when missing. The service keeps no in-memory state.
- Rationale (why a question was asked, grounded citations) is snapshotted into `qa_turn.rationale` and is lecturer-only. Every engine return goes through `toStudentInterviewView` (explicit allowlist) plus `assertStudentSafe`. Never return DB rows to students.
- New env vars: `STT_PROVIDER` (`mock` | `lambda`, Step 9), `SESSION_TABLE_AUTO_CREATE` (create the DynamoDB table + TTL at startup; local only), `SESSION_CONTEXT_TTL_GRACE_SEC`, `FOLLOW_UP_LLM_TIMEOUT_MS`. `DYNAMODB_ENDPOINT` is now honored by the real DynamoDB client.
- Engine unit tests use the in-memory fakes in `test/helpers/interviewFakes.js` (`buildWorld`); `test/interviewEngine.e2e.test.js` covers the real SQL and self-skips without Postgres.

### Auth
- JWT access and refresh tokens are stored in httpOnly cookies (`src/auth/`). Roles are `ADMIN`, `LECTURER` and `STUDENT`.
- `createAuthMiddleware` exposes `requireAuth`, `requireRole` and `requireSubjectScope` (the latter is not wired to any route). Subject scoping is done in services through `services/subjectScope.js` (questions via their topic, rubrics, generation jobs, materials); rows with no subject are treated as unscoped.
- CSRF protection is an Origin check (`middleware/csrf.js`): state-changing requests must send an `Origin` that matches `APP_BASE_URL`. The check is skipped only when no origin is configured.
- Errors carry `statusCode` + `code`, and the global handler returns `{ message, code }` so the frontend can branch on `code`.
- Accounts are created by an admin, and users set their password through emailed links. Email is sent via the `SEND_EMAIL` job and captured by Mailpit locally.

### Frontend
- `src/services/*Api.js` wrap `apiRequest` from `authApi.js`, which sends `credentials: 'include'` and throws errors carrying `status`/`code`. The base URL comes from `VITE_API_BASE_URL` and defaults to `http://localhost:3000`.
- `AuthContext` loads the session from `/auth/me`.
- `App.jsx` routes per role (`/admin`, `/lecturer`, `/student`) through `ProtectedRoute`. Shared UI primitives are in `src/components/ui/`.

## Conventions
- Git worktrees go in `.worktrees/` (gitignored). `jest.config.js` deliberately uses an unanchored `**/test/**` match so tests still run under that dot-directory.
- Never commit `.env` or real secrets. Prod secrets come from SSM / Secrets Manager.
