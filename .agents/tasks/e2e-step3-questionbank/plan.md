# Implementation Plan — E2E Step 3: Question Bank & Rubric

Worktree (ALL paths/commands target this): `d:\Workspace\swd392_team7_product\.worktrees\e2e-step3-questionbank`
Branch: `feat/e2e-step3-questionbank`. Use `git -C <worktree> ...`. Relative paths in a shell land in the parent workspace — always use the absolute worktree path.

## Context discovered during exploration

- Migrations auto-run on boot via `backend/src/db/migrationRunner.js` (orders by numeric prefix, tracks `schema_migrations`, one tx each, idempotent). Files live in `backend/db/migrations/`. Highest existing is `011_auth_step2.sql`; **next free number is `012`**. Never edit applied migrations.
- `007_questions_rubrics.sql` already added to `question`: `bloom_level` (CHECK REMEMBER/UNDERSTAND/APPLY/ANALYZE), `language`, `reference_answer`, `key_points` JSONB, `source` (CHECK MANUAL/IMPORT/AI), `status` (CHECK DRAFT/PENDING_REVIEW/APPROVED/REJECTED/ARCHIVED), `rationale` JSONB, `embedding vector(1024)`, `generation_job_id`, `created_by`, `reviewed_by`, `reviewed_at`, `review_note`. `rubric` gained `subject_id`, `is_locked`, `version`, `created_by`. `performance_level` exists (`performance_level_id`, `criterion_id` FK→rubric_criterion ON DELETE CASCADE, `label`, `min_score` NUMERIC(6,2), `max_score`, `description`, `order_no`). `question_source_ref` and `question_generation_job` exist. `question.embedding` has **no index yet**.
- `question` has `topic_id` → `topic.subject_id`; there is **no `subject_id` directly on question**. "Same subject" scoping for duplicate detection joins through `topic`.
- Existing hard duplicate guard: unique index `uq_question_content_normalized ON question (LOWER(TRIM(content)))` (001_baseline). Keep it.
- MVC pattern per resource: `repositories/*Repository.js` (ctor takes `database`), `services/*Service.js` (ctor takes `{ repository }`), `controllers/*Controller.js` (ctor takes service, arrow-fn handlers calling `next(error)`), `routes/*Routes.js` (`createXRouter(controller)`), all wired in `backend/src/app.js` `createApp(overrides)` with per-dependency override seams for test injection.
- **The current `questionService.js` still uses legacy statuses `['Active','Draft']` and maps only 4 fields** (id, topicId, rubricId, content, status). It must be rewritten for the new lifecycle and fields. `questionRepository.js` likewise only reads/writes the 4 columns.
- Auth middleware `backend/src/middleware/auth.js` exports `requireAuth`, `requireRole(...roles)`, `requireSubjectScope({param, subjectRepository})`; exposed on `app.authMiddleware` and in `createAuthMiddleware`. `/questions` and `/rubrics` are **currently unguarded** in app.js. Step 3 guards all lecturer write/lifecycle endpoints with `requireAuth + requireRole('LECTURER')`.
- Excel pattern (reuse exceljs@4.4.0): `adminService.importStudents(buffer)` validates the WHOLE file first, returns `{ ok:false, errors:[{row, errors:[...]}] }` with **zero writes** on any error, else `{ ok:true, created:[...] }`. Controller resolves buffer from raw body or base64 (`adminController.resolveImportBuffer`), responds **422** with the error table, **201** on success. Route mounts `express.raw({ type:[XLSX_MIME,'application/octet-stream'], limit:'10mb' })`.
- Backend tests: `npm test` = `node --test "test/*Service.test.js"` — **a new unit-test file only runs if its name ends with `Service.test.js`**. `npm run test:e2e` = jest (Postgres suites self-skip without `TEST_DATABASE_URL`/Docker — keep that). Current baseline: 74 unit tests pass green.
- `InMemoryDatabase` (`backend/src/db/createDatabase.js`) is a brittle SQL-string-matching mock that only recognizes the exact queries current repos issue. **Do NOT grow it for new logic.** New service unit tests inject **fake repositories** (as `adminService.test.js` does with FakeUserRepo/FakeSubjectRepo). Existing `questionService.test.js` uses real repo + InMemoryDatabase with legacy statuses and MUST be updated to the fake-repo style with new statuses.
- Frontend: Vite + React 19, no test runner. Scripts: `build` (`vite build`), `lint` (`oxlint`). Verify FE with `npm run build` and `npm run lint`. `authApi.js` exposes `apiRequest(path,{method,body,headers,raw})` (credentials:'include', sends Origin, throws Error with `.code`/`.details`/`.status`). `adminApi.js` is the service template; `importStudents` sends raw xlsx bytes. **`Questions.jsx` and `Rubrics.jsx` currently call the mock `/api/lecturer/questions|rubrics` (file-backed `lecturerDataController`) via bare `fetch`**, not the real endpoints. Step 3 adds `questionApi.js`/`rubricApi.js` and points the pages at the real `/questions`,`/rubrics`.

## Decisions (made here, grounded in the above)

- **Migration 012 is needed** solely for a cosine HNSW index on `question.embedding` to support near-duplicate search (`CREATE INDEX IF NOT EXISTS idx_question_embedding ON question USING hnsw (embedding vector_cosine_ops);`, mirroring `006_materials.sql`). No new column: all Step-3 fields already exist; same-subject scoping joins through `topic`. The "question purpose" / muc dich field is stored inside the existing `rationale` JSONB (`rationale.purpose`) rather than a new column, keeping it forward-compatible with the Step-4 AI rationale shape and the grading screen.
- **Embedding adapter** is a small interface with a deterministic **mock** implementation; selected by DI/env (`env.embeddingProvider`, default `mock`) so Step 4 drops in Titan. Lives in `backend/src/embedding/`.
- **State machine** is a pure helper module (no DB) so it is trivially unit-tested with the required legal/illegal transition matrix.
- **New unit tests use fake repositories** injected into services (no InMemoryDatabase growth). All new unit-test files are named `*Service.test.js` so the glob runs them.

### Status state machine (question lifecycle)

Legal transitions (`canTransition(from, to)` / `assertTransition`):

| From | Allowed to |
| --- | --- |
| DRAFT | PENDING_REVIEW, APPROVED, ARCHIVED |
| PENDING_REVIEW | APPROVED, REJECTED, DRAFT |
| APPROVED | ARCHIVED, PENDING_REVIEW |
| REJECTED | DRAFT, ARCHIVED |
| ARCHIVED | (terminal — no outgoing) |

Rules enforced in service: approve → target APPROVED, **requires a rubric attached** (409/400 `RUBRIC_REQUIRED` when `rubric_id` null); reject → target REJECTED, **reason required** (400 `REASON_REQUIRED`, stored in `review_note`); archive → target ARCHIVED. Illegal transition → 409 `INVALID_TRANSITION`. Manual create/import default APPROVED when complete (content+topic+rubric present) else DRAFT. Only APPROVED questions are exam-eligible (service exposes the status; exam selection is Step 5).

### Excel import template (questions)

Columns (header row, order-tolerant by label match like adminService): **content**, **topic code**, **Bloom**, **language**, **reference answer**, **key points** (`|`-separated), **rubric code**.
Validation (whole file first, all-or-nothing, zero writes on any error, per-row `{row, errors[]}`): content required; topic code must resolve to an existing topic; Bloom in {REMEMBER,UNDERSTAND,APPLY,ANALYZE}; language non-empty (e.g. VI/EN); rubric code must resolve to an existing rubric; key points split on `|`, trimmed, empties dropped; in-file + DB exact-duplicate content detection (hard). Valid rows insert as `source=IMPORT`, `status=APPROVED`. Controller returns 422 with `{ok:false, errors}`, 201 `{ok:true, created}`. A GET template-download endpoint streams a generated `.xlsx` with the header row.

### Embedding adapter interface + DI seam

`backend/src/embedding/embeddingAdapter.js` — factory `createEmbeddingAdapter(env)` returning `{ embed(text): Promise<number[1024]> }`. `backend/src/embedding/mockEmbeddingAdapter.js` — deterministic pseudo-embedding from normalized text (seeded hash → fill 1024 dims → L2-normalize), stable for equal normalized text. `backend/src/embedding/cosineSimilarity.js` — `cosineSimilarity(a,b)`. Env: `embeddingProvider` (default `'mock'`) added to `backend/src/config/env.js`; `createApp` builds the adapter and injects it into `QuestionService`. Near-duplicate: on create, embed normalized content, compare against same-subject existing embeddings; `>= 0.9` → non-blocking warning returned in the create response (`{ question, warnings:[{type:'NEAR_DUPLICATE', questionId, similarity}] }`); exact-duplicate stays a hard 409.

## Ordered items

- [ ] 1. Add migration `012_question_embedding_index.sql`: HNSW cosine index on `question.embedding` (guarded `IF NOT EXISTS`, mirrors 006). 
      Files: `backend/db/migrations/012_question_embedding_index.sql`
      Verify: `npm run test:e2e` from `backend/` — migrations e2e suite self-skips offline and stays green; file parses (no syntax edit to applied migrations). Confirm `npm test` still green.

- [ ] 2. Add the question status state machine as a pure module with `STATUSES`, `canTransition`, `assertTransition`, and helpers `isExamEligible`.
      Files: `backend/src/domain/questionStatus.js`
      Verify: `node --test "test/*Service.test.js"` after item 9's test exists; standalone `node -e "require('./src/domain/questionStatus')"` loads.

- [ ] 3. Add embedding adapter (interface + mock + cosine) and `embeddingProvider` env.
      Files: `backend/src/embedding/embeddingAdapter.js`, `backend/src/embedding/mockEmbeddingAdapter.js`, `backend/src/embedding/cosineSimilarity.js`, edit `backend/src/config/env.js`.
      Verify: covered by item 9 unit tests; `npm test` green.

- [ ] 4. Extend `questionRepository` to read/write new fields and support filtered list + same-subject embedding scan.
      Add columns to insert/update (bloom_level, language, reference_answer, key_points, source, status, rationale, embedding, created_by, reviewed_by, reviewed_at, review_note); `findAllFiltered({status,bloom,source})`; `findSameSubjectEmbeddings(questionId|topicId, excludeId)` (join through topic.subject_id); `updateStatusFields`. Preserve existing exact-duplicate query.
      Files: `backend/src/repositories/questionRepository.js`
      Verify: `npm run test:e2e` (Postgres CRUD suite self-skips offline, stays green); unit tests in item 9 use a fake repo so they do not touch SQL.

- [ ] 5. Rewrite `questionService` for new fields, validation, lifecycle, near-duplicate warning, and import. Inject `{ repository, embeddingAdapter, rubricRepository, topicRepository }`.
      Methods: list(filters), getById, create (maps all fields; purpose→rationale.purpose; exact-dup hard 409; near-dup non-blocking warning at >=0.9; default status APPROVED/DRAFT), update, approve/reject/archive (use state machine; approve requires rubric; reject requires reason), importQuestions(buffer) (all-or-nothing, per-row errors, source=IMPORT status=APPROVED), buildImportTemplate().
      Files: `backend/src/services/questionService.js`
      Verify: `node --test "test/*Service.test.js"` (item 9) all pass; `npm test` green.

- [ ] 6. Extend `questionController` + `questionRoutes` with list filters, GET import-template, POST import (raw/base64 → 422 on errors / 201), and POST `/:id/approve|reject|archive`.
      Files: `backend/src/controllers/questionController.js`, `backend/src/routes/questionRoutes.js`
      Verify: `npm run test:e2e` (route e2e self-skips offline); manual route table review; `npm test` green.

- [ ] 7. Rubric: performance-level CRUD, lock-prevents-edit, clone-with-version-bump. Extend repository (performance_level reads/writes within the rubric tx; `clone` copies criteria+levels, `version+1`, `is_locked=false`; expose `is_locked`/`version`/`subject_id`), service (block update when `is_locked`; `cloneRubric`; validate levels: label required, min<=max, order_no int), controller + routes (`POST /rubrics/:id/clone`, levels nested under criteria in create/update payload).
      Files: `backend/src/repositories/rubricRepository.js`, `backend/src/services/rubricService.js`, `backend/src/controllers/rubricController.js`, `backend/src/routes/rubricRoutes.js`
      Verify: `node --test "test/*Service.test.js"` (item 9 rubric tests); `npm test` green.

- [ ] 8. Wire everything in `createApp`: build embedding adapter, inject new deps into QuestionService/RubricService, guard `/questions` and `/rubrics` write/lifecycle/import routes with `requireAuth + requireRole('LECTURER')` (keep GET readable per existing behavior or guard per plan). Preserve existing override seams and endpoints.
      Files: `backend/src/app.js`, `backend/src/routes/questionRoutes.js`, `backend/src/routes/rubricRoutes.js`
      Verify: `npm test` green; `npm run test:e2e` self-skips offline and stays green.

- [ ] 9. Unit tests (fake-repo style, files end in `Service.test.js`). Update legacy `questionService.test.js` to new statuses/fields; add coverage for: state-machine legal+illegal transitions; approve-requires-rubric; reject-requires-reason; archive; list filters; Excel import all-or-nothing + per-row errors + source/status; near-duplicate cosine warning at the 0.9 threshold (and no warning below); exact-duplicate still hard-blocks; rubric lock-prevents-edit; clone copies criteria+levels and bumps version; performance-level validation.
      Files: `backend/test/questionService.test.js` (rewrite), `backend/test/questionStatusService.test.js`, `backend/test/questionImportService.test.js`, `backend/test/embeddingService.test.js`, `backend/test/rubricService.test.js` (extend).
      Verify: `cd backend; npm test` — all unit tests pass (74 baseline + new), zero failures. `npm run test:e2e` self-skips offline, green.

- [ ] 10. Frontend services: add `questionApi.js` and `rubricApi.js` (wrap `apiRequest`), covering list(filters), create/update/delete, approve/reject/archive, import (raw xlsx), template download, rubric levels + clone.
      Files: `frontend/src/services/questionApi.js`, `frontend/src/services/rubricApi.js`
      Verify: `cd frontend; npm run lint` clean; `npm run build` succeeds.

- [ ] 11. Update `Questions.jsx`: point at `questionApi` (real `/questions`); add Bloom/language/reference-answer/key-points/purpose fields to the form; add status/Bloom/source filters; Excel import action rendering the per-row error table; approve/reject(reason)/archive actions reflecting the lifecycle; a **disabled** "Generate with AI" placeholder (no generation logic). Keep user-facing strings consistent with existing English UI.
      Files: `frontend/src/pages/lecturer/Questions.jsx`
      Verify: `cd frontend; npm run lint` clean; `npm run build` succeeds.

- [ ] 12. Update `Rubrics.jsx`: point at `rubricApi`; add performance levels per criterion (label/min/max/description/order), and lock + clone controls (disable edit when locked).
      Files: `frontend/src/pages/lecturer/Rubrics.jsx`
      Verify: `cd frontend; npm run lint` clean; `npm run build` succeeds.

- [ ] 13. Integration pass: from `backend/` run `npm test` and `npm run test:e2e`; from `frontend/` run `npm run lint` and `npm run build`. Fix any seam issues. Commit on branch (no push).
      Verify: all four commands succeed; `git -C <worktree> status` shows the intended changes only.

## Notes / assumptions
- "Question purpose" stored in `rationale.purpose` (JSONB) — no schema change, forward-compatible with Step-4 AI rationale.
- Exam-session usage detection for rubric lock is minimal: `is_locked` is wired and edits are blocked when set; a true "opened exam session" trigger arrives in Step 5. Clone always works (produces an unlocked new version).
- Keep Postgres e2e suites self-skipping offline so `npm test` stays green without Docker.
- Do NOT implement RAG/AI generation (Step 4), exams (Step 5), interview/scoring (Steps 6-8). Embedding stays a mock behind a clean seam.
