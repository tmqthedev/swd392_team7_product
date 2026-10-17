# Implementation Plan — AIVES E2E Step 5 (Exam Sessions) + F1/F2/F3 hardening

All paths are absolute under the worktree `d:\Workspace\swd392_team7_product\.worktrees\e2e-step5-exams`.
Relative paths from a coder land in the parent checkout — always use the worktree root above.

Base facts confirmed by exploration:
- Branch: `feat/e2e-step5-exams`, clean.
- Next free migration number: **014** (001–013 applied; 008 already created `exam_session`,
  `exam_session_student`, `exam_session_examiner`, `viva_interview`, `assigned_question`, `qa_turn`).
- Backend: Express 5 `createApp(overrides)` factory, MVC (controller/service/repository), constructor-takes-db
  repositories, test-injection overrides. Unit tests: `npm test` = `node --test "test/*Service.test.js"` with
  injected fakes. E2E: `npm run test:e2e` = jest, Postgres suites self-skip when `TEST_DATABASE_URL` is unset.
- The in-memory mock DB (`backend/src/db/createDatabase.js`) only understands question/rubric/topic/evaluation
  SQL shapes — it does NOT support `exam_session` queries. Therefore new exam-session UNIT tests MUST use
  injected fake repositories (like `questionGenerationService.test.js` / `materialService.test.js`), NOT the
  mock DB. Real SQL is only exercised by the Postgres-gated e2e suite.
- Subject-scope pattern to mirror: `materialService._assertSubjectInScope(user, subjectId)` using
  `subjectRepository.listSubjectIdsForLecturer(lecturerId)`; ADMIN bypasses. Controllers thread the acting
  user as `req.user = { id, role }` (set by `requireAuth`).
- Mock seam pattern to mirror: `embedding/embeddingAdapter.js` + `llm/llmAdapter.js` — a factory that returns
  the mock when `env.awsMockMode` (or provider === 'mock') and only builds a real client otherwise.
- Status state-machine pattern to mirror: `backend/src/domain/questionStatus.js` (pure map + assertTransition).
- Exam-eligible gate: `domain/questionStatus.js` `isExamEligible(status)` === `status === 'APPROVED'`.

Keep scope to Step 5 + F1/F2/F3. Do NOT build the interview engine / Socket.IO (Steps 6-7), scoring (Step 8),
or real STT/TTS/Bedrock live calls (Step 9). Do not delete the legacy routes — only guard them (F2).

---

## Section A — Hardening slice F1 / F2 / F3 (do first)

- [ ] A1. (F3) Hard-fail missing `JWT_SECRET` in production.
      In the `createApp` TokenService wiring, when `runtimeEnv.awsMockMode === false` (prod/real) AND
      `runtimeEnv.jwtSecret` is empty/missing, throw a startup error instead of using the
      `'aives-dev-insecure-secret'` fallback. Keep the fallback only when `awsMockMode === true`
      (local/mock/test). Factor the decision into a small helper `resolveJwtSecret(runtimeEnv)` so it is unit
      testable without booting the whole app (export it from a module, e.g. `backend/src/auth/resolveJwtSecret.js`,
      and use it in app.js).
      Files: `d:\Workspace\swd392_team7_product\.worktrees\e2e-step5-exams\backend\src\auth\resolveJwtSecret.js` (new),
      `d:\Workspace\swd392_team7_product\.worktrees\e2e-step5-exams\backend\src\app.js` (edit).
      Verify: `cd backend && npm test` — new `test/jwtSecretGuardService.test.js` asserts: mock mode + empty secret
      returns the fallback; `awsMockMode:false` + empty secret throws; `awsMockMode:false` + real secret returns it.

- [ ] A2. (F2) Gate the three unauthenticated legacy mounts with `requireAuth`.
      In app.js change the `/topics`, `/evaluations`, and `/api/lecturer` mounts to insert
      `authMiddleware.requireAuth` before each router. Do NOT delete the routers or their controllers;
      `/api/lecturer` still backs EvaluationReview until Step 8. Pass `requireAuth` into the existing router
      factories (or `app.use('/topics', authMiddleware.requireAuth, createTopicRouter(...))`).
      Files: `d:\Workspace\swd392_team7_product\.worktrees\e2e-step5-exams\backend\src\app.js`.
      Verify: `cd backend && npm run test:e2e` offline still passes (suites self-skip); add assertions in the
      exam-session e2e suite (A/below) or a focused e2e that unauthenticated GET `/topics`, `/evaluations`,
      `/api/lecturer/sessions` now return 401. For offline-safe unit coverage, assert the router is mounted with
      the guard via a supertest request against `createApp` with no auth cookie (returns 401).

- [ ] A3. (F1) Thread the acting user + subject scope into `questionService`.
      Add a private `_assertSubjectInScope(user, subjectId)` (mirror materialService) and a
      `_subjectIdForQuestion(questionRow)`/`_subjectIdForTopic(topicId)` helper that derives subject via
      `topicRepository.getById(topicId).subject_id`. Change signatures of `listQuestions`, `getQuestionById`,
      `createQuestion`, `updateQuestion`, `approve`, `reject`, `archive`, `approveBatch` to accept the acting
      `user`. Reads (`listQuestions`, `getQuestionById`) filter / allow only in-scope subjects; writes throw
      403 FORBIDDEN when out of scope. ADMIN bypasses. Inject `subjectRepository` into QuestionService (wire in
      app.js; it already exists there). When a question/topic has no subject_id (mock rows), skip the check
      (same lenient fallback as `_assertRubricInSubject`).
      Files: `backend\src\services\questionService.js`, `backend\src\controllers\questionController.js`
      (pass `req.user`), `backend\src\app.js` (inject subjectRepository).
      Verify: `cd backend && npm test` — extend `test/questionService.test.js` (or new
      `test/questionScopeService.test.js`) with in-scope allow + out-of-scope 403 for a read and a write, plus
      ADMIN bypass. Existing questionService tests must still pass (thread a default ADMIN/undefined user so
      pre-existing tests keep working — add an overload where missing user + no subject_id skips the check).

- [ ] A4. (F1) Thread the acting user + subject scope into `rubricService`.
      Inject `subjectRepository` into RubricService. Add `_assertSubjectInScope(user, subjectId)`. The rubric row
      carries `subject_id` directly. Guard `updateRubric`, `cloneRubric`, `deleteRubric` (writes → 403 out of
      scope); filter `listRubrics` to in-scope subjects and 403/404 `getRubricById` out of scope. ADMIN bypasses;
      rubrics with null subject_id skip the check. Thread `req.user` from the controller.
      Files: `backend\src\services\rubricService.js`, `backend\src\controllers\rubricController.js`,
      `backend\src\app.js`.
      Verify: `cd backend && npm test` — extend `test/rubricService.test.js` (or new
      `test/rubricScopeService.test.js`) with in-scope allow + out-of-scope 403 on edit/clone/delete + ADMIN
      bypass. Existing rubric tests still pass.

---

## Section B — Backend `/exam-sessions` domain

- [ ] B1. Add migration `014_exam_session_step5.sql`: ADDITIVE indexes only (never edit 008). Add
      `CREATE INDEX IF NOT EXISTS` on `exam_session (subject_id)`, `exam_session (status)`, and
      `exam_session_student (student_id)`. No column changes — 008 already has every Nhóm-3 config column.
      Files: `backend\db\migrations\014_exam_session_step5.sql`.
      Verify: `cd backend && npm run test:e2e` — `migrations.e2e.test.js` applies cleanly against Postgres when
      `TEST_DATABASE_URL` is set; offline it self-skips. Re-running applies nothing (idempotent).

- [ ] B2. Create the mock TTS seam. New `backend\src\tts\ttsAdapter.js` factory `createTtsAdapter(env)` returning
      `{ synthesize({ text, language }) -> { audioKey, cached } }`. Mock impl `backend\src\tts\mockTtsAdapter.js`
      returns a deterministic `audioKey` (e.g. `tts/<sha256(language+text)>.mp3`) without any network call and
      records nothing externally. Real Google Chirp is Step 9: `createTtsAdapter` returns the mock whenever
      `env.awsMockMode` or `env.ttsProvider !== 'google'` (add `ttsProvider: process.env.TTS_PROVIDER || 'mock'`
      to env.js); the `google` branch throws `NOT_IMPLEMENTED` (Step 9) rather than calling out.
      Files: `backend\src\tts\ttsAdapter.js`, `backend\src\tts\mockTtsAdapter.js`,
      `backend\src\config\env.js` (add `ttsProvider`).
      Verify: `cd backend && npm test` — new `test/ttsAdapterService.test.js`: mock mode returns a stable audioKey
      for the same (text,language) and distinct keys for different inputs; `google` provider off-mock throws.

- [ ] B3. Add the exam-session status state machine `backend\src\domain\examSessionStatus.js` (mirror
      questionStatus.js): `STATUSES=['DRAFT','OPEN','CLOSED']`, `TRANSITIONS={DRAFT:['OPEN'],OPEN:['CLOSED'],
      CLOSED:[]}`, `canTransition`, `assertTransition` (throws 409 INVALID_TRANSITION).
      Files: `backend\src\domain\examSessionStatus.js`.
      Verify: `cd backend && npm test` — new `test/examSessionStatusService.test.js`: DRAFT→OPEN and OPEN→CLOSED
      allowed; DRAFT→CLOSED, OPEN→OPEN, CLOSED→anything rejected with 409.

- [ ] B4. Extend `examSessionRepository.js` with the queries the service needs (constructor-takes-db pattern):
      `update(id, patch)` (title/config/opens_at/closes_at — allowlisted columns), `listByCreator(createdBy)` /
      `listBySubjectIds(ids)` for scoped listing, `findByIdWithParticipants(id)` (session + student rows +
      examiner rows), `setStudents(examSessionId, studentIds)` (transactional delete+insert, mirror
      `subjectRepository.setLecturers`), `setExaminers(examSessionId, lecturerIds)` (transactional),
      `countApprovedQuestionsInTopic(topicId)` and `listApprovedQuestionIdsInTopic(topicId)`
      (`WHERE topic_id=$1 AND status='APPROVED'`).
      Files: `backend\src\repositories\examSessionRepository.js`.
      Verify: `cd backend && npm run test:e2e` — exercised by the Postgres-gated exam-session e2e suite (B9);
      offline self-skips.

- [ ] B5. Create `backend\src\services\examSessionService.js` (`ExamSessionService`) with injected deps
      `{ examSessionRepository, subjectRepository, topicRepository, appUserRepository, rubricRepository,
      questionRepository, ttsAdapter, db, logger }`. Methods:
      - `_assertSubjectInScope(user, subjectId)` (mirror materialService; ADMIN bypass).
      - `createSession({ user, ... })`: validate title/language(VI|EN)/config ranges, apply defaults
        (main_question_count=3, max_follow_ups_per_question=2, answer_time_limit_sec=120, think_time_sec=0),
        enforce the subject+topic belong to the lecturer's scope and the topic belongs to the subject; status
        starts DRAFT; `created_by = user.id`.
      - `getSession` / `listSessions({ user })`: scope-filtered (ADMIN all; LECTURER own/in-scope subjects).
      - `updateSession`: DRAFT-only edits of title/config/schedule, re-validate ranges, scope-guarded.
      - `pickMainQuestions(topicId, count)` ("Chọn câu chính"): random selection of `count` APPROVED question ids
        in the topic (reuse `questionRepository.listApproved... `). Exposed for Steps 6-7; used by `openSession`
        only to verify count. Build the interview engine NOT here.
      Config validation ranges: main_question_count 1..10, max_follow_ups_per_question 0..5,
      answer_time_limit_sec 10..600, think_time_sec 0..300.
      Files: `backend\src\services\examSessionService.js`.
      Verify: `cd backend && npm test` — new `test/examSessionService.test.js` (injected fakes) covers CRUD +
      config validation (bad language, out-of-range config → VALIDATION_ERROR) + scope allow/deny.

- [ ] B6. Add roster + examiner methods to `examSessionService.js`:
      - `setStudents({ user, examSessionId, codes })`: scope-guard the session; parse the pasted list (split on
        newlines/commas, trim, drop blanks, dedupe); resolve each code via `appUserRepository.findByCode`;
        a code is invalid if unknown OR its role !== 'STUDENT'. ALL-OR-NOTHING: if ANY row is invalid, return
        `{ ok:false, errors:[{ code, error }] }` and write NOTHING (mirror `importQuestions`/`importStudents`).
        On success call `examSessionRepository.setStudents` and return `{ ok:true, students:[...] }`.
      - `setExaminers({ user, examSessionId, lecturerIds })`: scope-guard; validate each id resolves to a
        LECTURER; write via `examSessionRepository.setExaminers`.
      Files: `backend\src\services\examSessionService.js`.
      Verify: `cd backend && npm test` — extend `test/examSessionService.test.js`: unknown code → all-or-nothing
      per-row error with ZERO writes; non-student code rejected; happy path writes all; examiner assignment
      allow + non-lecturer reject.

- [ ] B7. Add `openSession` / `closeSession` to `examSessionService.js`:
      - `openSession({ user })`: scope-guard; `assertTransition(status,'OPEN')`; count APPROVED exam-eligible
        questions in the session topic — if `< main_question_count` throw 409 `NOT_ENOUGH_QUESTIONS`; LOCK the
        rubric(s) used by those questions (`rubricRepository` set `is_locked=true`; add a
        `lockById(rubricId)`/`setLocked` repo method if absent — the Step-3 lock path is currently unreachable,
        this wires it); pre-generate main-question audio via `ttsAdapter.synthesize` for the selected main
        questions (stub/enqueue; NO real call); set status OPEN and `opens_at=now()`. Do the state flip + rubric
        lock inside `db.withTransaction` when available.
      - `closeSession({ user })`: scope-guard; `assertTransition(status,'CLOSED')`; set status CLOSED,
        `closes_at=now()`.
      Files: `backend\src\services\examSessionService.js` (+ `rubricRepository.setLocked` if needed).
      Verify: `cd backend && npm test` — extend `test/examSessionService.test.js`: illegal transition (e.g. open
      an already-CLOSED session) → 409; open blocked when too few APPROVED questions → 409; open locks the rubric
      (fake rubricRepository records the lock); open calls ttsAdapter.synthesize once per main question (spy);
      close transitions OPEN→CLOSED.

- [ ] B8. Create controller + router + wire into app.js.
      `backend\src\controllers\examSessionController.js` (class, arrow methods, `next(error)` pattern, threads
      `req.user`): `create`, `list`, `getById`, `update`, `setStudents`, `setExaminers`, `open`, `close`.
      `backend\src\routes\examSessionRoutes.js` `createExamSessionRouter(controller, { requireAuth, requireRole })`:
      all routes guarded by `requireAuth` + `requireRole('LECTURER')`. Routes:
      `POST /`, `GET /`, `GET /:id`, `PUT /:id`, `PUT /:id/students`, `PUT /:id/examiners`,
      `POST /:id/open`, `POST /:id/close`. In app.js build the repository/service/controller and
      `app.use('/exam-sessions', createExamSessionRouter(...))`. `setStudents` returns 422 with
      `{ ok:false, errors }` on invalid roster (mirror the question import 422 shape).
      Files: `backend\src\controllers\examSessionController.js`, `backend\src\routes\examSessionRoutes.js`,
      `backend\src\app.js`.
      Verify: `cd backend && npm test` passes (controller logic covered via service tests; add a small
      `test/examSessionController` only if logic beyond passthrough). `npm run test:e2e` offline self-skips.

- [ ] B9. Add a Postgres-gated e2e suite `backend\test\examSessions.e2e.test.js` (jest, mirror
      `materials.e2e.test.js`): skip entire suite unless `TEST_DATABASE_URL` is set. Cover create→set students
      (valid + unknown-code 422)→set examiners→open (success + NOT_ENOUGH_QUESTIONS 409 + rubric locked)→close;
      and F2 (unauthenticated `/topics`,`/evaluations`,`/api/lecturer/sessions` → 401).
      Files: `backend\test\examSessions.e2e.test.js`.
      Verify: `cd backend && npm run test:e2e` — passes with Postgres; self-skips offline. Do NOT weaken the
      existing 163 unit + 81 e2e.

---

## Section C — Frontend

- [ ] C1. Add the exam-session API service `frontend\src\services\examSessionApi.js` (mirror `materialApi.js` /
      `questionApi.js`, using `apiRequest` from `authApi`): `listExamSessions()`, `getExamSession(id)`,
      `createExamSession(body)`, `updateExamSession(id, patch)`, `setExamStudents(id, codesText)`,
      `setExamExaminers(id, lecturerIds)`, `openExamSession(id)`, `closeExamSession(id)`. Also `listSubjects()` /
      `listTopics()` as needed (reuse existing endpoints).
      Files: `frontend\src\services\examSessionApi.js`.
      Verify: `cd frontend && npm run build` compiles.

- [ ] C2. New "Kỳ thi (mới)" page `frontend\src\pages\lecturer\ExamSessions.jsx`: a form (title, subject, topic,
      language VI/EN, config fields main_question_count/max_follow_ups_per_question/answer_time_limit_sec/
      think_time_sec with the Nhóm-3 defaults prefilled), a textarea to paste the student-code list, an examiner
      picker, Open/Close controls with status display, and per-row roster validation errors surfaced from the
      422 `{ ok:false, errors }` response. Follow the existing UI components (`Card`, `Button`, `Table`, `Input`,
      `Feedback`) and the `Materials.jsx` page pattern. Keep user-facing strings consistent with the existing
      frontend language (English UI copy as in the current pages).
      Files: `frontend\src\pages\lecturer\ExamSessions.jsx`, `frontend\src\App.jsx` (add route
      `/lecturer/exam-sessions`), `frontend\src\components\Sidebar.jsx` (add nav link).
      Verify: `cd frontend && npm run build` compiles; `npm run lint` — report warnings vs errors.

- [ ] C3. Rework `frontend\src\pages\lecturer\Sessions.jsx`: replace the raw
      `fetch('/api/lecturer/sessions')` with `listExamSessions()` from the new API service so the lecturer
      session LIST reads the real `/exam-sessions` API; adapt the table columns to the real exam_session shape
      (title, subject/topic, language, status, config) and keep the search box. EvaluationReview.jsx stays on
      `/api/lecturer` until Step 8 — do not touch its data path (it keeps working behind the F2 `requireAuth`).
      Files: `frontend\src\pages\lecturer\Sessions.jsx`.
      Verify: `cd frontend && npm run build` compiles; `npm run lint` — report warnings vs errors.

---

## Loop stop contract (if the implement/review loop runs this plan)

The reviewer/aggregator writes
`d:\Workspace\swd392_team7_product\.agents\tasks\e2e-step5-exams\review.json` with top-level `"verdict"` set to
`"APPROVED"` when there are no blocking findings and `"CHANGES_REQUESTED"` otherwise, and is always the loop's
last child.

## Final verification (whole task)

- Backend: `cd d:\Workspace\swd392_team7_product\.worktrees\e2e-step5-exams\backend && npm install && npm test`
  (node --test) all pass; `npm run test:e2e` passes with Postgres / self-skips offline. 163 unit + 81 e2e
  baseline not weakened.
- Frontend: `cd d:\Workspace\swd392_team7_product\.worktrees\e2e-step5-exams\frontend && npm install && npm run build`
  compiles; `npm run lint` warnings-vs-errors reported.
