# **AIVES \- Software Requirements Specification (SRS)**

Oct 15, 2026 · @tmqthedev

Tài liệu này đặc tả những gì AIVES phải làm trong bản phát hành gồm đăng nhập, nhóm chức năng 1, 3, 4 và phần chính của nhóm 2 (kỳ thi và lịch thi), để nhóm phát triển và kiểm thử dùng chung một bộ yêu cầu có mã. Nó thay cho bản SRS cũ trong thư mục AIVES Docs.

## **1\. Giới thiệu**

**Phạm vi.** Đăng nhập và phân quyền (AUTH), ngân hàng câu hỏi và rubric (QB), sinh câu hỏi bằng RAG (RAG), kỳ thi và lịch thi (EXAM), phỏng vấn AI (INT), chấm điểm gợi ý (GRD) và giải thích câu hỏi (EXP). Báo cáo thống kê và việc sinh viên xem điểm nằm ngoài phạm vi.

| Thuật ngữ | Nghĩa |
| :---- | :---- |
| Kỳ thi (exam session) | Một đợt thi của một chủ đề, có cấu hình, khung giờ, danh sách sinh viên và người chấm |
| Khung giờ thi | Một khoảng mở, đóng (opens\_at, closes\_at) chung cho cả kỳ thi; thí sinh vào thi lúc nào trong khoảng này cũng được, không chia giờ riêng từng người |
| Gửi lịch, khởi động | Giảng viên gửi lịch thì kỳ thi chuyển SCHEDULED; quản trị viên khởi động thì kỳ thi chuyển OPEN và sinh viên mới vào thi được |
| Làm nóng (warm-up) | Gọi thử Lambda STT, TTS để container đã sẵn sàng, tránh khởi động nguội lúc sinh viên đang thi |
| Phiên thi (viva interview) | Lượt thi của một sinh viên trong một kỳ thi |
| Câu chính | Câu lấy từ ngân hàng, số lượng theo cấu hình kỳ thi |
| Câu hỏi xoáy (follow-up) | Câu AI tạo ra trong lúc thi để làm rõ câu trả lời của một câu chính |
| Lượt (turn) | Một cặp câu hỏi và câu trả lời |
| Ý chính (key point) | Ý mà câu trả lời đúng cần có, giảng viên hoặc AI soạn kèm câu hỏi |
| Mức Bloom | Nhớ, hiểu, vận dụng, phân tích |
| Rubric | Bộ tiêu chí có trọng số, mỗi tiêu chí có các mức đánh giá kèm khoảng điểm và mô tả |
| RAG | Sinh nội dung dựa trên các đoạn tài liệu được truy xuất theo độ tương đồng vector |
| STT, TTS, LLM | Chuyển giọng nói thành chữ, chữ thành giọng nói, mô hình ngôn ngữ lớn |

**Tài liệu tham chiếu:** [Kế hoạch triển khai](https://claude.ai/code/artifact/f2a9989b-ff90-4200-86b9-66af7ac7e890), [PRD](https://claude.ai/code/artifact/220c338c-0657-465d-99be-11de028cd409), [SDS](https://claude.ai/code/artifact/33d142a7-f922-4d96-aa62-54ff98ee510e), Workflow Definition (luồng thay thế A1–A6), class diagram và Physical ERD của nhóm.

## **2\. Mô tả tổng quan**

AIVES là ứng dụng web: frontend React, backend Node.js có REST và Socket.IO, Postgres có pgvector, cùng các dịch vụ AI bên ngoài (Lambda chạy PhoWhisper-small và Whisper small cho STT, Lambda chạy Kokoro-82M cho TTS, Bedrock Nova Pro cho LLM, Bedrock Titan cho embedding). Kiến trúc chi tiết nằm trong SDS.

| Tác nhân | Mô tả |
| :---- | :---- |
| Quản trị viên | Quản lý tài khoản, môn học và việc gán giảng viên vào môn; xem bảng lịch thi, khởi động và đóng kỳ thi |
| Giảng viên | Quản lý tài liệu, câu hỏi, rubric, kỳ thi của môn được gán; chấm và chốt điểm kỳ thi được phân công |
| Sinh viên | Thi các kỳ thi có tên mình |
| AI (hệ thống) | Sinh câu hỏi, hỏi xoáy, chấm gợi ý; không có quyền chốt bất cứ điều gì |

**Môi trường vận hành.** Trình duyệt Chrome, Edge hoặc Firefox bản mới trên máy tính có micro. Server chạy trên AWS ap-southeast-1 (một EC2 t4g.small) hoặc trên máy local bằng docker compose.

**Ràng buộc.**

* Chi phí gần 0 đồng; dịch vụ trả phí dùng của AWS. STT và TTS chạy model mở trên Lambda vì AWS không có giọng đọc tiếng Việt; Google TTS chỉ là tuỳ chọn.  
* Cùng một image chạy local và prod, chỉ khác biến môi trường.  
* Không dùng NAT Gateway, Load Balancer, RDS, API Gateway, Step Functions, SQS, Transcribe, Polly; việc nền là các dòng trong bảng background\_job của Postgres.  
* Email gửi qua SMTP của Gmail (nhóm không có domain), khoảng 500 người nhận mỗi ngày.

**Giả định.** Trường có email cho mỗi sinh viên; tài liệu môn học có lớp chữ; tài khoản AWS được bật Nova Pro và Titan Embeddings V2 ở ap-southeast-1 (trực tiếp hoặc qua cross-region inference).

## **3\. Yêu cầu chức năng**

Mỗi yêu cầu có mã để test và PR tham chiếu. Ưu tiên P0 là bắt buộc để demo trọn vòng, P1 là cần có trước khi dùng thật; cột US là user story tương ứng trong PRD.

### **3.1 Đăng nhập và phân quyền (AUTH)**

| Mã | Hệ thống phải | Ưu tiên | US |
| :---- | :---- | :---- | :---- |
| FR-AUTH-01 | Cho đăng nhập bằng email hoặc mã cùng mật khẩu; phát access token 15 phút và refresh token 7 ngày trong cookie httpOnly | P0 | US-01 |
| FR-AUTH-02 | Khoá tài khoản 15 phút sau 5 lần sai mật khẩu trong 15 phút | P1 | US-01 |
| FR-AUTH-03 | Cho đăng xuất và thu hồi refresh token; đổi refresh token mỗi lần làm mới | P0 | US-01 |
| FR-AUTH-04 | Gửi link đặt lại mật khẩu (hạn 30 phút, dùng một lần); trả lời giống nhau dù email có tồn tại hay không; thu hồi mọi phiên sau khi đặt lại | P1 | US-02 |
| FR-AUTH-05 | Cho quản trị viên tạo, sửa, khoá tài khoản và gửi lại link đặt mật khẩu | P0 | US-04 |
| FR-AUTH-06 | Import sinh viên từ Excel (mã SV, họ tên, email); kiểm tra cả file, báo lỗi theo dòng; gửi link đặt mật khẩu hạn 72 giờ cho mỗi tài khoản mới | P0 | US-03 |
| FR-AUTH-07 | Cho quản trị viên tạo môn học và gán giảng viên vào môn | P0 | US-04 |
| FR-AUTH-08 | Kiểm tra vai trò và phạm vi môn ở mọi API và kết nối Socket.IO | P0 | US-04 |
| FR-AUTH-09 | Tạo quản trị viên đầu tiên bằng lệnh dòng lệnh | P0 |  |

### **3.2 Ngân hàng câu hỏi và rubric (QB)**

| Mã | Hệ thống phải | Ưu tiên | US |
| :---- | :---- | :---- | :---- |
| FR-QB-01 | Cho tạo, sửa câu hỏi gồm nội dung, chủ đề, mức Bloom, ngôn ngữ, đáp án tham khảo, ý chính, rubric, mục đích (tuỳ chọn) | P0 | US-05 |
| FR-QB-02 | Quản lý trạng thái Nháp, Chờ duyệt, Đã duyệt, Bị loại, Lưu trữ theo quy tắc BR-02 | P0 | US-09 |
| FR-QB-03 | Chặn câu trùng y hệt sau chuẩn hoá; cảnh báo câu có độ tương đồng từ 0,9 trong cùng môn | P0 | US-05 |
| FR-QB-04 | Import câu hỏi từ Excel theo mẫu; có dòng lỗi thì không ghi gì và báo lỗi theo dòng | P1 | US-06 |
| FR-QB-05 | Cho tạo rubric gồm tiêu chí, trọng số (tổng 100%), mỗi tiêu chí có các mức đánh giá với khoảng điểm không chồng nhau và mô tả | P0 | US-10 |
| FR-QB-06 | Khoá rubric khi đã dùng trong kỳ thi đã mở; cho nhân bản thành phiên bản mới | P1 | US-10 |
| FR-QB-07 | Lọc câu hỏi theo môn, chủ đề, trạng thái, mức Bloom, nguồn | P1 |  |

### **3.3 Sinh câu hỏi bằng RAG (RAG)**

| Mã | Hệ thống phải | Ưu tiên | US |
| :---- | :---- | :---- | :---- |
| FR-RAG-01 | Nhận tài liệu PDF, PPTX, DOCX tối đa 50 MB, lưu lên kho file; từ chối định dạng khác | P0 | US-07 |
| FR-RAG-02 | Trích chữ, cắt đoạn khoảng 500 từ có chồng lấn, giữ số trang hoặc slide, tạo vector và lưu; báo lỗi nếu không trích được chữ | P0 | US-07 |
| FR-RAG-03 | Cho giảng viên yêu cầu sinh tối đa 20 câu một lần theo chủ đề, tài liệu, phân bổ Bloom, ngôn ngữ; chạy nền và hiện tiến độ | P0 | US-08 |
| FR-RAG-04 | Sinh mỗi câu kèm đáp án tham khảo, 3–5 ý chính, đoạn nguồn và trích dẫn, mục đích, phần tổng hợp | P0 | US-08 |
| FR-RAG-05 | Bỏ câu có trích dẫn không khớp với đoạn nguồn; lưu câu hợp lệ ở trạng thái Chờ duyệt | P0 | US-08 |
| FR-RAG-06 | Hiện câu Chờ duyệt cạnh đoạn nguồn; cho Duyệt (bắt buộc gắn rubric), Sửa rồi duyệt, Loại kèm lý do, duyệt nhiều câu một lần | P0 | US-09 |

### **3.4 Kỳ thi (EXAM)**

| Mã | Hệ thống phải | Ưu tiên | US |
| :---- | :---- | :---- | :---- |
| FR-EXAM-01 | Cho giảng viên tạo kỳ thi với chủ đề, ngôn ngữ, số câu chính (1–10), số lượt xoáy tối đa mỗi câu (0–5), giờ suy nghĩ, giờ trả lời, giờ của cả phiên, và một khung giờ mở, đóng chung cho cả kỳ; tuỳ chọn số câu theo từng mức Bloom (tổng bằng số câu chính; để trống thì lấy theo tỉ lệ của ngân hàng) | P0 | US-11, US-22 |
| FR-EXAM-02 | Nhận danh sách mã SV dán vào; báo mã không tồn tại | P0 | US-11 |
| FR-EXAM-03 | Cho chọn người chấm trong số giảng viên của môn | P0 | US-11 |
| FR-EXAM-04 | Chỉ quản trị viên mở (khởi động) được kỳ thi, và chỉ kỳ thi SCHEDULED; khi mở thì khoá rubric của mọi câu Đã duyệt trong chủ đề và tạo sẵn audio các câu này bằng việc nền, không chặn yêu cầu | P0 | US-24 |
| FR-EXAM-05 | Cho sinh viên xem các kỳ thi có tên mình, giờ mở và trạng thái của từng kỳ; kỳ chưa khởi động hiện “chưa bắt đầu” | P0 | US-12 |
| FR-EXAM-06 | Cho giảng viên gửi lịch (DRAFT → SCHEDULED) khi đã có giờ mở và đóng, giờ đóng chưa qua, chủ đề đủ câu Đã duyệt theo tổng và theo từng mức Bloom; cho rút lịch (SCHEDULED → DRAFT) để sửa. Giảng viên không tự mở kỳ thi | P0 | US-22 |
| FR-EXAM-07 | Cho quản trị viên xem bảng lịch thi của mọi môn, lọc theo trạng thái, môn, khoảng ngày; mỗi kỳ hiện khung giờ, giảng viên, số sinh viên, số phiên đã bắt đầu và đã xong, trạng thái làm nóng Lambda | P0 | US-24 |
| FR-EXAM-08 | Khi khởi động: trong một transaction chuyển OPEN, ghi started\_at, started\_by, khoá rubric; sau đó chạy song song mà không chặn yêu cầu: làm nóng Lambda STT và TTS theo ngôn ngữ kỳ thi, việc nền PREPARE\_EXAM\_AUDIO (có tiến độ đã xong/tổng), việc nền KEEP\_WARM gọi lại hai Lambda mỗi 5 phút tới giờ đóng hoặc tới khi kỳ thi không còn OPEN; ghi kết quả vào warm\_status. Cho quản trị viên bấm Làm nóng lại; cho quản trị viên hoặc giảng viên đóng kỳ thi | P0 | US-24 |
| FR-EXAM-09 | Cho đặt giới hạn tổng số lượt xoáy cho mỗi thí sinh (0–20, hoặc không giới hạn) | P1 | US-25 |

### **3.5 Phỏng vấn AI (INT)**

| Mã | Hệ thống phải | Ưu tiên | US |
| :---- | :---- | :---- | :---- |
| FR-INT-01 | Tạo phiên thi khi sinh viên vào lúc kỳ thi OPEN và đang trong khung giờ; chọn câu chính từ câu Đã duyệt của chủ đề theo BR-13; làm nóng Lambda STT khi phiên bắt đầu | P0 | US-12, US-23 |
| FR-INT-02 | Kiểm tra micro trước khi bắt đầu | P1 | US-13 |
| FR-INT-03 | Hiện câu hỏi dạng chữ và phát audio TTS đúng ngôn ngữ kỳ thi | P0 | US-13 |
| FR-INT-04 | Đếm giờ suy nghĩ và giờ trả lời theo đồng hồ của server; hết giờ thì tự nộp phần đã nói | P0 | US-13 |
| FR-INT-05 | Ghi âm, gửi audio từng đoạn trong lúc nói, lưu audio và chuyển thành chữ | P0 | US-13 |
| FR-INT-06 | Quyết định hỏi xoáy hay sang câu tiếp theo BR-05; câu xoáy một câu, tối đa khoảng 40 từ, không lộ đáp án | P0 | US-14 |
| FR-INT-07 | Không hiển thị transcript cho sinh viên và không cho ghi âm lại (trừ khi hệ thống lỗi, theo A1, A3) | P0 | US-13 |
| FR-INT-08 | Hiện “Câu x/y · Hỏi thêm a/b” và thời gian còn lại của phiên | P0 | US-13 |
| FR-INT-09 | Cho thi tiếp từ lượt đang dở khi kết nối lại, với thời gian còn lại của lượt đó | P1 | US-15 |
| FR-INT-10 | Xử lý các lỗi A1–A6 và lỗi TTS mà không làm mất phiên; ghi mọi lần thử lại | P0 |  |
| FR-INT-11 | Ghi tín hiệu phụ mỗi lượt: thời gian trước khi nói, thời lượng nói, số từ mỗi phút, số khoảng lặng trên 2 giây | P1 | US-20 |
| FR-INT-12 | Kết thúc phiên khi hết câu hoặc hết giờ: lưu transcript, tạo bản ghi chờ chấm, đưa vào hàng đợi chấm | P0 | US-16 |
| FR-INT-13 | Chỉ hỏi xoáy khi còn lượt xoáy của câu đang hỏi và còn lượt xoáy của thí sinh (max\_follow\_ups\_total) | P1 | US-25 |
| FR-INT-14 | Từ chối vào thi với mã lỗi EXAM\_NOT\_STARTED khi kỳ thi chưa OPEN hoặc chưa tới giờ mở; từ chối khi đã qua giờ đóng | P0 | US-12 |

### **3.6 Chấm điểm gợi ý (GRD)**

| Mã | Hệ thống phải | Ưu tiên | US |
| :---- | :---- | :---- | :---- |
| FR-GRD-01 | Chấm từng câu chính (gồm các lượt xoáy) theo từng tiêu chí rubric của câu: mức, điểm, lý do, bằng chứng trích từ transcript | P0 | US-16 |
| FR-GRD-02 | Cho mỗi câu: điểm mạnh, điểm yếu, ý còn thiếu, nhận xét, độ tin cậy | P0 | US-16 |
| FR-GRD-03 | Tính điểm câu và điểm bài theo BR-07 | P0 | US-16 |
| FR-GRD-04 | Gắn cờ bài theo BR-08 và không đưa ra điểm gợi ý cho câu bị gắn cờ | P0 | US-19 |
| FR-GRD-05 | Hiện màn chấm: transcript theo lượt, audio, giải thích câu hỏi, tín hiệu phụ, bảng điểm AI; bấm bằng chứng thì nhảy tới đoạn transcript | P0 | US-16, US-21 |
| FR-GRD-06 | Cho sửa điểm từng tiêu chí; bắt buộc lý do khi khác điểm AI; lưu lịch sử mọi lần sửa | P0 | US-18 |
| FR-GRD-07 | Cho chấm lại bằng AI mà vẫn giữ điểm giảng viên đã sửa | P1 | US-18 |
| FR-GRD-08 | Cho chốt điểm và mở lại, ghi lịch sử; chỉ người chấm được phân công | P0 | US-18 |

### **3.7 Giải thích câu hỏi (EXP)**

| Mã | Hệ thống phải | Ưu tiên | US |
| :---- | :---- | :---- | :---- |
| FR-EXP-01 | Lưu với mỗi lượt hỏi một phần giải thích gồm lý do, mục đích, ý chính và tiêu chí nhắm tới, căn cứ (đoạn nguồn, ý chính, câu nói của sinh viên), phần tổng hợp | P0 | US-17 |
| FR-EXP-02 | Câu chính do AI sinh lấy giải thích từ lúc sinh; câu giảng viên soạn lấy từ dữ liệu giảng viên nhập và ghi rõ “câu do giảng viên soạn” | P0 | US-17 |
| FR-EXP-03 | Kiểm tra mọi trích dẫn với transcript hoặc tài liệu gốc; trích dẫn không khớp bị bỏ và ghi chú “không xác minh được” | P0 | US-17 |
| FR-EXP-04 | Không gửi phần giải thích tới máy sinh viên dưới bất kỳ hình thức nào | P0 | US-17 |

## **4\. Use case chính**

| Mã | Use case | Tác nhân | Tiền điều kiện | Kết quả |
| :---- | :---- | :---- | :---- | :---- |
| UC-01 | Đăng nhập | Mọi người dùng | Tài khoản đã đặt mật khẩu, không bị khoá | Có phiên đăng nhập, vào trang theo vai trò |
| UC-02 | Import sinh viên | Quản trị viên | Có file Excel theo mẫu | Tài khoản được tạo, email đặt mật khẩu vào hàng đợi |
| UC-03 | Soạn hoặc import câu hỏi | Giảng viên | Được gán môn, có rubric | Câu hỏi Đã duyệt hoặc Nháp |
| UC-04 | Sinh câu hỏi bằng AI | Giảng viên | Có tài liệu trạng thái READY | Câu hỏi Chờ duyệt có nguồn và giải thích |
| UC-05 | Duyệt câu AI sinh | Giảng viên | Có câu Chờ duyệt | Câu Đã duyệt có rubric, hoặc Bị loại có lý do |
| UC-06 | Tạo và gửi lịch kỳ thi | Giảng viên | Được gán môn; đủ câu Đã duyệt cho chủ đề, theo tổng và từng mức Bloom | Kỳ thi SCHEDULED, hiện trên bảng lịch thi của quản trị viên |
| UC-07 | Thi vấn đáp | Sinh viên, AI | Có tên trong kỳ thi, kỳ thi OPEN, đang trong khung giờ | Phiên COMPLETED, bài chờ chấm |
| UC-08 | Chấm gợi ý | AI | Phiên COMPLETED | Bài AI\_SUGGESTED hoặc FLAGGED |
| UC-09 | Chốt điểm | Giảng viên được phân công | Bài AI\_SUGGESTED hoặc FLAGGED | Bài FINALIZED, có lịch sử chỉnh điểm |
| UC-10 | Quản trị lịch thi và khởi động kỳ thi | Quản trị viên | Kỳ thi SCHEDULED, giờ đóng chưa qua | Kỳ thi OPEN, Lambda STT và TTS đã làm nóng, audio câu hỏi đã tạo sẵn |

**UC-07 Thi vấn đáp, luồng chính**

1. Sinh viên chọn kỳ thi và bấm Vào thi; hệ thống kiểm tra kỳ thi OPEN và đang trong khung giờ, tạo phiên, chọn câu chính theo BR-13, đặt hạn chót phiên và làm nóng Lambda STT.  
2. Sinh viên thử micro và báo sẵn sàng.  
3. Hệ thống hiện và đọc câu hỏi; hết audio thì bắt đầu giờ suy nghĩ, rồi giờ trả lời.  
4. Sinh viên nói; hệ thống nhận audio từng đoạn, lưu và chuyển thành chữ.  
5. Sinh viên bấm Nộp hoặc hết giờ; hệ thống phân tích câu trả lời.  
6. Nếu cần và còn lượt (của câu và của thí sinh), hệ thống hỏi xoáy (quay lại bước 3 với câu xoáy); nếu không thì sang câu chính tiếp.  
7. Hết câu chính hoặc hết giờ phiên thì kết thúc, lưu transcript và đưa bài vào hàng đợi chấm.

**UC-07 luồng thay thế** (theo Workflow Definition)

| Mã | Tình huống | Hệ thống làm gì |
| :---- | :---- | :---- |
| A1 | Audio rỗng hoặc hỏng do hệ thống | Cho nói lại 1 lần |
| A2 | Lưu audio lỗi | Thử lại 3 lần; lỗi hẳn thì đánh dấu lượt FAILED và thi tiếp |
| A3 | STT lỗi | Chạy lại 2 lần; vẫn lỗi thì mời nói lại 1 lần |
| A4 | LLM lỗi hoặc trả sai định dạng | Gọi lại 1 lần; vẫn lỗi thì sang câu chính tiếp |
| A5 | Mất ngữ cảnh phiên | Thử lại; không được thì PAUSED, bù thời gian tạm dừng |
| A6 | Kết thúc | Lưu transcript, tạo bài chờ chấm |
| A7 | TTS lỗi | Hiện câu hỏi dạng chữ, đọc bằng giọng của trình duyệt |
| A8 | Rớt mạng hoặc tải lại trang | Quay lại lượt đang dở với thời gian còn lại; quá hạn phiên thì kết thúc với phần đã trả lời |
| A9 | Kỳ thi chưa khởi động hoặc chưa tới giờ mở | Từ chối với EXAM\_NOT\_STARTED; trang sinh viên hiện giờ mở và “chưa bắt đầu” |

**UC-10 Quản trị lịch thi và khởi động kỳ thi, luồng chính**

1. Quản trị viên mở Bảng lịch thi; hệ thống hiện mọi kỳ thi của các môn, lọc được theo trạng thái, môn và khoảng ngày.  
2. Quản trị viên chọn một kỳ thi SCHEDULED và bấm Khởi động.  
3. Hệ thống kiểm tra kỳ thi còn SCHEDULED và giờ đóng chưa qua; trong một transaction chuyển kỳ thi sang OPEN, ghi người và giờ khởi động, khoá rubric các câu Đã duyệt của chủ đề.  
4. Hệ thống trả kết quả ngay, rồi chạy song song: làm nóng Lambda STT và TTS theo ngôn ngữ kỳ thi, việc nền PREPARE\_EXAM\_AUDIO tạo sẵn audio cho mọi câu Đã duyệt của chủ đề, việc nền KEEP\_WARM gọi lại hai Lambda mỗi 5 phút.  
5. Bảng hiện trạng thái làm nóng của STT, TTS và tiến độ tạo audio (đã xong/tổng).  
6. Sinh viên vào thi trong khung giờ (UC-07); mỗi lần một phiên bắt đầu, hệ thống làm nóng STT thêm một lần.  
7. Khi cần, quản trị viên hoặc giảng viên bấm Đóng; kỳ thi CLOSED và KEEP\_WARM dừng. Qua giờ đóng thì KEEP\_WARM cũng tự dừng.

**UC-10 luồng thay thế**

| Mã | Tình huống | Hệ thống làm gì |
| :---- | :---- | :---- |
| A1 | Làm nóng STT hoặc TTS lỗi | Kỳ thi vẫn OPEN; trạng thái làm nóng trên bảng hiện lỗi; quản trị viên bấm Làm nóng lại |
| A2 | Đã qua giờ đóng khi bấm Khởi động | Từ chối, kỳ thi giữ SCHEDULED; giảng viên rút lịch, sửa khung giờ rồi gửi lại |
| A3 | Kỳ thi không còn SCHEDULED (đã rút lịch, đã mở hoặc đã đóng) | Từ chối với lỗi sai trạng thái, bảng tải lại trạng thái mới |
| A4 | Tạo audio một câu lỗi | Việc nền thử lại theo hàng đợi; vẫn lỗi thì câu đó được tổng hợp lúc hỏi, lỗi tiếp thì đọc bằng giọng trình duyệt (A7 của UC-07) |
| A5 | Lúc giảng viên gửi lịch, chủ đề thiếu câu Đã duyệt theo tổng hoặc theo một mức Bloom | Từ chối gửi lịch và báo mức còn thiếu; kỳ thi giữ DRAFT |
| A6 | Lúc giảng viên gửi lịch, chưa có khung giờ hoặc giờ đóng đã qua | Từ chối gửi lịch; kỳ thi giữ DRAFT |

## **5\. Quy tắc nghiệp vụ**

| Mã | Quy tắc |
| :---- | :---- |
| BR-01 | Mỗi tài khoản có đúng một vai trò. Giảng viên chỉ thao tác trên môn được gán; sinh viên chỉ thấy kỳ thi có tên mình. |
| BR-02 | Câu giảng viên soạn hoặc import vào Nháp hoặc Đã duyệt; câu AI sinh luôn vào Chờ duyệt. Chờ duyệt chuyển sang Đã duyệt hoặc Bị loại; Đã duyệt chuyển sang Lưu trữ. Chỉ câu Đã duyệt có rubric mới được chọn vào kỳ thi. |
| BR-03 | Tổng trọng số tiêu chí của một rubric bằng 100%; các mức đánh giá của một tiêu chí không chồng khoảng điểm. Rubric đã dùng trong kỳ thi đã mở thì không sửa được. |
| BR-04 | Kỳ thi chỉ gửi lịch được khi chủ đề có ít nhất số câu Đã duyệt bằng số câu chính cấu hình, đúng ngôn ngữ kỳ thi, và đủ câu cho từng mức Bloom theo phân bổ. Mỗi sinh viên một phiên mỗi kỳ thi. |
| BR-05 | Thứ tự quyết định sau mỗi câu trả lời: hết giờ phiên thì kết thúc; câu trả lời trống thì sang câu chính tiếp; AI đề xuất hỏi xoáy, còn lượt xoáy của câu và còn lượt xoáy của thí sinh thì hỏi xoáy; còn lại sang câu chính tiếp hoặc kết thúc nếu hết câu. AI chỉ được đề xuất, các giới hạn do hệ thống áp đặt. |
| BR-06 | Hạn chót phiên \= lúc bắt đầu \+ giờ của cả phiên (session\_time\_limit\_sec) do giảng viên đặt, không quá giờ đóng kỳ thi; tính một lần lúc bắt đầu và lưu lại. Thời gian rớt mạng vẫn tính; thời gian PAUSED do lỗi hệ thống được bù. |
| BR-07 | Điểm câu \= tổng (điểm tiêu chí ÷ điểm tối đa của tiêu chí × trọng số %) × 10\. Điểm bài \= trung bình điểm các câu chính, làm tròn 1 chữ số thập phân. Điểm AI của một tiêu chí phải nằm trong khoảng của mức AI chọn. |
| BR-08 | Một câu bị gắn cờ khi độ tin cậy dưới 0,6, có lượt FAILED, độ tin cậy STT trung bình thấp, hoặc AI chấm lỗi sau 3 lần. Bài có câu bị gắn cờ thì ở trạng thái FLAGGED. |
| BR-09 | Chỉ giảng viên được phân công cho kỳ thi mới sửa và chốt điểm. Sửa khác điểm AI phải có lý do. Chốt điểm cần mọi câu có điểm cuối, kể cả câu bị gắn cờ. |
| BR-10 | Tín hiệu phụ chỉ để tham khảo, không ảnh hưởng điểm. |
| BR-11 | Câu trả lời của sinh viên và nội dung tài liệu là dữ liệu, không phải mệnh lệnh cho AI. |
| BR-12 | Sinh viên chỉ vào thi được khi kỳ thi OPEN (quản trị viên đã khởi động) và giờ mở ≤ hiện tại \< giờ đóng; trước đó báo EXAM\_NOT\_STARTED. Giảng viên chỉ gửi và rút lịch, không tự mở kỳ thi. |
| BR-13 | Chọn câu chính cho mỗi thí sinh: bỏ các câu chính đã giao cho K thí sinh bắt đầu gần nhất của cùng kỳ thi (theo giờ bắt đầu phiên), K \= clamp(floor(số câu Đã duyệt ÷ số câu chính) − 1, 0, 3); trong các câu còn lại ưu tiên câu ít được dùng nhất trong kỳ thi; mọi thí sinh có cùng số câu mỗi mức Bloom (theo phân bổ cấu hình, hoặc chia theo tỉ lệ ngân hàng bằng phần dư lớn nhất). Ngân hàng không đủ thì nới điều kiện loại trừ, bắt đầu từ thí sinh cũ nhất, và ghi cảnh báo. Việc chọn chạy trong transaction khoá dòng exam\_session để hai thí sinh bắt đầu cùng lúc không chọn chồng nhau. |
| BR-14 | Sau khi khởi động, Lambda STT và TTS được giữ nóng bằng một lần gọi mỗi 5 phút cho tới giờ đóng hoặc tới khi kỳ thi không còn OPEN. Làm nóng lỗi không chặn kỳ thi. |

## **6\. Yêu cầu phi chức năng**

| Mã | Loại | Yêu cầu | Cách kiểm tra |
| :---- | :---- | :---- | :---- |
| NFR-01 | Độ trễ | Từ lúc sinh viên nộp câu trả lời đến lúc câu hỏi tiếp bắt đầu phát: trung vị dưới 3 giây, p95 dưới 6 giây | Log thời gian từng bước STT, LLM, TTS |
| NFR-02 | Độ trễ | API REST thông thường trả về dưới 500 ms (p95), trừ tải file và việc nền | Test tải nhẹ |
| NFR-03 | Tải | Chịu được 20 sinh viên thi cùng lúc trên một EC2 t4g.small | Test tải bằng socket.io-client mô phỏng |
| NFR-04 | Độ bền | Không lỗi nào làm mất phiên thi; backend khởi động lại giữa buổi thì thi tiếp được | Test A1–A8 và test khởi động lại |
| NFR-05 | Độ bền | Không bao giờ tạo điểm ảo: AI lỗi thì gắn cờ chấm tay | Test chấm với LLM giả trả lỗi |
| NFR-06 | Sao lưu | Mất tối đa 24 giờ dữ liệu khi máy hỏng; khôi phục được từ bản sao S3 | Diễn tập make db-restore |
| NFR-07 | Bảo mật | Mật khẩu băm scrypt; token trong cookie httpOnly, Secure, SameSite=Lax; kiểm tra Origin; không lưu khoá trong repo | Rà code, test API |
| NFR-08 | Bảo mật | Mọi API kiểm tra vai trò và phạm vi; phần giải thích câu hỏi, đáp án và ý chính không bao giờ tới máy sinh viên | Test sai vai trò cho từng route, kiểm tra payload Socket.IO |
| NFR-09 | Bảo mật | Prompt tách rõ dữ liệu và chỉ dẫn; AI không làm theo lời sinh viên như “bỏ qua câu này” | Bộ test prompt injection |
| NFR-10 | Kiểm toán | Lưu audio, transcript, IP khi vào thi, lịch sử chỉnh điểm và các lần xử lý lỗi | Kiểm tra dữ liệu sau buổi thi mẫu |
| NFR-11 | Chi phí | Chi phí cố định dưới \$25/tháng khi chạy liên tục; có cảnh báo AWS Budgets | Hoá đơn AWS |
| NFR-12 | Di động môi trường | Cùng image chạy local và prod, chỉ khác biến môi trường; không có nhánh code theo môi trường | docker compose up chạy được toàn bộ |
| NFR-13 | Ngôn ngữ | Giao diện tiếng Việt; buổi thi tiếng Việt hoặc tiếng Anh theo kỳ thi | Test hai ngôn ngữ |
| NFR-14 | Khả năng kiểm thử | STT, TTS, LLM, embedding, email đều nằm sau adapter có bản mock | Test e2e chạy không cần khoá thật |
| NFR-15 | Độ trễ | Sinh viên không gặp khởi động nguội của Lambda trong giờ thi: làm nóng khi khởi động kỳ thi, giữ nóng mỗi 5 phút, làm nóng STT khi phiên bắt đầu. Đo được: lần gọi đầu tiên sau khi đổi image mất 45–75 giây, các lần sau chỉ thêm khoảng 1 giây | warm\_status trên bảng lịch thi, log thời gian gọi Lambda |

Con số ở NFR-01 và NFR-03 là mục tiêu ban đầu. Đo trên Lambda (x86\_64, 3008 MB): câu trả lời dài 23–32 giây được chuyển thành chữ trong khoảng 15–16 giây với beam 5, WER 0% trên mẫu sạch; bản đang chạy dùng beam 1, lọc VAD, không lấy mốc thời gian từng từ nên nhanh hơn. Với câu trả lời dài, NFR-01 chưa đạt và cần đo lại.

## **7\. Giao diện ngoài và dữ liệu**

**Giao diện người dùng.** Ứng dụng web dùng bộ component sẵn có của frontend; danh sách trang nằm trong kế hoạch và bố cục theo tài liệu UX Design.

**Giao diện phần mềm.**

| Hệ thống | Dùng cho | Giao thức | Khi chạy local |
| :---- | :---- | :---- | :---- |
| Lambda STT aives-prod-stt (PhoWhisper-small cho tiếng Việt, Whisper small cho tiếng Anh) | Chuyển giọng nói thành chữ | AWS Lambda Invoke, audio PCM 16 kHz trong payload | Cùng image qua Lambda Runtime Interface Emulator |
| Amazon Bedrock Nova Pro | Hỏi xoáy, sinh câu hỏi, chấm điểm | Converse API, tool use ép JSON | Gọi Bedrock thật |
| Amazon Bedrock Titan Text Embeddings V2 | Vector 1024 chiều cho RAG và câu gần giống | InvokeModel | Gọi Bedrock thật |
| Lambda TTS aives-prod-tts (Kokoro-82M, ONNX: bản fine-tune tiếng Việt giọng diem\_trinh, bản gốc tiếng Anh giọng af\_heart) | Đọc câu hỏi | AWS Lambda Invoke, trả WAV, cache trên S3 tts-cache/\<sha256\>.wav | Cùng image qua Lambda Runtime Interface Emulator |
| Google Cloud TTS Chirp 3: HD (tuỳ chọn, không còn là đường chính) | Đọc câu hỏi khi đặt TTS\_PROVIDER=google | REST, service account | Giống prod |
| Amazon S3 | Audio, tài liệu, cache TTS, bản sao lưu | S3 API | MinIO |
| Amazon DynamoDB | Ngữ cảnh phiên thi | DynamoDB API | DynamoDB Local |
| Gmail SMTP | Email đặt mật khẩu | SMTP 587, STARTTLS, App Password | Mailpit |

**Giao diện truyền thông.** HTTPS qua CloudFront cho web và /api; WebSocket (Socket.IO) qua đường /ws cùng domain. Danh sách endpoint và sự kiện nằm trong SDS.

**Yêu cầu dữ liệu.**

| Dữ liệu | Lưu ở đâu | Giữ bao lâu |
| :---- | :---- | :---- |
| Tài khoản, câu hỏi, rubric, kỳ thi, transcript, điểm, lịch sử chỉnh điểm | Postgres | Suốt đời hệ thống |
| Audio câu trả lời | S3 | Ít nhất tới khi kỳ thi được chốt điểm hết; đề xuất 1 năm |
| Tài liệu môn học và vector | S3 và Postgres | Tới khi giảng viên xoá |
| Ngữ cảnh phiên thi | DynamoDB | Tự xoá sau 24 giờ (TTL) |
| Audio câu hỏi đã tổng hợp | S3 | Cache, tạo lại được |
| Bản sao lưu CSDL | S3 | 14 ngày |
| Token đặt mật khẩu, phiên đăng nhập | Postgres, dạng băm | Tới khi hết hạn, dọn định kỳ |

Mô hình dữ liệu đầy đủ (27 bảng, tới migration 018) nằm trong SDS.