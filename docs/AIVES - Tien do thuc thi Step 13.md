# AIVES: Tiến độ Thực thi Kế hoạch Step 13 (Cập nhật liên tục)

Tài liệu này theo dõi đối chiếu và ghi nhận toàn bộ tiến độ thực hiện theo kế hoạch thực thi mới nhất được thống nhất với chủ dự án.

---

## 1. Bảng tổng hợp tiến độ các bước

| Bước | Nội dung | Nhánh / PR | Trạng thái | Ghi chú & Kết quả |
| :--- | :--- | :--- | :--- | :--- |
| **Bước 0** | Merge #41, #42, Deploy prod, Smoke test, Chẩn đoán 409 | `main` | ✅ **HOÀN THÀNH** | PR #41 & #42 merged, deploy AWS prod thành công. Migration 020 & 021 đã áp. Smoke 200/404/401 pass. 409 chẩn đoán do dữ liệu và đã ghi nhận trong `docs/AIVES - Peer Review Step 13.md`. |
| **Bước 1** | **PR-3a**: `fix(step13): end abandoned interviews after deadline` (F9) | `fix/step13-end-abandoned-interviews` (PR #43) | ✅ **HOÀN THÀNH & ĐÃ MERGE** | Đã sweep phiên quá hạn sang `COMPLETED`, sinh `viva_result`, enqueue `GRADE_INTERVIEW`, seed job `EXPIRE_INTERVIEWS`. 500/500 unit tests pass. PR #43 CI 5/5 pass, merge vào `main` (commit `1dee638`). |
| **Bước 2** | **PR-3b**: `feat(step13): student results and examiner-only grading` (F10) | `feat/step13-student-results-and-examiner-grading` (PR #44) | ✅ **HOÀN THÀNH & ĐÃ MERGE** | PR #44: `https://github.com/tmqthedev/swd392_team7_product/pull/44`. Phân quyền chấm chỉ cho examiner/creator (`gradingService`). Allowlist kết quả SV an toàn (`studentResultView`, `meRoutes`). Giao diện SV xem kết quả (`Results.jsx`, `ResultDetail.jsx`) và GV review (`EvaluationReview.jsx`). 512/512 unit tests, 120/120 e2e tests pass. Frontend lint 0 error, build pass. CI 5/5 pass, merge vào `main` (commit `d7d1f83`). |
| **Bước 3** | **PR-3c**: `feat(step13): lecturer topic management UI` (F4) | `feat/step13-lecturer-topic-ui` (PR #45) | ✅ **HOÀN THÀNH & ĐÃ MERGE** | PR #45: `https://github.com/tmqthedev/swd392_team7_product/pull/45`. Quản lý chủ đề thi cho GV (`/lecturer/topics`), API client `services/topicApi.js`, dropdown môn học từ `getExamSessionOptions().subjects`, thống kê số câu hỏi đã duyệt, lọc và tìm kiếm, modal xác nhận xoá xử lý lỗi 409 FK toàn vẹn. 512/512 unit tests, 120/120 e2e tests pass, frontend lint 0 error, build pass. CI 5/5 pass, merge vào `main` (commit `d972c95`). |
| **Bước 4** | **PR-3d**: `fix(step13): backlog` (Backlog bug fixes) | `fix/step13-backlog-fixes` (PR #46) | ✅ **HOÀN THÀNH & ĐÃ MERGE** | PR #46: `https://github.com/tmqthedev/swd392_team7_product/pull/46`. Khắc phục trọn vẹn 5 lỗi backlog: lọc `topicId` câu hỏi, thêm migration 022 bảo lưu thứ tự `order_index` tiêu chí rubric, retry transient cho `GENERATE_QUESTIONS`, chuẩn hóa và lưu `pause_count` vào turn, cô lập retry budget mạng Bedrock khỏi vòng lặp sửa tiêu chí chấm thi. 518/518 unit tests, 120/120 e2e tests pass. CI 5/5 pass, merge vào `main` (commit `1fa81ef`). |
| **PR-4** | Cập nhật tài liệu & đặc tả (F1–F10, Phụ lục A/B, E2E plan v2) | `docs/step13-specs-sync` (PR #47) | ✅ **HOÀN THÀNH & ĐÃ MERGE** | PR #47: `https://github.com/tmqthedev/swd392_team7_product/pull/47`. Đồng bộ toàn bộ tài liệu theo code và API surface mới: F4 (UI Topics), F6 (lọc topicId & order_index), F9 (sweep phỏng vấn quá hạn & tín hiệu giọng nói), F10 (phân quyền chấm examiner & kết quả SV), Phụ lục A/B và E2E Plan v2 (xác nhận 7 backlog mục đã xong). CI 5/5 pass, merge vào `main` (commit `11ebe44`). |
| **PR-5** | Viết lại script test `scripts/e2e-restrict.mjs` | `test/step13-e2e-restrict-script` (PR #48) | ✅ **HOÀN THÀNH & ĐÃ MERGE** | PR #48: `https://github.com/tmqthedev/swd392_team7_product/pull/48`. Viết lại toàn diện script kiểm thử bảo mật tự động: 35+ checks bao phủ 401 unauthenticated matrix, CSRF origin guard, hardened API surface (404 audio, 400 TTS path traversal), student result isolation (404 unfinalized & quét chống rò rỉ rationale), và examiner-only write guard. Chạy trực tiếp qua CloudFront prod đạt 35/35 pass. CI 5/5 pass, merge vào `main` (commit `84da7b7`). |
| **E2E v2** | Chạy E2E v2 (G0 → G4) trên AWS production | `main` | ⏳ **ĐANG THỰC HIỆN** | Kiểm thử đầu cuối với tài khoản và dữ liệu thật, báo cáo tại `docs/ket-qua-e2e-v2.md`. |

---

## 2. Chi tiết thực hiện từng bước

### Bước 0: Merge, Deploy và Smoke trên Prod
- **Thực thi:**
  - Merge PR #41: `fix/step13-exam-session-setup-by-subject` vào `main`.
  - Merge PR #42: `fix/step13-secure-api-surface` vào `main`.
  - Workflow GitHub Actions Deploy trigger tự động, build và deploy thành công lên EC2 (`i-0797c55ad243db382`) và CloudFront (`https://d36ezmiqpl9miu.cloudfront.net`).
- **Smoke test production:**
  - `GET /health` -> 200 OK (`mockMode: false`, `dbMockMode: false`).
  - `POST /api/audio/upload-url` -> 404 NOT FOUND (đã gỡ route audio thừa).
  - `GET /api/tts/x.wav` (không cookie) -> 401 UNAUTHORIZED.
  - Log backend qua SSM xác nhận migration 020 và 021 đã áp thành công; log 4xx chỉ in 1 dòng kèm `errorCode`.
- **Chẩn đoán 409:**
  - Câu hỏi 3 & 4: Đã ở trạng thái `APPROVED` trong DB Postgres, gọi duyệt tiếp kích hoạt máy trạng thái từ chối `409 INVALID_TRANSITION` (đúng logic).
  - Kỳ thi session 6: Cấu hình `topic_id = 2`, `main_question_count = 3`, `bloom_distribution = {"REMEMBER": 3}` nhưng topic 2 chỉ có 2 câu approved (1 APPLY, 1 ANALYZE, 0 REMEMBER) -> hệ thống từ chối `409 NOT_ENOUGH_QUESTIONS` (đúng logic bảo vệ đề thi).
  - Kết luận đã ghi đầy đủ tại `docs/AIVES - Peer Review Step 13.md`.

---

### Bước 1 (PR-3a): End Abandoned Interviews After Deadline (F9)
- **Mục tiêu:** Tự động kết thúc các phiên phỏng vấn bị bỏ dở khi đã quá `deadline_at + grace_sec`, tạo `viva_result` và đẩy job `GRADE_INTERVIEW` để đảm bảo bài thi luôn được chấm điểm.
- **Thực thi:**
  - `VivaInterviewRepository.listOverdueActive({ before, limit })`: Lấy các phiên `IN_PROGRESS` / `PAUSED` có `deadline_at < before`.
  - `InterviewService.expireOverdueInterviews({ graceSec, limit })`: Duyệt các phiên quá hạn, gọi `_endInterview` với lý do `DEADLINE_REACHED`. Xử lý an toàn từng phiên (lỗi ghi `processing_failure`).
  - `BackgroundJobRepository.existsPending(type)`: Kiểm tra job đang chờ/chạy để tránh tạo chuỗi job trùng lặp.
  - Handler `EXPIRE_INTERVIEWS` tự động lên lịch chạy lặp lại theo chu kỳ `INTERVIEW_SWEEP_INTERVAL_SEC`.
  - Seed job lúc khởi động trong `server.js`.
  - Cấu hình env: `INTERVIEW_SWEEP_INTERVAL_SEC` (60s), `INTERVIEW_SWEEP_GRACE_SEC` (30s).
- **Kiểm thử:**
  - Unit tests: 500/500 pass.
  - E2E test cho SQL `listOverdueActive` trong `interviewEngine.e2e.test.js`.
  - Frontend lint 0 error, build thành công.
- **Kết quả:**
  - Tạo PR #43: `https://github.com/tmqthedev/swd392_team7_product/pull/43`.
  - GitHub Actions CI pass 5/5.
  - Đã merge vào `main` (commit `1dee638`).

---

### Bước 2 (PR-3b): Student Results and Examiner-Only Grading (F10)
- **Mục tiêu:**
  1. Giới hạn quyền chấm thi (ghi: `adjustCriterionScore`, `finalizeResult`, `reopenResult`, `regradeResult`) chỉ cho `ADMIN`, các examiner trong `exam_session_examiner` của kỳ thi, hoặc người tạo kỳ thi `created_by`. Giảng viên cùng môn nhưng không phải examiner chỉ có quyền xem (read-only).
  2. Cho phép sinh viên xem điểm thi của mình (`GET /api/me/results` và `GET /api/me/results/:id`), **chỉ khi** bài thi đã ở trạng thái `FINALIZED`. Trả về payload allowlist tuyệt đối an toàn qua `studentResultView.js` và `assertStudentSafe`.
- **Thực thi chi tiết:**
  - **Repository Layer (`backend/src/repositories/vivaResultRepository.js`):**
    - `isExaminerOrCreator(examSessionId, userId, tx)`: Kiểm tra quyền giám khảo hoặc người tạo bằng truy vấn SQL tối ưu.
    - `listFinalizedForStudent(studentId, tx)`: Liệt kê danh sách bài thi `FINALIZED` của sinh viên.
    - `findFinalizedForStudent(vivaResultId, studentId, tx)`: Lấy chi tiết điểm bài thi `FINALIZED` của sinh viên kèm tiêu chí rubric, không truy vấn các trường nhạy cảm (`rationale`, `evidence`, `ai_justification`, v.v.).
  - **Service Layer (`backend/src/services/gradingService.js`):**
    - `_assertSessionAccess(examSessionId, user, { write = false })`: Phân tách quyền đọc (giảng viên bộ môn) và quyền ghi (chỉ examiner hoặc creator). Trả về 403 `Only examiners of this exam can grade.` khi không đủ quyền ghi.
    - `getResultDetail` và `listSessionResults` tính toán và bổ sung cờ `canGrade: boolean`.
  - **Student Safe View (`backend/src/interview/studentResultView.js`):**
    - `toStudentResultView(detail)` & `toStudentResultListItem(row)`: Sử dụng allowlist nghiêm ngặt.
    - `assertStudentResultSafe(obj)`: Quét đệ quy toàn bộ payload, chặn đứng bất kỳ trường cấm nào (`rationale`, `evidence`, `ai_justification`, `flag_reason`, `feedback`, `turns`, `client_ip`, v.v.), ném lỗi `STUDENT_VIEW_LEAK` nếu phát hiện.
  - **Student Exam Service & Controller:**
    - `StudentExamService.listResults({ user })`: Kiểm tra vai trò `STUDENT`, gọi repo và map DTO an toàn.
    - `StudentExamService.getResultDetail({ user, resultId })`: Kiểm tra vai trò `STUDENT`, nếu không tìm thấy hoặc chưa FINALIZED thì trả về 404 `NOT_FOUND` (bảo vệ quyền riêng tư, không lộ sự tồn tại của bài thi chưa công bố).
    - `StudentExamController`: Bổ sung `listMyResults` và `getMyResult`.
  - **Routes (`backend/src/routes/meRoutes.js`):**
    - Thêm route `GET /api/me/results` và `GET /api/me/results/:id` bảo vệ bởi `studentGuard`.
  - **Frontend:**
    - `frontend/src/services/studentExamApi.js` & `studentApi.js`: Thêm `listMyResults()` và `getMyResult(id)`.
    - `frontend/src/pages/lecturer/EvaluationReview.jsx`: Khi `canGrade === false`, hiển thị badge "Chỉ xem (Không phải giám khảo)" kèm banner thông báo, vô hiệu hóa nút sửa điểm của từng tiêu chí và ẩn/vô hiệu hóa các nút Finalize / Reopen / Regrade.
    - `frontend/src/pages/student/Results.jsx`: Giao diện danh sách kết quả bài thi vấn đáp đã chốt điểm của sinh viên.
    - `frontend/src/pages/student/ResultDetail.jsx`: Giao diện chi tiết điểm thi từng câu hỏi và điểm từng tiêu chí rubric.
    - `frontend/src/routes/AppRoutes.jsx`: Đăng ký `/student/results` và `/student/results/:id`.
    - `frontend/src/shared/components/Sidebar/index.jsx`: Thêm mục "Results" vào thanh điều hướng bên trái cho sinh viên.
    - `frontend/src/pages/student/Dashboard.jsx`: Thêm nút "Xem kết quả thi" trên tiêu đề và nút "Xem kết quả" tại các bài thi đã nộp.
- **Kiểm thử đạt chuẩn 100%:**
  - `backend/test/studentResultViewService.test.js`: 3/3 pass (allowlist, cấm leak).
  - `backend/test/gradingExaminerGuardService.test.js`: 4/4 pass (examiner/creator được chấm, giảng viên khác bị 403, cờ `canGrade`).
  - `backend/test/studentExamService.test.js`: 8/8 pass (role guard, 404 isolation).
  - `backend/test/studentResults.e2e.test.js`: 8/8 pass.
  - `backend/test/gradingReview.e2e.test.js`: 10/10 pass.
  - Toàn bộ backend unit tests: **512/512 pass**.
  - Toàn bộ backend E2E tests: **120/120 pass**.
  - Frontend lint: **0 errors, 15 warnings**.
  - Frontend build: **Pass thành công**.
- **Kết quả:**
  - Tạo PR #44: `https://github.com/tmqthedev/swd392_team7_product/pull/44`.
  - GitHub Actions CI pass 5/5.
  - Đã merge vào `main` (commit `d7d1f83`).

---

### Bước 3 (PR-3c): Lecturer Topic Management UI (F4)
- **Mục tiêu:** Cung cấp giao diện quản lý chủ đề thi (Topics) cho giảng viên, cho phép tạo mới, chỉnh sửa, xem danh sách kèm số câu hỏi đã duyệt, và xoá topic an toàn.
- **Thực thi chi tiết:**
  - **API Client (`frontend/src/services/topicApi.js`):**
    - Cung cấp các hàm gọi REST API: `listTopics()`, `getTopic(id)`, `createTopic(body)`, `updateTopic(id, patch)`, `deleteTopic(id)`.
  - **Giao diện Quản lý Topic (`frontend/src/pages/lecturer/Topics.jsx`):**
    - Tải đồng thời `listTopics()` và `getExamSessionOptions()`.
    - Lập bản đồ `subjectMap` và `approvedCounts` để hiển thị môn học tương ứng và số câu hỏi đã duyệt của từng topic.
    - Hỗ trợ bộ lọc theo môn học (All Subjects / từng môn / Unassigned) và ô tìm kiếm theo tên topic / mã khoá học.
    - Modal Thêm / Chỉnh sửa: nhập tên topic (bắt buộc), chọn môn học từ danh sách môn được phân công (bắt buộc), mã khoá học (tuỳ chọn).
    - Modal Xác nhận Xoá Topic: bắt lỗi FK 409 (`RESOURCE_IN_USE` / `INVALID_FOREIGN_KEY`) từ `mapDbError` và hiển thị thông báo tiếng Việt: *"Không thể xoá chủ đề này vì đang có câu hỏi, tài liệu hoặc kỳ thi liên kết."*.
  - **Navigation & Routing:**
    - Đăng ký route `/lecturer/topics` trong `frontend/src/routes/AppRoutes.jsx`.
    - Thêm mục `Topics` với icon `Layers` vào thanh Sidebar của Giảng viên (`frontend/src/shared/components/Sidebar/index.jsx`).
- **Kiểm thử đạt chuẩn:**
  - Backend unit tests: 512/512 pass.
  - Backend E2E tests: 120/120 pass.
  - Frontend lint: 0 errors, 15 warnings (không phát sinh warning mới, tuân thủ quy tắc React 19 / oxlint).
  - Frontend build: Pass thành công (2.10s).
- **Kết quả:**
  - Tạo PR #45: `https://github.com/tmqthedev/swd392_team7_product/pull/45`.
  - GitHub Actions CI pass 5/5.
  - Đã merge vào `main` (commit `d972c95`).

---

### Bước 4 (PR-3d): Backlog Bug Fixes
- **Mục tiêu:** Khắc phục trọn vẹn 5 khiếm khuyết backlog đã được xác định qua audit và peer review, có unit test & E2E test bao phủ đầy đủ.
- **Thực thi chi tiết:**
  1. **Lọc `topicId` câu hỏi:**
     - `backend/src/repositories/questionRepository.js`: Thêm điều kiện `WHERE topic_id = $n` vào `findAllFiltered`.
     - `backend/src/services/questionService.js`: Chuyển tiếp `topicId` từ filter object xuống repository.
     - `backend/src/controllers/questionController.js`: Nhận `topicId` hoặc `topic_id` từ query params và đưa vào filter.
     - Kiểm thử: regression test trong `questionService.test.js` và `crud.e2e.test.js`.
  2. **Thứ tự tiêu chí Rubric (`rubric_criterion.order_index`):**
     - Migration 022: `ALTER TABLE rubric_criterion ADD COLUMN IF NOT EXISTS order_index INTEGER NOT NULL DEFAULT 1;`.
     - `RubricRepository._insertCriteria`: Lưu chính xác thứ tự tiêu chí `order_index = i + 1`.
     - `RubricService.toApiCriterion`: Xuất `orderIndex` ra API response.
     - `GradingService`: Sắp xếp các mức độ hoàn thành theo `ORDER BY order_no ASC, performance_level_id ASC`.
     - Kiểm thử: regression test trong `rubricService.test.js` và `crud.e2e.test.js`.
  3. **Retry transient cho `GENERATE_QUESTIONS`:**
     - `QuestionGenerationService.createJob`: Enqueue job với `{ maxAttempts: 3 }`.
     - `backend/src/jobs/handlers.js`: Kiểm tra số lần thử so với `maxAttempts`. Nếu là lỗi transient (mạng, Bedrock throttling) và còn lượt thử, giữ trạng thái job là `RUNNING` và rethrow để `JobQueue` tự retry với exponential backoff. Chỉ khi hết lượt thử mới cập nhật trạng thái `FAILED`.
     - Kiểm thử: regression test trong `questionGenerationService.test.js`.
  4. **Chuẩn hóa trường tín hiệu giọng nói (`pause_count`):**
     - `backend/src/services/speechSignals.js`: Trả về cả `pause_count` và `pauseCount` để tương thích hoàn toàn.
     - `InterviewService.submitAnswer`: Nhận tín hiệu giọng nói từ STT và lưu trữ các trường `response_latency_ms`, `speech_duration_ms`, `words_per_minute`, `pause_count` vào `qaTurnRepository.update`.
     - Kiểm thử: regression test trong `speechSignalsService.test.js` và `interviewService.test.js`.
  5. **Tách biệt retry budget chấm thi & regex criterion ID:**
     - `BedrockLlmAdapter`: Bọc vòng gọi `invokeModel` với retry riêng cho các lỗi transient (Throttling, ModelErrorException, mạng), không tiêu tốn lượt thử của vòng lặp sửa lỗi thiếu tiêu chí rubric (`MAX_EXTRA_ROUNDS = 2`).
     - `gradingPrompt.js`: Nâng cấp regex `normalizeGradeOutput` ưu tiên trích xuất đúng `criterionId` từ key định danh tiêu chí.
     - `GradingService`: Rethrow các lỗi transient mạng để `JobQueue` retry job `GRADE_INTERVIEW` ở mức hệ thống.
     - Kiểm thử: regression test trong `scoringRulesService.test.js` và `gradingService.test.js`.
- **Kiểm thử đạt chuẩn:**
  - Backend unit tests: **518/518 pass**.
  - Backend E2E tests: **120/120 pass** (bao gồm 71 test trong `crud.e2e.test.js`).
  - Frontend lint: **0 errors, 15 warnings**.
  - Frontend build: **Pass thành công**.
- **Kết quả:**
  - Tạo PR #46: `https://github.com/tmqthedev/swd392_team7_product/pull/46`.
  - GitHub Actions CI pass 5/5.
  - Đã merge vào `main` (commit `1fa81ef`).

---

### PR-4: Cập nhật tài liệu & đặc tả (F1–F10, Phụ lục A/B, E2E plan v2)
- **Mục tiêu:** Đồng bộ toàn diện đặc tả luồng nghiệp vụ (`docs/AIVES - Đặc tả luồng nghiệp vụ.md`), mô hình kiến trúc (`docs/architecture-aws.md`), và kế hoạch kiểm thử (`docs/e2e-execution-plan-v2.md`) phù hợp với hiện trạng code và API sau các bước Step 13.
- **Thực thi chi tiết:**
  - **Đặc tả luồng nghiệp vụ:**
    - F4: Cập nhật giao diện quản lý Topic cho Giảng viên tại `/lecturer/topics`, các API RESTful subject-scoped, modal thêm/sửa, và quy tắc xử lý lỗi 409 `RESOURCE_IN_USE`.
    - F6: Bổ sung lọc câu hỏi theo `topicId`, bảo toàn thứ tự tiêu chí rubric qua `order_index` (Migration 022), và cơ chế tự động retry 3 lần cho job `GENERATE_QUESTIONS`.
    - F9: Đặc tả tính năng thu dọn phiên thi quá hạn tự động qua background sweep job `EXPIRE_INTERVIEWS` và chuẩn hóa 4 chỉ số tín hiệu giọng nói (`pause_count`, `speech_duration_ms`, `words_per_minute`, `response_latency_ms`).
    - F10: Đặc tả giới hạn quyền chấm thi chỉ cho Examiner trong `exam_session_examiner` hoặc Creator (`created_by`), giảng viên khác chỉ có quyền xem (`canGrade: false`). Đặc tả chức năng sinh viên xem kết quả thi (`GET /api/me/results` và `/api/me/results/:id`), cơ chế 404 isolation và bộ lọc an toàn `toStudentResultView()`.
    - Phụ lục A & B: Cập nhật ma trận Role × Endpoint với các routes mới (`/api/me/results`, `/api/tts/:filename`, gỡ bỏ `/api/audio/**`) và bảng mã lỗi chuẩn hóa (`INVALID_FILENAME`, `RESOURCE_IN_USE`, `STUDENT_VIEW_LEAK`).
  - **Mô hình kiến trúc (`architecture-aws.md`):**
    - Bổ sung trường `int order_index` vào thực thể `rubric_criterion` trong ERD.
  - **Kế hoạch E2E v2 (`e2e-execution-plan-v2.md`):**
    - Cập nhật bảng trạng thái 7 vấn đề backlog kỹ thuật sang "Đã hoàn thành và merge vào main".
    - Bổ sung các bài kiểm tra restrict test tự động và checklist UI cho F4, F9, F10.
- **Kết quả:**
  - Tạo PR #47: `https://github.com/tmqthedev/swd392_team7_product/pull/47`.
  - GitHub Actions CI pass 5/5.
  - Đã merge vào `main` (commit `11ebe44`).

---

### PR-5: Viết lại script test `scripts/e2e-restrict.mjs`
- **Mục tiêu:** Viết lại toàn diện script kiểm thử bảo mật tự động `scripts/e2e-restrict.mjs`, bao phủ toàn bộ ma trận Role × Endpoint, CSRF origin guard, hardened API surface (404 audio, 400 TTS path traversal), student result isolation (404 unfinalized & quét chống rò rỉ rationale), và examiner-only write guard.
- **Thực thi chi tiết:**
  - Hỗ trợ tham số linh hoạt (`--base`, `--admin-email`, `--admin-password`, `--lecturer-email`, `--lecturer-password`, `--student-email`, `--student-password`).
  - Cơ chế Pre-flight thích ứng với cả môi trường local (`http://localhost:8080`) và CloudFront Production (`https://d36ezmiqpl9miu.cloudfront.net`).
  - 19 bài kiểm tra unauthenticated matrix (401).
  - 4 bài kiểm tra CSRF guard (403).
  - 8 bài kiểm tra route hardened & gỡ bỏ (`/api/audio/**` -> 404, `/api/tts/..` -> 400).
  - 4 bài kiểm tra validate tham số ID (`GET /api/topics/abc`, `DELETE /api/materials/abc`, v.v.).
  - Các suite phân quyền xác thực khi truyền credentials: ADMIN không truy cập được endpoint sinh viên/tạo kỳ thi giảng viên; STUDENT không truy cập được ngân hàng câu hỏi, rubric, topic, tài liệu, kết quả bài thi người khác; LECTURER ngoài examiner không thể finalize/reopen/chấm điểm.
- **Kiểm thử trực tiếp trên CloudFront Production:**
  - `node scripts/e2e-restrict.mjs --base https://d36ezmiqpl9miu.cloudfront.net` đạt **35/35 checks passed** (0 failures).
- **Kết quả:**
  - Tạo PR #48: `https://github.com/tmqthedev/swd392_team7_product/pull/48`.
  - GitHub Actions CI pass 5/5.
  - Đã merge vào `main` (commit `84da7b7`).

---

### E2E v2: Chạy kiểm thử E2E v2 (G0 → G4) trên AWS Production
- **Trạng thái:** ⏳ Đang thực hiện.
- **Kế hoạch:**
  - **G0: Thiết lập Baseline & Tiền kiểm**: Xác nhận workflow Deploy trên prod, chụp số dòng CSDL baseline, kiểm tra server log.
  - **G1: Restrict Test API tự động**: Chạy `scripts/e2e-restrict.mjs` trên production.
  - **G2: Kiểm thử Luồng nghiệp vụ UI (F1 → F10)**: Kiểm tra trọn vẹn luồng từ Admin tạo tài khoản/môn học, Giảng viên tạo topic/rubric/câu hỏi/kỳ thi, Sinh viên thi và Giám khảo chấm điểm.
  - **G3: Vòng lặp Khắc phục lỗi**: Ghi nhận và sửa chữa nếu phát sinh lỗi.
  - **G4: Hậu kiểm & Dọn dẹp**: Xoá toàn bộ dữ liệu `TEST_`, đối chiếu baseline đảm bảo zero residue, xuất báo cáo `docs/ket-qua-e2e-v2.md`.
