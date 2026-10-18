# AIVES — API contract for Backend

Tài liệu này mô tả API mà **frontend đang thiết kế / mock**. FE hiện **không gọi NodeJS** trừ stub `audioService`. Mọi endpoint dưới đây (trừ audio) đang **MOCK** và cần BE làm.

Auth header giả định: `Authorization: Bearer <accessToken>` khi đã login.

Format lỗi thống nhất:

```json
{ "message": "Human-readable error", "code": "OPTIONAL_CODE" }
```

HTTP: `400` validation, `401` unauthenticated, `403` forbidden, `404` not found, `409` duplicate, `500` server.

---

## 1. Port & môi trường

| Môi trường | FE | BE (đề xuất) | API Gateway | WebSocket/SSE |
|---|---|---|---|---|
| Local | Vite **5173** | NodeJS **3000** | `http://localhost:3000` | `ws://localhost:3000` |
| Staging | CloudFront | API Gateway URL | GIẢ ĐỊNH: `https://api-staging.aives.example` | cùng origin, path `/ws` |
| Prod | CloudFront | API Gateway URL | GIẢ ĐỊNH: `https://api.aives.example` | cùng origin, path `/ws` |

CORS whitelist local: `http://localhost:5173`

### Biến môi trường FE

| Tên | Ý nghĩa | Ví dụ |
|---|---|---|
| `VITE_API_BASE_URL` | Base URL REST (API Gateway / Node) | `http://localhost:3000` |
| `VITE_WS_BASE_URL` | Base URL WebSocket/SSE | `ws://localhost:3000` |

FE **không** hard-code port khi deploy. Fallback local là `http://localhost:3000`.

---

## 2. Enums dùng chung

```
Question.status     pending_review | approved | rejected
Question.source     lecturer | ai | import
Bloom.level         remember | understand | apply | analyze
Generation.status   pending | processing | completed | failed
Slot.status         ready | in_progress | pending_review | approved
Turn.type           main | follow_up
Fluency             hesitant | adequate | fluent
```

**GIẢ ĐỊNH:** `pending` là trạng thái *generation request*, không gắn lên Question. Role FE `lecturer` = Teacher trên ERD. Chưa có Admin.

---

## 3. REST theo nhóm

Các mục đánh dấu **[MOCK]** FE đang giả lập. **[STUB]** có hàm fetch nhưng UI chưa gọi.

### 3.1 Auth & phân quyền  **[MOCK UI only]**

Màn: `features/auth/login`, `forgetPassword`

| Method | URL | Mục đích |
|---|---|---|
| POST | `/api/auth/login` | Đăng nhập |
| POST | `/api/auth/logout` | Đăng xuất |
| POST | `/api/auth/forgot-password` | Gửi link reset |

**Login request**

```json
{ "identifier": "string (email or studentId)", "password": "string", "role": "lecturer | student" }
```

**GIẢ ĐỊNH / câu hỏi cho BE:** Backend có nhận `role` không? FE hiện chỉ dùng role để điều hướng demo. Nếu JWT chứa `role`, FE sẽ bỏ field này.

**Login 200**

```json
{
  "accessToken": "jwt",
  "user": { "id": "T01", "name": "Dr. Smith", "role": "lecturer" }
}
```

Forgot-password: `{ "email": "string" }` → 202 `{ "message": "If the account exists, a reset email was sent." }`

---

### 3.2 Course / Topic / Material / Term  **[MOCK read-only]**

Màn: form sinh câu hỏi, bộ lọc ngân hàng.

| Method | URL | Ghi chú |
|---|---|---|
| GET | `/api/courses` | `{ "items": [{ "id", "code", "name" }] }` |
| GET | `/api/courses/:courseId/topics` | `{ "items": [{ "id", "courseId", "name" }] }` |
| GET | `/api/topics/:topicId/materials` | `{ "items": [{ "id", "topicId", "title", "excerpt" }] }` |

Term / Enrollment: FE **chưa dùng**. Cần BE nếu slot thi gắn học kỳ.

---

### 3.3 Question bank  **[MOCK]**

Màn: `features/question-bank/pages`

**GET `/api/questions`**

Query (tuỳ chọn): `search`, `status`, `bloomLevel`, `topicId`, `page`, `pageSize`

200:

```json
{
  "items": [{
    "id": "Q001",
    "content": "Explain the principles of OOP in Java.",
    "status": "approved",
    "source": "lecturer",
    "bloomLevel": "understand",
    "topicId": "T01",
    "courseId": "C01",
    "rubricId": "R1",
    "topicName": "Object-Oriented Programming",
    "courseName": "Java Programming",
    "rubricName": "OOP oral rubric",
    "citation": {
      "materialId": "M01",
      "materialTitle": "Week 3 lecture slides — OOP in Java",
      "excerpt": "Encapsulation hides internal state..."
    },
    "rejectReason": null
  }],
  "total": 12
}
```

**POST `/api/questions`** body: `{ content, bloomLevel, topicId, courseId }` → 201 question (`status: approved` nếu giảng viên tự tạo).

**PATCH `/api/questions/:id`** body một phần: `{ content, bloomLevel, topicId, courseId }`

**DELETE `/api/questions/:id`** → 204

**POST `/api/questions/:id/approve`** `{ "rubricId": "R1" }` → 200 question `approved`

**POST `/api/questions/:id/reject`** `{ "reason": "Off-topic" }` → 200 question `rejected`

**POST `/api/questions/import`** `multipart/form-data` file `.txt|.csv` + optional `topicId`, `courseId`

200: `{ "created": [...], "skipped": ["duplicate line"] }`

409 when content trùng: `{ "message": "This question already exists.", "code": "DUPLICATE_QUESTION" }`

---

### 3.4 AI generation request  **[MOCK — cần BE gấp]**

Sequence: FE gửi request → BE trả **ngay** `pending` → xử lý nền → Question `pending_review`.

**POST `/api/question-generations`**

```json
{ "courseId": "C01", "topicId": "T01", "bloomLevel": "apply", "count": 3 }
```

202:

```json
{ "id": "GEN002", "status": "pending", "courseId": "C01", "topicId": "T01", "bloomLevel": "apply", "count": 3 }
```

**GET `/api/question-generations/:id`**

200 completed:

```json
{
  "id": "GEN002",
  "status": "completed",
  "questionIds": ["Q006", "Q007"],
  "duplicateCount": 1,
  "error": null
}
```

FE đang **poll 1.5s**. Ưu tiên SSE/WebSocket event `generation.completed` (xem mục 4).

---

### 3.5 Rubric & Criterion  **[MOCK]**

Màn: `features/rubric/pages`

**GET `/api/rubrics`** → `{ "items": [{ "id", "name", "maxScore", "criteria": [{ "id", "name", "maxScore" }] }] }`

`maxScore` = tổng criterion (BE nên tính sẵn).

**POST `/api/rubrics`** / **PUT `/api/rubrics/:id`**

```json
{
  "name": "OOP oral rubric",
  "criteria": [{ "id": "CR1", "name": "Accuracy", "maxScore": 5 }]
}
```

**DELETE `/api/rubrics/:id`** → 409 nếu đang gắn question.

---

### 3.6 Exam / ExamConfig / Slot / SlotQuestion  **[CHƯA CÓ UI CRUD]**

FE mới có danh sách slot (session) mock. Cần BE:

| Method | URL | Mục đích |
|---|---|---|
| POST | `/api/exams` | Tạo exam + ExamConfig (số câu chính, max follow-up, thời gian trả lời) |
| GET | `/api/exams/:examId/slots` | Danh sách slot / sinh viên |
| POST | `/api/exams/:examId/slots` | Gán sinh viên + khung giờ |
| GET | `/api/slots/:slotId` | Chi tiết 1 lượt thi |

**GIẢ ĐỊNH ExamConfig:**

```json
{
  "mainQuestionLimit": 3,
  "maxFollowUpsPerQuestion": 2,
  "answerLimitSeconds": 120
}
```

---

### 3.7 Viva session  **[MOCK + audio STUB]**

Màn: `features/viva-room/pages/session`

| Method | URL | Mục đích | Trạng thái FE |
|---|---|---|---|
| POST | `/api/slots/:slotId/start` | Bắt đầu, nhận câu hỏi đầu + (optional) TTS url | MOCK |
| POST | `/api/slots/:slotId/turns` | Nộp transcript/audio, nhận câu tiếp theo | MOCK |
| POST | `/api/slots/:slotId/end` | Kết thúc sớm | MOCK |
| POST | `/api/audio/upload-url` | Presigned S3 URL | STUB, UI chưa gọi |
| POST | `/api/audio/process` | `{ sessionId }` start Transcribe | STUB |
| GET | `/api/audio/status/:sessionId` | Poll transcribe | STUB |
| GET | `/api/audio/result/:sessionId` | Transcript | STUB |

**Start 200**

```json
{
  "sessionId": "SLOT-123",
  "examName": "Java Programming Viva",
  "mainQuestionLimit": 3,
  "maxFollowUpsPerQuestion": 2,
  "answerLimitSeconds": 120,
  "question": {
    "id": "Q001",
    "content": "Explain OOP in Java.",
    "type": "main",
    "ttsAudioUrl": "https://...",
    "followUpsRemaining": 2,
    "mainIndex": 1,
    "mainTotal": 3
  }
}
```

**Submit turn** `{ "questionId", "transcript", "durationSeconds", "audioObjectKey" }`

200 next question hoặc `{ "completed": true, "turns": [...] }`

Audio format **GIẢ ĐỊNH:** `audio/webm;codecs=opus`, 48 kHz, upload qua presigned PUT.

---

### 3.8 Transcript & Turn  **[MOCK read]**

Màn chấm điểm đọc `evaluation.turns`.

**GET `/api/slots/:slotId/turns`**

```json
{
  "items": [{
    "turnId": "TN1",
    "turn": 1,
    "type": "main",
    "parentTurnId": null,
    "reason": null,
    "q": "...",
    "a": "...",
    "durationSeconds": 41,
    "audioUrl": "https://..."
  }]
}
```

`parentTurnId` + `reason` = TurnLink / Reason khi AI hỏi xoáy.

---

### 3.9 Grading  **[MOCK — cần BE gấp]**

Màn: `features/grading/pages/evaluation`, `sessions`

**GET `/api/slots`** query `search` → danh sách session (studentName, studentId, exam, date, status, duration, aiScore, lecturerScore)

**GET `/api/slots/:slotId/evaluation`**

```json
{
  "slotId": "S001",
  "name": "Jane Doe",
  "studentId": "SE150123",
  "exam": "Java Programming Viva",
  "rubricId": "R1",
  "status": "pending_review",
  "aiOverall": 8.5,
  "lecturerOverall": null,
  "criteriaScores": [{
    "criterionId": "CR1",
    "name": "Accuracy",
    "maxScore": 5,
    "aiScore": 4.5,
    "lecturerScore": null,
    "evidence": "Named the four OOP principles correctly."
  }],
  "strengths": ["..."],
  "weaknesses": ["..."],
  "missingPoints": ["..."],
  "signals": { "avgAnswerSeconds": 38, "fluency": "adequate" },
  "lecturerReason": "",
  "turns": []
}
```

**PATCH `/api/slots/:slotId/evaluation`** lưu điểm GV (chưa chốt)

```json
{
  "criteriaScores": [{ "criterionId": "CR1", "lecturerScore": 4.0 }],
  "lecturerReason": "Reduced clarity: no example."
}
```

**POST `/api/slots/:slotId/evaluation/finalize`**

```json
{ "useAiScores": false }
```

`useAiScores: true` = giảng viên chấp nhận điểm AI (human-in-the-loop vẫn là người bấm chốt).

---

## 4. Realtime

| Luồng | Hiện FE | Đề xuất BE |
|---|---|---|
| Sinh câu hỏi AI | REST poll 1.5s | SSE `GET /api/question-generations/:id/events` hoặc WS |
| Transcript lúc nói | Web Speech API trên browser | Có thể bổ sung streaming Transcribe qua WS |
| Câu hỏi tiếp + TTS | REST sau khi nộp turn | WS `turn.next` + `ttsAudioUrl` để giảm latency |
| Audio dài hạn | STUB upload-url | REST presigned + Transcribe async |

**SSE generation (đề xuất)**

```
event: status
data: {"status":"processing"}

event: completed
data: {"status":"completed","questionIds":["Q006"],"duplicateCount":0}
```

**WS viva (đề xuất)** `ws://.../api/slots/:slotId/live`

```json
{ "type": "transcript.partial", "text": "Encapsulation is..." }
{ "type": "examiner.state", "state": "thinking" }
{ "type": "turn.next", "question": { } }
```

---

## 5. Câu hỏi cho BE

1. Login có field `role` không, hay role nằm trong JWT / account type?
2. Identifier là email, studentId, hay cả hai?
3. Question `pending` vs `pending_review` — BE dùng enum nào?
4. Import: multipart hay JSON array?
5. TTS: BE trả `ttsAudioUrl` (Polly) hay FE tự đọc bằng Web Speech? (NFR: Polly)
6. STT: FE upload audio hay stream WS tới Transcribe?
7. Slot ID vs Session ID — FE đang dùng `S001` như slotId.
8. Điểm overall: BE cộng tiêu chí hay có trọng số riêng?
9. Admin role có trong scope sprint này không?
10. Đa ngôn ngữ Việt/Anh API `Accept-Language`?

---

## 6. Endpoint FE đang mock — ưu tiên BE

Cần gấp:

1. `POST /api/auth/login`
2. `GET/POST/PATCH /api/questions` + approve/reject
3. `POST /api/question-generations` + GET status
4. `GET/POST /api/rubrics`
5. `POST /api/slots/:id/start|turns|end`
6. `GET /api/slots/:id/evaluation` + PATCH + finalize

Đã có stub JS, UI chưa gắn: `/api/audio/*`
