// UML class model of the AIVES persistent domain, written from
// backend/db/migrations/001..029 and the domain modules in backend/src/domain
// and backend/src/interview. One class per business table; pure join tables
// (subject_lecturer, subject_student, exam_session_student,
// exam_session_examiner) are drawn as many-to-many associations, not classes.
//
// Conventions (same as the legend on the diagram):
// - Attribute names are the exact column names; types are UML-style
//   (Integer, String, Decimal, Boolean, DateTime, Json, Vector1024).
// - [0..1] marks a nullable column. {id} marks the primary key.
// - Foreign keys are not repeated as attributes when they are drawn as an
//   association; the association end carries the FK column name as role.
// - "Who did it" references to AppUser (created_by, reviewed_by, ...) are shown
//   as attributes typed AppUser instead of lines, to keep the drawing legible.
//   In UML that is the same as an association end.
// - Composition (filled diamond) = ON DELETE CASCADE from the owner table.
//
// If you change a migration, update this file and run
//   node docs/uml/tools/build-class-diagram.js
// then re-export the PNG (see docs/uml/README.md).

const W = 250; // default class width

const packages = [
  { id: 'pkg_identity', name: 'Identity & Administration', x: 20, y: 20, w: 820, h: 1000 },
  { id: 'pkg_content', name: 'Question Bank & RAG', x: 880, y: 20, w: 1180, h: 1530 },
  { id: 'pkg_exam', name: 'Exam & Interview', x: 2100, y: 20, w: 900, h: 1530 },
  { id: 'pkg_grading', name: 'Grading', x: 3040, y: 20, w: 320, h: 1530 },
  { id: 'pkg_enums', name: 'Enumerations (CHECK constraints / domain modules)', x: 20, y: 1590, w: 3340, h: 520 },
];

// x/y are absolute canvas coordinates.
const classes = [
  // ---- Identity & Administration -------------------------------------
  {
    id: 'AppUser', table: 'app_user', x: 320, y: 70, w: 290,
    attrs: [
      'app_user_id : Integer {id}',
      'code : String [0..1] {unique}',
      'email : String {unique}',
      'full_name : String [0..1]',
      'password_hash : String [0..1]',
      'role : UserRole',
      'status : UserStatus = ACTIVE',
      'failed_login_count : Integer = 0',
      'first_failed_at : DateTime [0..1]',
      'locked_until : DateTime [0..1]',
      'last_login_at : DateTime [0..1]',
      'must_change_password : Boolean = false',
      'created_at : DateTime',
      'updated_at : DateTime',
    ],
  },
  {
    id: 'AuthSession', table: 'auth_session', x: 40, y: 70, w: 240,
    attrs: [
      'auth_session_id : Integer {id}',
      'refresh_token_hash : String',
      'expires_at : DateTime',
      'revoked_at : DateTime [0..1]',
      'ip : String [0..1]',
      'user_agent : String [0..1]',
      'created_at : DateTime',
    ],
  },
  {
    id: 'PasswordToken', table: 'password_token', x: 40, y: 300, w: 240,
    attrs: [
      'password_token_id : Integer {id}',
      'token_hash : String',
      'purpose : PasswordTokenPurpose',
      'expires_at : DateTime',
      'used_at : DateTime [0..1]',
      'created_at : DateTime',
    ],
  },
  {
    id: 'AdminAuditLog', table: 'admin_audit_log', x: 40, y: 520, w: 240,
    attrs: [
      'admin_audit_log_id : Integer {id}',
      'actor_id : AppUser [0..1]',
      'action : AuditAction',
      'entity_type : AuditEntityType',
      'entity_id : Integer',
      'created_at : DateTime',
    ],
    note: 'ON DELETE SET NULL',
  },
  {
    id: 'BackgroundJob', table: 'background_job', x: 40, y: 740, w: 240,
    attrs: [
      'background_job_id : Integer {id}',
      'type : JobType',
      'payload : Json',
      'status : JobStatus = PENDING',
      'attempts : Integer = 0',
      'max_attempts : Integer [0..1]',
      'run_after : DateTime',
      'locked_at : DateTime [0..1]',
      'last_error : String [0..1]',
      'created_at : DateTime',
      'updated_at : DateTime',
    ],
  },
  {
    id: 'Subject', table: 'subject', x: 560, y: 470, w: 250,
    attrs: [
      'subject_id : Integer {id}',
      'code : String {unique}',
      'name : String',
      'status : SubjectStatus = ACTIVE',
    ],
  },

  // ---- Question Bank & RAG --------------------------------------------
  {
    id: 'Topic', table: 'topic', x: 920, y: 470, w: 230,
    attrs: [
      'topic_id : Integer {id}',
      'name : String',
      'course_id : String [0..1]',
    ],
  },
  {
    id: 'CourseMaterial', table: 'course_material', x: 920, y: 70, w: 250,
    attrs: [
      'course_material_id : Integer {id}',
      'title : String',
      'file_key : String',
      'mime_type : String [0..1]',
      'size_bytes : Long [0..1]',
      'page_count : Integer [0..1]',
      'status : MaterialStatus = UPLOADED',
      'error : String [0..1]',
      'uploaded_by : AppUser [0..1]',
      'created_at : DateTime',
    ],
  },
  {
    id: 'MaterialChunk', table: 'material_chunk', x: 1290, y: 70, w: 300,
    attrs: [
      'material_chunk_id : Integer {id}',
      'chunk_no : Integer',
      'location : String [0..1]',
      'content : String',
      'embedding : Vector1024 [0..1] {HNSW cosine}',
      'subject_id : Subject [0..1] {copy of material subject}',
    ],
  },
  {
    id: 'QuestionGenerationJob', table: 'question_generation_job', x: 1290, y: 470, w: 270,
    attrs: [
      'question_generation_job_id : Integer {id}',
      'material_ids : Json [0..1]',
      'requested_count : Integer [0..1]',
      'bloom_distribution : Json [0..1]',
      'language : String [0..1]',
      'status : GenerationJobStatus [0..1]',
      'generated_count : Integer = 0',
      'error : String [0..1]',
      'requested_by : AppUser [0..1]',
      'created_at : DateTime',
    ],
  },
  {
    id: 'Question', table: 'question', x: 920, y: 760, w: 300,
    attrs: [
      'question_id : Integer {id}',
      'content : String {unique lower(trim)}',
      'status : QuestionStatus',
      'bloom_level : BloomLevel [0..1]',
      'language : QuestionLanguage [0..1]',
      'reference_answer : String [0..1]',
      'key_points : Json [0..1]',
      'source : QuestionSource [0..1]',
      'rationale : Json [0..1]',
      'embedding : Vector1024 [0..1] {HNSW cosine}',
      'created_by : AppUser [0..1]',
      'reviewed_by : AppUser [0..1]',
      'reviewed_at : DateTime [0..1]',
      'review_note : String [0..1]',
    ],
  },
  {
    id: 'QuestionSourceRef', table: 'question_source_ref', x: 1290, y: 330, w: 270,
    attrs: [
      'question_source_ref_id : Integer {id}',
      'excerpt : String [0..1]',
    ],
  },
  {
    id: 'Rubric', table: 'rubric', x: 1660, y: 760, w: 250,
    attrs: [
      'rubric_id : Integer {id}',
      'name : String [0..1]',
      'max_score : Decimal {> 0}',
      'is_locked : Boolean = false',
      'version : Integer = 1',
      'created_by : AppUser [0..1]',
    ],
  },
  {
    id: 'RubricCriterion', table: 'rubric_criterion', x: 1660, y: 1010, w: 250,
    attrs: [
      'rubric_criterion_id : Integer {id}',
      'criterion_name : String {unique per rubric}',
      'weight_percent : Decimal {0 < w <= 100}',
      'description : String [0..1]',
      'order_index : Integer = 1',
    ],
  },
  {
    id: 'PerformanceLevel', table: 'performance_level', x: 1660, y: 1260, w: 250,
    attrs: [
      'performance_level_id : Integer {id}',
      'label : String',
      'min_score : Decimal [0..1]',
      'max_score : Decimal [0..1]',
      'description : String [0..1]',
      'order_no : Integer [0..1]',
    ],
  },

  // ---- Exam & Interview -----------------------------------------------
  {
    id: 'ExamSession', table: 'exam_session', x: 2130, y: 70, w: 300,
    attrs: [
      'exam_session_id : Integer {id}',
      'title : String [0..1]',
      'language : ExamLanguage',
      'status : ExamSessionStatus = DRAFT',
      'main_question_count : Integer [0..1]',
      'max_follow_ups_per_question : Integer [0..1]',
      'max_follow_ups_total : Integer [0..1] {0..20}',
      'answer_time_limit_sec : Integer [0..1]',
      'think_time_sec : Integer [0..1]',
      'session_time_limit_sec : Integer = 1800 {> 0}',
      'bloom_distribution : Json [0..1]',
      'opens_at : DateTime [0..1]',
      'closes_at : DateTime [0..1]',
      'scheduled_at : DateTime [0..1]',
      'started_at : DateTime [0..1]',
      'warm_status : Json [0..1]',
      'created_by : AppUser [0..1]',
      'scheduled_by : AppUser [0..1]',
      'started_by : AppUser [0..1]',
      'created_at : DateTime',
    ],
  },
  {
    id: 'VivaInterview', table: 'viva_interview', x: 2130, y: 560, w: 300,
    attrs: [
      'viva_interview_id : Integer {id}',
      'status : InterviewStatus = NOT_STARTED',
      'current_question_index : Integer = 0',
      'current_follow_up_count : Integer = 0',
      'started_at : DateTime [0..1]',
      'deadline_at : DateTime [0..1]',
      'paused_at : DateTime [0..1]',
      'ended_at : DateTime [0..1]',
      'end_reason : EndReason [0..1]',
      'client_ip : String [0..1]',
    ],
    note: '{unique (exam_session, student)}',
  },
  {
    id: 'SessionContext', table: null, stereotype: 'DynamoDB item', x: 2130, y: 860, w: 300,
    attrs: [
      'sessionId : String = "interview#<id>" {key}',
      'interviewId : Integer',
      'examSessionId : Integer',
      'studentId : Integer',
      'status : InterviewStatus',
      'currentTurnId : Integer [0..1]',
      'currentAssignedQuestionId : Integer [0..1]',
      'currentQuestionIndex : Integer',
      'currentFollowUpCount : Integer',
      'deadlineAt : DateTime',
      'answerDeadlineAt : DateTime [0..1]',
      'partialSegments : PartialSegment [0..*]',
      'coveredKeyPoints : Map<String, String[]>',
      'expiresAt : Long {TTL}',
      'updatedAt : DateTime',
    ],
  },
  {
    id: 'AssignedQuestion', table: 'assigned_question', x: 2130, y: 1260, w: 300,
    attrs: [
      'assigned_question_id : Integer {id}',
      'order_no : Integer [0..1] {unique per interview}',
      'is_asked : Boolean = false',
    ],
  },
  {
    id: 'QATurn', table: 'qa_turn', x: 2560, y: 560, w: 300,
    attrs: [
      'qa_turn_id : Integer {id}',
      'sequence_no : Integer [0..1] {unique per interview}',
      'turn_type : TurnType',
      'follow_up_reason : FollowUpReason [0..1]',
      'question_text : String [0..1]',
      'rationale : Json [0..1]',
      'question_audio_key : String [0..1]',
      'status : TurnStatus [0..1]',
      'asked_at : DateTime [0..1]',
      'played_at : DateTime [0..1]',
      'answer_deadline_at : DateTime [0..1]',
      'answer_started_at : DateTime [0..1]',
      'answer_ended_at : DateTime [0..1]',
      'answer_text : String [0..1]',
      'answer_audio_key : String [0..1]',
      'transcript_confidence : Decimal [0..1]',
      'timed_out : Boolean [0..1]',
      'retry_count : Integer = 0',
      'response_latency_ms : Integer [0..1]',
      'speech_duration_ms : Integer [0..1]',
      'words_per_minute : Decimal [0..1]',
      'pause_count : Integer [0..1]',
    ],
  },
  {
    id: 'Transcript', table: 'transcript', x: 2560, y: 70, w: 260,
    attrs: [
      'transcript_id : Integer {id}',
      'full_text : String [0..1]',
      'is_complete : Boolean = false',
    ],
  },
  {
    id: 'ProcessingFailure', table: 'processing_failure', x: 2560, y: 250, w: 260,
    attrs: [
      'processing_failure_id : Integer {id}',
      'stage : FailureStage [0..1]',
      'error_code : String [0..1]',
      'message : String [0..1]',
      'retry_count : Integer = 0',
      'resolved : Boolean = false',
      'created_at : DateTime',
    ],
  },

  // ---- Grading ---------------------------------------------------------
  {
    id: 'VivaResult', table: 'viva_result', x: 3070, y: 560, w: 260,
    attrs: [
      'viva_result_id : Integer {id}',
      'status : ResultStatus = PENDING',
      'ai_total_score : Decimal [0..1]',
      'final_total_score : Decimal [0..1]',
      'finalized_by : AppUser [0..1]',
      'finalized_at : DateTime [0..1]',
    ],
  },
  {
    id: 'QuestionEvaluation', table: 'question_evaluation', x: 3070, y: 800, w: 260,
    attrs: [
      'question_evaluation_id : Integer {id}',
      'ai_score : Decimal [0..1]',
      'final_score : Decimal [0..1]',
      'confidence : Decimal [0..1]',
      'strengths : String [0..1]',
      'weaknesses : String [0..1]',
      'missing_points : Json [0..1]',
      'feedback : String [0..1]',
      'flag_reason : String [0..1]',
      'model_id : String [0..1]',
      'prompt_version : String [0..1]',
    ],
  },
  {
    id: 'CriterionScore', table: 'criterion_score', x: 3070, y: 1100, w: 260,
    attrs: [
      'criterion_score_id : Integer {id}',
      'ai_score : Decimal [0..1]',
      'ai_justification : String [0..1]',
      'evidence : Json [0..1]',
      'final_score : Decimal [0..1]',
    ],
  },
  {
    id: 'ScoreAdjustment', table: 'score_adjustment', x: 3070, y: 1320, w: 260,
    attrs: [
      'score_adjustment_id : Integer {id}',
      'old_score : Decimal [0..1]',
      'new_score : Decimal [0..1]',
      'reason : String [0..1]',
      'adjusted_by : AppUser [0..1]',
      'adjusted_at : DateTime',
    ],
  },
];

// Enumerations: CHECK constraints in migrations, or the constant lists in
// backend/src/domain/*.js and backend/src/interview/*.js when the column has
// no CHECK (marked "code").
const enums = [
  ['UserRole', ['ADMIN', 'LECTURER', 'STUDENT']],
  ['UserStatus', ['ACTIVE', 'LOCKED', 'DELETED']],
  ['PasswordTokenPurpose', ['SET', 'RESET']],
  ['SubjectStatus', ['ACTIVE', 'ARCHIVED']],
  ['MaterialStatus', ['UPLOADED', 'PROCESSING', 'READY', 'FAILED']],
  ['GenerationJobStatus', ['PENDING', 'RUNNING', 'COMPLETED', 'FAILED']],
  ['QuestionStatus', ['DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'ARCHIVED']],
  ['BloomLevel', ['REMEMBER', 'UNDERSTAND', 'APPLY', 'ANALYZE']],
  ['QuestionSource', ['MANUAL', 'IMPORT', 'AI']],
  ['QuestionLanguage', ['vi', 'en']],
  ['ExamLanguage', ['VI', 'EN']],
  ['ExamSessionStatus', ['DRAFT', 'SCHEDULED', 'OPEN', 'CLOSED']],
  ['InterviewStatus', ['NOT_STARTED', 'IN_PROGRESS', 'PAUSED', 'COMPLETED', 'TERMINATED']],
  ['EndReason', ['DEADLINE_REACHED', 'QUESTIONS_EXHAUSTED']],
  ['TurnType', ['MAIN', 'FOLLOW_UP']],
  ['TurnStatus', ['ASKED', 'ANSWERING', 'PROCESSING', 'ANSWERED', 'UNANSWERED', 'FAILED']],
  ['FollowUpReason', ['AMBIGUOUS', 'INCOMPLETE', 'CONTRADICTORY', 'NEEDS_CLARIFICATION']],
  ['FailureStage', ['AUDIO_INPUT', 'AUDIO_STORE', 'STT', 'TTS', 'FOLLOW_UP_LLM', 'SYSTEM', 'GRADE_ENQUEUE', 'EXPIRE_SWEEP']],
  ['ResultStatus', ['PENDING', 'AI_SCORING', 'AI_SUGGESTED', 'FLAGGED', 'FINALIZED']],
  ['JobType', ['SEND_EMAIL', 'INGEST_MATERIAL', 'GENERATE_QUESTIONS', 'GRADE_INTERVIEW', 'KEEP_WARM', 'PREPARE_EXAM_AUDIO', 'EXPIRE_INTERVIEWS']],
  ['JobStatus', ['PENDING', 'RUNNING', 'DONE', 'FAILED']],
  ['AuditEntityType', ['USER', 'SUBJECT', 'EXAM_SESSION']],
  ['AuditAction', ['USER_CREATE', 'USER_IMPORT', 'USER_UPDATE', 'USER_UPDATE_ROLE', 'USER_DELETE', 'USER_LOCK', 'USER_UNLOCK', 'USER_RESEND_SETUP',
    'SUBJECT_CREATE', 'SUBJECT_UPDATE', 'SUBJECT_DELETE', 'SUBJECT_ARCHIVE', 'SUBJECT_UNARCHIVE',
    'SUBJECT_ASSIGN_LECTURERS', 'SUBJECT_ASSIGN_STUDENTS',
    'EXAM_CREATE', 'EXAM_UPDATE', 'EXAM_DELETE', 'EXAM_START', 'EXAM_CLOSE', 'EXAM_WARM']],
  ['PartialSegment «datatype»', ['turnId : Integer', 'seq : Integer', 'text : String', 'confidence : Decimal [0..1]']],
];

// Associations. kind: 'composition' (diamond at `from`), 'association'.
// fromMult/toMult are the multiplicities at each end; role is the FK column
// (or join table) shown near the `to` end. `via` = optional waypoints.
const associations = [
  // Identity
  { from: 'AppUser', to: 'AuthSession', kind: 'composition', fromMult: '1', toMult: '0..*', role: 'user_id', exitX: 0, exitY: 0.12, entryX: 1, entryY: 0.3 },
  { from: 'AppUser', to: 'PasswordToken', kind: 'composition', fromMult: '1', toMult: '0..*', role: 'user_id', exitX: 0, exitY: 0.45, entryX: 1, entryY: 0.3 },
  { from: 'Subject', to: 'AppUser', kind: 'association', fromMult: '0..*', toMult: '0..*', role: 'lecturers\n«subject_lecturer»', exitX: 0.25, exitY: 0, entryX: 0.85, entryY: 1 },
  { from: 'Subject', to: 'AppUser', kind: 'association', fromMult: '0..*', toMult: '0..*', role: 'students\n«subject_student»', exitX: 0.6, exitY: 0, entryX: 1, entryY: 0.8 },
  // Content
  { from: 'Subject', to: 'Topic', kind: 'association', fromMult: '0..1', toMult: '0..*', role: 'subject_id', exitX: 1, exitY: 0.5, entryX: 0, entryY: 0.5 },
  { from: 'Subject', to: 'CourseMaterial', kind: 'association', fromMult: '0..1', toMult: '0..*', role: 'subject_id', exitX: 1, exitY: 0.2, entryX: 0, entryY: 0.7 },
  { from: 'Topic', to: 'CourseMaterial', kind: 'association', fromMult: '0..1', toMult: '0..*', role: 'topic_id', exitX: 0.5, exitY: 0, entryX: 0.5, entryY: 1 },
  { from: 'CourseMaterial', to: 'MaterialChunk', kind: 'composition', fromMult: '1', toMult: '0..*', role: 'material_id', exitX: 1, exitY: 0.3, entryX: 0, entryY: 0.3 },
  { from: 'Topic', to: 'QuestionGenerationJob', kind: 'association', fromMult: '0..1', toMult: '0..*', role: 'topic_id', exitX: 1, exitY: 0.5, entryX: 0, entryY: 0.6 },
  { from: 'Rubric', to: 'QuestionGenerationJob', kind: 'association', fromMult: '0..1', toMult: '0..*', role: 'rubric_id', exitX: 0.5, exitY: 0, entryX: 1, entryY: 0.5 },
  { from: 'Topic', to: 'Question', kind: 'association', fromMult: '1', toMult: '0..*', role: 'topic_id', exitX: 0.5, exitY: 1, entryX: 0.3, entryY: 0 },
  { from: 'QuestionGenerationJob', to: 'Question', kind: 'association', fromMult: '0..1', toMult: '0..*', role: 'generation_job_id', exitX: 0.3, exitY: 1, entryX: 0.85, entryY: 0 },
  { from: 'Question', to: 'QuestionSourceRef', kind: 'composition', fromMult: '1', toMult: '0..*', role: 'question_id', exitX: 1, exitY: 0.05, entryX: 0, entryY: 0.5, via: [[1250, 775], [1250, 367]] },
  { from: 'MaterialChunk', to: 'QuestionSourceRef', kind: 'association', fromMult: '0..1', toMult: '0..*', role: 'chunk_id', exitX: 0.5, exitY: 1, entryX: 0.5, entryY: 0 },
  { from: 'Rubric', to: 'Question', kind: 'association', fromMult: '0..1', toMult: '0..*', role: 'rubric_id', exitX: 0, exitY: 0.5, entryX: 1, entryY: 0.5 },
  { from: 'Subject', to: 'Rubric', kind: 'association', fromMult: '0..1', toMult: '0..*', role: 'subject_id', exitX: 0.5, exitY: 1, entryX: 0.5, entryY: 1, via: [[685, 1520], [1785, 1520]] },
  { from: 'Rubric', to: 'RubricCriterion', kind: 'composition', fromMult: '1', toMult: '1..*', role: 'rubric_id', exitX: 0.5, exitY: 1, entryX: 0.5, entryY: 0 },
  { from: 'RubricCriterion', to: 'PerformanceLevel', kind: 'composition', fromMult: '1', toMult: '0..*', role: 'criterion_id', exitX: 0.5, exitY: 1, entryX: 0.5, entryY: 0 },
  // Exam & interview
  { from: 'Subject', to: 'ExamSession', kind: 'association', fromMult: '0..1', toMult: '0..*', role: 'subject_id', exitX: 1, exitY: 0.85, entryX: 0, entryY: 0.04, via: [[860, 572], [860, -10], [2090, -10], [2090, 84]] },
  { from: 'Topic', to: 'ExamSession', kind: 'association', fromMult: '0..1', toMult: '0..*', role: 'topic_id', exitX: 0.85, exitY: 0, entryX: 0, entryY: 0.67, via: [[1115, 440], [1620, 440], [1620, 300]] },
  { from: 'ExamSession', to: 'AppUser', kind: 'association', fromMult: '0..*', toMult: '0..*', role: 'students\n«exam_session_student»', exitX: 0.3, exitY: 0, entryX: 0.3, entryY: 0, via: [[2220, -25], [407, -25]] },
  { from: 'ExamSession', to: 'AppUser', kind: 'association', fromMult: '0..*', toMult: '0..*', role: 'examiners\n«exam_session_examiner»', exitX: 0.7, exitY: 0, entryX: 0.7, entryY: 0, via: [[2340, -40], [523, -40]] },
  { from: 'ExamSession', to: 'VivaInterview', kind: 'composition', fromMult: '1', toMult: '0..*', role: 'exam_session_id', exitX: 0.5, exitY: 1, entryX: 0.5, entryY: 0 },
  { from: 'AppUser', to: 'VivaInterview', kind: 'association', fromMult: '1', toMult: '0..*', role: 'student_id', exitX: 0.5, exitY: 1, entryX: 0, entryY: 0.9, via: [[465, 1540], [2090, 1540], [2090, 786]] },
  { from: 'VivaInterview', to: 'AssignedQuestion', kind: 'composition', fromMult: '1', toMult: '1..*', role: 'interview_id', exitX: 0, exitY: 0.97, entryX: 0.15, entryY: 0, via: [[2110, 760], [2110, 1230], [2175, 1230]] },
  { from: 'Question', to: 'AssignedQuestion', kind: 'association', fromMult: '1', toMult: '0..*', role: 'question_id', exitX: 0.5, exitY: 1, entryX: 0, entryY: 0.5, via: [[1070, 1490], [2010, 1490], [2010, 1300]] },
  { from: 'VivaInterview', to: 'QATurn', kind: 'composition', fromMult: '1', toMult: '0..*', role: 'interview_id', exitX: 1, exitY: 0.2, entryX: 0, entryY: 0.1 },
  { from: 'AssignedQuestion', to: 'QATurn', kind: 'association', fromMult: '0..1', toMult: '0..*', role: 'assigned_question_id', exitX: 1, exitY: 0.5, entryX: 0.5, entryY: 1 },
  { from: 'VivaInterview', to: 'Transcript', kind: 'composition', fromMult: '1', toMult: '0..1', role: 'interview_id {unique}', exitX: 0.9, exitY: 0, entryX: 0, entryY: 0.5, via: [[2400, 530], [2490, 530], [2490, 120]] },
  { from: 'VivaInterview', to: 'ProcessingFailure', kind: 'composition', fromMult: '1', toMult: '0..*', role: 'interview_id', exitX: 1, exitY: 0.05, entryX: 0, entryY: 0.5, via: [[2520, 576], [2520, 345]] },
  { from: 'QATurn', to: 'ProcessingFailure', kind: 'association', fromMult: '0..1', toMult: '0..*', role: 'turn_id', exitX: 0.5, exitY: 0, entryX: 0.5, entryY: 1 },
  { from: 'VivaInterview', to: 'SessionContext', kind: 'dependency', label: '«rebuilt from»', exitX: 0.5, exitY: 1, entryX: 0.5, entryY: 0, reverse: true },
  // Grading
  { from: 'VivaInterview', to: 'VivaResult', kind: 'composition', fromMult: '1', toMult: '0..1', role: 'interview_id {unique}', exitX: 1, exitY: 0.9, entryX: 0, entryY: 0.3, via: [[2960, 786], [2960, 610]] },
  { from: 'VivaResult', to: 'QuestionEvaluation', kind: 'composition', fromMult: '1', toMult: '0..*', role: 'result_id', exitX: 0.5, exitY: 1, entryX: 0.5, entryY: 0 },
  { from: 'AssignedQuestion', to: 'QuestionEvaluation', kind: 'association', fromMult: '0..1', toMult: '0..*', role: 'assigned_question_id', exitX: 1, exitY: 0.8, entryX: 0, entryY: 0.85, via: [[3000, 1316], [3000, 1040]] },
  { from: 'QuestionEvaluation', to: 'CriterionScore', kind: 'composition', fromMult: '1', toMult: '0..*', role: 'evaluation_id', exitX: 0.5, exitY: 1, entryX: 0.5, entryY: 0 },
  { from: 'RubricCriterion', to: 'CriterionScore', kind: 'association', fromMult: '0..1', toMult: '0..*', role: 'criterion_id', exitX: 1, exitY: 0.3, entryX: 0, entryY: 0.25, via: [[2040, 1046], [2040, 1210], [3050, 1210], [3050, 1140]] },
  { from: 'PerformanceLevel', to: 'CriterionScore', kind: 'association', fromMult: '0..1', toMult: '0..*', role: 'ai_level_id', exitX: 1, exitY: 0.5, entryX: 0, entryY: 0.75, via: [[2060, 1340], [2060, 1500], [3030, 1500], [3030, 1185]] },
  { from: 'CriterionScore', to: 'ScoreAdjustment', kind: 'composition', fromMult: '1', toMult: '0..*', role: 'criterion_score_id', exitX: 0.5, exitY: 1, entryX: 0.5, entryY: 0 },
];

module.exports = { W, packages, classes, enums, associations };
