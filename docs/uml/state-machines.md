# UML State Machine Diagrams

Mỗi sơ đồ vẽ đúng bảng chuyển trạng thái trong code. Cạnh nào không có trong code thì không vẽ. Tên sự kiện là tên hàm/endpoint gây ra chuyển trạng thái; `[guard]` là điều kiện code kiểm tra; `/ action` là việc code làm kèm.

Nguồn: `backend/src/domain/questionStatus.js`, `examSessionStatus.js`, `interviewStatus.js`, `backend/src/services/*.js`, `backend/src/jobs/*.js`, CHECK constraint trong `backend/db/migrations/`.

## 1. Question (`question.status`)

`TRANSITIONS` trong `domain/questionStatus.js`. Chỉ `APPROVED` được đưa vào kỳ thi (`isExamEligible`). Câu hỏi mới chỉ được tạo ở `DRAFT` hoặc `PENDING_REVIEW` nếu truyền `status`; không truyền thì `APPROVED` khi đủ content + topic + rubric, ngược lại `DRAFT` (`_resolveCreateStatus`). Câu sinh bởi AI vào `PENDING_REVIEW`.

```mermaid
stateDiagram-v2
  direction LR
  [*] --> DRAFT : createQuestion [thiếu rubric]
  [*] --> APPROVED : createQuestion [content + topic + rubric]
  [*] --> PENDING_REVIEW : createQuestion(status=PENDING_REVIEW) / persistDrafts (GENERATE_QUESTIONS)
  DRAFT --> PENDING_REVIEW : update(status)
  DRAFT --> APPROVED : approve [rubric_id != null]
  DRAFT --> ARCHIVED : archive
  PENDING_REVIEW --> APPROVED : approve / approveBatch [rubric_id != null] / reviewed_by, reviewed_at
  PENDING_REVIEW --> REJECTED : reject(reason) / review_note
  PENDING_REVIEW --> DRAFT : update(status)
  APPROVED --> PENDING_REVIEW : update(status)
  APPROVED --> ARCHIVED : archive
  REJECTED --> DRAFT : update(status)
  REJECTED --> ARCHIVED : archive
  ARCHIVED --> [*]
  note right of APPROVED
    isExamEligible(): chỉ APPROVED
    được pickBalancedQuestions chọn
  end note
```

## 2. ExamSession (`exam_session.status`)

`TRANSITIONS` trong `domain/examSessionStatus.js`.

```mermaid
stateDiagram-v2
  direction LR
  [*] --> DRAFT : create (LECTURER / ADMIN)
  DRAFT --> SCHEDULED : scheduleSession [có opens_at < closes_at, closes_at > now, đủ câu APPROVED cùng ngôn ngữ] / scheduled_by, scheduled_at
  SCHEDULED --> DRAFT : unscheduleSession
  SCHEDULED --> OPEN : startSession (ADMIN) [now < closes_at, đủ câu] / started_by, started_at, khoá rubric, ExamLaunchService.launch()
  OPEN --> CLOSED : closeSession (ADMIN hoặc LECTURER phụ trách) / closes_at = now nếu đóng sớm
  CLOSED --> [*]
  note right of OPEN
    Đóng kỳ thi không dừng các viva đang chạy;
    EXPIRE_INTERVIEWS kết thúc chúng khi quá deadline_at
  end note
```

## 3. VivaInterview (`viva_interview.status`)

`INTERVIEW_TRANSITIONS` trong `domain/interviewStatus.js` và các hàm của `InterviewService`. `TERMINATED` có trong bảng chuyển trạng thái nhưng hiện không có code nào ghi giá trị này.

```mermaid
stateDiagram-v2
  direction LR
  [*] --> IN_PROGRESS : startOrResume [exam OPEN, có trong roster, now >= opens_at, đủ câu] / tạo AssignedQuestion, khoá rubric, tạo QATurn MAIN #1, deadline_at = min(started_at + session_time_limit_sec, closes_at)
  NOT_STARTED --> IN_PROGRESS : (cạnh có trong bảng, interview được tạo thẳng ở IN_PROGRESS)
  IN_PROGRESS --> PAUSED : pauseInterview(reason) / paused_at, ProcessingFailure(SYSTEM, INTERVIEW_PAUSED)
  PAUSED --> IN_PROGRESS : resumeInterview / deadline_at += thời gian tạm dừng
  IN_PROGRESS --> COMPLETED : _endInterview [deadline qua hoặc hết câu chính] / end_reason, turn mở -> UNANSWERED, Transcript, VivaResult PENDING, enqueue GRADE_INTERVIEW
  PAUSED --> COMPLETED : expireOverdueInterviews [deadline_at + grace < now]
  IN_PROGRESS --> TERMINATED : (dự phòng, chưa dùng)
  PAUSED --> TERMINATED : (dự phòng, chưa dùng)
  COMPLETED --> [*]
  TERMINATED --> [*]
```

## 4. QATurn (`qa_turn.status`)

`TURN_STATUSES` trong `domain/interviewStatus.js`; chuyển trạng thái nguyên tử qua `qaTurnRepository.transitionStatus`.

```mermaid
stateDiagram-v2
  direction LR
  [*] --> ASKED : tạo lượt MAIN / FOLLOW_UP (TTS đã chuẩn bị audio)
  ASKED --> ANSWERING : markQuestionPlayed / played_at, answer_deadline_at = min(now + think_time_sec + answer_time_limit_sec, deadline_at)
  ASKED --> PROCESSING : submitAnswer (claim nguyên tử)
  ANSWERING --> PROCESSING : submitAnswer (claim nguyên tử)
  PROCESSING --> ANSWERING : [audio rỗng/hỏng, retry_count < 1] / ProcessingFailure(AUDIO_INPUT), mở lại cửa sổ trả lời
  PROCESSING --> ASKED : [STT lỗi 2 lần, trạng thái trước là ASKED] / retry_count + 1, phát sự kiện turn-retry
  PROCESSING --> ANSWERING : [STT lỗi 2 lần, trạng thái trước là ANSWERING] / retry_count + 1, phát sự kiện turn-retry
  PROCESSING --> ANSWERED : lưu answer_text, transcript_confidence, timed_out, speech signals
  ASKED --> UNANSWERED : _endInterview (markOpenTurnsUnanswered)
  ANSWERING --> UNANSWERED : _endInterview (markOpenTurnsUnanswered)
  ANSWERED --> [*]
  UNANSWERED --> [*]
  FAILED --> [*]
  note left of FAILED
    Có trong CHECK constraint (016) và được
    scoringRules.detectFlagReason đọc,
    nhưng hiện không có code nào ghi FAILED
  end note
```

## 5. VivaResult (`viva_result.status`)

`GradingService` và `vivaResultRepository`.

```mermaid
stateDiagram-v2
  direction LR
  [*] --> PENDING : _endInterview (createPendingIfAbsent)
  [*] --> AI_SCORING : gradeInterview [chưa có viva_result]
  PENDING --> AI_SCORING : GRADE_INTERVIEW job (gradeInterview)
  AI_SCORING --> AI_SUGGESTED : [không có cờ] / ai_total_score = final_total_score = trung bình điểm câu chính
  AI_SCORING --> FLAGGED : [LLM lỗi, thiếu tiêu chí, level sai, confidence < 0.6, hoặc turn FAILED]
  note left of AI_SCORING
    internal: lỗi LLM tạm thời / throw,
    JobQueue thử lại với backoff
  end note
  note left of FLAGGED
    internal (AI_SUGGESTED và FLAGGED):
    adjustCriterionScore(newScore, reason)
    / ghi ScoreAdjustment, tính lại final_total_score
  end note
  AI_SUGGESTED --> FINALIZED : finalizeResult / finalized_by, finalized_at
  FLAGGED --> FINALIZED : finalizeResult / finalized_by, finalized_at
  PENDING --> FINALIZED : finalizeResult
  FINALIZED --> AI_SUGGESTED : reopenResult [không còn flag_reason]
  FINALIZED --> FLAGGED : reopenResult [có flag_reason]
  AI_SUGGESTED --> AI_SCORING : regradeResult / enqueue GRADE_INTERVIEW
  FLAGGED --> AI_SCORING : regradeResult / enqueue GRADE_INTERVIEW
  FINALIZED --> AI_SCORING : regradeResult / enqueue GRADE_INTERVIEW
  note right of FINALIZED
    Sinh viên chỉ xem được kết quả FINALIZED
    (toStudentResultView + assertStudentResultSafe)
  end note
```

`finalizeResult` chỉ chặn khi kết quả đã `FINALIZED` (`ALREADY_FINALIZED`), nên về mặt code mọi trạng thái khác đều chốt được; giao diện giảng viên chỉ hiện nút chốt sau khi AI chấm xong.

## 6. CourseMaterial (`course_material.status`)

`MaterialService.upload` và handler `INGEST_MATERIAL` trong `jobs/handlers.js`.

```mermaid
stateDiagram-v2
  direction LR
  [*] --> UPLOADED : upload / lưu S3, enqueue INGEST_MATERIAL
  UPLOADED --> PROCESSING : INGEST_MATERIAL bắt đầu
  PROCESSING --> READY : parse + chunk + embed / material_chunk, page_count
  PROCESSING --> FAILED : [không parse được, hoặc không có lớp text]
  note right of PROCESSING
    internal: lỗi embedding tạm thời / throw,
    JobQueue thử lại
  end note
  READY --> [*]
  FAILED --> [*]
```

## 7. QuestionGenerationJob (`question_generation_job.status`)

`QuestionGenerationService.createJob` và handler `GENERATE_QUESTIONS`.

```mermaid
stateDiagram-v2
  direction LR
  [*] --> PENDING : createJob [tài liệu READY] / enqueue GENERATE_QUESTIONS
  PENDING --> RUNNING : GENERATE_QUESTIONS bắt đầu / xoá nháp chưa duyệt của lần chạy trước
  RUNNING --> COMPLETED : persistDrafts / generated_count (error = NO_GROUNDABLE khi 0 câu)
  note right of RUNNING
    internal: lỗi khi còn lượt thử / ghi error,
    throw để JobQueue thử lại
  end note
  RUNNING --> FAILED : [lỗi, hết lượt thử]
  COMPLETED --> [*]
  FAILED --> [*]
```

## 8. BackgroundJob (`background_job.status`)

`backgroundJobRepository` + `jobs/jobQueue.js` (claim bằng `FOR UPDATE SKIP LOCKED`, backoff mũ tới `JOB_MAX_ATTEMPTS`).

```mermaid
stateDiagram-v2
  direction LR
  [*] --> PENDING : enqueueJob(type, payload, runAfter)
  PENDING --> RUNNING : claimNext [run_after <= now] / attempts + 1, locked_at
  RUNNING --> DONE : handler trả về bình thường
  RUNNING --> PENDING : handler throw [còn lượt] / run_after = backoff, last_error
  RUNNING --> FAILED : handler throw [hết lượt] / last_error
  RUNNING --> PENDING : requeueStale [worker chết, còn lượt]
  RUNNING --> FAILED : requeueStale [hết lượt]
  DONE --> [*]
  FAILED --> [*]
```
