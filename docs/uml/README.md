# UML diagrams

Bộ sơ đồ UML của AIVES, vẽ theo đúng code hiện tại (migrations `001…029`, `backend/src`, `infrastructure/terraform`). Khi code đổi, sửa sơ đồ trong cùng PR.

| Sơ đồ | Nguồn | Xem |
|---|---|---|
| Use case | [use-case-diagram.drawio](use-case-diagram.drawio) | [PNG](png/use-case-diagram.png) |
| Class (miền / dữ liệu): 26 lớp, 24 enum, quan hệ + bội số từ FK | [class-diagram.drawio](class-diagram.drawio) | [PNG](png/class-diagram.png) |
| Class (thiết kế backend): service, adapter, repository, job queue | [design-class-diagram.md](design-class-diagram.md) | Mermaid, hiển thị trên GitHub |
| State machine: Question, ExamSession, VivaInterview, QATurn, VivaResult, CourseMaterial, QuestionGenerationJob, BackgroundJob | [state-machines.md](state-machines.md) | Mermaid |
| Activity: tạo câu hỏi + rubric, RAG, thi vấn đáp, chấm điểm + duyệt | [activity-diagrams.md](activity-diagrams.md) | Mermaid |
| Sequence: bắt đầu phiên thi, một lượt trả lời, chấm điểm + chốt | [sequence-diagrams.md](sequence-diagrams.md) | Mermaid |
| Deployment (AWS prod) | [deployment-diagram.drawio](deployment-diagram.drawio) | [PNG](png/deployment-diagram.png) |
| ERD vật lý (Postgres) | [../architecture-aws.md](../architecture-aws.md#physical-erd-postgres) | Mermaid |

`docs/flow-class-diagram.png` là bản xuất của `class-diagram.drawio` (giữ tên cũ vì các tài liệu khác đang trỏ tới).

## Sửa và xuất lại

Ba file `.drawio` được sinh từ script để bám sát code; mở bằng draw.io để xem hoặc trình bày, nhưng khi sửa nội dung hãy sửa script rồi sinh lại:

```bash
node docs/uml/tools/build-class-diagram.js        # model: docs/uml/tools/class-model.js
node docs/uml/tools/build-use-case-diagram.js
node docs/uml/tools/build-deployment-diagram.js
```

Xuất PNG (draw.io qua mxGraph, Mermaid qua mermaid.js, cả hai chạy trong Chromium headless của Playwright):

```bash
mkdir -p /tmp/uml-render && (cd /tmp/uml-render && npm init -y >/dev/null && npm i mermaid@11.4.1 mxgraph@4.2.2 playwright)
UML_RENDER_MODULES=/tmp/uml-render/node_modules node docs/uml/tools/render.js docs/uml/*.drawio
cp docs/uml/png/class-diagram.png docs/flow-class-diagram.png
```

Chỉ commit PNG của các file `.drawio` (GitHub không hiển thị `.drawio`). Sơ đồ Mermaid hiển thị trực tiếp trên GitHub nên không commit ảnh; khi cần ảnh cho báo cáo, chạy `render.js` với file `.md` (ảnh ra `docs/uml/png/<tên>-<n>.png`).

## Quy ước

- Class diagram miền: tên thuộc tính là tên cột; `[0..1]` là cột nullable; `{id}` là khoá chính; ◆ composition là `ON DELETE CASCADE`; tham chiếu "ai thực hiện" tới `AppUser` (`created_by`, `reviewed_by`, ...) ghi thành thuộc tính kiểu `AppUser`. Bảng nối thuần (`subject_lecturer`, `subject_student`, `exam_session_student`, `exam_session_examiner`) vẽ thành association nhiều-nhiều.
- State machine chỉ vẽ chuyển trạng thái có trong code. Giá trị có trong CHECK constraint nhưng không code nào ghi (`viva_interview.TERMINATED`, `qa_turn.FAILED`) được ghi chú rõ.
- Không có Step Functions, API Gateway, Transcribe hay Polly: các bản vẽ cũ dùng chúng (`Workflow Diagram.png`, bản class diagram đầu tiên) đã lỗi thời so với code.
