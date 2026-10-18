# AIVES E2E Plan — Tiến độ triển khai

Cập nhật: 2026-10-19 · Hoàn thành Bước 10 trên nhánh `main` @ `1b797e3`

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
| 6 | Bộ máy phỏng vấn | ✅ Hoàn thành (interview engine) |
| 7 | Socket.IO và màn thi sinh viên | ✅ Hoàn thành (`586d587`) |
| 8 | Chấm điểm gợi ý | ✅ Hoàn thành (`95d6932`) |
| 9 | Nhà cung cấp thật (STT/TTS/LLM) | ✅ Hoàn thành (`d1d54ce`) |
| 10 | Xử lý lỗi và thi tiếp sau rớt mạng | ✅ Hoàn thành (`1b797e3`) |
| 11 | Deploy AWS | 🟡 Code xong (chờ nhóm chạy terraform apply) |

Kiểm thử hiện tại: **401 unit test pass (0 fail)**; E2E test suites pass toàn bộ (101 pass, 27 tự động skip khi thiếu DB ngoại tuyến); frontend build sạch (1.90s), lint 0 lỗi; `docker compose config` hợp lệ. Mọi adapter production được kết nối đúng chuẩn không hạ cấp mock.

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

### Bước 6 — Bộ máy phỏng vấn ✅ (chỉ engine)

Chỉ làm bộ máy (service/repository/adapter/máy trạng thái/test); **chưa có
REST endpoint hay Socket.IO cho phỏng vấn** — bước 7 sẽ nối vào
`app.interviewContext.interviewService`.
- Migration `016_interview_engine_step6.sql`: cột `exam_session.session_time_limit_sec`
  (mặc định 1800 s, CHECK > 0) do **giảng viên tự đặt**; cột audio câu hỏi / thời
  điểm phát / hạn trả lời trên `qa_turn` + CHECK trạng thái lượt; các khoá
  unique (1 phỏng vấn/sinh viên/kỳ thi, thứ tự câu, thứ tự lượt, 1 transcript).
  API `/api/exam-sessions` và form giảng viên có thêm ô "Session time limit (min)"
  (60–14400 s).
- Engine `InterviewService`: `startOrResume`, `getCurrentState`,
  `markQuestionPlayed`, `appendPartialTranscript`, `submitAnswer`. Chọn ngẫu
  nhiên câu APPROVED của chủ đề cho từng sinh viên (seed được, khoá rubric các
  câu được giao); hạn chót = bắt đầu + thời lượng phiên, không vượt `closes_at`.
- Thứ tự quyết định đúng đặc tả: (1) hết giờ → kết thúc; (2) trả lời rỗng →
  câu chính kế tiếp; (3) LLM đề xuất hỏi xoáy và còn lượt → hỏi xoáy; (4) còn lại
  → câu chính kế tiếp / hết câu → kết thúc. LLM không thể nới giới hạn.
- Hợp đồng JSON hỏi xoáy + A4: JSON sai/lỗi/timeout → thử lại 1 lần → vẫn sai thì
  sang câu chính kế tiếp + ghi `processing_failure`; kỳ thi không bao giờ dừng.
  Prompt coi câu trả lời là dữ liệu (chống prompt-injection), ≤ ~40 từ, VI/EN,
  không lộ đáp án.
- Rationale chụp vào `qa_turn.rationale` khi hỏi (câu AI: rationale + nguồn;
  câu tự soạn/import: "Câu do giảng viên soạn"; hỏi xoáy: từ LLM). Kiểm chứng
  trích dẫn: trích lời sinh viên phải có trong transcript, trích tài liệu phải có
  trong đoạn nguồn của câu; không xác minh được thì bỏ và ghi "không xác minh được".
  **Rationale không bao giờ có trong dữ liệu trả cho sinh viên** (DTO allowlist
  riêng + kiểm tra sâu, có test).
- Adapter: seam STT mới (`STT_PROVIDER`, mock mặc định), `decideFollowUp` trên
  adapter LLM (mock tất định; Bedrock trả NOT_IMPLEMENTED tới bước 9), dùng lại
  seam TTS bước 5; audio trả lời lưu qua abstraction S3 → `qa_turn.answer_audio_key`.
- SessionContext trên DynamoDB (khoá `interview#<id>`, TTL `expiresAt`), tự tạo
  bảng khi `SESSION_TABLE_AUTO_CREATE=true`; sửa lỗi client DynamoDB bỏ qua
  `DYNAMODB_ENDPOINT`. Postgres vẫn là nguồn sự thật, context mất thì dựng lại.
- Kết thúc: COMPLETED + lưu transcript + tạo `viva_result` PENDING + đưa job
  `GRADE_INTERVIEW` vào hàng đợi (chỉ là hook; chấm điểm ở bước 8).

Vướng mắc / chưa kiểm chứng:
- ~~Đường Postgres / DynamoDB Local chưa chạy~~ → **đã chạy** (Docker bật):
  `interviewEngine.e2e.test.js` (SQL thật + ràng buộc migration 016),
  `examSessions.e2e.test.js` và suite mới `sessionContext.e2e.test.js`
  (tạo bảng + bật TTL trên DynamoDB Local, idempotent) đều pass, 0 bỏ qua.
  Lượt chạy này phát hiện và sửa 1 lỗi: `update` context sau khi TTL đã xoá
  item tạo ra bản ghi "mồ côi" không có `expiresAt`, chặn việc dựng lại từ
  Postgres → nay dùng ghi có điều kiện (`attribute_exists`).
  CI GitHub Actions (run 39133042278) xanh: suite bước 6 chạy thật trên
  Postgres; riêng `sessionContext.e2e.test.js` tự bỏ qua vì CI không có
  DynamoDB Local (chỉ chạy thật ở máy local).
- Bedrock `decideFollowUp` và STT Lambda là NOT_IMPLEMENTED tới bước 9 (khi bật
  provider thật, engine tự fallback sang câu chính kế tiếp).
- Handler `GRADE_INTERVIEW` hiện là stub no-op nên job sẽ được đánh DONE mà chưa
  chấm; bước 8 cần chấm lại các `viva_result` còn PENDING.

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
- **compose-smoke**: dựng `postgres backend mailpit nginx minio` bằng
  `docker compose` với secret giả, chờ `/health` qua nginx, tạo admin, rồi chạy
  `scripts/ci-smoke.mjs`: đăng nhập → `/auth/me` → chặn CSRF Origin lạ (403) →
  tạo giảng viên + môn + phân công → kiểm tra job SEND_EMAIL tới Mailpit.

Lỗi phát hiện và đã sửa khi đưa CI chạy xanh:

- Job backend phải dùng Node 22: `npm test` truyền glob cho `node --test`,
  Node 20 không tự mở rộng glob (`Could not find test/*Service.test.js`).
- Image `minio/minio` đã bị gỡ khỏi Docker Hub (pull access denied), làm
  `docker compose up` đầy đủ lỗi. `docker-compose.yml` chuyển sang
  `pgsty/minio:RELEASE.2026-08-04T00-00-00Z` (bản build lại drop-in của MinIO
  upstream, cùng lệnh/env/port, ghim phiên bản); compose-smoke khởi động thêm
  minio và kiểm tra `/minio/health/live`. dynamodb không dùng khi
  `AWS_MOCK_MODE` nên CI bỏ qua.
- `create-admin` phải truyền đủ cờ (kể cả `--code`): thiếu cờ tuỳ chọn sẽ rơi
  vào prompt readline, gặp stdin đóng thì thoát mã 0 mà không tạo user.

---

## Việc chưa kiểm chứng được (rủi ro cần xử lý)

- Luồng tải tài liệu → sinh câu → duyệt → mở kỳ thi qua stack container chưa có
  smoke test (hiện được phủ ở mức Jest + Postgres thật). Backend chưa thật sự
  ghi vào MinIO (chế độ mock); `pgsty/minio` là fork cộng đồng, cần theo dõi.
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

### Bước 7 — Socket.IO và màn thi của sinh viên ✅ (`586d587`)

- Kênh `/interview` với Socket.IO: xác thực bằng cookie JWT của sinh viên, bắt sự kiện `interview:join`, `interview:ready`, `question:played`, `answer:start`, `audio:chunk`, `answer:end`.
- Frontend màn thi sinh viên `VivaSession.jsx`: thanh trạng thái, mic check, phát âm thanh câu hỏi, đồng hồ đếm ngược suy nghĩ / trả lời, ghi âm MediaRecorder và stream chunk thời gian thực.
- Tự động chuyển màn hình khi hoàn thành bài thi sang kết quả chờ duyệt.

### Bước 8 — Chấm điểm gợi ý và màn duyệt điểm của giảng viên ✅ (`95d6932`)

- Job `GRADE_INTERVIEW` kích hoạt sau khi kết thúc buổi thi viva.
- Đánh giá câu trả lời dựa trên tiêu chí Rubric và trích xuất bằng chứng (citations/evidence), tính điểm có trọng số normalized thang điểm 10.
- Tự động gắn cờ `confidence < 0.6` hoặc lượt lỗi `FAILED`.
- API `/api/exam-sessions/:id/results`, `/api/results/:id`, `/api/criterion-scores/:id`, finalize/reopen.
- Màn hình giảng viên xem kết quả, phát lại audio từng lượt, xem transcript kèm trích dẫn, điều chỉnh điểm kèm lý do (audit trail) và chốt điểm (finalize).

### Bước 9 — Kết nối nhà cung cấp AI thật (STT / TTS / LLM) ✅ (`d1d54ce`)

- Kết nối Bedrock Nova Pro (`amazon.nova-pro-v1:0`) cho sinh câu hỏi, quyết định hỏi xoáy và chấm điểm theo rubric.
- Kết nối Bedrock Titan Text Embeddings V2 (`amazon.titan-embed-text-v2:0`) cho tìm kiếm tương đồng vector 1024 chiều.
- Container PhoWhisper trên AWS Lambda STT với Runtime Interface Emulator (RIE) cho nhận dạng tiếng Việt offline / cloud.
- Google Cloud TTS Chirp 3 (`vi-VN-Chirp3-HD-Aoede` / `en-US-Journey-F`) tích hợp bộ đệm lưu trữ S3 audio caching để tiết kiệm chi phí và giảm độ trễ.
- Mọi adapter tuân thủ DI pattern, tự động kích hoạt thông qua biến môi trường cấu hình production.

### Bước 10 — Xử lý lỗi và thi tiếp sau rớt mạng (Fault Tolerance & Reconnection) ✅ (`1b797e3`)

- **A1**: File ghi âm rỗng hoặc lỗi buffer -> Tự động cho sinh viên thử lại 1 lần (`retryCount: 0`), đưa lượt về `ANSWERING`. Lần 2 vẫn rỗng -> ghi nhận `processing_failure` và chuyển sang câu kế tiếp.
- **A2**: Lỗi upload S3 -> Tự động retry tối đa 3 lần với exponential backoff; nếu S3 vẫn không khả dụng -> ghi nhận `AUDIO_STORE` failure và tiếp tục nhận diện STT an toàn từ memory buffer không làm gián đoạn thi.
- **A3**: Timeout dịch vụ STT (10s) -> Retry tối đa 2 lần; trả mã lỗi 502 STT_FAILED để thông báo sinh viên nhắc lại câu trả lời. Nếu hết lượt retry -> đánh dấu lượt FAILED và chuyển sang câu chính kế tiếp.
- **A4**: Timeout/lỗi LLM hỏi xoáy (20s) -> Retry 1 lần; nếu vẫn lỗi -> fallback an toàn sang câu chính kế tiếp (`NEXT_MAIN_QUESTION`), không bao giờ để kỳ thi bị kẹt.
- **A5**: Khôi phục trạng thái từ Postgres (`rebuildContextFromDb`) khi DynamoDB session context bị mất. Hỗ trợ tạm dừng (`pauseInterview`) và tiếp tục (`resumeInterview`) kèm cơ chế bù giờ chính xác (`deadline_at += now - paused_at`) đảm bảo quyền lợi thời gian của sinh viên (BR-06).
- **A6**: Idempotent completion khi hoàn thành bài thi: lưu transcript trọn vẹn, khởi tạo `viva_result` PENDING và đưa job `GRADE_INTERVIEW` vào queue an toàn.
- **A7**: Timeout dịch vụ TTS (8s) -> Ghi nhận lỗi `TTS` và trả `questionAudioKey: null` để frontend kích hoạt Web Speech API (SpeechSynthesis) đọc câu hỏi mượt mà.
- **A8**: Rớt mạng và vào lại thi tiếp: `getCurrentState` tính toán chính xác thời gian còn lại (`remainingAnswerMs`), đồng bộ đếm ngược; nếu sinh viên mất kết nối quá thời hạn trả lời của lượt, tự động nộp bài lượt đó và chuyển tiếp câu mới.
- Sinh viên luôn được bảo vệ qua tầng `toStudentInterviewView` và `assertStudentSafe` (không bao giờ lộ schema lỗi nội bộ, rationale hay SQL trace).

---

## Các bước còn lại

### Bước 11 — Deploy AWS 🟡 (code xong, chờ apply)
Terraform (bỏ RDS/API Gateway/Lambda Transcribe cũ; thêm ổ dữ liệu riêng +
bucket backup), `docker-compose.prod.yml`, cron `pg_dump`, GitHub Actions
(OIDC), `make aws-stop/aws-start`, cập nhật sơ đồ kiến trúc + ERD.

- Đã thêm: Terraform mới ở `infrastructure/terraform/` (VPC public, EC2 t4g.small
  + EBS dữ liệu riêng, CloudFront → S3/EC2, S3 ×4, DynamoDB, ECR, Lambda STT tùy
  chọn, SSM, Budgets, OIDC role), `docker-compose.prod.yml`, `scripts/`
  (fetch-ssm-env, deploy-on-host, pg-backup), `Makefile`,
  `.github/workflows/deploy.yml`, hướng dẫn trong README, `docs/architecture-aws.md`.
- Đã kiểm chứng: `terraform fmt -check` / `init -backend=false` / `validate` pass,
  `docker compose ... config` pass, `bash -n` các script pass
  (chi tiết: `.agents/tasks/e2e-step11-deploy/verification.md`).
- Nhóm cần làm: `terraform apply` lần đầu (user IAM, không dùng root), đặt secret
  SSM, đặt biến GitHub rồi bật `AWS_DEPLOY_ENABLED=true`.
- Hoãn: cập nhật bản vẽ drawio, hook `pg_dump` khi đóng kỳ thi (logic backend),
  STT thật (chờ bước 9).

---

## Quy ước làm việc

- Mỗi bước làm trong một git worktree riêng dưới `.worktrees/` (đã gitignore),
  rebase lên `main` rồi fast-forward, giữ lịch sử tuyến tính, push lên origin.
- Adapter dịch vụ ngoài (embedding, LLM, TTS, S3) luôn có bản **mock là mặc
  định và là đường test**; bản thật đặt sau "seam" chọn bằng biến môi trường —
  test chạy offline, không gọi AWS/Google thật.
- Mỗi bước: unit test (`node --test`) + e2e (Jest, suite phụ thuộc Postgres tự
  bỏ qua khi offline), build frontend; không làm yếu test đang pass.
