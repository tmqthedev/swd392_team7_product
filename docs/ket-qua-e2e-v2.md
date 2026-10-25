# AIVES: Báo cáo Kiểm thử Đầu - Cuối E2E v2 trên AWS Production

- **Ngày thực hiện**: 2026-10-25
- **Môi trường**: AWS Production (`ap-southeast-1`, CloudFront `https://d36ezmiqpl9miu.cloudfront.net`, EC2 `i-0797c55ad243db382`)
- **Backend Image**: `554013701253.dkr.ecr.ap-southeast-1.amazonaws.com/aives-prod-backend:84da7b72526f6f049123cf65775850038802b1ee`
- **Database**: PostgreSQL 16 + pgvector container `aives-postgres`
- **Tài liệu tham chiếu**: `docs/e2e-execution-plan-v2.md`, `docs/AIVES - Đặc tả luồng nghiệp vụ.md`

---

## 1. Giai đoạn 0: Baseline & Tiền kiểm

### 1.1. Trạng thái Hệ thống & CI/CD
- **Codebase `main`**: Đạt 518/518 backend unit tests, 120/120 e2e tests, frontend lint 0 errors, build sạch.
- **CI GitHub Actions**: 5/5 jobs xanh (`backend`, `frontend`, `stt-image`, `tts-image`, `compose-smoke`).
- **Deploy Production**: Workflow Deploy thành công cho PR #48 (commit `84da7b7`).
- **Migrations đã áp trên PostgreSQL**: Đạt 22/22 migrations (từ `001` đến `022`).

### 1.2. Baseline số dòng các bảng CSDL trước khi kiểm thử (Mốc đối soát)

| STT | Tên bảng CSDL (`public`) | Số dòng Baseline | Ghi chú |
| :---: | :--- | :---: | :--- |
| 1 | `app_user` | **8** | Tài khoản quản trị và mẫu có sẵn |
| 2 | `assigned_question` | **8** | Câu hỏi gán vào phiên thi |
| 3 | `auth_session` | **41** | Phiên đăng nhập hiện có |
| 4 | `background_job` | **11** | Hàng đợi công việc nền |
| 5 | `course_material` | **0** | Tài liệu học liệu |
| 6 | `criterion_score` | **18** | Điểm chi tiết tiêu chí |
| 7 | `exam_session` | **3** | Kỳ thi hiện có |
| 8 | `exam_session_examiner` | **3** | Giám khảo kỳ thi |
| 9 | `exam_session_student` | **5** | Roster thí sinh kỳ thi |
| 10 | `material_chunk` | **0** | Đoạn tài liệu RAG & vector embedding |
| 11 | `password_token` | **11** | Token đặt lại/thiết lập mật khẩu |
| 12 | `performance_level` | **12** | Mức độ hoàn thành rubric |
| 13 | `processing_failure` | **0** | Không có lỗi xử lý tồn đọng |
| 14 | `qa_turn` | **7** | Lượt hỏi đáp phỏng vấn |
| 15 | `question` | **2** | Ngân hàng câu hỏi |
| 16 | `question_evaluation` | **6** | Lịch sử đánh giá câu hỏi |
| 17 | `question_generation_job` | **0** | Job sinh câu hỏi AI |
| 18 | `question_source_ref` | **0** | Tham chiếu nguồn trích dẫn RAG |
| 19 | `rubric` | **1** | Bảng tiêu chí đánh giá |
| 20 | `rubric_criterion` | **3** | Tiêu chí đánh giá rubric |
| 21 | `schema_migrations` | **22** | Lịch sử migration (001 -> 022) |
| 22 | `score_adjustment` | **1** | Lịch sử chỉnh sửa điểm của giảng viên |
| 23 | `subject` | **3** | Môn học |
| 24 | `subject_lecturer` | **3** | Phân công giảng viên bộ môn |
| 25 | `subject_student` | **4** | Ghi danh sinh viên môn học |
| 26 | `topic` | **1** | Chủ đề thi |
| 27 | `transcript` | **3** | Bản ghi âm phỏng vấn |
| 28 | `viva_interview` | **4** | Phiên phỏng vấn vấn đáp |
| 29 | `viva_result` | **4** | Kết quả đánh giá thi |

---

## 2. Giai đoạn 1: Restrict Test API tự động

Chạy trực tiếp `node scripts/e2e-restrict.mjs --base https://d36ezmiqpl9miu.cloudfront.net` qua CloudFront production:

```text
================================================================
[E2E-RESTRICT] Target Base URL: https://d36ezmiqpl9miu.cloudfront.net
================================================================
[E2E-RESTRICT] Server responding and healthy at https://d36ezmiqpl9miu.cloudfront.net

--- 1. Role × Endpoint Matrix: Unauthenticated Requests (401) ---
  ✓ GET /api/auth/me -> 401
  ✓ GET /api/admin/users -> 401
  ✓ GET /api/admin/subjects -> 401
  ✓ GET /api/questions -> 401
  ✓ POST /api/questions -> 401
  ✓ GET /api/rubrics -> 401
  ✓ GET /api/materials -> 401
  ✓ GET /api/exam-sessions -> 401
  ✓ GET /api/exam-sessions/options -> 401
  ✓ GET /api/topics -> 401
  ✓ GET /api/me/exam-sessions -> 401
  ✓ GET /api/me/results -> 401
  ✓ GET /api/me/results/1 -> 401
  ✓ GET /api/tts/sample.mp3 -> 401
  ✓ GET /api/results/1 -> 401
  ✓ POST /api/results/1/finalize -> 401
  ✓ POST /api/results/1/reopen -> 401
  ✓ POST /api/results/1/regrade -> 401
  ✓ PUT /api/criterion-scores/1 -> 401

--- 2. CSRF Guard: Mutating Requests (403 CSRF_FORBIDDEN) ---
  ✓ POST /api/auth/logout with Origin: none -> 403
  ✓ POST /api/auth/logout with Origin: http://malicious-attacker.com -> 403
  ✓ POST /api/topics with Origin: none -> 403
  ✓ POST /api/topics with Origin: https://evil-site.org -> 403

--- 3. Hardened API Surface & Route Removal (404 and 400) ---
  ✓ Legacy POST /api/audio/upload-url -> 404 NOT FOUND
  ✓ Legacy POST /api/audio/process -> 404 NOT FOUND
  ✓ Legacy GET /api/audio/status/1 -> 404 NOT FOUND
  ✓ Legacy GET /api/audio/result/1 -> 404 NOT FOUND
  ✓ Hardened GET /api/tts/..%2Fsecret.txt -> 400/401
  ✓ Hardened GET /api/tts/test..wav -> 400/401
  ✓ Hardened GET /api/tts/bad*char.wav -> 400/401
  ✓ Hardened GET /api/tts/invalid%20space.mp3 -> 400/401

--- 4. Input Validation & Parameter Checks ---
  ✓ GET /api/topics/abc (non-numeric id) -> 400/401
  ✓ GET /api/questions/abc (non-numeric id) -> 400/401
  ✓ GET /api/rubrics/abc (non-numeric id) -> 400/401
  ✓ DELETE /api/materials/abc (non-numeric id) -> 400/401

================================================================
[E2E-RESTRICT] Test Execution Summary:
  Total checks:  35
  Passed:        35
  Failed:        0
================================================================
```

**Kết quả Giai đoạn 1**: **35/35 checks ĐẠT 100%**.

---

## 3. Nhật ký Phát hiện Lỗi & Vòng lặp Khắc phục (Giai đoạn 3)

| ID | Luồng | Bước thực hiện | Kết quả mong đợi | Kết quả thực tế | HTTP Code & Error Code | Log trích xuất | Mức độ | PR khắc phục |
| :---: | :---: | :--- | :--- | :--- | :---: | :--- | :---: | :---: |
| **BUG-E2E-01** | F9 | Khởi động backend (`server.js:start`) seed job `EXPIRE_INTERVIEWS` tự động quét phiên quá hạn | Job `EXPIRE_INTERVIEWS` được enqueue thành công vào bảng `background_job` | Lệnh INSERT thất bại do vi phạm ràng buộc CHECK trên cột `type` | 400 `CHECK_VIOLATION` | `Failed to seed initial EXPIRE_INTERVIEWS job`, `code: CHECK_VIOLATION` | **Cao** | Đang mở PR (Migration 023) |

- **Nguyên nhân gốc rễ BUG-E2E-01**: Ràng buộc `chk_background_job_type` trên bảng `background_job` trong PostgreSQL được cập nhật lần cuối tại migration `018_exam_schedule.sql` chỉ cho phép 6 loại job (`INGEST_MATERIAL`, `GENERATE_QUESTIONS`, `GRADE_INTERVIEW`, `SEND_EMAIL`, `KEEP_WARM`, `PREPARE_EXAM_AUDIO`). Khi PR-3a bổ sung job `EXPIRE_INTERVIEWS`, hệ thống chưa bổ sung migration cập nhật ràng buộc CHECK trong Postgres.
- **Biện pháp xử lý**: Tạo migration `023_background_job_expire_interviews.sql` mở rộng `chk_background_job_type` cho phép `EXPIRE_INTERVIEWS`, cập nhật `schema.sql`, thêm test hồi quy, mở PR, merge và deploy tự động.
