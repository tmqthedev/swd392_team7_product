const {
  toStudentResultListItem,
  toStudentResultView,
  assertStudentResultSafe,
} = require('../interview/studentResultView');

function httpError(statusCode, code, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.code = code;
  return err;
}

class StudentExamService {
  constructor({
    examSessionRepository,
    vivaInterviewRepository,
    vivaResultRepository,
    clock = () => new Date(),
  }) {
    this.examSessionRepository = examSessionRepository;
    this.vivaInterviewRepository = vivaInterviewRepository;
    this.vivaResultRepo = vivaResultRepository;
    this.clock = clock;
  }

  async listExamSessions({ user }) {
    if (!user || user.role !== 'STUDENT') {
      throw httpError(403, 'FORBIDDEN', 'Only students can view their assigned exam sessions.');
    }

    const now = this.clock();
    const nowTime = now.getTime();
    const rows = await this.examSessionRepository.listByStudent(user.id);

    return rows.map((row) => {
      const opensAtTime = row.opens_at ? new Date(row.opens_at).getTime() : null;
      const closesAtTime = row.closes_at ? new Date(row.closes_at).getTime() : null;
      const deadlineTime = row.interview_deadline_at ? new Date(row.interview_deadline_at).getTime() : null;

      const isWithinTimeWindow = (opensAtTime == null || nowTime >= opensAtTime)
        && (closesAtTime == null || nowTime <= closesAtTime);

      const hasInterview = row.viva_interview_id != null;
      const interviewStatus = row.interview_status || 'NOT_STARTED';
      const isInterviewExpired = deadlineTime != null && nowTime >= deadlineTime;

      // Only an OPEN exam inside its window is startable: SCHEDULED (not yet
      // started by an admin) and OPEN-before-opens_at are not.
      const canStart = row.status === 'OPEN' && isWithinTimeWindow && !hasInterview;
      const canResume = row.status === 'OPEN'
        && hasInterview
        && interviewStatus === 'IN_PROGRESS'
        && !isInterviewExpired;

      return {
        examSessionId: row.exam_session_id,
        title: row.title,
        subjectName: row.subject_name || null,
        subjectCode: row.subject_code || null,
        topicName: row.topic_name || null,
        language: row.language,
        mainQuestionCount: row.main_question_count,
        maxFollowUpsPerQuestion: row.max_follow_ups_per_question,
        maxFollowUpsTotal: row.max_follow_ups_total ?? null,
        answerTimeLimitSec: row.answer_time_limit_sec,
        thinkTimeSec: row.think_time_sec,
        sessionTimeLimitSec: row.session_time_limit_sec,
        opensAt: row.opens_at ? new Date(row.opens_at).toISOString() : null,
        closesAt: row.closes_at ? new Date(row.closes_at).toISOString() : null,
        status: row.status,
        canStart,
        canResume,
        interview: hasInterview ? {
          interviewId: row.viva_interview_id,
          status: interviewStatus,
          startedAt: row.interview_started_at ? new Date(row.interview_started_at).toISOString() : null,
          deadlineAt: row.interview_deadline_at ? new Date(row.interview_deadline_at).toISOString() : null,
          isExpired: isInterviewExpired,
        } : null,
      };
    });
  }

  async listResults({ user }) {
    if (!user || user.role !== 'STUDENT') {
      throw httpError(403, 'FORBIDDEN', 'Only students can view their results.');
    }
    const rows = await this.vivaResultRepo.listFinalizedForStudent(user.id);
    return rows.map(toStudentResultListItem).map(assertStudentResultSafe);
  }

  async getResultDetail({ user, resultId }) {
    if (!user || user.role !== 'STUDENT') {
      throw httpError(403, 'FORBIDDEN', 'Only students can view their results.');
    }
    const detail = await this.vivaResultRepo.findFinalizedForStudent(resultId, user.id);
    if (!detail) {
      throw httpError(404, 'NOT_FOUND', 'Result not found or not finalized.');
    }
    const view = toStudentResultView(detail);
    return assertStudentResultSafe(view);
  }
}

module.exports = { StudentExamService };
