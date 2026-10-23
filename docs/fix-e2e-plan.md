Kế hoạch: vá luồng tạo kỳ thi, đặc tả theo luồng, E2E plan v2 (restrict test + vá lỗi mọi luồng)
Context
Chủ dự án test trực tiếp trên prod bằng tài khoản LECTURER và gặp lỗi khi tạo kỳ thi. Log prod (đọc qua SSM, 72h gần nhất) cho thấy:

POST /api/exam-sessions tạo được draft (session 6, 7, subject 1, topic 2), nhưng POST /api/exam-sessions/6/schedule trả 409 bảy lần liên tiếp. Log request không ghi code, nên chưa biết là NOT_ENOUGH_QUESTIONS hay INVALID_TRANSITION. Khả năng cao là NOT_ENOUGH_QUESTIONS, vì topic 2 thiếu câu APPROVED. Ngoài ra POST /api/questions/3|4/approve cũng trả 409.
processing_failure = 0.
Phản hồi của chủ dự án (BR):

Dropdown Subject không hiện các môn đã gán cho giảng viên. Code hiện tại (ExamSessions.jsx:317-322) lấy subject_id từ toàn bộ /api/topics và chỉ hiện "Subject 1". Môn được gán (subject_lecturer) mà chưa có topic thì không hiện. Môn ngoài phạm vi thì vẫn hiện, chọn vào sẽ bị 403.
Không submit được schedule, và UI không cho biết trước topic đủ câu hay chưa.
Roster sinh viên và examiner đang nhập tay mã/ID. Theo BR, giảng viên phải chọn từ danh sách lấy trong DB theo môn, không nhập tay. Hiện chưa có quan hệ sinh viên ↔ môn (schema chỉ có subject_lecturer).
Mục tiêu: (a) vá ngay luồng tạo, lên lịch và roster của kỳ thi; (b) viết đặc tả theo luồng để team dễ nắm; (c) viết E2E execution plan mới có restrict test (phân quyền, phạm vi môn, máy trạng thái) và vòng "test → vá → test lại" cho mọi luồng. Theo yêu cầu, việc chính là lập và chạy kế hoạch E2E. Phần sửa code giữ ở mức tối thiểu cần để luồng chạy đúng BR.

Phần A. Vá luồng kỳ thi của giảng viên (PR fix(step13): exam session setup by subject)
A1. Endpoint "options" cho form tạo kỳ thi
GET /api/exam-sessions/options (LECTURER) trả về:

{ subjects: [{ subject_id, code, name,
    topics: [{ topic_id, name, approved: n, byBloom: {REMEMBER: n, ...} }],
    students: [{ app_user_id, code, full_name }],      // đã ghi danh môn, ACTIVE
    lecturers: [{ app_user_id, code, full_name }] }] } // subject_lecturer
Phạm vi lấy từ subjectRepository.listSubjectIdsForLecturer(user.id), cùng nguồn listSessions đang dùng (examSessionService.js:296).
Số câu theo Bloom dùng lại countByLevel trong interview/pickBalancedQuestions.js trên listApprovedQuestionsInTopic.
Route khai báo trước /:id trong examSessionRoutes.js. Service method getCreateOptions({ user }), wiring qua createApp overrides như thường lệ.
A2. Ghi danh sinh viên vào môn
Migration 020_subject_student.sql: bảng subject_student (subject_id, student_id, PK chung, FK), cùng mẫu với subject_lecturer trong 005_subjects.sql.
Admin: PUT /api/admin/subjects/:id/students nhận { codes } (dán danh sách hoặc CSV), all-or-nothing, cùng logic _parseCodes và setStudents. subjectRepository.setStudents / listStudents theo mẫu setLecturers.
UI admin Subjects.jsx: thêm khối "Students" cạnh phần gán giảng viên.
A3. Roster và examiner chọn từ danh sách
setStudents nhận studentIds (giữ codes để tương thích). Mỗi id phải là STUDENT ACTIVE đã ghi danh môn của kỳ thi, sai thì trả 422 kèm danh sách lỗi.
setExaminers: mỗi id phải là LECTURER được gán môn đó, sai thì trả 400.
UI ExamSessions.jsx: thay 2 textarea bằng bảng có checkbox, ô tìm kiếm và nút "Chọn tất cả" (dữ liệu lấy từ options của môn). Dropdown Subject hiện code – name từ options. Dropdown Topic hiện số câu APPROVED kèm phân bố Bloom, và cảnh báo trước khi submit nếu approved < main_question_count hoặc Bloom mix không đủ.
A4. Chẩn đoán 409
Request log ghi thêm err.code khi status ≥ 400 (không ghi body), sửa ở middleware log hoặc global error handler trong app.js.
Kiểm tra nguyên nhân approve 409 (thường do thiếu rubric hoặc chuyển trạng thái sai ở domain/questionStatus.js). Nếu là bug thì vá, nếu đúng luật thì cho UI hiện thông báo theo code.
Test cho phần A
Unit (backend/test/examSessionService.test.js): options trả đúng phạm vi; setStudents từ chối SV không ghi danh; setExaminers từ chối GV không thuộc môn.
E2E (backend/test/examSessions.e2e.test.js, cần Postgres): migration 020, options, admin enroll.
npm test, npm run test:e2e (với TEST_DATABASE_URL), npm run lint + npm run build ở frontend.
Phần B. Đặc tả theo luồng: docs/AIVES - Đặc tả luồng nghiệp vụ.md (tiếng Việt)
Mỗi luồng viết theo một khung: Actor · Tiền điều kiện · Các bước (UI → API) · Trạng thái/chuyển trạng thái · Luật nghiệp vụ (BR) · Lỗi có thể gặp (HTTP + code + thông báo UI) · Tiêu chí chấp nhận · Liên kết SRS/SDS.

Các luồng:

F1 Đăng nhập, đặt và đổi mật khẩu, khoá tài khoản (ADMIN/LECTURER/STUDENT).
F2 Admin: tài khoản (tạo, gửi lại link, khoá/mở).
F3 Admin: môn học, gán giảng viên, ghi danh sinh viên (mới).
F4 Giảng viên: topic trong môn (hiện chưa có UI topic; đặc tả ghi rõ, phần E2E kiểm tra).
F5 Giảng viên: tài liệu (upload, ingest, FAILED).
F6 Giảng viên: ngân hàng câu hỏi (tạo tay, Excel, RAG; duyệt, sửa, từ chối; rubric và khoá rubric; trùng lặp).
F7 Giảng viên: kỳ thi (tạo, cấu hình, roster/examiner theo môn, submit/withdraw/close). Sơ đồ trạng thái DRAFT → SCHEDULED → OPEN → CLOSED.
F8 Admin: lịch thi (start, warm, close).
F9 Sinh viên: thi vấn đáp (mic check, TTS, STT, câu hỏi phụ, F5/reconnect, hết giờ).
F10 Chấm điểm (AI gợi ý, giảng viên chỉnh và chốt, sinh viên xem kết quả).
Phụ lục: ma trận phân quyền Role × Endpoint (lấy từ routes/*.js) và bảng mã lỗi.
Nguồn: PRD/SRS/SDS hiện có, ket-qua-lop-E.md, code routes và services. Không sao chép lại cả SRS, chỉ tham chiếu.

Phần C. E2E execution plan v2: docs/e2e-execution-plan-v2.md
Cùng thể loại với docs/e2e-execution-plan.md: dành cho agent, có quy tắc bắt buộc, giai đoạn và điểm "Kiểm tra". Nội dung:

Quy tắc: giữ nguyên các quy tắc cũ (không in secret, chỉ ghi dữ liệu TEST_, sửa code qua PR + CI xanh, chủ dự án merge). Thêm: mỗi bug ghi vào docs/ket-qua-e2e-v2.md theo mẫu ID · luồng · bước · mong đợi · thực tế · HTTP/code · log · mức độ · PR vá.

Giai đoạn 0, baseline: CI xanh, npm test/test:e2e local với Postgres, chụp số dòng các bảng, đọc log 72h (method/url/status/code).

Giai đoạn 1, restrict test API (tự động, script scripts/e2e-restrict.mjs chạy được với local và prod):

Ma trận Role × Endpoint: không cookie → 401; sai role → 403; thiếu Origin khi gửi POST/PUT → 403 CSRF.
Phạm vi môn: GV A không đọc hay sửa được kỳ thi, câu hỏi, tài liệu, rubric của môn B (403/404); SV chỉ thấy kỳ thi có tên mình trong roster, không thấy rationale (allowlist toStudentInterviewView).
Máy trạng thái: mọi chuyển trạng thái sai trả 409 INVALID_TRANSITION (sửa SCHEDULED, start DRAFT, close CLOSED, duyệt câu đã REJECTED...).
Validation biên: range cấu hình, Bloom mix sai tổng, cửa sổ thời gian ngược, closes_at trong quá khứ.
Roster/examiner: id ngoài môn bị từ chối (sau phần A).
Giai đoạn 2, luồng nghiệp vụ trên UI (F1 → F10) với dữ liệu TEST_: mỗi luồng là một checklist theo tiêu chí chấp nhận ở phần B. F9 cần người thật (micro), agent hướng dẫn và ghi kết quả.

Giai đoạn 3, vòng vá lỗi: gom bug theo luồng, mỗi nhóm một PR fix(step13): ... kèm test tái hiện (unit hoặc e2e). Sau Deploy thì chạy lại script restrict và checklist của luồng đó. Lặp đến khi không còn bug mức Cao/Trung bình.

Giai đoạn 4, hậu kiểm và dọn dẹp: processing_failure mới = 0, mọi background_job của lần chạy là DONE, log không lỗi; xoá dữ liệu TEST_; số dòng các bảng khớp baseline.

Backlog đưa vào làm luôn (từ báo cáo §8): bộ lọc topicId bị bỏ qua, order_index luôn bằng 1, job generation FAILED bị coi là terminal, pause_count hỏng, chưa có UI topic, job kết thúc phỏng vấn bị bỏ dở sau deadline, retry budget của chấm điểm.

Thứ tự thực hiện
Phần A, viết test trước. Mở PR, chờ CI xanh, chủ dự án merge, Deploy, test lại trên prod với tài khoản giảng viên thật.
Phần B và Phần C trong cùng một PR docs (docs(step13): ...).
Chạy E2E v2 theo Phần C (là việc chính); bug mới đi theo vòng ở Giai đoạn 3.
Kiểm tra
Local: docker compose up -d postgres rồi TEST_DATABASE_URL=... npm run test:all (backend), npm run lint && npm run build (frontend), docker compose up, rồi đăng nhập GV theo luồng F7: chọn môn đã gán, thấy topic kèm số câu, chọn SV/GV bằng checkbox, submit schedule (nếu thiếu câu thì thấy thông báo rõ ràng).
Prod: sau Deploy, chạy node scripts/e2e-restrict.mjs --base https://d36ezmiqpl9miu.cloudfront.net (tài khoản TEST_), log có code cho mọi 4xx, F7 chạy hết đến SCHEDULED, admin start được.