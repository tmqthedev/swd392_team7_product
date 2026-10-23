# AIVES: kết quả chạy kế hoạch E2E (lớp E) và Bước 12

Ngày chạy: 2026-10-22 đến 2026-10-23. Người chạy: agent (Claude Code), chủ dự án duyệt quyết định và làm bước cần người thật. Kế hoạch gốc: `docs/e2e-execution-plan.md`. Môi trường: prod AWS `ap-southeast-1` (account 554013701253), app https://d36ezmiqpl9miu.cloudfront.net.

## 1. Tóm tắt

- **STT và TTS thật đã chạy trên prod.** STT: PhoWhisper-small (vi) / Whisper small (en) trên Lambda `aives-prod-stt`. TTS: Kokoro-82M (vi fine-tune + en) trên Lambda `aives-prod-tts`. Cả hai x86_64, 3008 MB. Chủ dự án xác nhận TTS nghe tốt.
- **Thêm nhóm chức năng "Quản lý kỳ thi & lịch thi" (Bước 12)**:
  - khung giờ mở/đóng do giảng viên đặt;
  - luồng DRAFT → SCHEDULED → OPEN → CLOSED;
  - bảng lịch thi cho Admin, nút Khởi động làm nóng STT/TTS song song, sinh trước audio và giữ ấm tới giờ đóng;
  - chọn câu không trùng giữa các thí sinh liền kề, cân bằng Bloom;
  - giới hạn câu xoáy theo thí sinh.
  Tài liệu và ERD đã cập nhật.
- **Luồng nghiệp vụ lớp E chạy hết trên prod với dữ liệu `TEST_`.** Có đúng một bước không làm được là thi bằng giọng người thật: chủ dự án không tiện trả lời, nên dùng giọng Kokoro tổng hợp thay thế.
- **Phát hiện và sửa 12 lỗi** trong lúc chạy. Có 2 lỗi bảo mật/dữ liệu đáng chú ý: JWT bị ghi vào log, và điểm AI chỉ chấm 1 trên 3 tiêu chí.
- **Toàn bộ dữ liệu `TEST_` đã được dọn.** Số hàng các bảng nghiệp vụ bằng lúc trước khi chạy.
- Tổng cộng 10 PR (#29 đến #38) đã merge, CI xanh, 11 lần Deploy thành công.

## 2. Kết quả từng giai đoạn

| Giai đoạn | Bước | Trạng thái | Bằng chứng ngắn |
|---|---|---|---|
| 0 | Kiểm tra trước | Đạt sau khi sửa | CI `main` đỏ ở `stt-image` (PyAV 19 bỏ tham số `metadata_errors`). Sửa bằng PR #29 (pin `av==18.1.0`), CI xanh. |
| 1 | Bật STT trên Lambda | Đạt sau khi sửa | `aives-prod-stt` tạo qua Terraform (thêm 1 tài nguyên, không huỷ gì). Lần đầu quá chậm và nói bịa; sửa ở PR #31. Deploy bật bước "Update STT Lambda code". Backend healthy, log không lỗi STT. |
| 2 | Bật TTS Kokoro | Đạt | PR #30 (Lambda `lambda/tts`, adapter `kokoro`, Terraform, CI `tts-image`). Câu hỏi có `audioKey = tts-cache/<sha256>.wav`. `/api/tts/*.wav` trả `audio/wav` 24 kHz. Chủ dự án nghe và xác nhận. |
| 3.1 | Admin, môn, tài khoản, email | Đạt, có thay đổi | Mật khẩu admin được cung cấp bị từ chối (`INVALID_CREDENTIALS`). Theo lựa chọn của chủ dự án, tạo admin riêng `TEST_ADMIN` bằng `create-admin`. Đã tạo môn `TEST_SWD`, GV `TEST_GV01`, SV `TEST_SV01` và `TEST_SV02` (nhập qua Excel). Email đặt mật khẩu đến Gmail thật. |
| 3.2 | Upload PDF, ingest | Đạt | 2 PDF có lớp chữ (vi, en) → `READY` (parse, chunk, Titan embedding). |
| 3.3 | Sinh câu RAG, duyệt, rubric | Đạt sau khi sửa | Trước tiên phải sửa API topic (PR #33, #34). Job EN tạo 6/6 câu. Job VI lần 1 `FAILED` do lỗi Nova, lần 2 tạo 7/8. 13 câu có trích dẫn nguồn (đoạn văn, tên file, trang). Đã duyệt hàng loạt và gắn rubric 3 tiêu chí. |
| 3.4 | Tạo kỳ thi, gửi lịch, Admin khởi động | Đạt | 3 kỳ thi `TEST_` (VI, EN, VI lần 2). Lệnh `/open` cũ của giảng viên trả 404. Admin Start mất 216 ms. Warm STT/TTS ok, audio 7/7 và 6/6, keep-warm 5 phút/lần, dừng đúng `closes_at`. `EXAM_NOT_OPEN` và `EXAM_NOT_STARTED` đúng. |
| 3.5 | Sinh viên thi | Đạt một phần | Chủ dự án vào thi `TEST_SV01`: TTS Kokoro phát tốt, nhưng không trả lời bằng giọng. `TEST_SV02` thi qua API bằng giọng Kokoro tổng hợp. Transcript đúng, chỉ sai 1 từ trên 24 ("ra" thành "da"). Câu xoáy được hỏi sau PR #35. Không kiểm tra được F5 giữa chừng với người thật. |
| 3.5b | Không trùng câu, cùng cơ cấu Bloom | Đạt | Kỳ thi 5: SV01 nhận {17 UNDERSTAND, 15 APPLY}, SV02 thi ngay sau nhận {12 UNDERSTAND, 13 APPLY}. Không trùng câu nào, cùng cơ cấu Bloom. |
| 3.6 | Giảng viên xem kết quả, chỉnh điểm, chốt | Đạt sau khi sửa | Có lý do hỏi từng câu kèm nguồn, transcript, điểm theo tiêu chí. Hai lỗi đã sửa: chỉnh điểm làm tổng giảm (PR #37), AI chỉ chấm 1 tiêu chí (PR #38). Sau sửa: nâng 1 tiêu chí 1 → 6 cho q12 = 3,50, tổng 2,60 (đúng). Đã chốt; sau khi chốt thì khoá (`RESULT_FINALIZED`). |
| 3.7 | Kiểm tra hệ thống | Đạt | Mọi `background_job` của lần chạy `DONE`, trừ job sinh câu VI lỗi trước khi sửa. 200 dòng log cuối không có lỗi. Không còn cookie JWT trong log. `processing_failure`: 3 lỗi trước khi sửa và 1 lần bộ chặn "lộ đáp án" chạy đúng thiết kế. |
| 4 | Dọn dữ liệu `TEST_` | Đạt | SQL theo id, chạy `ROLLBACK` trước để đếm, sau đó `COMMIT`. Xoá 10 object S3 theo đúng key đã ghi (2 PDF, 8 file audio trả lời). Giữ `tts-cache/`. Số hàng các bảng nghiệp vụ khớp lúc đầu (chi tiết ở mục 6). |
| 5 | Báo cáo | Đạt | File này. |

## 3. Số đo hiệu năng

**STT** (Lambda x86_64, 3008 MB, model small, VAD, không word timestamps):

| Cấu hình | Kết quả |
|---|---|
| arm64, 2048 MB | Câu vi 5,6 giây: timeout 30 giây. Câu en 4,5 giây: 16–18 giây. |
| arm64, 3008 MB | Câu vi mất 49 giây và **nói bịa** đoạn cuối im lặng. |
| x86_64, 3008 MB (beam 5) | Câu trả lời 23–32 giây được nhận dạng trong 15–16 giây, WER 0% trên mẫu sạch. |
| Model base (thử để so sánh) | Nhanh gấp khoảng 2 lần nhưng sai từ tiếng Việt. Chủ dự án chọn small. |
| Cold start lần đầu sau image mới | 45–75 giây. Sau đó warm-up mỗi lần 2–10 giây. Keep-warm giữ Lambda ấm suốt kỳ thi. |
| Nộp một câu trả lời trên prod | 9–15 giây cho audio 6–17 giây (STT cộng LLM quyết định câu xoáy). |

Whisper luôn mã hoá đủ cửa sổ 30 giây, nên câu ngắn tốn gần bằng câu 30 giây.

**TTS** (Kokoro ONNX, thời gian chạy bên trong Lambda):

| Cấu hình | Kết quả |
|---|---|
| x86_64, 3008 MB | 2,7–8,9 giây mỗi câu. Đo từ máy ở Việt Nam thì chậm hơn 5–10 giây do khởi động CLI và tải WAV về. |
| arm64 | Chậm hơn khoảng 40%. |
| 2048 MB | Gần hết RAM (dùng 1848–2028 MB khi nạp cả 2 model). |
| Sinh trước khi Admin khởi động | 7 câu mất 40–60 giây, chạy nền, request Start không chờ. |

## 4. Những quyết định và lý do

- **Mở PR sửa CI thay vì dừng** (giai đoạn 0): chủ dự án chọn. Nguyên nhân rõ ràng: thiếu pin phiên bản.
- **STT trên x86_64 thay vì arm64**: CTranslate2 int8 chạy trên x86 (AVX2) nhanh gấp khoảng 2 lần, giá cao hơn khoảng 20%.
- **Tắt word timestamps, bật VAD, `condition_on_previous_text=False`, beam 1**:
  - Word timestamps làm thời gian tăng gấp khoảng 2 lần, mà chỉ phục vụ `pause_count`. Chỉ số này đã luôn bằng 0 vì lệch tên trường.
  - VAD và `condition_on_previous_text=False` loại bỏ đoạn nói bịa.
  - Beam 1 nhanh hơn khoảng 30%, WER không đổi trên mẫu thử.
- **Giữ model small cho cả hai ngôn ngữ**: chủ dự án chọn. Transcript là đầu vào để chấm điểm nên ưu tiên độ chính xác.
- **TTS Kokoro dùng ONNX, không dùng `hexgrad/kokoro`**:
  - `hexgrad/kokoro` không có tiếng Việt và cần torch lúc chạy (nạp mất 22 giây).
  - Tiếng Việt dùng `contextboxai/Kokoro-Vietnamese` (metadata ghi Apache-2.0, README không có văn bản license; rủi ro đã ghi trong PR #30).
  - Tiếng Anh dùng `kokoro-onnx`.
- **TTS x86_64, 3008 MB**: đo cả hai kiến trúc và hai mức RAM rồi chọn theo tiêu chí "hiệu năng và độ chính xác cao nhất trong chi phí hợp lý" của chủ dự án.
- **Bước 12 theo lựa chọn của chủ dự án**:
  - Chỉ có khung giờ chung, không chia ca từng thí sinh.
  - Không trùng câu với K thí sinh liền trước, ưu tiên câu ít dùng, cân bằng Bloom.
  - Admin Khởi động thì mở thi và làm nóng.
  - Thứ tự: làm xong STT/TTS, rồi làm tính năng, rồi chạy lớp E.
- **Làm song song bằng 3 sub-agent** (backend, frontend, docs) trong worktree riêng với hợp đồng API chung. Sau đó ghép và kiểm tra chéo; bỏ thay đổi `network.tf` vì nó sửa mô tả security group trên prod.
- **Tạo `TEST_ADMIN` thay vì đoán mật khẩu admin**: tài khoản bị khoá sau 5 lần sai. Chủ dự án chọn.
- **Sửa lỗi qua PR có test hồi quy rồi mới chạy tiếp**, không sửa tay trên prod. Riêng lần đổi kiến trúc/RAM Lambda để đo đạc là thao tác có chủ đích; Terraform đã đồng bộ lại sau đó.
- **Sao lưu DB trước migration 018** (`s3://aives-prod-backups-554013701253/pg/aives-20261022T173554Z.sql.gz`).

## 5. Lỗi phát hiện và đã sửa

| PR | Lỗi | Ảnh hưởng | Cách sửa |
|---|---|---|---|
| #29 | PyAV 19 bỏ `metadata_errors` | Mọi lần STT đều lỗi | Pin `av==18.1.0`, `faster-whisper==1.2.1` |
| #31 | STT chậm, nói bịa khi im lặng | Timeout, transcript sai | x86_64, VAD, beam 1, 3008 MB, `STT_TIMEOUT_MS=90000` |
| #30 | `/api/tts` chỉ đọc `tts/` | Audio cache `tts-cache/` (cả Google) không bao giờ được phát | Đọc `tts-cache/` trước |
| #33 | API topic không gắn được môn | Không tạo được topic dùng cho sinh câu và tạo kỳ thi | Nhận `subject_id` |
| #34 | Thiếu cột `topic.course_id` trên Postgres | `POST /api/topics` và nhập câu hỏi Excel luôn `DATABASE_ERROR` | Migration 019 |
| #34 | **pino ghi toàn bộ Cookie (JWT access/refresh) vào log** | Lộ token trong log | Che `cookie`, `authorization`, `set-cookie` |
| #35 | Nova bỏ trường `covered_key_points` rỗng | **Không bao giờ hỏi câu xoáy** | Thiếu trường thì coi là rỗng |
| #35 | Nova thỉnh thoảng trả `ModelErrorException` | Điểm VI bị `FLAGGED`, job sinh câu lỗi | Thử lại lỗi tạm thời (tối đa 3 lần) |
| #36 | Màn kiểm tra micro không bao giờ hiện | Sinh viên không thử được micro | Hiện trước câu đầu, thêm ghi 3 giây và nghe lại |
| #36 | Kỳ thi quá giờ vẫn hiện OPEN, thông báo chung chung | Admin và sinh viên khó hiểu | Thêm nhãn "Window ended" và thông báo "đã đóng lúc …" |
| #37 | Chỉnh điểm tiêu chí làm tổng **giảm** | Điểm sai | Tính lại theo trọng số, chuẩn hoá id |
| #38 | **AI chỉ chấm 1/3 tiêu chí** | Điểm câu chỉ dựa trên 1 tiêu chí | Mỗi tiêu chí một trường bắt buộc, hỏi bù tiêu chí còn thiếu; thiếu thì `FLAGGED` |

## 6. Dọn dữ liệu

Đã xoá:

| Bảng | Số hàng |
|---|---|
| background_job | 103 |
| processing_failure | 4 |
| viva_result | 3 (kèm đánh giá, điểm tiêu chí, lịch sử chỉnh) |
| viva_interview | 4 (kèm lượt hỏi, transcript) |
| exam_session | 3 |
| question | 13 (kèm nguồn) |
| question_generation_job | 3 |
| rubric | 1 |
| course_material | 2 (kèm chunk) |
| topic | 2 |
| subject | 1 |
| app_user | 4 (`TEST_ADMIN`, `TEST_GV01`, `TEST_SV01`, `TEST_SV02`, kèm phiên đăng nhập và token) |

Xoá thêm 10 object S3.

So với lúc trước khi chạy, mọi bảng nghiệp vụ bằng nhau. Bốn bảng chênh, đều không thuộc dữ liệu của lần chạy:
- `schema_migrations` +1: migration 019.
- `auth_session` +3, `password_token` +2, `background_job` +2: hoạt động của tài khoản thật (`AD01`, `TMQ_test_1`) trong lúc chạy, ví dụ đăng nhập và đặt lại mật khẩu. Không phải dữ liệu `TEST_` nên giữ nguyên.

DynamoDB `interview#<id>` tự hết hạn theo TTL.

## 7. Blockers đã gặp

- Phiên `aws login` hết hạn 2 lần. Docker Desktop chưa bật lúc đầu.
- Auto-mode chặn lệnh push ECR lần đầu và lệnh `git rebase`. Đã dùng `git merge` thay cho rebase.
- `docker login` ECR trên Windows lỗi credential store ("The stub received bad data"). Đã dùng một Docker config tạm.
- Account AWS mới bị giới hạn RAM Lambda 3008 MB và 10 lambda chạy đồng thời. Đã gửi yêu cầu tăng quota; **đã được duyệt** (concurrency hiện là 1000).
- Mật khẩu admin prod được cung cấp không đúng.
- Khung giờ kỳ thi đầu (07:18–10:14) đã đóng trước khi chủ dự án vào thi, nên phải tạo kỳ thi mới.
- Chủ dự án không tiện trả lời bằng giọng.
- Chạy image arm64 qua QEMU trên laptop chậm hơn 10–50 lần, nên đã bỏ bước test cục bộ đó.

## 8. Việc còn lại

1. **Kiểm thử bằng giọng người thật**: trả lời 20–40 giây, F5 giữa chừng, thử màn kiểm tra micro mới (PR #36).
2. **Phiên thi bỏ dở không tự kết thúc**: phiên của SV01 đứng ở `IN_PROGRESS` sau hạn chót, nên không có kết quả. Cần job nền kết thúc phiên quá hạn và gửi chấm.
3. **Tăng RAM STT lên 6–10 GB** (đã được phép sau khi quota được duyệt), sau đó đo lại. Dự kiến nhanh gấp 2–3 lần mà chi phí mỗi lượt gần như không đổi.
4. **Chấm điểm**: 2 trên 6 câu vẫn thiếu 1 tiêu chí sau 3 lần thử (đã được gắn `FLAGGED` an toàn). Nên tách số lần thử cho lỗi tạm thời và cho tiêu chí thiếu, và ưu tiên id lấy từ tên trường.
5. **Nova Pro viết lý do chấm tiếng Việt đôi khi bị méo dấu** ("Hợổng diễn đạt…"). Cân nhắc model khác hoặc hậu kiểm.
6. **Lỗi nhỏ**:
   - `GET /questions?topicId=` bỏ qua bộ lọc.
   - `rubric_criterion.order_index` luôn bằng 1.
   - Job sinh câu bị đánh `FAILED` vĩnh viễn khi gặp lỗi tạm thời.
   - `speechSignals` đọc `start/end` trong khi adapter trả `startMs/endMs`.
   - Chưa có giao diện tạo topic.
   - Kế hoạch ghi `/api/question-generation` nhưng đường dẫn đúng là `/api/question-generation-jobs`.
7. **Dọn môi trường cục bộ**: các worktree của sub-agent ở `.claude/worktrees/` và các nhánh tính năng trên GitHub đã merge, có thể xoá.

## 9. Nhắc về bảo mật (trước khi lên production thật)

- **Đổi mật khẩu admin**: mật khẩu cũ từng nằm trong lịch sử git và đã được gửi qua chat.
- **Đổi `JWT_SECRET`** để vô hiệu các token từng bị ghi vào log trước PR #34 (refresh token sống 7 ngày).
- Đổi Gmail App Password.
- Thôi dùng tài khoản root AWS cho công việc hằng ngày; dùng IAM user/role có MFA.
