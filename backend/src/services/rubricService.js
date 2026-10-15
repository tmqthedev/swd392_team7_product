function normalizeCriterionName(name) {
  return String(name).trim().toLowerCase();
}

function toApiPerformanceLevel(row) {
  return {
    id: row.performance_level_id,
    label: row.label,
    minScore: row.min_score == null ? null : Number(row.min_score),
    maxScore: row.max_score == null ? null : Number(row.max_score),
    description: row.description ?? null,
    orderNo: row.order_no == null ? null : Number(row.order_no),
  };
}

function toApiCriterion(row) {
  return {
    id: row.rubric_criterion_id,
    name: row.criterion_name,
    weightPercent: Number(row.weight_percent),
    description: row.description,
    performanceLevels: (row.performance_levels || []).map(toApiPerformanceLevel),
  };
}

function toApiRubric(record) {
  return {
    id: record.rubric_id,
    maxScore: Number(record.max_score),
    subjectId: record.subject_id ?? null,
    version: record.version == null ? 1 : Number(record.version),
    isLocked: record.is_locked === true,
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
      throw this._notFound();
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
      subjectId: payload?.subjectId != null ? Number(payload.subjectId) : undefined,
      createdBy: payload?.createdBy != null ? Number(payload.createdBy) : undefined,
    });

    return toApiRubric(row);
  }

  async updateRubric(rubricId, payload) {
    const existing = await this.repository.findById(rubricId);
    if (!existing) {
      throw this._notFound();
    }
    if (existing.is_locked === true) {
      const err = new Error('This rubric is locked and cannot be edited. Clone it to make changes.');
      err.statusCode = 409;
      err.code = 'RUBRIC_LOCKED';
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
      throw this._notFound();
    }

    return toApiRubric(row);
  }

  async cloneRubric(rubricId) {
    const row = await this.repository.clone(rubricId);
    if (!row) {
      throw this._notFound();
    }
    return toApiRubric(row);
  }

  async deleteRubric(rubricId) {
    const existing = await this.repository.findById(rubricId);
    if (!existing) {
      throw this._notFound();
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

  _notFound() {
    const err = new Error('Rubric not found');
    err.statusCode = 404;
    return err;
  }

  _validateCreatePayload(payload) {
    const errors = [];
    const maxScore = this._parseRequiredScore(payload?.maxScore, 'maxScore', errors);
    const criteria = this._parseRequiredCriteria(payload?.criteria, errors);

    if (errors.length > 0) {
      throw this._validationError(errors.join(' '));
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
      throw this._validationError('At least one field is required to update a rubric.');
    }

    if (errors.length > 0) {
      throw this._validationError(errors.join(' '));
    }

    return patch;
  }

  _validationError(message) {
    const err = new Error(message);
    err.statusCode = 400;
    err.code = 'VALIDATION_ERROR';
    return err;
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

      const performanceLevels = this._parsePerformanceLevels(item?.performanceLevels, prefix, errors);

      return {
        id: item?.id,
        name: String(name).trim(),
        weightPercent,
        description: description == null ? null : String(description).trim(),
        performanceLevels,
      };
    });
  }

  // Validate the optional nested performance levels for a criterion:
  // label required, numeric min_score <= max_score, integer order_no.
  _parsePerformanceLevels(value, prefix, errors) {
    if (value === undefined || value === null) {
      return [];
    }
    if (!Array.isArray(value)) {
      errors.push(`${prefix}.performanceLevels must be an array.`);
      return [];
    }
    return value.map((level, index) => {
      const lp = `${prefix}.performanceLevels[${index}]`;
      const label = level?.label;
      if (label === undefined || label === null || String(label).trim() === '') {
        errors.push(`${lp}.label is required.`);
      }

      const minScore = level?.minScore;
      const maxScore = level?.maxScore;
      let min = null;
      let max = null;
      if (minScore !== undefined && minScore !== null) {
        min = Number(minScore);
        if (!Number.isFinite(min)) {
          errors.push(`${lp}.minScore must be a number.`);
          min = null;
        }
      }
      if (maxScore !== undefined && maxScore !== null) {
        max = Number(maxScore);
        if (!Number.isFinite(max)) {
          errors.push(`${lp}.maxScore must be a number.`);
          max = null;
        }
      }
      if (min !== null && max !== null && min > max) {
        errors.push(`${lp}.minScore must be <= maxScore.`);
      }

      let orderNo = null;
      if (level?.orderNo !== undefined && level?.orderNo !== null) {
        orderNo = Number(level.orderNo);
        if (!Number.isInteger(orderNo)) {
          errors.push(`${lp}.orderNo must be an integer.`);
          orderNo = null;
        }
      }

      return {
        label: label == null ? null : String(label).trim(),
        minScore: min,
        maxScore: max,
        description: level?.description == null ? null : String(level.description).trim(),
        orderNo,
      };
    });
  }

  _assertCriteriaWeightTotal(criteria) {
    const total = criteria.reduce((sum, item) => sum + item.weightPercent, 0);
    if (Math.abs(total - 100) > 0.001) {
      throw this._validationError('Rubric criteria weightPercent values must total 100.');
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
        throw this._validationError('Invalid rubric criterion reference.');
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
  toApiRubric,
};
