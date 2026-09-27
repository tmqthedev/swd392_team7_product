function normalizeCriterionName(name) {
  return String(name).trim().toLowerCase();
}

function toApiCriterion(row) {
  return {
    id: row.rubric_criterion_id,
    name: row.criterion_name,
    weightPercent: Number(row.weight_percent),
    description: row.description,
  };
}

function toApiRubric(record) {
  return {
    id: record.rubric_id,
    maxScore: Number(record.max_score),
    criteria: (record.criteria || []).map(toApiCriterion),
  };
}

class RubricService {
  constructor({ repository }) {
    this.repository = repository;
  }

  async listRubrics() {
    const rows = await this.repository.findAll();
    return rows.map(toApiRubric);
  }

  async getRubricById(rubricId) {
    const row = await this.repository.findById(rubricId);
    if (!row) {
      const err = new Error('Rubric not found');
      err.statusCode = 404;
      throw err;
    }
    return toApiRubric(row);
  }

  async createRubric(payload) {
    const validated = this._validateCreatePayload(payload);
    this._assertCriteriaWeightTotal(validated.criteria);
    this._assertNoDuplicateCriterionNames(validated.criteria);

    const row = await this.repository.create({
      maxScore: validated.maxScore,
      criteria: validated.criteria,
    });

    return toApiRubric(row);
  }

  async updateRubric(rubricId, payload) {
    const existing = await this.repository.findById(rubricId);
    if (!existing) {
      const err = new Error('Rubric not found');
      err.statusCode = 404;
      throw err;
    }

    const validated = this._validateUpdatePayload(payload);
    if (validated.criteria !== undefined) {
      await this._assertValidCriterionReferences(rubricId, payload.criteria);
      this._assertCriteriaWeightTotal(validated.criteria);
      this._assertNoDuplicateCriterionNames(validated.criteria);
    }

    const row = await this.repository.update(rubricId, {
      maxScore: validated.maxScore,
      criteria: validated.criteria,
    });

    if (!row) {
      const err = new Error('Rubric not found');
      err.statusCode = 404;
      throw err;
    }

    return toApiRubric(row);
  }

  async deleteRubric(rubricId) {
    const existing = await this.repository.findById(rubricId);
    if (!existing) {
      const err = new Error('Rubric not found');
      err.statusCode = 404;
      throw err;
    }

    const usageCount = await this.repository.countQuestionsUsingRubric(rubricId);
    if (usageCount > 0) {
      const err = new Error('Rubric cannot be deleted while assigned to questions.');
      err.statusCode = 409;
      err.code = 'RUBRIC_IN_USE';
      throw err;
    }

    const row = await this.repository.deleteById(rubricId);
    return toApiRubric({ ...row, criteria: [] });
  }

  _validateCreatePayload(payload) {
    const errors = [];
    const maxScore = this._parseRequiredScore(payload?.maxScore, 'maxScore', errors);
    const criteria = this._parseRequiredCriteria(payload?.criteria, errors);

    if (errors.length > 0) {
      const err = new Error(errors.join(' '));
      err.statusCode = 400;
      err.code = 'VALIDATION_ERROR';
      throw err;
    }

    return { maxScore, criteria };
  }

  _validateUpdatePayload(payload) {
    const errors = [];
    const patch = {};

    if (payload?.maxScore !== undefined) {
      patch.maxScore = this._parseRequiredScore(payload.maxScore, 'maxScore', errors);
    }
    if (payload?.criteria !== undefined) {
      patch.criteria = this._parseRequiredCriteria(payload.criteria, errors);
    }

    if (Object.keys(patch).length === 0) {
      const err = new Error('At least one field is required to update a rubric.');
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

  _parseRequiredScore(value, fieldName, errors) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      errors.push(`${fieldName} must be a number greater than 0.`);
      return null;
    }
    return parsed;
  }

  _parseRequiredCriteria(value, errors) {
    if (!Array.isArray(value) || value.length === 0) {
      errors.push('At least one rubric criterion is required.');
      return [];
    }

    return value.map((item, index) => {
      const prefix = `criteria[${index}]`;
      const name = item?.name;
      if (name === undefined || name === null || String(name).trim() === '') {
        errors.push(`${prefix}.name is required.`);
      }

      const weightPercent = Number(item?.weightPercent);
      if (!Number.isFinite(weightPercent) || weightPercent <= 0 || weightPercent > 100) {
        errors.push(`${prefix}.weightPercent must be between 0 and 100.`);
      }

      const description = item?.description;
      if (description !== undefined && description !== null && String(description).trim() === '') {
        errors.push(`${prefix}.description cannot be empty when provided.`);
      }

      return {
        id: item?.id,
        name: String(name).trim(),
        weightPercent,
        description: description == null ? null : String(description).trim(),
      };
    });
  }

  _assertCriteriaWeightTotal(criteria) {
    const total = criteria.reduce((sum, item) => sum + item.weightPercent, 0);
    if (Math.abs(total - 100) > 0.001) {
      const err = new Error('Rubric criteria weightPercent values must total 100.');
      err.statusCode = 400;
      err.code = 'VALIDATION_ERROR';
      throw err;
    }
  }

  _assertNoDuplicateCriterionNames(criteria) {
    const seen = new Set();
    for (const criterion of criteria) {
      const normalized = normalizeCriterionName(criterion.name);
      if (seen.has(normalized)) {
        const err = new Error('A criterion with this name already exists in the rubric.');
        err.statusCode = 409;
        err.code = 'DUPLICATE_DATA';
        throw err;
      }
      seen.add(normalized);
    }
  }

  async _assertValidCriterionReferences(rubricId, criteria) {
    for (const criterion of criteria) {
      if (criterion.id === undefined || criterion.id === null) {
        continue;
      }

      const criterionId = Number(criterion.id);
      if (!Number.isInteger(criterionId) || criterionId <= 0) {
        const err = new Error('Invalid rubric criterion reference.');
        err.statusCode = 400;
        err.code = 'VALIDATION_ERROR';
        throw err;
      }

      const existing = await this.repository.findCriterionById(criterionId);
      if (!existing || existing.rubric_id !== rubricId) {
        const err = new Error('Invalid rubric criterion reference.');
        err.statusCode = 400;
        err.code = 'INVALID_CRITERION_REFERENCE';
        throw err;
      }
    }
  }
}

module.exports = {
  RubricService,
  normalizeCriterionName,
};
