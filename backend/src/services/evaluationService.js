const ALLOWED_EVALUATION_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'];

function validationError(message) {
  const err = new Error(message);
  err.statusCode = 400;
  err.code = 'VALIDATION_ERROR';
  return err;
}

function notFound() {
  const err = new Error('Evaluation not found');
  err.statusCode = 404;
  return err;
}

class EvaluationService {
  constructor({ repository }) {
    this.repository = repository;
  }

  async createEvaluation(data = {}) {
    if (!data.session_id || !data.student_id) {
      throw validationError('session_id and student_id are required');
    }

    const errors = [];
    const record = {
      session_id: String(data.session_id),
      student_id: String(data.student_id),
      question_id: this._parseOptionalPositiveInt(data.question_id, 'question_id', errors),
      ai_suggested_score: this._parseOptionalScore(data.ai_suggested_score, 'ai_suggested_score', errors),
      ai_feedback: data.ai_feedback ?? null,
      final_score: this._parseOptionalScore(data.final_score, 'final_score', errors),
      lecturer_feedback: data.lecturer_feedback ?? null,
      status: this._parseStatus(data.status ?? 'PENDING', errors),
    };
    if (errors.length > 0) throw validationError(errors.join(' '));

    return this.repository.create(record);
  }

  async getEvaluation(id) {
    const evaluation = await this.repository.getById(id);
    if (!evaluation) throw notFound();
    return evaluation;
  }

  async listEvaluations() {
    return this.repository.list();
  }

  async updateEvaluation(id, patch = {}) {
    const errors = [];
    const clean = {};
    if (patch.ai_suggested_score !== undefined) {
      clean.ai_suggested_score = this._parseOptionalScore(patch.ai_suggested_score, 'ai_suggested_score', errors);
    }
    if (patch.final_score !== undefined) {
      clean.final_score = this._parseOptionalScore(patch.final_score, 'final_score', errors);
    }
    if (patch.ai_feedback !== undefined) clean.ai_feedback = patch.ai_feedback;
    if (patch.lecturer_feedback !== undefined) clean.lecturer_feedback = patch.lecturer_feedback;
    if (patch.status !== undefined) clean.status = this._parseStatus(patch.status, errors);

    if (errors.length > 0) throw validationError(errors.join(' '));
    if (Object.keys(clean).length === 0) {
      throw validationError('No updatable fields provided.');
    }

    const existing = await this.repository.getById(id);
    if (!existing) throw notFound();

    // Business rule: an APPROVED evaluation must have a final score.
    const finalScore = clean.final_score !== undefined ? clean.final_score : existing.final_score;
    if (clean.status === 'APPROVED' && (finalScore === null || finalScore === undefined)) {
      throw validationError('final_score is required to approve an evaluation.');
    }

    const updated = await this.repository.update(id, clean);
    if (!updated) throw notFound();
    return updated;
  }

  async deleteEvaluation(id) {
    const deleted = await this.repository.delete(id);
    if (!deleted) throw notFound();
    return deleted;
  }

  _parseStatus(value, errors) {
    const status = String(value).trim().toUpperCase();
    if (!ALLOWED_EVALUATION_STATUSES.includes(status)) {
      errors.push(`status must be one of: ${ALLOWED_EVALUATION_STATUSES.join(', ')}.`);
      return null;
    }
    return status;
  }

  _parseOptionalScore(value, field, errors) {
    if (value === undefined || value === null) return null;
    const parsed = Number(value);
    if (typeof value === 'boolean' || value === '' || !Number.isFinite(parsed) || parsed < 0) {
      errors.push(`${field} must be a non-negative number.`);
      return null;
    }
    return parsed;
  }

  _parseOptionalPositiveInt(value, field, errors) {
    if (value === undefined || value === null) return null;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      errors.push(`${field} must be a positive integer.`);
      return null;
    }
    return parsed;
  }
}

module.exports = { EvaluationService, ALLOWED_EVALUATION_STATUSES };
