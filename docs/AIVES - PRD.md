# **AIVES \- Product Requirements Document (PRD)**

Oct 15, 2026 · @tmqthedev

AIVES là hệ thống thi vấn đáp bằng giọng nói, trong đó AI đóng vai giám khảo hỏi và hỏi xoáy, còn giảng viên soạn câu hỏi và chốt điểm. Bản phát hành này gồm đăng nhập, ngân hàng câu hỏi (nhóm 1), kỳ thi và lịch thi (nhóm 2), lõi phỏng vấn AI (nhóm 3\) và chấm điểm gợi ý (nhóm 4).

## **Bài toán và mục tiêu**

Thi vấn đáp 1-1 đánh giá đúng mức hiểu của sinh viên nhưng tốn nhiều giờ của giảng viên, và mỗi giảng viên hỏi, chấm một kiểu. AIVES để AI hỏi thay theo câu hỏi và rubric giảng viên đã duyệt, rồi đưa ra điểm gợi ý có bằng chứng để giảng viên chốt.

* **Giảm thời gian của giảng viên:** giảng viên không phải ngồi hỏi từng sinh viên, chỉ soạn hoặc duyệt câu hỏi trước và xem lại bài sau.  
* **Đánh giá nhất quán:** mọi sinh viên được hỏi theo cùng cấu hình và chấm theo cùng rubric có mô tả từng mức.  
* **Hỏi sâu như người thật:** AI hỏi xoáy khi câu trả lời thiếu ý, mơ hồ hoặc mâu thuẫn, trong giới hạn thời gian và số lượt.  
* **Minh bạch và con người quyết định:** mỗi câu hỏi có lời giải thích vì sao hỏi, mỗi điểm gợi ý có trích dẫn từ transcript, và chỉ giảng viên được chốt điểm.  
* **Chi phí gần 0 đồng:** chạy được bằng credit AWS của tài khoản mới, và chạy được cả trên máy local.

## **Người dùng**

| Vai trò | Họ cần gì | AIVES giúp gì |
| :---- | :---- | :---- |
| Quản trị viên | Tạo tài khoản cho cả lớp nhanh, phân môn cho giảng viên, mở kỳ thi đúng giờ | Import sinh viên từ Excel, tự gửi link đặt mật khẩu qua email, gán giảng viên vào môn, bảng lịch thi để khởi động và đóng kỳ thi |
| Giảng viên | Có đủ câu hỏi tốt theo từng mức Bloom, tổ chức thi mà không ngồi hỏi từng người, chấm nhanh nhưng vẫn công bằng | AI sinh câu hỏi từ giáo trình để duyệt, AI hỏi thay trong phòng thi, AI chấm gợi ý có bằng chứng và giải thích |
| Sinh viên | Biết mình thi kỳ nào, thi trong môi trường rõ ràng, không mất bài khi rớt mạng | Danh sách kỳ thi của mình, câu hỏi được đọc và hiện dạng chữ, đồng hồ đếm ngược, thi tiếp từ lượt đang dở |

## **Phạm vi bản phát hành**

| Nhóm chức năng (theo đề tài) | Bản này |
| :---- | :---- |
| 1\. Ngân hàng câu hỏi và rubric | Có đủ: tạo tay, import Excel, AI sinh bằng RAG, mức Bloom, rubric có mức đánh giá, duyệt câu AI sinh |
| 2\. Kỳ thi và lịch thi | Phần chính: tạo kỳ thi, cấu hình (số câu, số lượt xoáy mỗi câu và mỗi thí sinh, phân bổ Bloom), một khung giờ chung cho cả kỳ, danh sách sinh viên, người chấm, gửi lịch; quản trị viên khởi động kỳ thi. Chưa xếp giờ riêng cho từng thí sinh |
| 3\. Lõi phỏng vấn AI (bắt buộc) | Có đủ |
| 4\. Chấm điểm AI | Có đủ, kèm giải thích câu hỏi và tín hiệu phụ |
| 5\. Giám sát và minh bạch | Một phần: lưu audio, transcript, lịch sử chỉnh điểm, IP khi vào thi |
| 6\. Phản hồi và báo cáo | Chưa làm (sinh viên xem điểm, thống kê) |
| 7\. Quản trị | Một phần: tài khoản, vai trò, môn học, bảng lịch thi (khởi động, đóng, làm nóng lại) |

Không làm trong bản này: OCR cho PDF scan, cộng tín hiệu phụ vào điểm, đăng nhập bằng Google hay SSO.

## **Tính năng và user story**

Mức ưu tiên: P0 là bắt buộc để demo trọn vòng, P1 là cần có trước khi dùng thật. Mã yêu cầu chi tiết nằm trong SRS.

| ID | Là | Tôi muốn | Chấp nhận khi | Ưu tiên |
| :---- | :---- | :---- | :---- | :---- |
| US-01 | Người dùng | Đăng nhập bằng email hoặc mã và mật khẩu | Vào đúng trang theo vai trò; sai 5 lần trong 15 phút thì bị khoá tạm | P0 |
| US-02 | Người dùng | Đặt lại mật khẩu khi quên | Nhận link qua email, link hết hạn sau 30 phút và chỉ dùng một lần | P1 |
| US-03 | Quản trị viên | Import danh sách sinh viên từ Excel | Dòng lỗi được báo theo số dòng; mỗi sinh viên mới nhận email đặt mật khẩu | P0 |
| US-04 | Quản trị viên | Tạo giảng viên và gán vào môn | Giảng viên chỉ thấy dữ liệu của môn được gán | P0 |
| US-05 | Giảng viên | Tạo câu hỏi có mức Bloom, đáp án tham khảo, ý chính và rubric | Thiếu trường bắt buộc hoặc trùng y hệt thì không lưu; gần giống thì cảnh báo | P0 |
| US-06 | Giảng viên | Import câu hỏi từ Excel | Có file mẫu; file có dòng lỗi thì không ghi gì và báo lỗi theo dòng | P1 |
| US-07 | Giảng viên | Tải giáo trình, slide của môn | Nhận PDF, PPTX, DOCX có chữ đến 50 MB; thấy trạng thái xử lý | P0 |
| US-08 | Giảng viên | Cho AI sinh câu hỏi theo chủ đề và phân bổ Bloom | Mỗi câu có đáp án, ý chính, trích nguồn đúng với tài liệu và lời giải thích | P0 |
| US-09 | Giảng viên | Duyệt, sửa hoặc loại câu AI sinh | Câu chưa duyệt không bao giờ vào kỳ thi; duyệt phải gắn rubric | P0 |
| US-10 | Giảng viên | Tạo rubric có tiêu chí, trọng số và mức đánh giá | Tổng trọng số 100%; rubric đã dùng thì khoá, muốn sửa phải nhân bản | P0 |
| US-11 | Giảng viên | Tạo kỳ thi với số câu, số lượt xoáy, giờ suy nghĩ, giờ trả lời, ngôn ngữ, danh sách SV, người chấm | Kỳ thi chỉ gửi lịch được khi đủ câu Đã duyệt cho chủ đề, cả tổng số và từng mức Bloom | P0 |
| US-12 | Sinh viên | Thấy các kỳ thi của mình và vào thi trong khung giờ | Không thấy kỳ thi không có tên mình; thấy giờ mở; ngoài khung giờ hoặc khi kỳ thi chưa được khởi động thì không vào được | P0 |
| US-13 | Sinh viên | Nghe câu hỏi và trả lời bằng giọng nói | Câu hỏi hiện dạng chữ và được đọc; có đồng hồ; hết giờ thì tự nộp | P0 |
| US-14 | Sinh viên | Được hỏi xoáy khi trả lời chưa đủ | Chỉ hỏi khi thiếu ý, mơ hồ, mâu thuẫn; không quá số lượt cấu hình; không lộ đáp án | P0 |
| US-15 | Sinh viên | Thi tiếp khi rớt mạng hoặc tải lại trang | Quay lại đúng lượt đang dở với thời gian còn lại, không được cộng thêm giờ | P1 |
| US-16 | Giảng viên | Nhận điểm gợi ý ngay sau buổi thi | Điểm từng tiêu chí có lý do và trích dẫn; có điểm mạnh, điểm yếu, ý thiếu | P0 |
| US-17 | Giảng viên | Biết vì sao AI hỏi từng câu | Mỗi câu chính và câu xoáy có lý do, nguồn, phần tổng hợp, mục đích; sinh viên không thấy | P0 |
| US-18 | Giảng viên | Chỉnh điểm và chốt | Khác điểm AI thì phải ghi lý do; mọi lần chỉnh có lịch sử; chỉ người chấm được phân công mới chốt | P0 |
| US-19 | Giảng viên | Biết bài nào AI không chắc chắn | Bài có độ tin cậy dưới 0,6 hoặc transcript thiếu được gắn cờ, không có điểm gợi ý | P0 |
| US-20 | Giảng viên | Xem tốc độ nói, thời gian trả lời, số lần ngập ngừng | Hiển thị cạnh từng lượt, không cộng vào điểm | P1 |
| US-21 | Giảng viên | Nghe lại audio của từng câu trả lời | Phát được từ màn chấm | P1 |
| US-22 | Giảng viên | Đặt một khung giờ mở, đóng chung cho kỳ thi rồi gửi lịch | Gửi lịch chỉ được khi có khung giờ, giờ đóng chưa qua và đủ câu Đã duyệt theo tổng và từng mức Bloom; kỳ thi chuyển sang Đã lên lịch; rút lịch thì về Nháp để sửa | P0 |
| US-23 | Giảng viên | Mỗi thí sinh nhận bộ câu chính không trùng với các thí sinh vừa thi trước, nhưng cùng tỉ lệ mức Bloom | Khi ngân hàng đủ câu, hai thí sinh liền nhau không trùng câu chính; mọi thí sinh có cùng số câu mỗi mức Bloom; ngân hàng thiếu thì vẫn chọn được và có ghi cảnh báo | P0 |
| US-24 | Quản trị viên | Xem lịch thi của mọi môn và khởi động kỳ thi | Bảng lọc theo trạng thái, môn, khoảng ngày; Khởi động chuyển kỳ thi sang Đang mở, làm nóng STT và TTS, tạo sẵn audio câu hỏi có tiến độ; làm nóng lỗi thì kỳ thi vẫn mở và bấm Làm nóng lại được | P0 |
| US-25 | Giảng viên | Giới hạn tổng số câu hỏi xoáy cho mỗi thí sinh | Không thí sinh nào bị hỏi xoáy quá giới hạn này, kể cả khi câu đang hỏi còn lượt xoáy | P1 |

## **Luồng sử dụng trọn vòng**

1. **Quản trị viên** tạo môn học, tài khoản giảng viên và import sinh viên; mọi người nhận email đặt mật khẩu.  
2. **Giảng viên** tải giáo trình và slide, tạo rubric, rồi soạn, import hoặc cho AI sinh câu hỏi.  
3. **Giảng viên** duyệt câu AI sinh: xem đoạn nguồn và lời giải thích, sửa nếu cần, gắn rubric.  
4. **Giảng viên** tạo kỳ thi, dán danh sách mã SV, chọn người chấm, đặt khung giờ và gửi lịch.  
5. **Quản trị viên** xem bảng lịch thi và bấm Khởi động: kỳ thi mở, hệ thống làm nóng STT, TTS và tạo sẵn audio câu hỏi.  
6. **Sinh viên** đăng nhập, thử micro, vào thi trong khung giờ. AI đọc từng câu chính, nghe câu trả lời, hỏi xoáy khi cần, rồi chuyển câu tiếp cho đến hết số câu hoặc hết giờ.  
7. **Hệ thống** lưu transcript và audio, AI chấm gợi ý theo rubric, gắn cờ bài không chắc chắn.  
8. **Giảng viên** được phân công mở màn chấm: đọc transcript, xem vì sao AI hỏi từng câu, kiểm tra bằng chứng, chỉnh điểm có lý do và chốt.

## **Chỉ số thành công**

| Chỉ số | Mục tiêu | Đo bằng |
| :---- | :---- | :---- |
| Thời gian chờ sau khi sinh viên nói xong đến câu hỏi tiếp | Dưới 3 giây (trung vị), dưới 6 giây (p95) | Log thời gian từng bước của mỗi lượt |
| Buổi thi hoàn thành không bị mất phiên | 100% buổi thi có transcript và bản ghi chấm | viva\_interview và viva\_result |
| Câu AI sinh được duyệt (có hoặc không sửa) | Từ 60% trở lên | Trạng thái câu hỏi có nguồn AI |
| Điểm AI sát điểm giảng viên chốt | Chênh trung bình dưới 1 điểm trên thang 10 | ai\_total\_score so với final\_total\_score |
| Bài bị gắn cờ | Dưới 15% | viva\_result trạng thái FLAGGED |
| Chi phí cố định | Dưới \$25/tháng khi chạy liên tục | AWS Budgets |

Các mục tiêu là đề xuất ban đầu, nhóm chỉnh lại sau khi đo thật ở bước 9 của kế hoạch.

## **Ràng buộc, giả định và tài liệu liên quan**

* Chi phí gần 0 đồng; dịch vụ trả phí thì dùng của AWS, trả bằng credit tài khoản mới. STT (PhoWhisper-small cho tiếng Việt, Whisper small cho tiếng Anh) và TTS (Kokoro-82M, có bản fine-tune tiếng Việt) chạy model mở trên AWS Lambda, vì AWS không có giọng đọc tiếng Việt; Google TTS chỉ còn là tuỳ chọn.  
* Cùng một bản code chạy ở local và trên AWS, chỉ khác biến môi trường.  
* Ngôn ngữ thi là tiếng Việt hoặc tiếng Anh, chọn theo kỳ thi.  
* Sinh viên thi trên trình duyệt có micro; không có giám sát camera trong bản này.  
* AI không bao giờ tự chốt điểm; khi AI lỗi thì bài chuyển sang chấm tay, không tạo điểm ảo.  
* Tài liệu liên quan: [Kế hoạch triển khai](https://claude.ai/code/artifact/f2a9989b-ff90-4200-86b9-66af7ac7e890), [SRS](https://claude.ai/code/artifact/0aecd027-dead-48e4-ba63-361bc0a7c0e5) và [SDS](https://claude.ai/code/artifact/33d142a7-f922-4d96-aa62-54ff98ee510e) của AIVES, Workflow Definition và UX Design trong thư mục AIVES Docs của repo.