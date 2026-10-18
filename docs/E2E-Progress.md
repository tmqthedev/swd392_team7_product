# AIVES E2E Plan — Tiến độ triển khai

Cập nhật: 2026-10-17 · Nhánh chính: `origin/main` @ `150602d`

Tài liệu này tóm tắt những gì đã hoàn thành theo kế hoạch
`docs/AIVES - E2E Plan Management.md` (11 bước) và các bước còn lại.

---

## Tổng quan nhanh

| Bước | Nội dung | Trạng thái |
| :---- | :---- | :---- |
| 1 | Nền tảng local + CSDL | ✅ Hoàn thành |
| 2 | Đăng nhập và phân quyền | ✅ Hoàn thành |
| 3 | Ngân hàng câu hỏi và rubric | ✅ Hoàn thành |
| 4 | RAG và sinh câu hỏi | ✅ Hoàn thành |
| 5 | Kỳ thi phía giảng viên | ✅ Hoàn thành (kèm vá lỗi review 1–4) |
| 6 | Bộ máy phỏng vấn | ⬜ Tiếp theo |
| 7 | Socket.IO và màn thi sinh viên | ⬜ Chưa làm |
| 8 | Chấm điểm gợi ý | ⬜ Chưa làm |
| 9 | Nhà cung cấp thật (STT/TTS/LLM) | ⬜ Chưa làm |
| 10 | Xử lý lỗi và thi tiếp sau rớt mạng | ⬜ Chưa làm |
| 11 | Deploy AWS | ⬜ Chưa làm |

Kiểm thử hiện tại trên `main`: **220 unit test + 87 e2e test pass** (21 suite phụ
thuộc Postgres tự bỏ qua khi chạy offline), frontend build sạch,
`docker compose config` hợp lệ. Chưa commit secret nào; `.env.example` là file
duy nhất được theo dõi.

---

## Chi tiết các bước đã hoàn thành

### Bước 1 — Nền tảng local và CSDL ✅

- `docker-compose.yml` ở gốc repo: backend, Postgres (pgvector/pg16),
  DynamoDB Local, MinIO (thay S3), Mailpit (SMTP + web UI 8025), nginx.
- Trình chạy migration tự động khi backend khởi động
  (`backend/src/db/migrationRunner.js`): đánh số, chạy trong transaction,
  idempotent, theo dõi qua bảng `schema_migrations`.
- Toàn bộ mô hình dữ liệu thống nhất (migration 001–010): tài khoản, môn học,
  tài liệu + `material_chunk` (vector 1024 chiều + chỉ mục HNSW), câu hỏi/rubric,
  kỳ thi/phỏng vấn, chấm điểm, `background_job`. Dữ liệu cũ được chuyển
  (Active → APPROVED, Draft → DRAFT).
- Repository cho các bảng lõi mới + hàng đợi việc nền
  (`SELECT … FOR UPDATE SKIP LOCKED`, retry/backoff, worker giới hạn số lượng).

### Bước 2 — Đăng nhập và phân quyền ✅

- Mật khẩu băm bằng **scrypt** (salt riêng mỗi user, so sánh constant-time).
- Phiên JWT (HMAC) trong cookie **httpOnly + Secure + SameSite**; chỉ lưu
  **hash** của refresh token trong `auth_session`, xoay vòng khi làm mới.
- Quên mật khẩu: link một lần, **thu hồi mọi phiên** khi đặt lại, trả lời
  **giống nhau dù email có tồn tại hay không** (chống dò tài khoản).
- Khoá tạm 15 phút sau 5 lần sai; kiểm tra Origin/CSRF cho request thay đổi dữ liệu.
- Middleware vai trò + phạm vi môn (`requireAuth` / `requireRole` /
  `requireSubjectScope`), domain quản trị (quản lý user, **import sinh viên từ
  Excel** kiểu all-or-nothing), gửi email thật qua hàng đợi SEND_EMAIL, lệnh
  `create-admin`. Frontend chuyển sang phiên thật qua `/auth/me`.

### Bước 3 — Ngân hàng câu hỏi và rubric ✅

- Máy trạng thái câu hỏi DRAFT → PENDING_REVIEW → APPROVED/REJECTED → ARCHIVED,
  ép ở server (duyệt bắt buộc có rubric, loại bắt buộc có lý do).
- Thêm trường Bloom, ngôn ngữ, đáp án tham khảo, ý chính, mục đích; lọc theo
  trạng thái/Bloom/nguồn; **import Excel** câu hỏi all-or-nothing.
- Rubric: mức đánh giá (performance level) theo tiêu chí, **khoá + nhân bản
  (bump version)**.
- Cảnh báo câu gần giống qua adapter embedding (bản mock, có "seam" để gắn bản
  thật); trùng y hệt vẫn chặn cứng, cosin ≥ 0,9 chỉ cảnh báo.

### Bước 4 — RAG và sinh câu hỏi ✅

- Tải tài liệu lên S3/MinIO (PDF/PPTX/DOCX ≤ 50 MB, báo lỗi "cần bản có chữ"),
  job INGEST_MATERIAL: tách chữ → cắt đoạn (~500 từ, chồng 50 từ, giữ số
  trang/slide) → tạo vector (adapter Titan thật đặt sau seam, mock là mặc định).
- Job GENERATE_QUESTIONS: lấy ~12 đoạn gần nhất trải đều các tài liệu → sinh
  bằng adapter LLM (mock mặc định + Nova Pro thật sau seam) → **kiểm tra
  trích dẫn (grounding)** loại câu bịa nguồn / trích đoạn không khớp → lưu
  source=AI, status=PENDING_REVIEW kèm `question_source_ref`.
- Chống prompt-injection (coi văn bản tài liệu là dữ liệu).
- Frontend: trang Tài liệu, nút "Sinh bằng AI", trang **Chờ duyệt** (hiện câu
  cạnh đoạn nguồn + giải thích, duyệt/sửa/loại, duyệt lô theo rubric chung).

### Bước 5 — Kỳ thi phía giảng viên ✅ (kèm vá lỗi)

Tính năng:
- Domain `/api/exam-sessions`: CRUD với mặc định Nhóm-3 (3 câu chính, tối đa 2
  hỏi xoáy/câu, 120 giây, giờ suy nghĩ do giảng viên đặt, VI/EN).
- Danh sách sinh viên dán theo **mã** (all-or-nothing, báo lỗi từng dòng),
  phân công người chấm, máy trạng thái DRAFT → OPEN → CLOSED.
- Mở kỳ thi: kiểm tra đủ câu APPROVED, **khoá rubric**, tạo sẵn audio câu chính
  qua **seam TTS mock** (Google TTS thật để bước 9).
- Frontend: trang Kỳ thi mới + `Sessions.jsx` trỏ sang API thật.

Vá lỗi từ hai lượt review độc lập (gộp vào bước 5):
- **H1** — không còn bypass vòng đời câu hỏi qua create/update (đổi trạng thái
  chỉ qua approve/reject/archive; APPROVED giữ rubric).
- **H2** — stack chạy được: route dưới `/api`, nginx phục vụ SPA, Dockerfile
  copy `db/`.
- **H3** — chặn đọc `/questions` + `/rubrics` theo vai trò (sinh viên không
  đọc được đáp án) và theo phạm vi môn (helper `SubjectScope` dùng chung).
- **M1** — job kẹt RUNNING được đưa lại hàng đợi lúc khởi động + quét định kỳ,
  thoát mượt khi SIGTERM/SIGINT.
- **M2** — đếm sai mật khẩu atomic + cột `first_failed_at` (hết race khoá tài khoản).
- **M3** — sinh câu hỏi idempotent, an toàn khi retry.
- Gate route cũ (`/api/topics`, `/api/evaluations`, `/api/lecturer`) bằng
  `requireAuth`; guard JWT_SECRET bắt buộc ở production.

> Lịch sử git: nhánh `fix/steps1-4-review` (7 commit vá lỗi) và phần tính năng
> Step 5 đã được **hợp nhất (reconcile)** thành một `main` nhất quán. Khi trùng
> (phạm vi môn, gate route cũ, guard JWT), giữ bản của nhánh review (mạnh hơn),
> bỏ bản yếu hơn của Step 5; không mất tính năng kỳ thi. Migration được đánh lại
> số: `014_login_window.sql`, `015_exam_session_step5.sql`.

---

## CI GitHub Actions

Workflow `.github/workflows/ci.yml` (tên `CI`, không đổi tên vì deploy bước 11
dựa vào nó) chạy trên GitHub runner mỗi lần push `main`/`feat/**` và PR, nên
không cần bật Docker trên máy cá nhân:

- **backend** (Node 22 + service Postgres pgvector/pg16): `npm test` (unit
  node:test) và `npm run test:e2e` (Jest). **4 suite cần Postgres nay chạy
  thật** (step4, exam-sessions, jobQueue, migrations — 21 test, 0 skip);
  migration 001–015 áp sạch trên Postgres thật.
- **frontend**: `npm run build` và `npm run lint` (oxlint, chỉ lỗi mới làm fail).
- **compose-smoke**: dựng `postgres backend mailpit nginx` bằng
  `docker compose` với secret giả, chờ `/health` qua nginx, tạo admin, rồi chạy
  `scripts/ci-smoke.mjs`: đăng nhập → `/auth/me` → chặn CSRF Origin lạ (403) →
  tạo giảng viên + môn + phân công → kiểm tra job SEND_EMAIL tới Mailpit.

Lỗi phát hiện và đã sửa khi đưa CI chạy xanh:

- Job backend phải dùng Node 22: `npm test` truyền glob cho `node --test`,
  Node 20 không tự mở rộng glob (`Could not find test/*Service.test.js`).
- compose-smoke chỉ khởi động postgres/backend/mailpit/nginx: image
  `minio/minio` không còn trên Docker Hub (pull access denied), còn
  minio/dynamodb không dùng khi `AWS_MOCK_MODE`. `docker-compose.yml` giữ nguyên.
- `create-admin` phải truyền đủ cờ (kể cả `--code`): thiếu cờ tuỳ chọn sẽ rơi
  vào prompt readline, gặp stdin đóng thì thoát mã 0 mà không tạo user.

---

## Việc chưa kiểm chứng được (rủi ro cần xử lý)

- **`docker compose up` đầy đủ ở local vẫn lỗi**: `docker-compose.yml` còn dùng
  image `minio/minio` đã bị gỡ khỏi Docker Hub → cần thay image trước khi dựng
  full stack (CI đã né bằng cách chỉ chạy các service của chế độ mock). Luồng
  tải tài liệu → sinh câu → duyệt → mở kỳ thi qua stack container chưa có smoke
  test (hiện được phủ ở mức Jest + Postgres thật).
- Các đường gọi **thật** tới Bedrock / Google TTS / Gmail SMTP / S3 chưa chạy
  (chỉ mới có adapter mock + bản thật đặt sau seam).
- Chất lượng tách chữ PDF/DOCX/PPTX trên tài liệu thật chưa đo.

### Nợ kỹ thuật nhỏ (LOW, hoãn lại)

- Import sinh viên chưa transaction hoá hoàn toàn.
- `db/lecturer-data/*.json` còn được theo dõi (sẽ bỏ khi bước 5/8 thay
  `/api/lecturer`).
- Uniqueness nội dung câu hỏi đang là global (cân nhắc giới hạn theo môn/chủ đề).
- Chỉ mục HNSW `idx_question_embedding` chưa dùng (near-dup đang tính bằng JS).
- 23 cảnh báo lint frontend (import/biến thừa, set-state-in-effect).

---

## Các bước còn lại

### Bước 6 — Bộ máy phỏng vấn (TIẾP THEO)
Interface STT/TTS/LLM kèm bản mock; máy trạng thái phỏng vấn, hạn chót, quy tắc
hỏi xoáy (chỉ hỏi khi thiếu ý/mơ hồ/mâu thuẫn, backend áp giới hạn), phần giải
thích câu hỏi (rationale), ngữ cảnh phiên trên DynamoDB. Test đầy đủ bằng mock —
không cần nhà cung cấp thật.

### Bước 7 — Socket.IO và màn thi của sinh viên
Kênh `/interview`, ghi âm thật, danh sách kỳ thi của sinh viên, tín hiệu phụ,
chạy trọn luồng với adapter mock.

### Bước 8 — Chấm điểm gợi ý
Job GRADE_INTERVIEW, tính điểm theo rubric, gắn cờ độ tin cậy thấp; màn chấm
(transcript + audio + giải thích + chỉnh điểm có lý do + lịch sử + chốt điểm).
Thay route `/evaluations` cũ bằng `/results`.

### Bước 9 — Nhà cung cấp thật
Image Lambda STT (PhoWhisper qua RIE ở local), Bedrock Nova Pro + Titan
Embeddings, Google TTS Chirp 3 + cache S3; đo độ trễ và chất lượng. Gắn các
adapter thật vào seam đã dựng sẵn ở bước 3–5.

### Bước 10 — Xử lý lỗi và thi tiếp sau rớt mạng
A1–A6, thi tiếp từ lượt đang dở, lỗi việc nền, test từng trường hợp.

### Bước 11 — Deploy AWS
Terraform (bỏ RDS/API Gateway/Lambda Transcribe cũ; thêm ổ dữ liệu riêng +
bucket backup), `docker-compose.prod.yml`, cron `pg_dump`, GitHub Actions
(OIDC), `make aws-stop/aws-start`, cập nhật sơ đồ kiến trúc + ERD.

---

## Quy ước làm việc

- Mỗi bước làm trong một git worktree riêng dưới `.worktrees/` (đã gitignore),
  rebase lên `main` rồi fast-forward, giữ lịch sử tuyến tính, push lên origin.
- Adapter dịch vụ ngoài (embedding, LLM, TTS, S3) luôn có bản **mock là mặc
  định và là đường test**; bản thật đặt sau "seam" chọn bằng biến môi trường —
  test chạy offline, không gọi AWS/Google thật.
- Mỗi bước: unit test (`node --test`) + e2e (Jest, suite phụ thuộc Postgres tự
  bỏ qua khi offline), build frontend; không làm yếu test đang pass.
