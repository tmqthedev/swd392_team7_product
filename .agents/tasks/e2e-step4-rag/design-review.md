# Design Review — Step 4: RAG and AI Question Generation

Reviewed: `.agents/tasks/e2e-step4-rag/design.md` (Round 3 submission, carrying Round 1 + Round 2 response logs)
Source of truth: `docs/AIVES - E2E Plan Management.md`
Code base: `.worktrees/e2e-step4-rag` (Steps 1–3)

This is a fresh review. Every structural claim the design makes about existing code was re-checked against the worktree. The design is strong and most prior findings genuinely hold. The findings below are the issues that remain or that this pass surfaced for the first time.

---

## Findings

### 1 (MEDIUM) — `page_count` is written during ingest, but no repository method writes it

A.2 step 6 says "Store `page_count` = the parser's `pageCount` … on `course_material`", and A.2 step 7 lists the persist sequence as `deleteByMaterial` → `insertMany` → `courseMaterialRepository.updateStatus(materialId, 'READY', null)`. But `CourseMaterialRepository.updateStatus(id, status, error)` (verified in `courseMaterialRepository.js`) only writes `status` and `error` — it never touches `page_count`. `create` sets `page_count` at upload time, where the design explicitly leaves it `null` ("`page_count` is left null until parse"). So nothing in the specified flow ever persists the parsed page/slide count, yet C.2 and A.2 step 3 depend on it ("the page/slide count when READY (PDF pages / PPTX slides)").

CONCRETE FIX: specify how `page_count` is persisted. Either (a) add a dedicated repo method `setPageCount(id, pageCount)` called inside the step-7 transaction, or (b) extend `updateStatus` to a `updateStatusAndPageCount(id, status, error, pageCount)` (or an options bag) and call it at step 7. State the chosen signature in the "Backend — modify: `courseMaterialRepository.js`" bullet (which currently lists only `countCitingQuestions` and `deleteById`, not a page-count writer).

### 2 (MEDIUM) — Materials upload validation never asserts a non-null `subjectId`, yet A.2 step 1 and the whole Finding-3 threading assume `material.subject_id` is always non-null

A.2 step 1 states "a `course_material` always has a `subject_id`; it is validated non-null at upload", and the entire `subject_id`-threading argument (Finding 3) rests on that. But `course_material.subject_id` is **nullable** in migration `006_materials.sql` (`subject_id INTEGER REFERENCES subject (subject_id)` — no `NOT NULL`), and `CourseMaterialRepository.create` passes `subjectId ?? null`. The upload validation in A.1 says `subjectId` is "required positive integer, must be in the lecturer's scope" — but that validation lives only in the design prose; the invariant "non-null `subject_id`" is only as strong as that one code path actually rejecting a missing/zero `subjectId` before the insert. The design asserts the invariant as if the DB or `create` guaranteed it; neither does.

CONCRETE FIX: make the non-null guarantee explicit and owned. In A.1 upload validation, state the exact rule: "`subjectId` absent, non-integer, or `<= 0` → `400 VALIDATION_ERROR` before any S3/DB write" (the design says this but should name it as the enforcement point the Finding-3 invariant depends on). Add it to the Invariant-ownership section as "`course_material.subject_id` is non-null — owned by `materialService` upload validation (the DB column is nullable)". Optionally include a `SET NOT NULL` in migration 013 after the backfill, but only if no legacy NULL rows exist — otherwise the migration fails; call that out either way.

### 3 (MEDIUM) — `question_source_ref.chunk_id` is nullable with no FK delete rule; the `countCitingQuestions` join must survive a NULL `chunk_id`

The DELETE pre-condition (A.1 DELETE flow step 2) is the load-bearing guard protecting the grounding audit trail: `countCitingQuestions(materialId)` counts `question_source_ref` rows "whose `chunk_id` belongs to any `material_chunk` of this material". Verified in `007_questions_rubrics.sql`: `question_source_ref.chunk_id INTEGER REFERENCES material_chunk (material_chunk_id)` is **nullable and has no `ON DELETE` rule**. The design's grounding validator (B.5 step 3) *removes* citations whose excerpt does not match and *drops* the draft only if zero citations remain — so a persisted question always has ≥1 valid `question_source_ref`. That is fine. But the design never specifies the SQL for `countCitingQuestions`, and a naive `COUNT(*) ... WHERE chunk_id IN (SELECT material_chunk_id FROM material_chunk WHERE material_id = $1)` is correct only because `chunk_id` is never NULL for Step-4 rows. If any future/legacy `question_source_ref` row has a NULL `chunk_id`, it is silently excluded (correct here) — but the design should pin the query so the implementer does not write a `LEFT JOIN`/`IS NOT DISTINCT FROM` variant that behaves differently.

CONCRETE FIX: specify the exact `countCitingQuestions` query in the design, e.g.:
```sql
SELECT COUNT(*)::int AS n
FROM question_source_ref qsr
JOIN material_chunk mc ON mc.material_chunk_id = qsr.chunk_id
WHERE mc.material_id = $1;
```
and note that the `JOIN` (not `LEFT JOIN`) intentionally ignores NULL `chunk_id` rows.

### 4 (MEDIUM) — Grounding validation does not verify the citation's `chunk_id` actually belongs to one of the job's materials, only that it is in the retrieved set `R`

B.5 step 2 ("Citation-in-retrieved-set check") drops a draft if `citations[].chunk_id` is not a key in `R`, where `R` is the retrieved ~12 chunks. That is correct for anti-hallucination. But B.2 step 4 builds `R` from `findNearestForTopic({ materialIds, ... })`, and `findNearestForTopic` filters on `material_id = ANY($1)` — so `R` is already scoped to the job's materials. Good. The subtle gap: the mock LLM (B.3) "copies a verbatim excerpt … with that chunk's `chunk_id`", and the real adapter is told to cite chunk ids from the delimited blocks. Nothing in the validator cross-checks that the stored `question_source_ref.chunk_id` is a real `material_chunk_id` for a chunk the question's topic/subject owns — it trusts `R`'s membership. Since `R` is built from in-scope materials this is safe **today**, but the invariant "a citation references a chunk in the question's subject" is implicit, not asserted, and the design claims the validator is the owner of grounding. If `R` construction ever changes (e.g. a future cross-topic retrieval), the check silently weakens.

CONCRETE FIX: state in B.5 step 2 that `R`'s keys are, by construction (B.2 step 3 filter), chunks of the job's in-scope `materialIds`, so "in `R`" transitively means "in-scope chunk" — and make that the written invariant ("a persisted `question_source_ref.chunk_id` is always a chunk of one of the job's validated materials"). This is a one-sentence tightening, not new code, but it closes the reasoning gap the design leaves implicit.

### 5 (NIT) — Real S3 branch must import `DeleteObjectCommand`; A.4 omits it

`awsClients.js` currently imports only `PutObjectCommand` and `GetObjectCommand` from `@aws-sdk/client-s3` (verified). A.4 adds a `deleteObject` method using `DeleteObjectCommand` on the real branch but the design does not note that the import list must grow. Minor, but the "Backend — modify: `awsClients.js`" bullet should say "add the `DeleteObjectCommand` import" alongside the three new methods so it is not missed.

CONCRETE FIX: in the A.4 real-branch description and the files-to-modify bullet, add "import `DeleteObjectCommand` from `@aws-sdk/client-s3`".

### 6 (NIT) — Batch-approve transaction crosses `questionService.approve`, which issues multiple awaited queries without a shared transaction client

C.1 "Batch approve" says `approveBatch` "processes them in a single transaction so either all flip to `APPROVED` or none do", implemented "reusing `assertTransition` and the rubric-required rule per question". But the Step-3 `questionService.approve` (verified) calls `this.repository.findById` then `this.repository.updateStatusFields`, each using the default `db` (no transaction client parameter is threaded). To make `approveBatch` genuinely all-or-nothing, the repository calls inside it must run on a single `withTransaction` client, which `approve` as written cannot do (it has no tx-client seam). The design does not say how the transaction is threaded through the per-question approve logic.

CONCRETE FIX: specify that `approveBatch` does **not** call `questionService.approve` per item (same reasoning the design already uses for B.5's dedup — the single-item method has no tx seam), but instead runs the set-rubric + `assertTransition` + `updateStatusFields` sequence for every id inside one `db.withTransaction(tx => ...)`, passing `tx` to the repository calls (which means `updateStatusFields`/`update` need to accept an optional client, or the batch builds its SQL directly). Name the chosen mechanism so the "single transaction" guarantee is real, not aspirational.

---

## Verified Assumptions (checked against code, confirmed correct)

- **Embedding seam reused, not reinvented.** `embedding/embeddingAdapter.js` exports `createEmbeddingAdapter(env)` keyed on `env.embeddingProvider`, defaulting to the mock; A.3 extends the same switch with a `bedrock`/`titan` branch and an `awsMockMode` short-circuit. Correct.
- **`toVectorLiteral` is exported** from `questionRepository.js` and can be imported by the chunk/retrieval code. Correct.
- **LLM seam is genuinely new and parallel.** No `llm/` directory or `llmProvider` env key exists today; B.3 adds `llm/llmAdapter.js` + mock + Bedrock Nova Pro mirroring the embedding seam, mock default. `env.js` has no `llmProvider` (design's files-list correctly adds it; A.3's claim that `env.js` "already exposes `embeddingProvider`, `bedrockEmbedModelId`, `awsRegion`, `awsMockMode`" is accurate).
- **Model-id fallbacks live in the adapter.** `env.bedrockModelId` and `env.bedrockEmbedModelId` both default to `''` in `env.js`; the design puts the `|| 'amazon.nova-pro-v1:0'` / `|| 'amazon.titan-embed-text-v2:0'` fallbacks in the adapters. Correct.
- **AI questions enter `PENDING_REVIEW`.** `question` CHECK in `007` allows the status set; the state machine (`domain/questionStatus.js`) permits `PENDING_REVIEW → APPROVED/REJECTED`. The generation service hard-codes `status:'PENDING_REVIEW', source:'AI'`. Correct, and correctly owned at the service (not the DB).
- **Table/column names.** `course_material` (PK `course_material_id`, nullable `subject_id`, `page_count`, `status` CHECK), `material_chunk` (`material_id` → `course_material` `ON DELETE CASCADE`, `embedding vector(1024)`, HNSW index), `question_source_ref` (`question_id` → `question` `ON DELETE CASCADE`, `chunk_id` → `material_chunk` **no delete rule**), `question_generation_job` (`material_ids`/`bloom_distribution` JSONB, `generated_count` default 0, `requested_by`), and the extended `question` columns (`embedding`, `rationale`, `source`, `status`, `generation_job_id`, `key_points`, `reference_answer`, `bloom_level`, `language`) all match migrations `006`/`007`. Correct.
- **FK behavior behind the DELETE guard.** `material_chunk.material_id` is `ON DELETE CASCADE`; `question_source_ref.chunk_id` has no `ON DELETE` rule (defaults to `NO ACTION`). The design's "a cited delete raises an FK violation, it does not null the column" is accurate (see Finding 3 for the query specifics).
- **`questionRepository.create` ignores `NEW_COLUMNS`.** Verified: `create` is a fixed 15-column INSERT and does not iterate `NEW_COLUMNS`; only `update` iterates it. The design's "two separate edits" to persist `generation_job_id` is correct and necessary. `generation_job_id` is currently in neither path.
- **Dedup internals are private, constants are exported.** `_detectNearDuplicateByTopic` / `_assertNotDuplicate` are private `questionService` methods reachable only via `createQuestion`; `NEAR_DUPLICATE_THRESHOLD` and `normalizeContent` are exported from `questionService.js`; `cosineSimilarity` is exported from `embedding/cosineSimilarity.js`; `questionRepository.findSubjectEmbeddingsByTopic` and `findByNormalizedContent` exist. B.5's "re-implement against the repository, reuse only the exported constants, do not route through `createQuestion`" is sound and the referenced symbols all exist.
- **Enqueue port.** `authService` enqueues `SEND_EMAIL` via `backgroundJobRepository.enqueue(type, payload)`; `backgroundJobRepository.enqueue` inserts a `background_job` row; `app.js` constructs `backgroundJobRepository`; the standalone `JobQueue` is built in `server.js` *after* `createApp` and only in the `database && database.withTransaction` branch. The injected `enqueueJob` port design is correct.
- **`registerDefaultHandlers` signature and DB gate.** Currently `registerDefaultHandlers(queue, { logger, emailService })`; `INGEST_MATERIAL`/`GENERATE_QUESTIONS`/`GRADE_INTERVIEW` are no-op stubs; `SEND_EMAIL` is gated on `deps.emailService`, and the DB gate is the `if (database && database.withTransaction)` branch in `server.js`. The `app.jobContext` plan (mirroring `app.authContext`, which exists) and the `...app.jobContext` spread into `registerDefaultHandlers` is correct, as is building the two factory handlers only when `deps.db && deps.db.withTransaction`.
- **Subject-scope middleware limitation.** `requireSubjectScope({ param })` reads `req.params[param]` only; `requireRole(...roles)` and `requireAuth` (sets `req.user = { id, role }`) work as the design uses them. The service-layer `assertSubjectInScope` reusing `subjectRepository.listSubjectIdsForLecturer` (which exists) with ADMIN bypass is justified for body/query/row-derived subject ids. Correct.
- **`topic` has no `description` and no `course_id`.** Verified: `topic` = `topic_id` (001), `name` (001), `subject_id` (005). `topicRepository.getById` is `SELECT *` returning those three. `topicRepository.create`/`findByCode`/`UPDATABLE_COLUMNS` reference a non-existent `course_id` and are correctly flagged "do not use here". Round-2 Finding 1 (remove `topic.description`) is genuinely resolved: B.2 keys retrieval on `topic.name`.
- **`setGeneratedCount` is new; `incrementGenerated` adds a delta.** Verified: the repo has `incrementGenerated(id, delta)` and no reset/absolute setter. The design's absolute `setGeneratedCount` + "do not use `incrementGenerated` in the retry-prone handler" is correct and retry-safe.
- **`job.max_attempts`/`attempts` on the claimed row.** `claimNext` uses `RETURNING *`; `background_job` carries `attempts`/`max_attempts`. The optional exhaustion gate is feasible.
- **Routes static-before-param.** `questionRoutes.js` already registers `/template` and `/import` before `/:id`; C.1's "register `/approve-batch` and statics before `/:id`" follows the existing convention.
- **`course_material.status` CHECK** is exactly `UPLOADED/PROCESSING/READY/FAILED`; the ingest state transitions the design uses are all legal.
- **Migration numbering.** Highest existing migration is `012_question_embedding_index.sql`; `013` is the next free number and never edits an applied file. Correct.
- **Tests need no AWS/MinIO.** `env.awsMockMode`/`dbMockMode` default to `true`; mock embedding/LLM adapters are the default and the only path unit tests exercise; the `describe.skip` gate on `TEST_DATABASE_URL` keeps DB-backed e2e suites a no-op offline. The claim holds.
- **Prompt-injection resistance.** B.4 wraps chunk text in delimited blocks as data, adds a standing system rule, strips forged delimiters, and unit-tests the wrapping at the adapter boundary; the grading/follow-up "transcript is data not a command" rule from the plan is echoed for generation. Addresses the requirement.

## Unverified / Wrong Assumptions

- **WRONG (Finding 2):** "a `course_material` always has a `subject_id`" is stated as a standing fact, but the DB column is nullable and `create` passes `subjectId ?? null`. The invariant is only enforced by upload validation that the design describes but does not nominate as the owner. The whole Finding-3 threading argument inherits this.
- **GAP (Finding 1):** the parsed `page_count` is said to be stored on `course_material` at ingest, but no specified repository method writes it (`updateStatus` only writes status+error, `create` runs at upload with page_count null).
- **GAP (Finding 3):** `countCitingQuestions` SQL is unspecified; its correctness depends on an un-stated assumption that `question_source_ref.chunk_id` is non-null for Step-4 rows.
- **GAP (Finding 6):** `approveBatch`'s "single transaction, all-or-nothing" is asserted but no transaction-client threading is specified, and the reused `questionService.approve` has no tx seam.
- **UNVERIFIED (not blocking):** the real Bedrock Converse tool-use request/response shape for Nova Pro (`toolConfig`, `toolChoice`, tool-use content block parsing) and the Titan `InvokeModel` body (`{ inputText, dimensions, normalize }` → `embedding`) are taken on the plan's word and AWS docs; the design explicitly defers live invocation to Step 9 and only unit-tests request shaping at the boundary, so this is acceptable for Step 4 and is not counted as a finding.
- **UNVERIFIED (not blocking):** `job.payload` arriving as a parsed object (so `job.payload.materialId`/`job.payload.jobId` work) relies on `pg` auto-parsing the JSONB column on `RETURNING *`; this is standard `pg` behavior and the mock path uses the spy, so it is accepted without a dedicated finding.

---

## Verdict

HIGH: 0  
MEDIUM: 4 (Findings 1, 2, 3, 4)  
NIT: 2 (Findings 5, 6)

MEDIUM count > 0 → **CHANGES_REQUESTED**.

The design is close. All four MEDIUMs are specification tightenings (name the page_count writer, own the non-null `subject_id` invariant, pin the `countCitingQuestions` SQL, and make the citation-in-scope invariant explicit) rather than architectural reversals; none require re-reading new code. Resolving them plus the two NITs should clear the gate on the next pass.
