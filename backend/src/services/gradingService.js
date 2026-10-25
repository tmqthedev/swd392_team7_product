// GradingService: Coordinates automated AI scoring via Bedrock Nova Pro and lecturer review.
//
// Rules from docs/AIVES - E2E Plan Management.md (Section 4):
// - Auto-grading on interview completion (GRADE_INTERVIEW).
// - Calls Nova Pro tool use for each main question against rubric criteria and performance levels.
// - Weighted scoring normalized to 10-point scale, rounded to 1 decimal place.
// - FLAGGED on low confidence (<0.6), turn failures, or LLM schema errors.
// - Lecturer adjustments strictly require a reason.
// - Subject-scoped access for lecturers.
// - Examiner-only / creator-only write permissions (Step 13: F10).

const {
  calculateQuestionScore,
  calculateVivaTotalScore,
  detectFlagReason,
  assertValidScoreAdjustment,
} = require('../domain/scoringRules');
const { missingCriterionIds } = require('../llm/gradingPrompt');

function notFound(message = 'Resource not found') {
  const err = new Error(message);
  err.statusCode = 404;
  err.code = 'NOT_FOUND';
  return err;
}

function forbidden(message = 'Forbidden') {
  const err = new Error(message);
  err.statusCode = 403;
  err.code = 'FORBIDDEN';
  return err;
}

function badRequest(message = 'Bad request', code = 'VALIDATION_ERROR') {
  const err = new Error(message);
  err.statusCode = 400;
  err.code = code;
  return err;
}

class GradingService {
  constructor({
    db,
    vivaResultRepository,
    llmAdapter,
    enqueueJob,
    logger = console,
  }) {
    this.db = db;
    this.vivaResultRepo = vivaResultRepository;
    this.llmAdapter = llmAdapter;
    this.enqueueJob = enqueueJob;
    this.logger = logger;
  }

  /**
   * Main background job execution for GRADE_INTERVIEW.
   */
  async gradeInterview({ interviewId }) {
    this.logger.info(`[GradingService] Starting AI grading for interview ${interviewId}`);

    // Find or ensure viva_result row
    let vivaResult = await this.vivaResultRepo.findByInterviewId(interviewId);
    if (!vivaResult) {
      const initRes = await this.db.query(
        'INSERT INTO viva_result (interview_id, status) VALUES ($1, $2) RETURNING *',
        [interviewId, 'AI_SCORING']
      );
      vivaResult = initRes.rows[0];
    } else {
      await this.vivaResultRepo.updateResult(vivaResult.viva_result_id, { status: 'AI_SCORING' });
    }

    // Load interview, exam session, and language
    const ivRes = await this.db.query(
      `SELECT vi.*, es.language AS exam_language, es.title AS session_title
       FROM viva_interview vi
       JOIN exam_session es ON es.exam_session_id = vi.exam_session_id
       WHERE vi.viva_interview_id = $1`,
      [interviewId]
    );
    const interview = ivRes.rows[0];
    if (!interview) {
      throw notFound(`Interview ${interviewId} not found for grading`);
    }

    // Load assigned questions
    const aqRes = await this.db.query(
      `SELECT aq.*, q.content AS question_content, q.bloom_level, q.reference_answer, q.key_points,
              q.rubric_id
       FROM assigned_question aq
       JOIN question q ON q.question_id = aq.question_id
       WHERE aq.interview_id = $1
       ORDER BY aq.order_no ASC`,
      [interviewId]
    );
    const assignedQuestions = aqRes.rows;

    // Load all turns
    const turnsRes = await this.db.query(
      `SELECT * FROM qa_turn WHERE interview_id = $1 ORDER BY sequence_no ASC`,
      [interviewId]
    );
    const allTurns = turnsRes.rows;

    const evaluationsToSave = [];
    const questionScores = [];
    let llmFailed = false;

    for (const aq of assignedQuestions) {
      const qTurns = allTurns.filter((t) => t.assigned_question_id === aq.assigned_question_id);
      const history = qTurns.map((t) => ({
        turnType: t.turn_type,
        questionText: t.question_text,
        answerText: t.answer_text,
        status: t.status,
      }));

      // Load rubric criteria with performance levels
      const rcRes = await this.db.query(
        `SELECT rc.*
         FROM rubric_criterion rc
         WHERE rc.rubric_id = $1
         ORDER BY rc.order_index ASC`,
        [aq.rubric_id]
      );
      const criteria = rcRes.rows;

      for (const crit of criteria) {
        const plRes = await this.db.query(
          `SELECT * FROM performance_level
           WHERE rubric_criterion_id = $1
           ORDER BY order_index ASC`,
          [crit.rubric_criterion_id]
        );
        crit.performance_levels = plRes.rows;
      }

      let aiGradingResult = null;
      try {
        aiGradingResult = await this.llmAdapter.gradeQuestion({
          language: interview.exam_language || 'EN',
          mainQuestion: {
            content: aq.question_content,
            bloom_level: aq.bloom_level,
            reference_answer: aq.reference_answer,
            key_points: aq.key_points,
          },
          history,
          rubricCriteria: criteria,
        });
      } catch (err) {
        this.logger.error({ err }, `[GradingService] LLM grading call failed for question ${aq.assigned_question_id}`);
        llmFailed = true;
      }

      if (aiGradingResult && Array.isArray(aiGradingResult.criteria_evaluations)) {
        // The model may skip rubric criteria even after retries: keep what it
        // graded, add the rest as ungraded rows and flag the question for the
        // lecturer instead of presenting a total built from a subset.
        const missing = missingCriterionIds(aiGradingResult, criteria);
        const qScore = calculateQuestionScore(aiGradingResult.criteria_evaluations, criteria);
        questionScores.push(qScore);

        evaluationsToSave.push({
          assigned_question_id: aq.assigned_question_id,
          ai_score: qScore,
          final_score: qScore,
          confidence: aiGradingResult.confidence ?? 0.85,
          strengths: aiGradingResult.strengths || '',
          weaknesses: aiGradingResult.weaknesses || '',
          missing_points: aiGradingResult.missing_points || [],
          feedback: aiGradingResult.feedback || '',
          flag_reason: missing.length > 0
            ? `AI grading incomplete: criteria ${missing.join(', ')} not graded`
            : null,
          model_id: 'apac.amazon.nova-pro-v1:0',
          prompt_version: '1.0',
          criteria: [
            ...aiGradingResult.criteria_evaluations.map((ce) => ({
              criterion_id: ce.criterion_id,
              ai_level_id: ce.ai_level_id,
              ai_score: ce.ai_score,
              ai_justification: ce.ai_justification,
              evidence: ce.evidence || [],
              final_score: ce.ai_score,
            })),
            ...missing.map((criterionId) => ({
              criterion_id: criterionId,
              ai_level_id: null,
              ai_score: null,
              ai_justification: 'Not graded by AI; manual grading required',
              evidence: [],
              final_score: null,
            })),
          ],
        });
      } else {
        // Fallback for LLM failure
        evaluationsToSave.push({
          assigned_question_id: aq.assigned_question_id,
          ai_score: null,
          final_score: null,
          confidence: 0,
          strengths: '',
          weaknesses: '',
          missing_points: [],
          feedback: 'AI scoring unavailable; manual grading required.',
          flag_reason: 'AI grading service failure',
          model_id: 'apac.amazon.nova-pro-v1:0',
          prompt_version: '1.0',
          criteria: criteria.map((c) => ({
            criterion_id: c.rubric_criterion_id,
            ai_level_id: null,
            ai_score: null,
            ai_justification: 'Manual grading required',
            evidence: [],
            final_score: null,
          })),
        });
      }
    }

    // Save all evaluations and criteria records
    await this.vivaResultRepo.saveEvaluationsAndCriteria(
      vivaResult.viva_result_id,
      evaluationsToSave
    );

    // Compute viva total score and check flagging
    const vivaTotal = calculateVivaTotalScore(questionScores);
    const flagCheck = detectFlagReason({
      questionEvaluations: evaluationsToSave,
      turns: allTurns,
      llmFailed,
    });

    const nextStatus = flagCheck.isFlagged ? 'FLAGGED' : 'AI_SUGGESTED';

    const updated = await this.vivaResultRepo.updateResult(vivaResult.viva_result_id, {
      status: nextStatus,
      ai_total_score: vivaTotal,
      final_total_score: vivaTotal,
    });

    this.logger.info(
      `[GradingService] Interview ${interviewId} graded: status=${nextStatus}, totalScore=${vivaTotal}`
    );

    return updated;
  }

  /**
   * List all exam results for a given session with subject scoping.
   * Includes canGrade boolean flag for the requesting user.
   */
  async listSessionResults({ examSessionId, user }) {
    await this._assertSessionAccess(examSessionId, user, { write: false });
    const canGrade = user.role === 'ADMIN'
      || (typeof this.vivaResultRepo.isExaminerOrCreator === 'function'
        ? await this.vivaResultRepo.isExaminerOrCreator(examSessionId, user.id)
        : false);

    const rows = await this.vivaResultRepo.listBySession(examSessionId);
    return rows.map((r) => ({ ...r, canGrade: Boolean(canGrade) }));
  }

  /**
   * Get complete result details for lecturer review with subject scoping.
   * Includes canGrade boolean flag for the requesting user.
   */
  async getResultDetail({ resultId, user }) {
    const detail = await this.vivaResultRepo.getFullResultDetail(resultId);
    if (!detail) {
      throw notFound(`Viva result ${resultId} not found`);
    }
    await this._assertSessionAccess(detail.result.exam_session_id, user, { write: false });
    const canGrade = user.role === 'ADMIN'
      || (typeof this.vivaResultRepo.isExaminerOrCreator === 'function'
        ? await this.vivaResultRepo.isExaminerOrCreator(detail.result.exam_session_id, user.id)
        : false);

    return {
      ...detail,
      canGrade: Boolean(canGrade),
      result: {
        ...detail.result,
        canGrade: Boolean(canGrade),
      },
    };
  }

  /**
   * Adjust score for a specific criterion with mandatory reason.
   * Strictly restricted to ADMIN, examiners of this exam, or the exam creator.
   */
  async adjustCriterionScore({ criterionScoreId, newScore, reason, user }) {
    const cs = await this.vivaResultRepo.findCriterionScoreById(criterionScoreId);
    if (!cs) {
      throw notFound(`Criterion score ${criterionScoreId} not found`);
    }

    const detail = await this.vivaResultRepo.getFullResultDetail(cs.result_id);
    if (!detail) {
      throw notFound(`Associated viva result not found`);
    }
    await this._assertSessionAccess(detail.result.exam_session_id, user, { write: true });

    if (detail.result.status === 'FINALIZED') {
      throw badRequest('Cannot adjust scores on a finalized result. Please reopen it first.', 'RESULT_FINALIZED');
    }

    const oldScore = cs.final_score !== null ? Number(cs.final_score) : Number(cs.ai_score);
    assertValidScoreAdjustment({ oldScore, newScore: Number(newScore), reason });

    // Record adjustment history
    await this.vivaResultRepo.insertScoreAdjustment({
      criterionScoreId,
      oldScore,
      newScore: Number(newScore),
      reason: String(reason).trim(),
      adjustedBy: user.id,
    });

    // Update criterion score
    await this.vivaResultRepo.updateCriterionScore(criterionScoreId, {
      finalScore: Number(newScore),
    });

    // Recompute evaluation score
    // Ids come back from Postgres as strings (BIGINT) while the route parses a
    // number, and criterion rows carry the rubric weight/max as
    // criterion_weight / criterion_max_score: normalise both before scoring.
    const evaluationId = Number(cs.question_evaluation_id ?? cs.evaluation_id);
    const ev = detail.evaluations.find((e) => Number(e.question_evaluation_id) === evaluationId);
    if (ev && Array.isArray(ev.criteria)) {
      const updatedCriteria = ev.criteria.map((c) => (
        Number(c.criterion_score_id) === Number(criterionScoreId) ? { ...c, final_score: Number(newScore) } : c
      ));
      const newQuestionScore = calculateQuestionScore(
        updatedCriteria.map((c) => ({ criterion_id: c.criterion_id, score: c.final_score ?? c.ai_score })),
        updatedCriteria.map((c) => ({
          criterion_id: c.criterion_id,
          weight: c.criterion_weight ?? c.weight,
          max_score: c.criterion_max_score ?? c.max_score,
        })),
      );
      await this.vivaResultRepo.updateEvaluationScore(evaluationId, {
        finalScore: newQuestionScore,
      });
    }

    // Recompute viva total score
    const refreshed = await this.vivaResultRepo.getFullResultDetail(cs.result_id);
    const newTotal = calculateVivaTotalScore(
      refreshed.evaluations.map((e) => e.final_score)
    );
    await this.vivaResultRepo.updateResult(cs.result_id, {
      final_total_score: newTotal,
    });

    return this.vivaResultRepo.getFullResultDetail(cs.result_id);
  }

  /**
   * Lecturer finalizes the viva exam result.
   * Strictly restricted to ADMIN, examiners of this exam, or the exam creator.
   */
  async finalizeResult({ resultId, user }) {
    const detail = await this.vivaResultRepo.getFullResultDetail(resultId);
    if (!detail) throw notFound(`Viva result ${resultId} not found`);
    await this._assertSessionAccess(detail.result.exam_session_id, user, { write: true });

    if (detail.result.status === 'FINALIZED') {
      throw badRequest('Result is already finalized.', 'ALREADY_FINALIZED');
    }

    return this.vivaResultRepo.updateResult(resultId, {
      status: 'FINALIZED',
      finalized_by: user.id,
      finalized_at: new Date(),
    });
  }

  /**
   * Lecturer re-opens a finalized result for adjustments.
   * Strictly restricted to ADMIN, examiners of this exam, or the exam creator.
   */
  async reopenResult({ resultId, user }) {
    const detail = await this.vivaResultRepo.getFullResultDetail(resultId);
    if (!detail) throw notFound(`Viva result ${resultId} not found`);
    await this._assertSessionAccess(detail.result.exam_session_id, user, { write: true });

    if (detail.result.status !== 'FINALIZED') {
      throw badRequest('Only finalized results can be reopened.', 'NOT_FINALIZED');
    }

    const hasFlag = detail.evaluations.some((e) => e.flag_reason);
    const targetStatus = hasFlag ? 'FLAGGED' : 'AI_SUGGESTED';

    return this.vivaResultRepo.updateResult(resultId, {
      status: targetStatus,
      finalized_by: null,
      finalized_at: null,
    });
  }

  /**
   * Trigger a regrade of the interview.
   * Strictly restricted to ADMIN, examiners of this exam, or the exam creator.
   */
  async regradeResult({ resultId, user }) {
    const detail = await this.vivaResultRepo.getFullResultDetail(resultId);
    if (!detail) throw notFound(`Viva result ${resultId} not found`);
    await this._assertSessionAccess(detail.result.exam_session_id, user, { write: true });

    await this.vivaResultRepo.updateResult(resultId, { status: 'AI_SCORING' });

    if (typeof this.enqueueJob === 'function') {
      await this.enqueueJob('GRADE_INTERVIEW', { interviewId: detail.result.interview_id });
    }

    return { ok: true, status: 'AI_SCORING' };
  }

  async _assertSessionAccess(examSessionId, user, { write = false } = {}) {
    if (user.role === 'ADMIN') return;
    const esRes = await this.db.query(
      `SELECT es.subject_id
       FROM exam_session es
       WHERE es.exam_session_id = $1`,
      [examSessionId]
    );
    const session = esRes.rows[0];
    if (!session) throw notFound(`Exam session ${examSessionId} not found`);

    const subRes = await this.db.query(
      `SELECT 1 FROM subject_lecturer WHERE subject_id = $1 AND lecturer_id = $2`,
      [session.subject_id, user.id]
    );
    if (subRes.rows.length === 0) {
      throw forbidden('You are not authorized to access results for this subject.');
    }

    if (write) {
      const allowed = typeof this.vivaResultRepo.isExaminerOrCreator === 'function'
        ? await this.vivaResultRepo.isExaminerOrCreator(examSessionId, user.id)
        : false;
      if (!allowed) {
        throw forbidden('Only examiners of this exam can grade.');
      }
    }
  }
}

module.exports = {
  GradingService,
};
