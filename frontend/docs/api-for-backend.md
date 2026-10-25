# AIVES — Production API Contract & System Architecture

Tài liệu này chuẩn hóa API contract chính thức giữa **Frontend (React 19 SPA)** và **Backend (Express 5 REST API + Socket.IO)** trên cả môi trường `dev` và `prod` sau khi rà soát và khắc phục sự cố merge code.

---

## 1. Mạng, Port Mapping & Môi trường

| Môi trường | Frontend URL | Backend / API URL | Reverse Proxy / Gateway | WebSocket / Realtime |
|---|---|---|---|---|
| **Local Dev (Vite)** | `http://localhost:5173` | `http://localhost:3000` (Node Express) | Vite Proxy (`/api` -> `:3000`, `/socket.io` -> `:3000`) | `ws://localhost:3000/socket.io/` |
| **Local Compose** | `http://localhost:8080` | `backend:3000` (nội bộ Docker) | Nginx Container (`:8080`) | Nginx proxy `/socket.io/` -> `backend:3000` |
| **Production (AWS)** | CloudFront Distribution (`https://<domain>`) | EC2 Host `:80` (mapped `80:3000` Docker) | CloudFront routing: S3 cho SPA, `/api/*` & `/socket.io/*` sang EC2 | CloudFront forward `/socket.io/*` -> EC2 `:80` |

### Biến môi trường kết nối Frontend
| Biến môi trường | Mặc định | Ý nghĩa |
|---|---|---|
| `VITE_API_BASE_URL` | `/api` | Base URL cho REST API (same-origin qua proxy Nginx/CloudFront). Không hardcode port. |
| `VITE_WS_BASE_URL` | `""` (empty) | Base URL cho Socket.IO (mặc định cùng origin, namespace `/interview`). |

### Whitelist Port & CORS/CSRF
- **CSRF Check:** Backend kiểm tra header `Origin` khớp với `APP_BASE_URL` (ví dụ `http://localhost:8080` trên local, hoặc domain CloudFront trên Prod) đối với các request `POST`, `PUT`, `PATCH`, `DELETE`.
- **Cookie Auth:** Access token (`aives_access`) và Refresh token (`aives_refresh`) được đặt trong `httpOnly` secure cookie. Client **bắt buộc** truyền `credentials: 'include'` trong mọi request fetch.

---

## 2. Chuẩn Enums Hệ Thống (Database & Domain)

```text
User.role                 ADMIN | LECTURER | STUDENT
User.status               ACTIVE | LOCKED
Question.status           DRAFT | PENDING_REVIEW | APPROVED | REJECTED | ARCHIVED
Question.source           MANUAL | IMPORT | AI
Bloom.level               REMEMBER | UNDERSTAND | APPLY | ANALYZE
ExamSession.status        DRAFT | OPEN | CLOSED
Interview.status          IN_PROGRESS | COMPLETED | TIMED_OUT | DEADLINE_REACHED
GenerationJob.status      QUEUED | PROCESSING | COMPLETED | FAILED
```

---

## 3. REST API Endpoints Chính Thức

### 3.1 Authentication (`/api/auth`)
- `POST /api/auth/login`: `{ "identifier": "<email-or-code>", "password": "<pass>" }` -> Trả về `200 { "user": { "id", "email", "fullName", "role", "code" } }` và set HttpOnly cookies.
- `POST /api/auth/logout`: Xóa auth cookies.
- `GET /api/auth/me`: Trả về thông tin session hiện tại từ cookie.
- `POST /api/auth/refresh`: Cấp mới access token từ refresh cookie.
- `POST /api/auth/forgot-password`: Gửi email khôi phục mật khẩu qua background job `SEND_EMAIL`.
- `POST /api/auth/reset-password`: Đổi mật khẩu qua token email.
- `POST /api/auth/set-password`: Thiết lập mật khẩu ban đầu cho tài khoản mới.
- `PUT /api/auth/password`: Đổi mật khẩu khi đã đăng nhập.

### 3.2 Admin Management (`/api/admin`) - Role ADMIN
- `GET /api/admin/users`: Danh sách người dùng hệ thống.
- `POST /api/admin/users`: Tạo tài khoản mới (Lecturer/Student/Admin).
- `GET /api/admin/subjects`: Danh sách môn học.
- `POST /api/admin/subjects`: Tạo môn học mới.
- `PUT /api/admin/subjects/:id/lecturers`: Phân công giảng viên cho môn học.

### 3.3 Course Materials (`/api/materials`) - Role LECTURER / ADMIN
- `GET /api/materials?subjectId=<id>`: Danh sách tài liệu môn học.
- `POST /api/materials`: Upload tài liệu (PDF/DOCX/PPTX tối đa 50MB) -> Đẩy background job `INGEST_MATERIAL`.
- `DELETE /api/materials/:id`: Xóa tài liệu.

### 3.4 Questions & Generation (`/api/questions`, `/api/question-generation-jobs`)
- `GET /api/questions`: Lọc theo status, topicId, source, bloom.
- `POST /api/questions`: Tạo câu hỏi thủ công.
- `PUT /api/questions/:id`: Cập nhật nội dung câu hỏi.
- `DELETE /api/questions/:id`: Xóa câu hỏi (chặn nếu đã gán vào kỳ thi).
- `POST /api/questions/:id/approve`: Duyệt câu hỏi (yêu cầu gán rubric).
- `POST /api/questions/:id/reject`: Từ chối câu hỏi kèm lý do.
- `POST /api/questions/:id/archive`: Lưu trữ câu hỏi.
- `POST /api/questions/import`: Import hàng loạt câu hỏi từ file Excel.
- `POST /api/question-generation-jobs`: Yêu cầu AI sinh câu hỏi từ tài liệu môn học (`GENERATE_QUESTIONS` job).
- `GET /api/question-generation-jobs/:id`: Kiểm tra trạng thái tiến trình sinh câu hỏi.

### 3.5 Rubrics (`/api/rubrics`)
- `GET /api/rubrics`: Danh sách rubric theo môn học của giảng viên.
- `GET /api/rubrics/:id`: Chi tiết rubric kèm tiêu chí đánh giá và trọng số (tổng = 100).
- `POST /api/rubrics`: Tạo rubric mới.
- `PUT /api/rubrics/:id`: Sửa tiêu chí (bị khóa nếu rubric đã gán vào kỳ thi đang mở).
- `POST /api/rubrics/:id/clone`: Nhân bản rubric sang version mới.
- `DELETE /api/rubrics/:id`: Xóa rubric không sử dụng.

### 3.6 Exam Sessions & Realtime Viva
- `GET /api/exam-sessions`: Giảng viên quản lý ca thi viva.
- `POST /api/exam-sessions`: Tạo ca thi mới.
- `POST /api/exam-sessions/:id/open`: Mở ca thi (yêu cầu đủ câu hỏi đã duyệt).
- `POST /api/exam-sessions/:id/close`: Đóng ca thi.
- `GET /api/me/exam-sessions`: Sinh viên xem các ca thi được phân công.
- `POST /api/interviews`: Bắt đầu hoặc tiếp tục buổi phỏng vấn viva.
- `GET /api/interviews/:id`: Lấy trạng thái an toàn cho sinh viên (Student-safe view: không lộ đáp án/rationale).
- **Socket.IO Namespace `/interview`:**
  - Event `student:join`: Sinh viên kết nối với `interviewId`.
  - Event `student:audio_chunk`: Sinh viên stream audio câu trả lời.
  - Event `turn:question`: Server phát câu hỏi kèm TTS audio URL.
  - Event `turn:ended`: Kết thúc lượt hỏi.

### 3.7 Grading & Review (`/api/exam-sessions/:id/results`, `/api/results/:id`)
- `GET /api/exam-sessions/:id/results`: Danh sách kết quả chấm điểm của sinh viên trong ca thi.
- `GET /api/results/:id`: Chi tiết điểm viva, điểm từng tiêu chí rubric, đề xuất AI, transcript và file ghi âm.
- `PUT /api/criterion-scores/:id`: Giảng viên điều chỉnh điểm tiêu chí (bắt buộc nhập lý do thay đổi).
- `POST /api/results/:id/finalize`: Giảng viên chốt và khóa bảng điểm chính thức.
- `POST /api/results/:id/reopen`: Mở lại bảng điểm để chỉnh sửa khi có khiếu nại.
