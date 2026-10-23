# AIVES: báo cáo tổng hợp lần chạy E2E và Bước 12

Tài liệu này gộp toàn bộ lần chạy vào một file: mục tiêu, những gì đã cân nhắc, các lựa chọn và lý do, cách thực hiện, kết quả, số đo, lỗi đã sửa, blockers và việc còn lại.

- **Thời gian:** 2026-10-22 đến 2026-10-23.
- **Người thực hiện:** agent (Claude Code). Chủ dự án duyệt các quyết định và làm các bước cần người thật.
- **Kế hoạch gốc:** `docs/e2e-execution-plan.md`.
- **Môi trường:** prod AWS `ap-southeast-1` (account 554013701253), app https://d36ezmiqpl9miu.cloudfront.net, EC2 `i-0797c55ad243db382`.
- **Bảo mật:** tài liệu không chứa mật khẩu, token hay khoá bí mật.

---

## 1. Tóm tắt

| Hạng mục | Kết quả |
|---|---|
| STT thật (PhoWhisper-small / Whisper small trên Lambda) | Đạt. x86_64, 3008 MB. Câu trả lời 23–32 giây được nhận dạng trong 15–16 giây, WER 0% trên mẫu sạch. |
| TTS thật (Kokoro-82M trên Lambda) | Đạt. x86_64, 3008 MB, 2,7–8,9 giây mỗi câu. Chủ dự án nghe và xác nhận. |
| Nhóm chức năng mới "Quản lý kỳ thi & lịch thi" (Bước 12) | Đạt. Đã deploy prod, tài liệu và ERD đã cập nhật. |
| Luồng nghiệp vụ lớp E với dữ liệu `TEST_` | Đạt, trừ bước thi bằng giọng người thật. Dùng giọng tổng hợp thay thế. |
| Lỗi phát hiện và sửa | 12 lỗi, qua 10 PR (#29–#38), CI xanh, 11 lần Deploy thành công. |
| Dọn dữ liệu `TEST_` | Đạt. Các bảng nghiệp vụ về đúng số hàng ban đầu. |
| Quota Lambda | Đã được duyệt: chạy đồng thời 10 → 1000, mở giới hạn RAM 3008 MB. |

---

## 2. Bối cảnh và cách làm việc

### 2.1. Mục tiêu theo kế hoạch

1. Bật STT thật (PhoWhisper trên Lambda).
2. Bật TTS thật bằng Kokoro.
3. Chạy luồng nghiệp vụ đầy đủ (lớp E) với dữ liệu `TEST_`.
4. Dọn dữ liệu `TEST_`.
5. Báo cáo.

Trong lúc chạy, chủ dự án bổ sung nhóm chức năng **"Quản lý kỳ thi & lịch thi"**:
- Giảng viên tạo phiên thi gắn môn, danh sách sinh viên và khung thời gian.
- Hệ thống chọn bộ câu cho từng sinh viên sao cho thí sinh thi liên tiếp không trùng câu.
- Cấu hình được số câu chính và số câu xoáy tối đa.
- Admin có bảng lịch thi chung. Khi Admin bấm khởi động, các Lambda được làm nóng song song.

### 2.2. Thoả thuận với chủ dự án trước khi chạy

Agent hỏi lại cho đến khi đủ thông tin để làm. Các thoả thuận đã chốt:

| Câu hỏi | Lựa chọn của chủ dự án |
|---|---|
| CI `main` đang đỏ thì làm gì | Agent mở PR sửa, không dừng lại |
| Merge PR | Agent tự merge khi CI xanh |
| Email test | `tmqthedev+test_…@gmail.com` |
| License weights Kokoro tiếng Việt chưa rõ | Vẫn làm, ghi rủi ro vào PR |
| Cách chạy lớp E | Agent gọi API bằng curl; bước thi bằng micro do người làm |
| Mật khẩu admin | Chủ dự án dán trong chat; agent không ghi vào file |
| Ghi vào prod (Terraform, SSM, Deploy, SQL dọn dẹp) | Agent tự chạy khi điểm kiểm tra đạt; bất thường thì dừng lại hỏi |
| Kỳ thi tiếng Anh | Có; agent tự tạo PDF tiếng Anh |
| Làm việc song song | Có dùng nhiều sub-agent |

### 2.3. Nguyên tắc agent tự đặt ra

- Mọi thay đổi code đi qua PR có test, CI xanh rồi mới merge. Không sửa tay dữ liệu prod để vá lỗi.
- Trước mỗi thao tác ghi vào prod đều xem trước tác động: đọc `terraform plan`, chạy SQL thử với `ROLLBACK`, liệt kê object S3 trước khi xoá.
- Sao lưu DB trước khi chạy migration làm thay đổi schema.
- Không in giá trị bí mật. Mật khẩu ngẫu nhiên cho tài khoản `TEST_` chỉ nằm trong file tạm và đã xoá khi xong.
- Gặp lỗi thì tái hiện, xác định nguyên nhân gốc, sửa và viết test hồi quy, rồi mới đi tiếp.
- Ghi nhật ký tiến độ vào bộ nhớ để có thể chạy tiếp nếu phiên làm việc bị ngắt.

---

## 3. Giai đoạn 0: kiểm tra trước

**Thực hiện:** kiểm tra AWS, Git, `gh`, Docker, Terraform và CI của `main`.

**Phát hiện:**
- Phiên AWS hết hạn và Docker Desktop chưa bật; chủ dự án đã xử lý.
- CI `main` đỏ ở job `stt-image`: `open() got an unexpected keyword argument 'metadata_errors'`.

**Phân tích:** `lambda/stt/requirements.txt` không ghim phiên bản. PyAV 19 bỏ tham số `metadata_errors`, trong khi faster-whisper 1.2.1 vẫn truyền tham số này. Agent tải wheel các bản 16 đến 19 để so file `.pyi`, xác định bản 19 là bản bỏ tham số. Bản 18.1.0 có wheel aarch64 abi3 cài được trên Amazon Linux 2023.

**Lựa chọn:** mở PR sửa thay vì dừng (chủ dự án duyệt).

**Kết quả:** PR #29 ghim `faster-whisper==1.2.1`, `av==18.1.0`. CI xanh, đã merge.

---

## 4. Giai đoạn 1: bật STT trên Lambda

### 4.1. Thực hiện

1. **Build image arm64 rồi push lên ECR.**
   - Auto-mode chặn lệnh push lần đầu; chủ dự án cho phép sau đó.
   - `docker login` vào ECR trên Windows lỗi credential store ("The stub received bad data"). Agent dùng một Docker config tạm chứa token ECR thay cho credential store.
2. **`terraform plan`:** chỉ tạo 1 tài nguyên mới là function STT. Các thay đổi khác chỉ là tag mặc định. Sau khi xác nhận, chạy `apply`.
3. **Gọi thử Lambda và đo:**

| Cấu hình | Kết quả |
|---|---|
| arm64, 2048 MB | Warm-up vi mất 23 giây, warm-up en vượt 30 giây. Câu vi 5,6 giây: **timeout 30 giây**. Câu en 4,5 giây: 16–18 giây. |
| arm64, 3008 MB (mức tối đa của account) | Câu vi mất **49 giây** và **nói bịa** một đoạn không có trong audio ("trao thông báo về bảo vệ công nghệ…"). |

### 4.2. Phân tích

- Chạy cùng model trên laptop, 1 luồng x86: tiếng Việt cho kết quả đúng, không lặp, mất 11–13 giây. Vậy model không bị treo; Lambda chỉ đơn giản là thiếu CPU.
- Tắt word timestamps giảm khoảng 55% thời gian. Tăng từ 1 lên 4 luồng giảm thêm khoảng 30%.
- Word timestamps chỉ dùng để đếm `pause_count`. Chỉ số này đã luôn bằng 0 sẵn, vì adapter trả `startMs/endMs` còn `speechSignals` đọc `start/end`.
- Đoạn nói bịa xuất hiện ở phần im lặng cuối audio. Đây là hành vi đã biết của Whisper.
- Account mới bị giới hạn RAM Lambda 3008 MB, khoảng 1,7 vCPU.

### 4.3. Lựa chọn và lý do

| Lựa chọn | Lý do |
|---|---|
| Bật VAD, `condition_on_previous_text=False` | Loại phần im lặng, hết nói bịa |
| Tắt word timestamps (biến `STT_WORD_TIMESTAMPS`) | Nhanh gấp khoảng 2 lần, không mất tính năng đang dùng được |
| `cpu_threads` bằng số vCPU | Dùng hết CPU Lambda cấp |
| **x86_64 thay arm64** | Đo trên cùng Lambda: x86_64 nhanh gấp khoảng 2 lần (vi 8,2 giây so với 15,5 giây cho câu 5,6 giây), vì kernel int8 của CTranslate2 tối ưu cho AVX2. Giá cao hơn khoảng 20%. |
| RAM 3008 MB, Lambda timeout 120 giây, `STT_TIMEOUT_MS=90000` | Mức tối đa account cho phép; đủ cho câu trả lời dài |
| beam 1 | Đo nhanh hơn 20–35%, WER không đổi trên mẫu thử |
| Không bật batched pipeline | Ở beam 1 không nhanh thêm |
| **Giữ model small** (chủ dự án chọn) | Base nhanh gấp khoảng 2 lần nhưng sai từ tiếng Việt ("tuần tử" thay vì "tuần tự"). Transcript là đầu vào để chấm điểm nên ưu tiên độ chính xác. |

Phát hiện quan trọng khi đo bằng câu dài: Whisper luôn mã hoá đủ cửa sổ 30 giây, nên câu 5 giây tốn gần bằng câu 30 giây. Câu trả lời 23–32 giây chỉ mất 15–16 giây (0,5–0,65 lần thời lượng). Đo bằng câu ngắn làm hiệu năng trông tệ hơn thực tế.

Trước khi chọn, agent đưa cho chủ dự án bảng các phương án xếp theo hiệu năng trên chi phí:
- **Miễn phí:** warm-up khi bắt đầu thi, batched pipeline, beam 1, xin tăng quota.
- **Cần công:** nhận dạng dần trong lúc sinh viên đang nói, chia audio gọi song song.
- **Không đáng:** Amazon Transcribe (đắt gấp khoảng 30 lần), provisioned concurrency (khoảng 32 USD/tháng), GPU.

Chủ dự án chọn làm nhóm miễn phí trước. Agent đã gửi yêu cầu tăng quota (chạy đồng thời 10 → 1000) và yêu cầu đã được duyệt.

### 4.4. Kết quả

- PR #31 merged.
- Đặt biến repo `STT_FUNCTION_NAME` và `STT_DOCKER_PLATFORM=linux/amd64`; SSM `STT_PROVIDER=lambda`.
- Deploy xanh, bước "Update STT Lambda code" không còn bị bỏ qua.
- Backend healthy, không có lỗi STT trong log.
- Lambda đang dùng image SHA của `main`, x86_64, 3008 MB, 120 giây.

---

## 5. Giai đoạn 2: bật TTS bằng Kokoro

### 5.1. Thử model theo yêu cầu của chủ dự án

Chủ dự án hỏi về `hexgrad/kokoro`. Agent cài thử và đánh giá:
- License Apache-2.0, chạy miễn phí.
- Tạo được giọng `af_heart` tiếng Anh tốt.
- **Không hỗ trợ tiếng Việt**: `lang_code='vi'` bị từ chối.
- Cần torch lúc chạy; nạp mất 22 giây, quá chậm cho cold start Lambda.

### 5.2. Lựa chọn

| Ngôn ngữ | Model | Ghi chú |
|---|---|---|
| Tiếng Việt | `contextboxai/Kokoro-Vietnamese` (Kokoro-82M fine-tune, ONNX) | Giọng nữ `diem_trinh`. Metadata ghi Apache-2.0 nhưng README không có văn bản license; rủi ro đã ghi trong PR. |
| Tiếng Anh | `hexgrad/Kokoro-82M` qua `kokoro-onnx` | Giọng nữ `af_heart` |

Cách đóng gói image:
- torch chỉ dùng ở stage build, để đổi voicepack `.pt` sang `.npy`. Runtime chỉ cần onnxruntime.
- Model đóng sẵn trong image, đặt `HF_HUB_OFFLINE=1`.
- Đầu ra là WAV 24 kHz. Lỗi thì raise, không tự chuyển sang phương án khác.

### 5.3. Thực hiện (PR #30)

- `lambda/tts/`: Dockerfile, `build_models.py`, `handler.py`. Đã chạy thử handler trên máy cho cả vi và en.
- Backend `KokoroTtsAdapter`: `TTS_PROVIDER=kokoro`, cache S3 `tts-cache/<sha256>.wav`, `TTS_LAMBDA_ENDPOINT` cho RIE local.
- Terraform: ECR `aives-prod-tts`, IAM role, log group, function, quyền invoke, tham số SSM.
- Workflow: CI có job `tts-image` gọi thử qua RIE; Deploy có bước build và update TTS.
- Phát hiện thêm: `/api/tts/:filename` chỉ đọc thư mục `tts/`, nên audio cache trong `tts-cache/`, kể cả của adapter Google, chưa bao giờ được phát. Đã sửa.
- Đặt `TTS_TIMEOUT_MS=25000` cho prod, vì 8 giây không đủ cho cold start.
- Phần Terraform và workflow do 2 sub-agent làm song song.

### 5.4. Đo và chọn kiến trúc

Thời gian lấy từ REPORT trong CloudWatch, tức thời gian chạy thật bên trong Lambda:

| Cấu hình | Kết quả |
|---|---|
| x86_64, 2048 MB | Dùng 1848–2028 MB, **gần hết RAM** khi nạp cả 2 model |
| arm64, 2048 MB | Chậm hơn x86 khoảng 40% |
| **x86_64, 3008 MB** | **2,7–8,9 giây mỗi câu** |

Số đo từ máy ở Việt Nam chậm hơn 5–10 giây vì AWS CLI khởi động chậm và phải tải WAV về. Backend chạy trên EC2 cùng region nên không chịu phần này.

**Lựa chọn:** x86_64, 3008 MB, theo tiêu chí "hiệu năng và độ chính xác cao nhất trong chi phí hợp lý" của chủ dự án.

### 5.5. Kết quả

- Function TTS tạo bằng Terraform. Đặt biến repo `TTS_FUNCTION_NAME`, `ECR_TTS_REPOSITORY`, `TTS_DOCKER_PLATFORM=linux/amd64`; SSM `TTS_PROVIDER=kokoro`. Deploy xanh.
- Câu hỏi trong kỳ thi có `audioKey = tts-cache/<sha256>.wav`; `/api/tts/*.wav` trả `audio/wav` 24 kHz.
- **Chủ dự án nghe trên Chrome và xác nhận TTS hoạt động tốt.**

---

## 6. Bước 12: nhóm chức năng "Quản lý kỳ thi & lịch thi"

### 6.1. Khảo sát (3 sub-agent đọc code song song)

**Đã có:**
- Vòng đời kỳ thi DRAFT → OPEN → CLOSED.
- Danh sách sinh viên, người chấm.
- Giới hạn câu xoáy theo từng câu hỏi.

**Còn thiếu:**
- Giảng viên không đặt được giờ mở/đóng, dù SRS FR-EXAM-01 đã yêu cầu.
- Chọn câu hoàn toàn ngẫu nhiên.
- Không có giới hạn câu xoáy theo thí sinh.
- Admin không có màn hình kỳ thi.
- `warmUp()` có trong code nhưng không ở đâu gọi.
- Khi sinh viên vào thi, hệ thống không kiểm tra giờ mở.
- `db/schema.sql` lệch so với migrations từ 011 trở đi.
- ERD drawio không có file nguồn.

### 6.2. Lựa chọn thiết kế (chủ dự án duyệt)

| Vấn đề | Lựa chọn |
|---|---|
| Khung thời gian | Một khung chung `opens_at/closes_at` cho cả kỳ thi, không chia ca từng thí sinh |
| Tránh trùng câu | Loại các câu của K thí sinh liền trước (K = clamp(floor(ngân hàng / n) − 1, 0, 3)), ưu tiên câu ít dùng trong kỳ thi, **cân bằng Bloom** để mọi thí sinh có cùng cơ cấu. Thiếu câu thì nới dần từ thí sinh cũ nhất và ghi cảnh báo. |
| Khởi động | Giảng viên gửi lịch (SCHEDULED). Admin bấm Khởi động: kỳ thi sang OPEN; song song làm nóng STT và TTS theo ngôn ngữ, sinh trước audio mọi câu đã duyệt, giữ ấm mỗi 5 phút tới `closes_at`. |
| Thứ tự làm | Xong STT/TTS, rồi làm tính năng, rồi chạy lớp E (để lớp E kiểm tra luôn tính năng mới) |
| ERD | Mermaid trong `architecture-aws.md` là nguồn chuẩn; xuất ra PNG |

### 6.3. Thực hiện (PR #32)

Chia cho 3 sub-agent làm trong worktree riêng (backend, frontend, docs), dùng chung một hợp đồng API đã chốt trước. Agent chính ghép lại, kiểm tra chéo và bỏ thay đổi `network.tf`: dòng đó là mô tả của rule security group, sửa vào sẽ làm thay đổi security group trên prod.

**Backend:**
- Migration `018_exam_schedule.sql`:
  - status thêm `SCHEDULED`;
  - cột mới `bloom_distribution`, `max_follow_ups_total`, `scheduled_*`, `started_*`, `warm_status`;
  - job type mới `KEEP_WARM`, `PREPARE_EXAM_AUDIO`;
  - thêm index.
- Đồng bộ `db/schema.sql` với migrations 011–018.
- Service:
  - `scheduleSession` / `unscheduleSession` / `startSession`;
  - `examLaunchService` warm song song bằng `Promise.allSettled`, request không chờ;
  - job keep-warm tự lên lịch lại;
  - module `pickBalancedQuestions`;
  - khoá dòng `SELECT … FOR UPDATE` khi bắt đầu phiên, chống hai sinh viên vào cùng lúc;
  - lỗi `EXAM_NOT_STARTED`;
  - giới hạn câu xoáy tổng theo thí sinh, giữ nguyên thứ tự quyết định.
- API:
  - Giảng viên: `POST /exam-sessions/:id/schedule|unschedule`; bỏ `/open`.
  - Admin: `GET /admin/exam-schedule`, `POST /admin/exam-sessions/:id/start|close|warm`.

**Frontend:**
- Trang giảng viên: khung giờ, cơ cấu Bloom, giới hạn xoáy theo thí sinh, nút Gửi lịch / Rút lịch.
- Trang Admin mới "Exam schedule": bộ lọc, tiến độ, huy hiệu warm STT/TTS, tiến độ audio, nút Start / Close / Warm again, tự làm mới mỗi 10 giây.
- Dashboard sinh viên: hiện giờ mở và trạng thái "Not started yet".

**Docs:**
- PRD: US-22..25.
- SRS: FR-EXAM-06..09, FR-INT-13/14, UC-10, BR-12..14, NFR-15.
- SDS, E2E Plan Management (Bước 12), `architecture-aws.md` (Mermaid triển khai và ERD), E2E Test Flow, README, E2E-Progress, 2 file `.docx`.
- `docs/erd.png` và `docs/architecture-aws.png` xuất từ Mermaid.
- Bỏ mật khẩu admin đang ghi rõ trong tài liệu E2E Test Flow.

**Kiểm thử:**
- `npm test` 463/463.
- `test:e2e` trên Postgres tạm (pgvector): 130 pass, có test hai sinh viên bắt đầu đồng thời trên SQL thật.
- Frontend lint và build đạt.

**Triển khai:**
- Sao lưu DB trước migration 018: `s3://aives-prod-backups-554013701253/pg/aives-20261022T173554Z.sql.gz`.
- Deploy xanh, migration 018 chạy thành công trên prod.

---

## 7. Giai đoạn 3: luồng nghiệp vụ lớp E trên prod

### 7.1. Chuẩn bị

- **Đếm mốc:** ghi số hàng của 28 bảng trước khi chạy, để so sau khi dọn.
- **Admin:** mật khẩu admin chủ dự án cung cấp bị từ chối (`INVALID_CREDENTIALS`). Agent dừng sau 1 lần thử, vì sai 5 lần là bị khoá. Theo lựa chọn của chủ dự án, agent tạo `TEST_ADMIN` bằng `create-admin` qua SSM với mật khẩu ngẫu nhiên.
- **Môn và tài khoản:**
  - Môn `TEST_SWD`, giảng viên `TEST_GV01`.
  - Sinh viên `TEST_SV01`, `TEST_SV02`. API chỉ cho tạo sinh viên qua nhập Excel, nên agent tạo file xlsx bằng exceljs.
  - 3 email đặt mật khẩu được gửi tới Gmail thật (job `SEND_EMAIL` đều `DONE`).
  - Chủ dự án dán link của GV01 và SV02; agent đặt mật khẩu ngẫu nhiên qua API. SV01 do chủ dự án tự đặt.
- **Tài liệu:** 2 PDF ngắn có lớp chữ (vi và en, về kiến trúc phân lớp, UML, SOLID, mẫu thiết kế), in bằng Chrome headless. Upload xong cả hai `READY` (parse, chunk, Titan embedding).

### 7.2. Lỗi chặn khi tạo topic, sửa ngay

- PR #33: `POST /api/topics` không nhận `subject_id`. Sinh câu và tạo kỳ thi đều cần topic thuộc môn. Cũng không có giao diện tạo topic.
- PR #34:
  - Bảng `topic` trên Postgres **không có cột `course_id`**, vì không migration nào tạo nó, nên API topic và nhập câu hỏi Excel luôn trả `DATABASE_ERROR`. Sửa bằng migration 019.
  - Cùng lúc phát hiện **pino ghi toàn bộ header Cookie (JWT access/refresh) vào log**. Đã che cookie, authorization và set-cookie. Đã kiểm tra lại: log không còn token.

### 7.3. Sinh câu hỏi bằng RAG và duyệt

- Topic 3 (vi) và 4 (en).
- Đường dẫn thật là `/api/question-generation-jobs`; kế hoạch ghi `/api/question-generation`.
- Job EN: 6/6 câu.
- Job VI: lần 1 `FAILED` do Nova báo `ModelErrorException` ("invalid sequence as part of ToolUse"), lần 2 tạo 7/8 câu.
- Mọi câu đều có nguồn trích dẫn (đoạn trích, tên file, trang).
- Tạo rubric 3 tiêu chí (50/30/20), duyệt hàng loạt 13 câu và gắn rubric.

### 7.4. Kỳ thi, lịch thi, Admin khởi động

- Tạo 2 kỳ thi `TEST_` (vi và en): 2 câu chính, tối đa 1 câu xoáy; bản VI cố định Bloom là 1 APPLY + 1 UNDERSTAND.
- Gửi lịch: chuyển sang SCHEDULED. Lệnh `/open` cũ của giảng viên trả 404.
- Trạng thái lỗi:
  - Khi kỳ thi còn SCHEDULED, sinh viên nhận `EXAM_NOT_OPEN`.
  - Sau khi Admin khởi động nhưng trước giờ mở, sinh viên nhận `EXAM_NOT_STARTED`.
- **Admin Start mất 216 ms.**
  - Warm STT xong trong 7,4 / 10,1 giây, TTS trong 5,8 / 3,7 giây (cold).
  - Audio sinh trước 7/7 và 6/6 trong 40–60 giây.
  - Keep-warm chạy mỗi 5 phút từ 00:19 đến 03:15 UTC rồi **tự dừng đúng `closes_at`**.

### 7.5. Sinh viên thi

**TEST_SV02 (agent qua API):**
- Câu trả lời là giọng Kokoro tổng hợp từ văn bản soạn sẵn, nên STT thật được chạy đầy đủ.
- Mỗi lần nộp câu mất 9–15 giây. Hai kỳ thi đều `COMPLETED`.

**TEST_SV01 (chủ dự án trên Chrome):**
- Kỳ thi đầu đã quá khung giờ (đóng lúc 10:14) khi chủ dự án vào lúc 13:14. Màn hình chỉ báo "currently unavailable", dễ hiểu nhầm là lỗi quyền. Agent giải thích nguyên nhân và tạo kỳ thi VI lần 2 với khung 13:17–18:15.
- Chủ dự án tự bấm **Start trên bảng Admin**; giao diện hoạt động.
- **TTS phát tốt.** Chủ dự án không tiện trả lời bằng giọng.
- Chủ dự án nhận xét **"chưa có phần để sinh viên test mic"**.

**Phân tích nhận xét về micro:**
- Mã đã có màn kiểm tra micro nhưng **không bao giờ hiện**.
- Lý do: `startOrResume` tạo sẵn lượt đầu ở trạng thái `ASKED`, nên vừa vào phòng là phát câu 1 ngay.

**Sửa trong PR #36:**
- Phiên mới hiện kiểm tra micro trước.
- Thêm "Ghi 3 giây và nghe lại".
- Bảng Admin có nhãn "Window ended" và ẩn nút Warm again khi quá giờ.
- Sinh viên thấy "This exam closed at …".

### 7.6. Câu xoáy và chấm điểm: thêm lỗi phát hiện

- **Không bao giờ hỏi câu xoáy.** `processing_failure` có 3 dòng `LLM_INVALID_OUTPUT`. Gọi thử Nova trực tiếp cho thấy Nova bỏ trường `covered_key_points` khi danh sách rỗng, dù schema bắt buộc trường này. Sửa trong PR #35. Sau sửa, câu trả lời mơ hồ được hỏi xoáy: "Bạn có thể mô tả cụ thể hơn về mẫu Adapter…".
- **Nova lỗi tạm thời không được thử lại**, khiến một bài VI bị `FLAGGED`. Log còn mất chi tiết lỗi vì dùng sai chữ ký hàm của pino. PR #35 thêm thử lại cho lỗi tạm thời. Chấm lại: `AI_SUGGESTED` 6,5.
- **Không trùng câu, cùng cơ cấu Bloom: đạt.**

| Thứ tự | Thí sinh | Câu (Bloom) |
|---|---|---|
| 1 | TEST_SV01 (13:30) | 17 UNDERSTAND, 15 APPLY |
| 2 | TEST_SV02 (13:35) | 12 UNDERSTAND, 13 APPLY |

- **Transcript:** sai 1 từ trên 24 ("ra" thành "da").
- **Lý do hỏi từng câu:** có, kèm trích dẫn tài liệu; chỉ giảng viên xem được.

### 7.7. Giảng viên xem kết quả, chỉnh điểm, chốt

- **Chỉnh 1 tiêu chí từ 2 lên 3 thì tổng giảm từ 2,00 xuống 1,00.**
  - Nguyên nhân: hàm tính lại nhận sai kiểu tham số, nên trọng số đọc ra bằng 0. Id kiểu chuỗi cũng không khớp với id kiểu số.
  - Sửa trong PR #37, có test hồi quy.
- **AI chỉ chấm 1/3 tiêu chí.**
  - Gọi thử Nova cho thấy với mảng mở, Nova chỉ trả 1 phần tử, kể cả khi đã ghi rõ số lượng trong prompt và thử lại.
  - PR #38: mỗi tiêu chí là một trường bắt buộc riêng; mỗi lần thử chỉ hỏi phần còn thiếu rồi gộp lại (thử trực tiếp 4/4 lần đủ 3 tiêu chí). Nếu vẫn thiếu thì `FLAGGED` "AI grading incomplete", không đưa ra tổng tính từ một phần tiêu chí.
- **Sau khi sửa, trên prod:**
  - 4/6 câu có đủ 3 tiêu chí, tổng tính đúng theo trọng số (ví dụ 5×0,5 + 2×0,3 + 6×0,2 = 4,3).
  - 2 câu còn lại bị gắn cờ an toàn.
  - Nâng tiêu chí của q12 từ 1 lên 6 cho q12 = 3,50, tổng 2,60 (đúng); lịch sử chỉnh ghi đủ điểm cũ, điểm mới và lý do.
  - Chốt điểm xong thì khoá chỉnh sửa (`RESULT_FINALIZED`).

### 7.8. Kiểm tra hệ thống (3.7)

- `background_job` của lần chạy đều `DONE`, trừ 1 job sinh câu VI lỗi trước khi sửa.
- 200 dòng log cuối: 0 lỗi. Log không còn cookie JWT.
- `processing_failure`: 3 dòng từ trước khi sửa và 1 dòng do bộ chặn "câu xoáy làm lộ đáp án" (chạy đúng thiết kế A4).
- Phát hiện mới: phiên của SV01 bỏ dở vẫn `IN_PROGRESS` sau hạn chót, vì không có cơ chế tự kết thúc phiên quá hạn.

---

## 8. Giai đoạn 4: dọn dữ liệu `TEST_`

**Cách làm:**
1. Đóng các kỳ thi `TEST_` để dừng keep-warm.
2. API không xoá được tài liệu vì câu hỏi còn trích dẫn (`MATERIAL_IN_USE`).
3. Đọc toàn bộ khoá ngoại của 28 bảng, soạn script xoá theo id đã ghi, đúng thứ tự phụ thuộc.
4. Bảng `background_job` chỉ xoá các job có payload trỏ tới id hoặc email `TEST_`, nên **giữ lại job email đặt lại mật khẩu của chủ dự án**.
5. Chạy thử trong transaction kết thúc bằng `ROLLBACK`. Lần đầu lỗi thứ tự cascade; sửa script rồi chạy thử lại.
6. Số hàng khớp với dự kiến thì chạy lại với `COMMIT`.

**Số hàng đã xoá:**

| Bảng | Số hàng |
|---|---|
| background_job | 103 |
| processing_failure | 4 |
| viva_result | 3 (kèm đánh giá, điểm tiêu chí, lịch sử chỉnh) |
| viva_interview | 4 (kèm lượt hỏi, transcript, câu được giao) |
| exam_session | 3 |
| question | 13 (kèm nguồn trích dẫn) |
| question_generation_job | 3 |
| rubric | 1 (kèm tiêu chí, mức) |
| course_material | 2 (kèm chunk) |
| topic | 2 |
| subject | 1 |
| app_user | 4 (`TEST_ADMIN`, `TEST_GV01`, `TEST_SV01`, `TEST_SV02`, kèm phiên đăng nhập, token) |

**S3:** liệt kê rồi xoá đúng 10 object đã ghi (2 PDF, 8 file audio trả lời). Giữ 15 object trong `tts-cache/`.

**So với mốc ban đầu:** mọi bảng nghiệp vụ bằng nhau. Bốn bảng chênh, đều đã kiểm tra là không thuộc dữ liệu của lần chạy:
- `schema_migrations` +1: migration 019.
- `auth_session` +3, `password_token` +2, `background_job` +2: hoạt động của tài khoản thật `AD01` và `TMQ_test_1` (đăng nhập, đặt lại mật khẩu). Giữ nguyên.

DynamoDB `interview#<id>` tự hết hạn theo TTL. File mật khẩu tạm, cookie và token ECR trên máy agent đã xoá.

---

## 9. Số đo tổng hợp

| Thành phần | Số đo |
|---|---|
| STT, câu 23–32 giây (x86_64, 3008 MB) | 15–16 giây, WER 0% (mẫu sạch, beam 5; beam 1 nhanh hơn 20–35%) |
| STT, câu 5 giây | khoảng 8 giây (chi phí cố định của cửa sổ 30 giây) |
| STT, cold start lần đầu sau image mới | 45–75 giây; các lần warm-up sau 2–10 giây |
| Nộp câu trên prod (STT và LLM quyết định xoáy) | 9–15 giây cho audio 6–17 giây |
| TTS mỗi câu (bên trong Lambda) | 2,7–8,9 giây; arm64 chậm hơn khoảng 40% |
| Sinh trước audio khi khởi động | 7 câu mất 40–60 giây, chạy nền |
| Request Admin Start | 216 ms |
| Keep-warm | 5 phút/lần, khoảng 3 GB-giây mỗi lần ping (chi phí không đáng kể) |

---

## 10. Danh sách PR và Deploy

| PR | Nội dung |
|---|---|
| #29 | Ghim PyAV 18.1 cho STT |
| #30 | Kokoro TTS trên Lambda (vi và en) |
| #31 | STT nhanh và chính xác trên Lambda (x86_64, VAD, beam 1, 3008 MB) |
| #32 | Bước 12: quản lý kỳ thi và lịch thi, Admin khởi động và làm nóng, chọn câu cân bằng |
| #33 | API topic nhận `subject_id` |
| #34 | Migration `topic.course_id`, che JWT trong log |
| #35 | Thử lại khi Nova lỗi, chấp nhận danh sách key point bị bỏ (câu xoáy hoạt động) |
| #36 | Màn kiểm tra micro hiện được, thêm nghe lại; hiển thị kỳ thi đã đóng |
| #37 | Chỉnh điểm tính lại tổng theo trọng số đúng |
| #38 | AI chấm đủ mọi tiêu chí của rubric |
| #39 | Báo cáo này |

Deploy thành công theo commit: `d07f910`, `ed0ca5d`, `3bbdd0b` (2 lần), `f9030f7`, `53e227f`, `6719bf2`, `c7196d6`, `810373f`, `49cb892`, `b47fd68`.

---

## 11. Blockers đã gặp và cách xử lý

| Blocker | Xử lý |
|---|---|
| CI `main` đỏ khi bắt đầu | PR #29 |
| Phiên `aws login` hết hạn (2 lần), Docker chưa bật | Chủ dự án đăng nhập lại và bật Docker |
| Auto-mode chặn push ECR và `git rebase` | Chủ dự án cho phép push; dùng `git merge` thay rebase |
| `docker login` ECR lỗi credential store trên Windows | Dùng Docker config tạm chứa token ECR |
| Account giới hạn RAM Lambda 3008 MB, chạy đồng thời 10 | Tối ưu trong giới hạn; gửi yêu cầu quota, đã được duyệt (1000) |
| Chạy image arm64 qua QEMU trên laptop chậm 10–50 lần | Bỏ bước test cục bộ; test thật trên CI và Lambda |
| Mạng chập chờn khi tải torch lúc build | Build lại |
| Mật khẩu admin prod không đúng | Tạo `TEST_ADMIN` riêng, đã xoá khi dọn |
| Khung giờ kỳ thi đóng trước khi chủ dự án vào | Tạo kỳ thi mới; sửa giao diện để báo rõ |
| Chủ dự án không tiện trả lời bằng giọng | Dùng giọng tổng hợp; bước giọng thật để lại |
| Lỗi chặn trong code (topic, câu xoáy, chấm điểm, chỉnh điểm, micro) | Sửa từng lỗi qua PR có test rồi chạy tiếp |

---

## 12. Việc còn lại (đề xuất theo thứ tự ưu tiên)

1. **Thi bằng giọng người thật:** trả lời 20–40 giây, F5 giữa chừng, dùng thử màn kiểm tra micro mới.
2. **Tự kết thúc phiên quá hạn:** job nền kết thúc các phiên `IN_PROGRESS` đã quá `deadline_at` và gửi chấm. Hiện phiên bỏ dở không có kết quả.
3. **Tăng RAM STT lên 6–10 GB** (quota đã mở) rồi đo lại. Dự kiến nhanh gấp 2–3 lần, chi phí mỗi lượt gần như không đổi.
4. **Chấm điểm:** 2/6 câu vẫn thiếu 1 tiêu chí sau 3 lần thử. Tách số lần thử cho lỗi tạm thời và cho tiêu chí thiếu, và ưu tiên id lấy từ tên trường.
5. **Chất lượng tiếng Việt của Nova Pro:** lý do chấm đôi khi méo dấu. Cân nhắc model khác hoặc thêm bước hậu kiểm.
6. **Lỗi nhỏ:**
   - `GET /questions?topicId=` bỏ qua bộ lọc.
   - `rubric_criterion.order_index` luôn bằng 1.
   - Job sinh câu bị `FAILED` vĩnh viễn khi lỗi tạm thời.
   - `pause_count` lệch tên trường.
   - Chưa có giao diện tạo topic.
   - Sửa đường dẫn `/api/question-generation-jobs` trong kế hoạch.
7. **Dọn môi trường:** worktree của sub-agent ở `.claude/worktrees/` và các nhánh tính năng trên GitHub đã merge.

---

## 13. Bảo mật: việc cần làm trước khi lên production thật

- **Đổi mật khẩu admin:** mật khẩu cũ từng nằm trong lịch sử git và đã được gửi qua chat.
- **Đổi `JWT_SECRET`** để vô hiệu các token từng bị ghi vào log trước PR #34 (refresh token sống 7 ngày).
- **Đổi Gmail App Password.**
- **Thôi dùng tài khoản root AWS** cho công việc hằng ngày; dùng IAM user/role có MFA.
- Xem lại quyền SSM/CloudWatch: log cũ có thể còn token cho tới khi hết hạn lưu giữ.
