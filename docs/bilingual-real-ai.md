# Ngôn ngữ UI và kiểm chứng AI thật

UI mặc định tiếng Việt. Bộ chọn tại trang đăng nhập và thanh trên cùng lưu lựa chọn Việt–Anh vào `localStorage` với khóa `aives.uiLanguage`. Đổi UI không đổi ngôn ngữ kỳ thi và không dịch nội dung do người dùng nhập. Ngày giờ giữ múi giờ hiện có, định dạng theo ngôn ngữ UI.

Giảng viên đặt `VI` hoặc `EN` cho kỳ thi. Backend truyền giá trị đó đến STT, TTS, sinh câu hỏi phụ và chấm điểm. Khi tạo câu hỏi hoặc sinh câu hỏi từ tài liệu, giảng viên cũng chọn ngôn ngữ nội dung riêng.

## Chạy ứng dụng

`npm start` kiểm tra cấu hình trước khi mở database/listener. Cả bốn provider phải là dịch vụ thật; `AWS_MOCK_MODE=true`, provider `mock` hoặc tên provider không hỗ trợ làm khởi động thất bại với `AI_CONFIG_INVALID`.

Mặc định: `STT_PROVIDER=lambda`, `TTS_PROVIDER=kokoro`, `LLM_PROVIDER=bedrock`, `EMBEDDING_PROVIDER=bedrock`. Model mặc định là Nova Pro và Titan Embed Text v2. Các adapter mock chỉ được dùng khi dựng ứng dụng trong kiểm thử qua dependency injection hoặc harness kiểm thử.

### Docker local

1. Đăng nhập AWS và xuất thông tin truy cập tạm thời vào môi trường shell đang chạy Compose. Với AWS CLI hỗ trợ `export-credentials`, trên PowerShell:

   ```powershell
   $taskCredentials = aws configure export-credentials --format process | ConvertFrom-Json
   $env:AWS_ACCESS_KEY_ID = $taskCredentials.AccessKeyId
   $env:AWS_SECRET_ACCESS_KEY = $taskCredentials.SecretAccessKey
   $env:AWS_SESSION_TOKEN = $taskCredentials.SessionToken
   docker compose up -d --build
   ```

2. Tài khoản AWS cần quyền gọi Nova/Titan tại vùng model tương ứng. Không lưu thông tin truy cập thật vào Git. Thông tin truy cập trong container hết hạn cùng phiên AWS; xuất lại và tạo lại backend khi hết hạn.
3. Compose chạy model STT/TTS thật bằng Lambda RIE; tên hàm local là `function`. Backend dùng `http://stt:8080` và `http://tts:8080`. Khi chạy backend ngoài Docker, dùng endpoint cổng 8081 và 8082 trong `.env.example`.
4. MinIO dùng `S3_ACCESS_KEY_ID`/`S3_SECRET_ACCESS_KEY` riêng. `STORAGE_BUCKET_AUTO_CREATE=true` tạo bucket local khi thiếu; production dùng bucket do Terraform quản lý. Chạy ứng dụng tại `http://localhost:8080`.
5. Lần tải model đầu có thể mất vài phút trên CPU. Compose local chờ STT tối đa 120 giây và TTS 180 giây. Luồng khởi động kỳ thi làm nóng model trước khi sinh viên trả lời. Production giữ timeout riêng trong Compose production.

### Kiểm thử offline

`npm test` và `npm run test:e2e` trong `backend/` dùng cấu hình mock tường minh qua `test/runTests.js`. Các bài E2E Postgres cần `TEST_DATABASE_URL`; nên dùng database kiểm thử mới để tránh dữ liệu từ lần chạy trước ảnh hưởng truy vấn có giới hạn.

Smoke test Compose offline dùng override riêng:

```bash
docker compose -f docker-compose.yml -f docker-compose.test.yml up -d --build postgres backend minio nginx
```

Override này chạy `test/startServer.js`, được mount từ thư mục test, và không thuộc image production. Không dùng override kiểm thử để triển khai.

## Lỗi giọng nói

- STT lỗi sau hai lần gọi: ghi nhận lỗi vận hành, trả `STT_FAILED`, giữ câu hiện tại và hạn giờ đã lưu. Các lần lỗi tiếp theo cũng không được ghi thành câu trả lời rỗng. Hạn giờ toàn bài vẫn có hiệu lực.
- Trình duyệt giữ bản ghi âm cho lượt hiện tại để sinh viên gửi lại hoặc ghi âm lại. Đoạn âm thanh cuối phải được gửi trước `answer:end`. Backend giữ thao tác chiếm lượt nguyên tử để ngăn ghi nhận trùng.
- TTS lỗi hoặc không tìm thấy tệp: dùng giọng trình duyệt với `vi-VN`/`en-US` theo kỳ thi và hiển thị trạng thái dự phòng. Nếu không có giọng trình duyệt, câu hỏi vẫn hiển thị và có nút tiếp tục. Endpoint âm thanh thiếu trả `502 TTS_AUDIO_UNAVAILABLE`, không trả byte âm thanh giả.

## Kiểm chứng tích hợp thật

Trên host đã cấu hình dịch vụ thật:

```bash
docker exec aives-backend node src/cli/verifyRealAi.js --create-test-fixtures
```

Lệnh này gọi dịch vụ có phát sinh phí và tạo dữ liệu tổng hợp đánh dấu `[TEST]`/`AI-SMOKE-*`: người dùng không có mật khẩu, môn học, tài liệu, rubric, câu hỏi và hai kỳ thi Việt–Anh. Nó kiểm tra upload/parse PPTX, embedding, retrieval, sinh câu hỏi có trích dẫn, đọc câu hỏi, tổng hợp câu trả lời để chạy STT, phỏng vấn và chấm điểm. Các job của lượt kiểm chứng được gọi đồng bộ; dịch vụ AI, database, S3 và DynamoDB đều thật. Không đọc bài thi của người dùng khác. Kỳ thi thử được đóng khi lệnh kết thúc; giữ dữ liệu thử để kiểm tra báo cáo.

Kết quả cuối là JSON với mã lượt chạy, ID fixture và trạng thái từng ngôn ngữ. `followUps` phản ánh quyết định thật của model; không ép model hỏi phụ khi engine quyết định chuyển câu. `AI_SMOKE_DEBUG=true` chỉ in dữ liệu tổng hợp dùng trong lệnh để chẩn đoán sinh câu hỏi và quyết định hỏi phụ. Không bật chế độ này cho công việc khác.

## Phát hành và khôi phục

Phát hành qua CI và workflow deploy hiện có từ `main`. Trước phát hành ghi lại backend image, image digest Lambda và bản frontend đang phục vụ. Sau phát hành kiểm tra `/health`, ảnh backend đang chạy, trạng thái hai Lambda và chạy smoke test thật ở trên. Khi cần khôi phục, dùng backend image và Lambda image digest đã ghi nhận, đồng thời khôi phục bộ asset/frontend tương ứng; không thay đổi dữ liệu thi thật.
