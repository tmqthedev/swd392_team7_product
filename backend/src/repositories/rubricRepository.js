class RubricRepository {
  constructor(database) {
    this.db = database;
  }

  async findAll() {
    const rubrics = await this.db.query('SELECT * FROM rubric ORDER BY rubric_id ASC');
    const criteria = await this.db.query(
      'SELECT * FROM rubric_criterion ORDER BY rubric_id ASC, rubric_criterion_id ASC',
    );
    return this._attachCriteria(rubrics.rows, criteria.rows);
  }

  async findById(rubricId) {
    const rubric = await this.db.query('SELECT * FROM rubric WHERE rubric_id = $1', [rubricId]);
    if (!rubric.rows[0]) {
      return null;
    }
    const criteria = await this.db.query(
      'SELECT * FROM rubric_criterion WHERE rubric_id = $1 ORDER BY rubric_criterion_id ASC',
      [rubricId],
    );
    return {
      ...rubric.rows[0],
      criteria: criteria.rows,
    };
  }

  async countQuestionsUsingRubric(rubricId) {
    const result = await this.db.query(
      'SELECT COUNT(*)::int AS count FROM question WHERE rubric_id = $1',
      [rubricId],
    );
    return result.rows[0]?.count || 0;
  }

  async create({ maxScore, criteria }) {
    return this.db.withTransaction(async (tx) => {
      const rubricResult = await tx.query(
        'INSERT INTO rubric (max_score) VALUES ($1) RETURNING *',
        [maxScore],
      );
      const rubric = rubricResult.rows[0];
      const savedCriteria = [];

      for (const criterion of criteria) {
        const criterionResult = await tx.query(
          `INSERT INTO rubric_criterion (rubric_id, criterion_name, weight_percent, description)
           VALUES ($1, $2, $3, $4)
           RETURNING *`,
          [rubric.rubric_id, criterion.name, criterion.weightPercent, criterion.description ?? null],
        );
        savedCriteria.push(criterionResult.rows[0]);
      }

      return { ...rubric, criteria: savedCriteria };
    });
  }

  async update(rubricId, { maxScore, criteria }) {
    return this.db.withTransaction(async (tx) => {
      const fields = [];
      const values = [];

      if (maxScore !== undefined) {
        values.push(maxScore);
        fields.push(`max_score = $${values.length}`);
      }

      if (fields.length > 0) {
        values.push(rubricId);
        const rubricResult = await tx.query(
          `UPDATE rubric SET ${fields.join(', ')}
           WHERE rubric_id = $${values.length}
           RETURNING *`,
          values,
        );
        if (!rubricResult.rows[0]) {
          return null;
        }
      } else {
        const rubricResult = await tx.query('SELECT * FROM rubric WHERE rubric_id = $1', [rubricId]);
        if (!rubricResult.rows[0]) {
          return null;
        }
      }

      let savedCriteria;
      if (criteria !== undefined) {
        await tx.query('DELETE FROM rubric_criterion WHERE rubric_id = $1', [rubricId]);
        savedCriteria = [];
        for (const criterion of criteria) {
          const criterionResult = await tx.query(
            `INSERT INTO rubric_criterion (rubric_id, criterion_name, weight_percent, description)
             VALUES ($1, $2, $3, $4)
             RETURNING *`,
            [rubricId, criterion.name, criterion.weightPercent, criterion.description ?? null],
          );
          savedCriteria.push(criterionResult.rows[0]);
        }
      } else {
        const criteriaResult = await tx.query(
          'SELECT * FROM rubric_criterion WHERE rubric_id = $1 ORDER BY rubric_criterion_id ASC',
          [rubricId],
        );
        savedCriteria = criteriaResult.rows;
      }

      const rubricRow = await tx.query('SELECT * FROM rubric WHERE rubric_id = $1', [rubricId]);
      return {
        ...rubricRow.rows[0],
        criteria: savedCriteria,
      };
    });
  }

  async deleteById(rubricId) {
    const result = await this.db.query(
      'DELETE FROM rubric WHERE rubric_id = $1 RETURNING *',
      [rubricId],
    );
    if (!result.rows[0]) {
      return null;
    }
    return result.rows[0];
  }

  async findCriterionById(criterionId) {
    const result = await this.db.query(
      'SELECT * FROM rubric_criterion WHERE rubric_criterion_id = $1',
      [criterionId],
    );
    return result.rows[0] || null;
  }

  _attachCriteria(rubricRows, criterionRows) {
    const criteriaByRubric = criterionRows.reduce((acc, row) => {
      if (!acc[row.rubric_id]) {
        acc[row.rubric_id] = [];
      }
      acc[row.rubric_id].push(row);
      return acc;
    }, {});

    return rubricRows.map((row) => ({
      ...row,
      criteria: criteriaByRubric[row.rubric_id] || [],
    }));
  }
}

module.exports = {
  RubricRepository,
};
