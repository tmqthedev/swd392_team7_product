# AIVES - Software Requirements Specification (SRS)
### Đặc tả Yêu cầu Phần mềm theo Chuẩn ISO/IEC/IEEE 29148:2018

**Tên hệ thống**: AIVES (AI-assisted Viva Examination System)  
**Mã học phần / Đồ án**: SWD392 — Software Architecture and Design  
**Tác giả**: @tmqthedev & Antigravity AI Pair Programmer  
**Ngày cập nhật**: 25/10/2026 · Phiên bản: 2.0 (Master Release E2E Live Production)

---

## 1. GIỚI THIỆU (INTRODUCTION)

### 1.1. Mục đích tài liệu (Purpose)
Tài liệu này quy định đầy đủ các yêu cầu chức năng (Functional Requirements - FR) và phi chức năng (Non-Functional Requirements - NFR) cho hệ thống **AIVES** (AI-assisted Viva Examination System). Bản đặc tả này đóng vai trò là cơ sở kỹ thuật chính thức cho toàn bộ hoạt động thiết kế kiến trúc, cài đặt mã nguồn, kiểm thử chấp nhận (Acceptance Testing) và nghiệm thu chuyển giao hệ thống, tuân thủ tiêu chuẩn kỹ thuật quốc tế **ISO/IEC/IEEE 29148:2018**.

### 1.2. Phạm vi sản phẩm (Product Scope)
AIVES là nền tảng kiểm tra vấn đáp bằng giọng nói tích hợp AI tương tác thời gian thực, phục vụ công tác khảo thí các môn học thực hành phần mềm. Hệ thống bao quát 7 phân hệ nghiệp vụ chính:
1. **Xác thực & Phân quyền (AUTH)**: Quản lý danh tính, phân quyền dựa trên vai trò (RBAC) và phạm vi môn học (Subject Scoping).
2. **Quản trị Chủ đề & Học liệu (TOPIC & MAT)**: Quản lý cây chủ đề thi và học liệu giảng dạy phục vụ RAG.
3. **Ngân hàng Câu hỏi & Rubric (QB)**: Quản lý câu hỏi theo thang tư duy Bloom, phát hiện trùng lặp vector và cấu trúc tiêu chí Rubric đa mức.
4. **Sinh Câu hỏi Bằng AI (RAG)**: Trích xuất tri thức từ giáo trình/slide, phân đoạn vector và sinh câu hỏi có kiểm định trích dẫn nguồn.
5. **Quản lý Kỳ thi & Lịch thi (EXAM)**: Thiết lập kỳ thi theo môn học, gán thí sinh/giám khảo, gửi lịch thi và điều phối kích hoạt tập trung.
6. **Lõi Phỏng vấn Thời gian thực (INT)**: Phòng thi giọng nói Socket.IO, streaming âm thanh PCM, hỏi xoáy thích ứng và tự động quét quá hạn.
7. **Chấm điểm Gợi ý & Thẩm định (GRD)**: AI chấm điểm theo Rubric, phân quyền giám khảo chấm thi và giao diện công bố kết quả cho sinh viên.

### 1.3. Bảng thuật ngữ & Viết tắt (Glossary)

| Thuật ngữ | Định nghĩa & Ý nghĩa kỹ thuật |
| :--- | :--- |
| **Viva Examination** | Kỳ thi vấn đáp trực tiếp 1-1 giữa giám khảo (hoặc AI) và thí sinh thông qua tương tác giọng nói. |
| **Exam Session (Kỳ thi)** | Một đợt tổ chức thi cho một chủ đề cụ thể, có khung giờ mở/đóng chung, danh sách sinh viên ghi danh và ban giám khảo được phân công. |
| **Viva Interview (Phiên thi)**| Tiến trình thi của một sinh viên cụ thể trong một kỳ thi, bao gồm chuỗi các lượt hỏi đáp. |
| **QA Turn (Lượt hỏi đáp)** | Cặp tương tác gồm một câu hỏi phát ra từ hệ thống và một câu trả lời thu nhận từ thí sinh. |
| **Main Question (Câu chính)**| Câu hỏi xuất phát từ ngân hàng câu hỏi đã duyệt, được hệ thống phân bổ cân bằng theo mức Bloom. |
| **Follow-up Question (Câu hỏi xoáy)** | Câu hỏi phụ do AI tự động sinh trong lúc thi nhằm đào sâu, làm rõ câu trả lời của câu chính. |
| **Bloom Taxonomy** | Thang đo 4 mức độ tư duy nhận thức: Nhớ (`REMEMBER`), Hiểu (`UNDERSTAND`), Vận dụng (`APPLY`), Phân tích (`ANALYZE`). |
| **Rubric** | Bộ tiêu chí đánh giá có trọng số (tổng 100%), mỗi tiêu chí chứa các mức hoàn thành (`performance_level`) kèm khoảng điểm và mô tả chi tiết. |
| **RAG** | *Retrieval-Augmented Generation* — Cơ chế sinh nội dung dựa trên các đoạn tài liệu được truy xuất theo độ tương đồng vector ngữ nghĩa. |
| **STT / TTS** | *Speech-to-Text* (Chuyển giọng nói thành văn bản) và *Text-to-Speech* (Tổng hợp văn bản thành giọng nói). |
| **Human-in-the-Loop** | Nguyên tắc thiết kế AI mang tính gợi ý, quyết định điểm số cuối cùng bắt buộc do con người (Giảng viên) phê duyệt. |

### 1.4. Tài liệu tham chiếu (References)
- ISO/IEC/IEEE 29148:2018: Systems and software engineering — Life cycle processes — Requirements engineering.
- ISO/IEC/IEEE 29119-3:2013: Software testing — Part 3: Test documentation.
- IEEE Std 1016-2009: Standard for Information Technology — Systems Design — Software Design Descriptions.
- AIVES Product Requirements Document (PRD v2.0): `docs/AIVES - PRD.md`.
- AIVES Software Design Specification (SDS v2.0): `docs/AIVES - SDS.md`.
- AIVES Business Flows Specification: `docs/AIVES - Đặc tả luồng nghiệp vụ.md`.

---

## 2. MÔ TẢ TỔNG QUAN HỆ THỐNG (OVERALL DESCRIPTION)

### 2.1. Phối cảnh sản phẩm (Product Perspective)
AIVES vận hành theo mô hình kiến trúc phân tán Hybrid Cloud:
- **Giao diện người dùng (Frontend SPA)**: React 19 + Vite, triển khai trên Amazon S3 phục vụ qua CloudFront CDN toàn cầu.
- **Máy chủ ứng dụng (Backend Container)**: Node.js 20, Express 5, Socket.IO, triển khai trên EC2 ARM64 chạy Docker Compose.
- **Cơ sở dữ liệu trung tâm**: PostgreSQL 16 tích hợp extension vector `pgvector`, quản lý 28 bảng nghiệp vụ.
- **Tầng dịch vụ AI Serverless**:
  * AWS Lambda x86_64 chạy container CTranslate2 PhoWhisper/Whisper (STT).
  * AWS Lambda x86_64 chạy container ONNX Kokoro-82M (TTS).
  * Amazon Bedrock Nova Pro (LLM) và Titan Text Embeddings V2 (Embedding).
  * Amazon DynamoDB lưu trữ trạng thái phiên thi tạm thời (`SessionContext`) có gắn TTL.

```
[ Trình duyệt Web (React 19 SPA) ]
               │
               ▼  HTTPS (443) / WSS
    [ Amazon CloudFront CDN ]
         │               │
         │ (Static Web)  │ (/api/*, /socket.io/*)
         ▼               ▼
    [ Amazon S3 ]   [ EC2 Backend Container (Node 20 / Express 5) ]
                         │
                         ├─▶ [ PostgreSQL 16 + pgvector ]
                         ├─▶ [ Amazon DynamoDB (Session Cache) ]
                         ├─▶ [ AWS Lambda STT (PhoWhisper) & TTS (Kokoro) ]
                         ├─▶ [ Amazon Bedrock (Nova Pro & Titan V2) ]
                         └─▶ [ Amazon S3 (Materials & Audio Buckets) ]
```

### 2.2. Các tác nhân người dùng (User Classes and Characteristics)
1. **Quản trị viên (ADMIN)**: Người quản lý hạ tầng vận hành đào tạo. Có toàn quyền quản lý tài khoản người dùng, môn học, phân công giảng viên, ghi danh sinh viên và điều phối mở/đóng các kỳ thi trên toàn hệ thống.
2. **Giảng viên (LECTURER)**: Cán bộ giảng dạy phụ trách môn học. Quản lý chủ đề thi, tài liệu học liệu, ngân hàng câu hỏi, Rubric, thiết lập cấu hình kỳ thi và trực tiếp thẩm định, điều chỉnh, chốt điểm bài thi của thí sinh.
3. **Sinh viên (STUDENT)**: Thí sinh tham gia thi vấn đáp. Sử dụng trình duyệt có micro để tham gia phòng thi giọng nói với AI, theo dõi thời gian và tra cứu bảng điểm chính thức của mình.
4. **Hệ thống AI (AI Actor)**: Tác nhân tự động đóng vai trò Trợ lý Giám khảo. Thực hiện đọc câu hỏi, nghe và phiên dịch câu trả lời, quyết định hỏi xoáy thích ứng và đưa ra điểm gợi ý dựa trên Rubric kèm minh chứng.

### 2.3. Ràng buộc thiết kế và triển khai (Design and Implementation Constraints)
1. **Ràng buộc chi phí**: Tối ưu hóa vận hành trong hạn mức tài khoản AWS Free Tier / Startup Credits; chi phí cố định không vượt quá $25/tháng.
2. **Ràng buộc hạ tầng**: Không sử dụng các dịch vụ có chi phí duy trì cao như NAT Gateway, Application Load Balancer hay AWS RDS. Toàn bộ logic hàng đợi việc nền chạy trực tiếp trong CSDL PostgreSQL qua bảng `background_job`.
3. **Tính độc lập môi trường (Environment Parity)**: Cùng một bộ mã nguồn và Docker image phải chạy nhất quán trên cả môi trường cục bộ (Local Docker Compose) và đám mây AWS Production, chỉ phân biệt thông qua biến môi trường nạp từ file cấu hình hoặc AWS SSM Parameter Store.
4. **Bảo mật và Quyền riêng tư**: Tuyệt đối không để lộ đáp án tham khảo, tiêu chí chấm thi hoặc lý do nội bộ (`rationale`) của AI cho sinh viên ở bất kỳ giai đoạn nào.

---

## 3. YÊU CẦU CHỨC NĂNG CHI TIẾT (FUNCTIONAL REQUIREMENTS)

### 3.1. Phân hệ Xác thực & Quản trị Người dùng (AUTH)

| Mã yêu cầu | Mô tả chi tiết yêu cầu | Ưu tiên |
| :--- | :--- | :---: |
| **FR-AUTH-01** | Hệ thống phải cho phép người dùng đăng nhập bằng Email hoặc Mã tài khoản (`code`) kết hợp Mật khẩu. Khi đăng nhập thành công, phát hành cặp token JWT gồm `access_token` (15 phút) và `refresh_token` (7 ngày) lưu trong cookie an toàn với các cờ `httpOnly`, `Secure` và `SameSite=Lax`. | **P0** |
| **FR-AUTH-02** | Hệ thống phải mã hóa mật khẩu người dùng bằng thuật toán `scrypt` tiêu chuẩn của Node.js `crypto` với muối ngẫu nhiên (salt) riêng biệt cho từng tài khoản. | **P0** |
| **FR-AUTH-03** | Hệ thống phải tự động khóa tài khoản tạm thời trong vòng 15 phút (trả về HTTP `423 LOCKED`) khi người dùng nhập sai mật khẩu 5 lần liên tiếp trong cửa sổ 15 phút. Số lần sai phải được đếm nguyên tử chống điều kiện chạy đua (Race Condition). | **P1** |
| **FR-AUTH-04** | Hệ thống phải cho phép người dùng đăng xuất (`POST /api/auth/logout`), thu hồi phiên làm việc hiện tại và xóa cookies. Áp dụng cơ chế xoay vòng Refresh Token (hủy token cũ ngay khi làm mới). | **P0** |
| **FR-AUTH-05** | Hệ thống phải cung cấp tính năng Quên mật khẩu an toàn: Gửi liên kết đặt lại mật khẩu một lần (Single-use token, hết hạn sau 30 phút) qua email. Phản hồi API luôn trả về `200 { ok: true }` bất kể email có tồn tại hay không nhằm chống tấn công dò quét tài khoản. | **P1** |
| **FR-AUTH-06** | Hệ thống phải cho phép người dùng đã đăng nhập thay đổi mật khẩu (`PUT /api/auth/password`). Khi đổi mật khẩu thành công, toàn bộ các phiên đăng nhập khác của người dùng phải bị thu hồi ngay lập tức. | **P1** |
| **FR-AUTH-07** | Hệ thống phải cung cấp API cho Quản trị viên tạo mới, cập nhật, khóa (`lock`) và mở khóa (`unlock`) tài khoản người dùng, cũng như gửi lại liên kết kích hoạt tài khoản (`resend-setup`). | **P0** |
| **FR-AUTH-08** | Hệ thống phải cho phép Quản trị viên import danh sách sinh viên hàng loạt từ tệp Excel (`.xlsx`). Tiến trình import phải tuân thủ nguyên tắc All-or-Nothing: Nếu phát hiện bất kỳ dòng nào sai định dạng hoặc trùng mã/email, hệ thống phải rollback toàn bộ và thông báo chi tiết số dòng lỗi. | **P0** |
| **FR-AUTH-09** | Hệ thống phải kiểm tra quyền hạn (Role check: `ADMIN`, `LECTURER`, `STUDENT`) và phạm vi môn học (`requireSubjectScope`) trên toàn bộ các endpoint và kết nối Socket.IO. Giảng viên chỉ được xem và thao tác trên dữ liệu thuộc môn học được phân công. | **P0** |
| **FR-AUTH-10** | Hệ thống phải áp dụng cơ chế bảo vệ CSRF thông qua middleware `verifyOrigin`: Mọi yêu cầu thay đổi dữ liệu (`POST`, `PUT`, `PATCH`, `DELETE`) bắt buộc phải có header `Origin` khớp với `APP_BASE_URL`. | **P0** |

---

### 3.2. Phân hệ Quản trị Môn học & Ghi danh (SUBJECT)

| Mã yêu cầu | Mô tả chi tiết yêu cầu | Ưu tiên |
| :--- | :--- | :---: |
| **FR-SUBJ-01** | Hệ thống phải cho phép Quản trị viên thực hiện các thao tác Thêm, Sửa, Xóa và Xem danh sách môn học (`subject`). | **P0** |
| **FR-SUBJ-02** | Hệ thống phải cho phép Quản trị viên phân công giảng viên phụ trách môn học (`PUT /api/admin/subjects/:id/lecturers`), lưu trữ vào bảng quan hệ `subject_lecturer`. | **P0** |
| **FR-SUBJ-03** | Hệ thống phải cho phép Quản trị viên ghi danh sinh viên vào môn học (`PUT /api/admin/subjects/:id/students`), lưu trữ vào bảng quan hệ `subject_student`. Hỗ trợ nhập danh sách mã sinh viên theo cơ chế All-or-Nothing. | **P0** |
| **FR-SUBJ-04** | Hệ thống phải ngăn chặn việc gán sinh viên hoặc giảng viên vào kỳ thi nếu những người này chưa được ghi danh hoặc phân công vào môn học tương ứng của kỳ thi đó. | **P0** |

---

### 3.3. Phân hệ Quản trị Chủ đề thi (TOPIC)

| Mã yêu cầu | Mô tả chi tiết yêu cầu | Ưu tiên |
| :--- | :--- | :---: |
| **FR-TOPIC-01** | Hệ thống phải cung cấp giao diện và API cho Giảng viên quản lý các Chủ đề thi (`topic`) thuộc môn học được phân công (`GET`, `POST`, `PATCH`, `DELETE /api/topics`). | **P0** |
| **FR-TOPIC-02** | Khi hiển thị danh sách Chủ đề thi, hệ thống phải cung cấp thống kê số lượng câu hỏi đã được phê duyệt (`APPROVED`) và phân bố số câu theo từng mức độ tư duy Bloom của từng chủ đề. | **P0** |
| **FR-TOPIC-03** | Hệ thống phải bảo vệ tính toàn vẹn dữ liệu: Khi xóa chủ đề thi đang có câu hỏi, tài liệu học liệu hoặc kỳ thi liên kết, hệ thống phải chặn thao tác và trả về mã lỗi HTTP `409 RESOURCE_IN_USE`. | **P0** |

---

### 3.4. Phân hệ Ngân hàng Câu hỏi & Rubric (QB)

| Mã yêu cầu | Mô tả chi tiết yêu cầu | Ưu tiên |
| :--- | :--- | :---: |
| **FR-QB-01** | Hệ thống phải cho phép Giảng viên tạo và chỉnh sửa câu hỏi bao gồm các trường: nội dung, chủ đề, mức Bloom (`REMEMBER`, `UNDERSTAND`, `APPLY`, `ANALYZE`), ngôn ngữ (`vi`/`en`), đáp án tham khảo, 3–5 ý chính bắt buộc (`key_points`), Rubric liên kết và mục đích đánh giá (`rationale`). | **P0** |
| **FR-QB-02** | Hệ thống phải cưỡng chế máy trạng thái câu hỏi ở tầng backend: `DRAFT` $\rightarrow$ `PENDING_REVIEW` $\rightarrow$ `APPROVED` / `REJECTED` $\rightarrow$ `ARCHIVED`. Chuyển sang `APPROVED` bắt buộc phải có Rubric; chuyển sang `REJECTED` bắt buộc phải có lý do từ chối. | **P0** |
| **FR-QB-03** | Hệ thống phải tự động phát hiện câu hỏi trùng lặp: Chặn cứng (HTTP 409 `DUPLICATE_QUESTION`) đối với nội dung trùng khớp 100% sau chuẩn hóa; Phát cảnh báo phi chặn (`NEAR_DUPLICATE`) nếu độ tương đồng vector Cosine $\ge 0.9$ so với câu hỏi trong cùng môn học. | **P0** |
| **FR-QB-04** | Hệ thống phải cho phép Giảng viên import câu hỏi hàng loạt từ tệp Excel định dạng mẫu theo cơ chế All-or-Nothing. | **P1** |
| **FR-QB-05** | Hệ thống phải cho phép Giảng viên tạo Rubric đánh giá gồm nhiều tiêu chí, trọng số phần trăm (tổng chuẩn 100%), mỗi tiêu chí chứa các mức đánh giá (`performance_level`) kèm khoảng điểm và mô tả chi tiết. Thứ tự tiêu chí phải được bảo toàn thông qua cột `order_index`. | **P0** |
| **FR-QB-06** | Hệ thống phải tự động khóa cứng Rubric (`is_locked = true`) khi Rubric đó đã được sử dụng trong kỳ thi đã chuyển sang trạng thái `OPEN`. Rubric đã khóa không thể chỉnh sửa, chỉ có thể nhân bản (`clone`) thành phiên bản mới. | **P0** |
| **FR-QB-07** | Hệ thống phải hỗ trợ bộ lọc câu hỏi đa tiêu chí: theo môn học, chủ đề, trạng thái phê duyệt, mức Bloom và nguồn tạo (Thủ công, Import, AI sinh). | **P1** |

---

### 3.5. Phân hệ RAG & Sinh Câu hỏi Tự động (RAG)

| Mã yêu cầu | Mô tả chi tiết yêu cầu | Ưu tiên |
| :--- | :--- | :---: |
| **FR-RAG-01** | Hệ thống phải tiếp nhận tệp tài liệu học liệu định dạng PDF, DOCX, PPTX dung lượng tối đa 50 MB, lưu trữ vào Amazon S3; từ chối mọi định dạng không hợp lệ hoặc tệp scan không có lớp chữ. | **P0** |
| **FR-RAG-02** | Tác vụ nền `INGEST_MATERIAL` phải tự động trích xuất văn bản, cắt đoạn thông minh (~500 từ, độ chồng lấn 50 từ, bảo toàn số trang/slide) và gọi Bedrock Titan Text Embeddings V2 sinh vector 1024 chiều lưu vào bảng `material_chunk` có chỉ mục HNSW. | **P0** |
| **FR-RAG-03** | Hệ thống phải cho phép Giảng viên yêu cầu AI sinh tối đa 20 câu hỏi một lần dựa trên chủ đề, các tài liệu được chọn, tỷ lệ phân bổ Bloom và ngôn ngữ chỉ định thông qua tác vụ nền `GENERATE_QUESTIONS`. | **P0** |
| **FR-RAG-04** | Mỗi câu hỏi AI sinh phải bao gồm đầy đủ: nội dung câu hỏi, đáp án tham khảo, 3–5 ý chính, đoạn trích dẫn nguồn văn bản (`question_source_ref`), mức Bloom và lời giải thích mục đích kiểm tra. | **P0** |
| **FR-RAG-05** | Hệ thống phải tích hợp bộ lọc kiểm định trích dẫn (Grounding Verification): Tự động loại bỏ các câu hỏi AI có đoạn trích nguồn không tồn tại trong tài liệu gốc. Câu hỏi hợp lệ được lưu ở trạng thái `PENDING_REVIEW`. | **P0** |
| **FR-RAG-06** | Giao diện phải hiển thị câu hỏi chờ duyệt cạnh đoạn trích dẫn nguồn tài liệu; cho phép Giảng viên Duyệt (gắn Rubric), Chỉnh sửa rồi duyệt, Từ chối kèm lý do hoặc Duyệt hàng loạt theo Rubric chung. | **P0** |

---

### 3.6. Phân hệ Quản lý Kỳ thi & Lịch thi (EXAM)

| Mã yêu cầu | Mô tả chi tiết yêu cầu | Ưu tiên |
| :--- | :--- | :---: |
| **FR-EXAM-01** | Hệ thống phải cho phép Giảng viên tạo kỳ thi gắn với một chủ đề thi của môn học, thiết lập số câu chính (1–10), số câu hỏi xoáy tối đa mỗi câu (0–5), tổng số câu hỏi xoáy tối đa cho thí sinh (0–20), thời gian suy nghĩ, thời gian trả lời, thời gian cả phiên và một khung giờ mở/đóng (`opens_at`, `closes_at`) chung cho cả kỳ. | **P0** |
| **FR-EXAM-02** | Giao diện thiết lập kỳ thi phải cho phép chọn danh sách sinh viên tham gia thi trực tiếp từ các sinh viên đã ghi danh môn học (`subject_student`) và chọn ban giám khảo từ các giảng viên được phân công môn học (`subject_lecturer`) thông qua Bảng chọn Checkbox trực quan. | **P0** |
| **FR-EXAM-03** | Hệ thống phải cho phép Giảng viên gửi lịch thi (chuyển trạng thái từ `DRAFT` sang `SCHEDULED`). Thao tác gửi lịch chỉ hợp lệ khi: kỳ thi đã có khung giờ hợp lệ, giờ đóng chưa qua, và chủ đề thi có đủ số lượng câu hỏi đã duyệt (`APPROVED`) thỏa mãn cả tổng số lượng và cơ cấu phân bổ Bloom. | **P0** |
| **FR-EXAM-04** | Hệ thống phải cho phép Giảng viên rút lịch thi (chuyển từ `SCHEDULED` về lại `DRAFT`) để điều chỉnh cấu hình khi cần thiết. Giảng viên không có quyền trực tiếp mở kỳ thi sang trạng thái `OPEN`. | **P0** |
| **FR-EXAM-05** | Hệ thống phải cung cấp Bảng điều phối lịch thi (`/admin/exam-schedule`) cho Quản trị viên để theo dõi toàn bộ kỳ thi trong trường, lọc theo môn học, trạng thái và khoảng ngày. | **P0** |
| **FR-EXAM-06** | Quản trị viên là người duy nhất có quyền Khởi động kỳ thi (`POST /api/admin/exam-sessions/:id/start`). Khi khởi động: Kỳ thi chuyển sang `OPEN`, ghi nhận thời gian bắt đầu, khóa cứng toàn bộ Rubric liên quan. | **P0** |
| **FR-EXAM-07** | Khi kỳ thi được khởi động, hệ thống phải tự động kích hoạt song song mà không làm nghẽn luồng xử lý: Làm nóng (Warm-up) Lambda STT và Lambda TTS theo ngôn ngữ thi; Khởi chạy tác vụ nền `PREPARE_EXAM_AUDIO` tổng hợp sẵn file âm thanh `.wav` cho toàn bộ câu hỏi đã duyệt vào S3; Khởi chạy tác vụ nền `KEEP_WARM` duy trì gọi Lambda định kỳ mỗi 5 phút cho đến giờ đóng kỳ thi. | **P0** |
| **FR-EXAM-08** | Bảng điều phối lịch thi phải hiển thị trạng thái làm nóng tài nguyên (`warm_status`) và cho phép Quản trị viên bấm nút "Làm nóng lại (Re-warm)" khi cần thiết mà không làm gián đoạn trạng thái `OPEN` của kỳ thi. | **P0** |
| **FR-EXAM-09** | Hệ thống phải cho phép Quản trị viên hoặc Giảng viên phụ trách thực hiện Đóng kỳ thi (`CLOSED`). Khi đóng kỳ thi, tác vụ `KEEP_WARM` lập tức dừng lại, và các phiên thi chưa hoàn tất sẽ được chuyển sang trạng thái kết thúc `TERMINATED`. | **P0** |

---

### 3.7. Phân hệ Phỏng vấn AI Thời gian thực (INT)

| Mã yêu cầu | Mô tả chi tiết yêu cầu | Ưu tiên |
| :--- | :--- | :---: |
| **FR-INT-01** | Hệ thống phải tự động khởi tạo phiên thi (`viva_interview`) khi sinh viên tham gia trong khoảng thời gian kỳ thi đang `OPEN` và trong khung giờ mở/đóng. Lựa chọn bộ câu hỏi chính tuân thủ thuật toán cân bằng: đúng phân bổ Bloom, chống trùng lặp câu hỏi giữa các thí sinh thi liên tiếp nhau và ưu tiên câu ít sử dụng. | **P0** |
| **FR-INT-02** | Hệ thống phải yêu cầu thí sinh thực hiện bước kiểm tra micro (Mic Check) trước khi chính thức bắt đầu bài thi. | **P1** |
| **FR-INT-03** | Trong phòng thi, hệ thống phải hiển thị câu hỏi dạng văn bản và phát âm thanh đọc tự nhiên thông qua Lambda TTS (Kokoro-82M) đúng theo ngôn ngữ của kỳ thi. | **P0** |
| **FR-INT-04** | Hệ thống phải quản lý thời gian thi bằng đồng hồ kiểm soát bởi máy chủ (Server-authoritative Timers): Đếm ngược thời gian suy nghĩ, sau đó mở micro đếm ngược thời gian trả lời; khi hết giờ trả lời, máy chủ tự động ngắt thu âm và nộp phần nội dung đã nói. | **P0** |
| **FR-INT-05** | Trong lúc thí sinh nói, trình duyệt phải truyền luồng âm thanh PCM 16 kHz qua Socket.IO theo từng gói 250 ms. Máy chủ thực hiện gom đoạn, phát hiện khoảng lặng và chuyển đổi thành văn bản qua Lambda STT (PhoWhisper/Whisper). | **P0** |
| **FR-INT-06** | Bộ máy phỏng vấn phải phân tích câu trả lời đối chiếu với các ý chính và áp dụng quy tắc quyết định hỏi xoáy thích ứng: Chỉ đặt câu hỏi hỏi xoáy khi câu trả lời thiếu ý, mơ hồ hoặc mâu thuẫn; Câu hỏi xoáy phải ngắn gọn (dưới 40 từ), đúng trọng tâm và tuyệt đối không gợi ý đáp án; Không được vượt quá giới hạn số lượt hỏi xoáy cấu hình. | **P0** |
| **FR-INT-07** | Hệ thống tuyệt đối không hiển thị transcript cho thí sinh trong lúc thi và không cho phép ghi âm lại câu trả lời (trừ trường hợp hệ thống gặp lỗi kỹ thuật). | **P0** |
| **FR-INT-08** | Giao diện phòng thi phải hiển thị tiến độ bài thi rõ ràng ("Câu x/y · Hỏi thêm a/b") và đồng hồ đếm ngược thời gian còn lại của toàn bộ phiên thi. | **P0** |
| **FR-INT-09** | Hệ thống phải hỗ trợ khôi phục phiên thi khi gặp sự cố mạng hoặc tải lại trang (F5): Thí sinh được đưa trở lại đúng câu hỏi và lượt đang làm dở với thời gian làm bài còn lại chính xác được phục hồi từ DynamoDB Context Store. | **P1** |
| **FR-INT-10** | Hệ thống phải tự động chuyển sang cơ chế dự phòng phát âm thanh Web Speech API của trình duyệt nếu dịch vụ Lambda TTS gặp sự cố, đảm bảo phiên thi không bị gián đoạn. | **P0** |
| **FR-INT-11** | Hệ thống phải ghi nhận các chỉ số tín hiệu giọng nói phụ của từng lượt: thời gian trước khi nói (latency), thời lượng nói, tốc độ nói (từ/phút - WPM) và số lần ngập ngừng trên 2 giây. Các chỉ số này chỉ phục vụ tham khảo, không tự động cộng/trừ vào điểm số. | **P1** |
| **FR-INT-12** | Tác vụ nền `EXPIRE_INTERVIEWS` phải quét định kỳ mỗi 60 giây các phiên thi quá hạn chót (`deadline_at + grace_sec`), tự động đóng phiên với lý do `DEADLINE_REACHED`, tạo bản ghi kết quả `viva_result` và đẩy vào hàng đợi chấm điểm tự động. | **P0** |

---

### 3.8. Phân hệ Chấm điểm Gợi ý & Thẩm định Kết quả (GRD)

| Mã yêu cầu | Mô tả chi tiết yêu cầu | Ưu tiên |
| :--- | :--- | :---: |
| **FR-GRD-01** | Ngay khi phiên thi kết thúc (`COMPLETED` hoặc `TERMINATED`), hệ thống phải tự động đẩy tác vụ nền `GRADE_INTERVIEW` để AI (Bedrock Nova Pro) chấm điểm toàn bộ transcript đối chiếu với từng tiêu chí của Rubric đã khóa. | **P0** |
| **FR-GRD-02** | Kết quả đánh giá của AI phải bao gồm: điểm số từng tiêu chí, mức độ hoàn thành (`performance_level`), trích xuất bằng chứng xác thực (`evidence` trích nguyên văn từ transcript), điểm mạnh, điểm yếu và các ý cốt lõi còn thiếu. Điểm tổng kết bài thi được quy đổi chính xác theo thang điểm 10. | **P0** |
| **FR-GRD-03** | Hệ thống phải tự động gắn cờ cảnh báo (`FLAGGED`) đối với các bài thi có độ tin cậy nhận dạng thấp ($< 0.6$) hoặc transcript có dấu hiệu bất thường. Bài thi bị gắn cờ bắt buộc Giám khảo phải chấm thủ công hoàn toàn, hệ thống không hiển thị điểm gợi ý ảo. | **P0** |
| **FR-GRD-04** | Màn hình thẩm định của Giảng viên (`EvaluationReview.jsx`) phải cho phép: Nghe lại tệp âm thanh câu trả lời của từng lượt (`GET /api/turns/:id/audio`), xem lời giải thích vì sao AI hỏi câu hỏi đó, xem minh chứng AI trích xuất và điều chỉnh điểm số từng tiêu chí. | **P0** |
| **FR-GRD-05** | Mọi thao tác điều chỉnh điểm của Giảng viên khác với điểm AI gợi ý bắt buộc phải nhập lý do điều chỉnh (`reason`). Hệ thống phải lưu vết toàn bộ lịch sử chỉnh sửa điểm vào bảng `score_adjustment`. | **P0** |
| **FR-GRD-06** | Hệ thống phải áp dụng phân quyền chấm thi nghiêm ngặt (Examiner-only Guard): Chỉ Quản trị viên, Giảng viên tạo kỳ thi (`created_by`) hoặc Giám khảo được phân công trong kỳ thi (`exam_session_examiner`) mới có quyền thực hiện các thao tác ghi (điều chỉnh điểm, chốt điểm `finalize`, mở lại `reopen`, chấm lại `regrade`). Giảng viên khác cùng bộ môn chỉ có quyền xem (Read-only). | **P0** |
| **FR-GRD-07** | Hệ thống phải cho phép Sinh viên tra cứu danh sách và chi tiết kết quả bài thi của mình (`GET /api/me/results` và `GET /api/me/results/:id`), **chỉ khi** bài thi đã ở trạng thái `FINALIZED`. Nếu bài thi chưa chốt hoặc bị mở lại (`reopen`), API phải trả về `404 NOT_FOUND` để bảo vệ quyền riêng tư. | **P0** |
| **FR-GRD-08** | Dữ liệu kết quả trả về cho sinh viên bắt buộc phải đi qua bộ lọc an toàn `toStudentResultView()` và thẩm định qua `assertStudentResultSafe()`, nghiêm cấm tuyệt đối rò rỉ các trường nhạy cảm như rationale, evidence, prompt hoặc feedback nội bộ của giám khảo. | **P0** |

---

## 4. YÊU CẦU PHI CHỨC NĂNG (NON-FUNCTIONAL REQUIREMENTS - NFR)

Tuân thủ chuẩn chất lượng phần mềm **ISO/IEC 25010**:

### 4.1. Hiệu năng & Khả năng đáp ứng (Performance Efficiency)
- **NFR-PERF-01 (Độ trễ phản hồi)**: Độ trễ xử lý từ khi thí sinh dứt lời nói đến khi nhận được câu hỏi tiếp theo phải đạt trung vị $< 3.0$ giây và p95 $< 6.0$ giây trong điều kiện mạng tiêu chuẩn.
- **NFR-PERF-02 (Thời gian xử lý STT)**: Lambda STT phải nhận dạng một đoạn âm thanh độ dài 5 giây trong thời gian $\le 1.5$ giây.
- **NFR-PERF-03 (Thời gian tổng hợp TTS)**: Lambda TTS phải tổng hợp một câu hỏi có độ dài 30 từ trong thời gian $\le 3.5$ giây. Tái sử dụng file âm thanh lưu trong S3 Cache với độ trễ phản hồi $< 200$ ms.
- **NFR-PERF-04 (Khả năng chịu tải đồng thời)**: Hệ thống phải đáp ứng tốt ít nhất 30 thí sinh tham gia phỏng vấn đồng thời trên một máy chủ EC2 `t4g.small` kết hợp Lambda Auto-scaling.

### 4.2. An toàn & Bảo mật thông tin (Security)
- **NFR-SEC-01 (Mã hóa đường truyền)**: 100% lưu lượng trao đổi giữa Client và CloudFront phải được mã hóa qua HTTPS/TLS 1.3 và WebSocket WSS.
- **NFR-SEC-02 (Bảo vệ phiên & Cookie)**: Toàn bộ JWT Token lưu trữ trong Cookie với cờ `httpOnly; Secure; SameSite=Lax`. Cơ chế Refresh Token Rotation một lần.
- **NFR-SEC-03 (Phòng chống tấn công)**: Triệt tiêu các nguy cơ tấn công phổ biến: SQL Injection (100% tham số hóa truy vấn), CSRF (Origin Verification), Brute-force Lockout (khóa sau 5 lần sai), Path Traversal (Regex lọc tên file âm thanh), Prompt Injection Defense.
- **NFR-SEC-04 (An toàn dữ liệu thí sinh)**: Áp dụng cơ chế Data Masking nghiêm ngặt (Student Safety View), ngăn chặn triệt để nguy cơ lộ đề và đáp án.

### 4.3. Độ tin cậy & Tính sẵn sàng (Reliability & Availability)
- **NFR-REL-01 (Tính sẵn sàng)**: Hệ thống duy trì mức độ sẵn sàng đạt tối thiểu 99.5% trong các khung giờ tổ chức thi.
- **NFR-REL-02 (Khôi phục sự cố)**: Thời gian khôi phục phiên thi của thí sinh sau khi mất kết nối mạng hoặc tải lại trang F5 không quá 3 giây (RTO $< 3s$), bảo toàn 100% tiến độ và dữ liệu đã làm (RPO = 0).
- **NFR-REL-03 (Bảo toàn tác vụ nền)**: Khi container máy chủ khởi động lại, 100% các tác vụ nền đang chạy dở phải được đưa trở lại hàng đợi `PENDING` để tái xử lý tự động.

### 4.4. Tính tương thích & Khả năng chuyển giao (Portability & Compatibility)
- **NFR-PORT-01 (Môi trường máy khách)**: Tương thích hoàn hảo với các trình duyệt web hiện đại hỗ trợ Web Audio API: Google Chrome (bản 100+), Microsoft Edge (bản 100+), Mozilla Firefox (bản 100+).
- **NFR-PORT-02 (Tính độc lập môi trường)**: Hoạt động đồng nhất trên môi trường phát triển máy đơn (Local Docker Compose) và môi trường đám mây AWS Production mà không cần thay đổi bất kỳ dòng mã nguồn nào.
