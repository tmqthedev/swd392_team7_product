# AIVES: Tiến độ Thực thi Kế hoạch Step 13 (Cập nhật liên tục)

Tài liệu này theo dõi đối chiếu và ghi nhận toàn bộ tiến độ thực hiện theo kế hoạch thực thi mới nhất được thống nhất với chủ dự án.

---

## 1. Bảng tổng hợp tiến độ các bước

| Bước | Nội dung | Nhánh / PR | Trạng thái | Ghi chú & Kết quả |
| :--- | :--- | :--- | :--- | :--- |
| **Bước 0** | Merge #41, #42, Deploy prod, Smoke test, Chẩn đoán 409 | `main` | ✅ **HOÀN THÀNH** | PR #41 & #42 merged, deploy AWS prod thành công. Migration 020 & 021 đã áp. Smoke 200/404/401 pass. 409 chẩn đoán do dữ liệu và đã ghi nhận trong `docs/AIVES - Peer Review Step 13.md`. |
| **Bước 1** | **PR-3a**: `fix(step13): end abandoned interviews after deadline` (F9) | `fix/step13-end-abandoned-interviews` (PR #43) | ✅ **HOÀN THÀNH & ĐÃ MERGE** | Đã sweep phiên quá hạn sang `COMPLETED`, sinh `viva_result`, enqueue `GRADE_INTERVIEW`, seed job `EXPIRE_INTERVIEWS`. 500/500 unit tests pass. PR #43 CI 5/5 pass, merge vào `main` (commit `1dee638`). |
| **Bước 2** | **PR-3b**: `feat(step13): student results and examiner-only grading` (F10) | `feat/step13-student-results-and-examiner-grading` | 🟢 **HOÀN THÀNH CODE & TEST, ĐANG MỞ PR** | Phân quyền chấm chỉ cho examiner/creator (`gradingService`). Allowlist kết quả SV an toàn (`studentResultView`, `meRoutes`). Giao diện SV xem kết quả (`Results.jsx`, `ResultDetail.jsx`) và GV review (`EvaluationReview.jsx`). 512/512 unit tests, 120/120 e2e tests pass. Frontend lint 0 error, build pass. |
| **Bước 3** | **PR-3c**: `feat(step13): lecturer topic management UI` (F4) | `feat/step13-lecturer-topic-ui` | ⏳ **CHƯA BẮT ĐẦU** | Quản lý topic cho GV theo môn được gán, dropdown môn, cảnh báo khi xóa. |
| **Bước 4** | **PR-3d**: `fix(step13): backlog` (4 bug backlog) | `fix/step13-backlog-fixes` | ⏳ **CHƯA BẮT ĐẦU** | Lọc `topicId` câu hỏi, `rubric_criterion.order_index`, retry transient cho `GENERATE_QUESTIONS`, chuẩn hóa `pause_count`. |
| **PR-4** | Cập nhật tài liệu & đặc tả (F1–F10, Phụ lục A/B, E2E plan v2) | `docs/step13-specs-sync` | ⏳ **CHƯA BẮT ĐẦU** | Đồng bộ toàn bộ tài liệu theo code và API surface mới. |
| **PR-5** | Viết lại script test `scripts/e2e-restrict.mjs` | `test/step13-e2e-restrict-script` | ⏳ **CHƯA BẮT ĐẦU** | Bổ sung test kiểm tra kết quả SV và quyền chấm của examiner. |
| **E2E v2** | Chạy E2E v2 (G0 → G4) trên AWS production | `main` | ⏳ **CHƯA BẮT ĐẦU** | Kiểm thử đầu cuối với tài khoản và dữ liệu thật, báo cáo tại `docs/ket-qua-e2e-v2.md`. |

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
  - `backend/test/studentResults.e2e.test.js`: 8/8 pass (E2E API isolation, sinh viên A không xem được sinh viên B, chưa finalized trả 404, SV gọi route giảng viên trả 403, reopen tự động ẩn kết quả).
  - `backend/test/gradingReview.e2e.test.js`: 10/10 pass.
  - Toàn bộ backend unit tests: **512/512 pass**.
  - Toàn bộ backend E2E tests: **120/120 pass** (các Postgres tests skip sạch sẽ khi không có DB local).
  - Frontend lint: **0 errors, 15 warnings** (không phát sinh warning mới).
  - Frontend build: **Pass thành công** trong 3.19s.

---

### Bước 3 (PR-3c): Lecturer Topic Management UI (F4)
- **Trạng thái:** ⏳ Chưa bắt đầu.
- **Yêu cầu:**
  - Tạo trang `pages/lecturer/Topics.jsx` và route `/lecturer/topics`.
  - Lấy danh sách topic qua `GET /api/topics`, hiển thị số câu hỏi đã duyệt (`approved`).
  - Form tạo/sửa topic với dropdown môn học lấy từ `getExamSessionOptions().subjects`.
  - Xóa topic có xử lý lỗi ràng buộc toàn vẹn (409).
  - API client `services/topicApi.js`.

---

### Bước 4 (PR-3d): Backlog Bug Fixes
- **Trạng thái:** ⏳ Chưa bắt đầu.
- **Yêu cầu (mỗi lỗi có test tái hiện):**
  1. Fix `GET /questions?topicId=` không lọc theo `topicId`.
  2. Fix `rubric_criterion.order_index` luôn bằng 1 khi tạo/sửa rubric.
  3. `GENERATE_QUESTIONS` gặp lỗi tạm thời phải throw error để JobQueue retry.
  4. Chuẩn hóa tên trường `pause_count` trong interview engine.
  5. Tách biệt retry budget chấm điểm: transient network vs missing criteria.

---

### Các bước tiếp theo (PR-4, PR-5, E2E v2)
- **PR-4:** Cập nhật đặc tả F1–F10 (`AIVES - Đặc tả luồng nghiệp vụ.md`), Phụ lục A/B, và `e2e-execution-plan-v2.md`.
- **PR-5:** Hoàn thiện `scripts/e2e-restrict.mjs` kiểm tra bảo mật phân quyền trên toàn bộ API.
- **E2E v2:** Chạy kiểm thử toàn diện từ G0 đến G4 trên môi trường AWS Production, xuất báo cáo tại `docs/ket-qua-e2e-v2.md`.
