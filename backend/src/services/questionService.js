const ALLOWED_STATUSES = ['Active', 'Draft'];

function normalizeContent(content) {
  return String(content).trim().toLowerCase();
}

function toApiQuestion(row) {
  return {
    id: row.question_id,
    topicId: row.topic_id,
    rubricId: row.rubric_id,
    content: row.content,
    status: row.status,
  };
}

class QuestionService {
  constructor({ repository }) {
    this.repository = repository;
  }

  async listQuestions() {
    const rows = await this.repository.findAll();
    return rows.map(toApiQuestion);
  }

  async getQuestionById(questionId) {
    const row = await this.repository.findById(questionId);
    if (!row) {
      const err = new Error('Question not found');
      err.statusCode = 404;
      throw err;
    }
    return toApiQuestion(row);
  }

  async createQuestion(payload) {
    const validated = this._validateCreatePayload(payload);
    await this._assertNotDuplicate(validated.content);

    const row = await this.repository.create({
      topicId: validated.topicId,
      rubricId: validated.rubricId,
      content: validated.content,
      status: validated.status,
    });

    return toApiQuestion(row);
  }

  async updateQuestion(questionId, payload) {
    const existing = await this.repository.findById(questionId);
    if (!existing) {
      const err = new Error('Question not found');
      err.statusCode = 404;
      throw err;
    }

    const validated = this._validateUpdatePayload(payload);
    if (validated.content !== undefined) {
      await this._assertNotDuplicate(validated.content, questionId);
    }

    const row = await this.repository.update(questionId, {
      topicId: validated.topicId,
      rubricId: validated.rubricId,
      content: validated.content,
      status: validated.status,
    });

    if (!row) {
      const err = new Error('Question not found');
      err.statusCode = 404;
      throw err;
    }

    return toApiQuestion(row);
  }

  async deleteQuestion(questionId) {
    const row = await this.repository.deleteById(questionId);
    if (!row) {
      const err = new Error('Question not found');
      err.statusCode = 404;
      throw err;
    }
    return toApiQuestion(row);
  }

  _validateCreatePayload(payload) {
    const errors = [];

    const topicId = this._parseRequiredInt(payload?.topicId, 'topicId', errors);
    const content = this._parseRequiredContent(payload?.content, errors);
    const status = this._parseRequiredStatus(payload?.status, errors);
    const rubricId = this._parseOptionalInt(payload?.rubricId, 'rubricId', errors);

    if (errors.length > 0) {
      const err = new Error(errors.join(' '));
      err.statusCode = 400;
      err.code = 'VALIDATION_ERROR';
      throw err;
    }

    return { topicId, content, status, rubricId };
  }

  _validateUpdatePayload(payload) {
    const errors = [];
    const patch = {};

    if (payload?.topicId !== undefined) {
      patch.topicId = this._parseRequiredInt(payload.topicId, 'topicId', errors);
    }
    if (payload?.content !== undefined) {
      patch.content = this._parseRequiredContent(payload.content, errors);
    }
    if (payload?.status !== undefined) {
      patch.status = this._parseRequiredStatus(payload.status, errors);
    }
    if (payload?.rubricId !== undefined) {
      patch.rubricId = payload.rubricId === null
        ? null
        : this._parseRequiredInt(payload.rubricId, 'rubricId', errors);
    }

    if (Object.keys(patch).length === 0) {
      const err = new Error('At least one field is required to update a question.');
      err.statusCode = 400;
      err.code = 'VALIDATION_ERROR';
      throw err;
    }

    if (errors.length > 0) {
      const err = new Error(errors.join(' '));
      err.statusCode = 400;
      err.code = 'VALIDATION_ERROR';
      throw err;
    }

    return patch;
  }

  _parseRequiredContent(value, errors) {
    if (value === undefined || value === null || String(value).trim() === '') {
      errors.push('Question content is required.');
      return null;
    }
    return String(value).trim();
  }

  _parseRequiredStatus(value, errors) {
    if (value === undefined || value === null || String(value).trim() === '') {
      errors.push('Question status is required.');
      return null;
    }
    const status = String(value).trim();
    if (!ALLOWED_STATUSES.includes(status)) {
      errors.push(`Question status must be one of: ${ALLOWED_STATUSES.join(', ')}.`);
      return null;
    }
    return status;
  }

  _parseRequiredInt(value, fieldName, errors) {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      errors.push(`${fieldName} must be a positive integer.`);
      return null;
    }
    return parsed;
  }

  _parseOptionalInt(value, fieldName, errors) {
    if (value === undefined || value === null) {
      return null;
    }
    return this._parseRequiredInt(value, fieldName, errors);
  }

  async _assertNotDuplicate(content, excludeQuestionId = null) {
    const normalized = normalizeContent(content);
    const duplicate = await this.repository.findByNormalizedContent(normalized, excludeQuestionId);
    if (duplicate) {
      const err = new Error('This question already exists.');
      err.statusCode = 409;
      err.code = 'DUPLICATE_QUESTION';
      throw err;
    }
  }
}

module.exports = {
  QuestionService,
  ALLOWED_STATUSES,
  normalizeContent,
};
