# UML Design Class Diagram (backend)

Sơ đồ lớp thiết kế của `backend/src`: lớp thật, phương thức public thật (lấy từ code), và quan hệ phụ thuộc mà `createApp(overrides)` trong `src/app.js` nối với nhau. Luồng gọi luôn là route → controller → service → repository. Các adapter AI là interface có nhiều hiện thực, chọn bằng biến môi trường (`STT_PROVIDER`, `TTS_PROVIDER`, `LLM_PROVIDER`, `EMBEDDING_PROVIDER`); hiện thực `Mock*` chỉ dùng trong test.

Sơ đồ lớp miền (bảng, thuộc tính, enum) nằm ở [class-diagram.drawio](class-diagram.drawio).

## 1. Service và cổng (port) AI

```mermaid
classDiagram
  direction LR
  class InterviewService {
    +startOrResume(user, examSessionId, clientIp)
    +getCurrentState(user, interviewId)
    +pauseInterview(user, interviewId, reason)
    +resumeInterview(user, interviewId)
    +markQuestionPlayed(user, interviewId, turnId)
    +appendPartialTranscript(...)
    +submitAnswer(user, interviewId, turnId, audio, contentType, transcript, timedOut, signals)
    +expireOverdueInterviews(graceSec, limit)
    +rebuildContextFromDb(interviewId, knownTurn)
    -_endInterview(interview, reason)
    -_decideWithRetry(...)
  }
  class GradingService {
    +gradeInterview(interviewId)
    +listSessionResults(examSessionId, user)
    +getResultDetail(resultId, user)
    +adjustCriterionScore(criterionScoreId, newScore, reason, user)
    +finalizeResult(resultId, user)
    +reopenResult(resultId, user)
    +regradeResult(resultId, user)
    +getTurnAudioKey(turnId, user)
    -_assertSessionAccess(examSessionId, user, write)
  }
  class QuestionService {
    +listQuestions()
    +getQuestionById()
    +createQuestion(payload, user)
    +updateQuestion()
    +deleteQuestion()
    +approve(questionId, reviewedBy, user)
    +reject(questionId, reason, reviewedBy, user)
    +archive()
    +approveBatch()
    +getQuestionSources()
    +importQuestions()
    +buildImportTemplate()
  }
  class QuestionGenerationService {
    +getJob(user, jobId)
    +createJob(...)
    +persistDrafts(job, drafts, R)
  }
  class ExamSessionService {
    +createSession()
    +getSession()
    +listSessions()
    +getCreateOptions()
    +updateSession()
    +setStudents()
    +setExaminers()
    +scheduleSession(user, examSessionId)
    +unscheduleSession(user, examSessionId)
    +startSession(user, examSessionId)
    +warmSession(user, examSessionId)
    +closeSession(user, examSessionId)
    +deleteSession()
    +getLecturerProgress()
    +listScheduleForAdmin()
  }
  class ExamLaunchService {
    +launch(session)
    +warm(session)
    +nextKeepWarmAt()
  }
  class MaterialService {
    +upload()
    +list()
    +delete()
  }
  class SessionContextStore {
    +key(interviewId)
    +get(interviewId)
    +put(ctx)
    +update(interviewId, patch)
    +appendPartialSegment()
    +clearPartialSegments(interviewId)
    +delete(interviewId)
    +ensureTable()
  }
  class SttAdapter {
    <<interface>>
    +transcribe(audio, contentType, language, hints)
    +warmUp(language)
  }
  class TtsAdapter {
    <<interface>>
    +synthesize(text, language)
    +warmUp(language)
  }
  class LlmAdapter {
    <<interface>>
    +generateQuestions(language, topic, bloomDistribution, requestedCount, chunks)
    +decideFollowUp(input)
    +gradeQuestion(language, mainQuestion, history, rubricCriteria)
  }
  class EmbeddingAdapter {
    <<interface>>
    +embed(text) number[1024]
  }
  class LambdaSttAdapter
  class MockSttAdapter
  class KokoroTtsAdapter
  class GoogleTtsAdapter
  class MockTtsAdapter
  class BedrockLlmAdapter
  class MockLlmAdapter
  class BedrockEmbeddingAdapter
  class MockEmbeddingAdapter

  SttAdapter <|.. LambdaSttAdapter
  SttAdapter <|.. MockSttAdapter
  TtsAdapter <|.. KokoroTtsAdapter
  TtsAdapter <|.. GoogleTtsAdapter
  TtsAdapter <|.. MockTtsAdapter
  LlmAdapter <|.. BedrockLlmAdapter
  LlmAdapter <|.. MockLlmAdapter
  EmbeddingAdapter <|.. BedrockEmbeddingAdapter
  EmbeddingAdapter <|.. MockEmbeddingAdapter

  InterviewService --> SttAdapter : sttAdapter
  InterviewService --> TtsAdapter : ttsAdapter
  InterviewService --> LlmAdapter : llmAdapter
  InterviewService --> SessionContextStore : sessionContextStore
  GradingService --> LlmAdapter : llmAdapter
  QuestionService --> EmbeddingAdapter : embeddingAdapter
  QuestionGenerationService --> EmbeddingAdapter : embeddingAdapter
  ExamSessionService --> ExamLaunchService : examLaunchService
  ExamLaunchService --> SttAdapter
  ExamLaunchService --> TtsAdapter
```

## 2. Lớp web, service, repository và hàng đợi việc nền

```mermaid
classDiagram
  direction TB
  class createApp {
    <<composition root>>
    +createApp(overrides) Express
    +jobContext
  }
  class InterviewController
  class interviewSocket {
    <<Socket.IO /interview>>
    interview:join, interview:ready
    question:played, answer:start
    audio:chunk, answer:end
  }
  class GradingController
  class QuestionController
  class ExamSessionController
  class AdminController {
    -_audit(req, action, entityType, entityIds)
  }
  class AuthController
  class AuthService {
    +login() +refresh() +logout() +me()
    +forgotPassword() +resetPassword()
    +setPassword() +changePassword()
  }
  class AdminService {
    +listUsers() +createUser() +updateUser() +deleteUser()
    +lockUser() +unlockUser() +resendSetupLink() +importStudents()
    +listSubjects() +createSubject() +updateSubject() +deleteSubject()
    +setSubjectArchived() +assignLecturers() +assignStudents()
  }
  class InterviewService
  class GradingService
  class QuestionService
  class ExamSessionService
  class JobQueue {
    +registerHandler(type, handler)
    +enqueue(type, payload, options)
    +start()
    +stop()
    +recoverStale()
  }
  class BackgroundJobRepository {
    +enqueue(type, payload, runAfter, maxAttempts)
    +existsPending(type)
    +claimNext(client)
    +requeueStale(olderThanMs)
    +markDone(id)
    +findById(id)
    +markFailed(id, errorText, nextRunAfter)
  }
  class handlers {
    <<module jobs/handlers.js>>
    SEND_EMAIL
    INGEST_MATERIAL
    GENERATE_QUESTIONS
    GRADE_INTERVIEW
    KEEP_WARM
    PREPARE_EXAM_AUDIO
    EXPIRE_INTERVIEWS
  }
  class Repositories {
    <<package repositories/>>
    VivaInterviewRepository
    QaTurnRepository
    AssignedQuestionRepository
    TranscriptRepository
    VivaResultRepository
    ProcessingFailureRepository
    QuestionRepository
    RubricRepository
    ExamSessionRepository
    ...
  }
  class PgDatabase {
    +query(sql, params)
    +withTransaction(fn)
  }

  createApp ..> InterviewController : «create»
  createApp ..> GradingController : «create»
  createApp ..> QuestionController : «create»
  createApp ..> ExamSessionController : «create»
  createApp ..> AdminController : «create»
  createApp ..> AuthController : «create»
  InterviewController --> InterviewService
  interviewSocket --> InterviewService
  GradingController --> GradingService
  QuestionController --> QuestionService
  ExamSessionController --> ExamSessionService
  AdminController --> AdminService
  AuthController --> AuthService
  InterviewService --> Repositories
  GradingService --> Repositories
  QuestionService --> Repositories
  ExamSessionService --> Repositories
  AdminService --> Repositories
  AuthService --> Repositories
  Repositories --> PgDatabase
  InterviewService ..> BackgroundJobRepository : enqueueJob port
  GradingService ..> BackgroundJobRepository : enqueueJob port
  AuthService ..> BackgroundJobRepository : enqueueJob(SEND_EMAIL)
  JobQueue --> BackgroundJobRepository
  JobQueue o-- handlers : registerHandler
  handlers ..> InterviewService : EXPIRE_INTERVIEWS
  handlers ..> GradingService : GRADE_INTERVIEW
```

Service không giữ handle của `JobQueue`; chúng nhận cổng `enqueueJob(type, payload)` do `BackgroundJobRepository` cung cấp (`createApp`). `JobQueue` chỉ chạy trong `server.js` khi có Postgres thật.
