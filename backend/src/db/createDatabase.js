const { Pool } = require('pg');
const { mapDbError } = require('./mapDbError');

class InMemoryDatabase {
  constructor() {
    this.topics = new Map([[1, { topic_id: 1, name: 'Default topic' }]]);
    this.rubrics = new Map();
    this.rubricCriteria = new Map();
    this.questions = new Map();
    this.nextQuestionId = 1;
    this.nextRubricId = 1;
    this.nextCriterionId = 1;
  }

  async withTransaction(callback) {
    return callback({
      query: (text, params) => this.query(text, params),
    });
  }

  async query(text, params = []) {
    try {
      return await this._dispatch(text, params);
    } catch (error) {
      throw mapDbError(error);
    }
  }

  async _dispatch(text, params) {
    const sql = text.replace(/\s+/g, ' ').trim();

    if (sql.startsWith('INSERT INTO question')) {
      const [topicId, rubricId, content, status] = params;
      this._assertTopicExists(topicId);
      if (rubricId != null) {
        this._assertRubricExists(rubricId);
      }

      const normalizedContent = String(content).trim().toLowerCase();
      const duplicate = [...this.questions.values()].find(
        (q) => q.normalizedContent === normalizedContent,
      );
      if (duplicate) {
        const err = new Error('duplicate key value violates unique constraint');
        err.code = '23505';
        throw err;
      }

      const questionId = this.nextQuestionId++;
      const row = {
        question_id: questionId,
        topic_id: topicId,
        rubric_id: rubricId,
        content,
        status,
        normalizedContent,
      };
      this.questions.set(questionId, row);
      return { rows: [row], rowCount: 1 };
    }

    if (sql.startsWith('UPDATE question SET')) {
      const id = params[params.length - 1];
      const current = this.questions.get(id);
      if (!current) {
        return { rows: [], rowCount: 0 };
      }

      const patch = this._parseUpdatePatch(sql, params);
      if (patch.topic_id != null) {
        this._assertTopicExists(patch.topic_id);
      }
      if (patch.rubric_id != null) {
        this._assertRubricExists(patch.rubric_id);
      }

      const nextContent = patch.content != null ? patch.content : current.content;
      const normalizedContent = String(nextContent).trim().toLowerCase();
      const duplicate = [...this.questions.values()].find(
        (q) => q.question_id !== id && q.normalizedContent === normalizedContent,
      );
      if (duplicate) {
        const err = new Error('duplicate key value violates unique constraint');
        err.code = '23505';
        throw err;
      }

      const updated = {
        ...current,
        ...patch,
        content: nextContent,
        normalizedContent,
      };
      this.questions.set(id, updated);
      return { rows: [updated], rowCount: 1 };
    }

    if (sql.startsWith('DELETE FROM question WHERE question_id =')) {
      const [id] = params;
      const row = this.questions.get(id);
      if (!row) {
        return { rows: [], rowCount: 0 };
      }
      this.questions.delete(id);
      return { rows: [row], rowCount: 1 };
    }

    if (sql.startsWith('SELECT') && sql.includes('LOWER(TRIM(content))')) {
      const [normalized, excludeId] = params;
      const match = [...this.questions.values()].find((row) => {
        if (row.normalizedContent !== normalized) return false;
        if (excludeId != null && row.question_id === excludeId) return false;
        return true;
      });
      return { rows: match ? [match] : [], rowCount: match ? 1 : 0 };
    }

    if (sql.startsWith('SELECT') && sql.includes('ORDER BY question_id')) {
      const rows = [...this.questions.values()].sort((a, b) => a.question_id - b.question_id);
      return { rows, rowCount: rows.length };
    }

    if (sql.startsWith('SELECT') && sql.includes('FROM question WHERE question_id =')) {
      const [id] = params;
      const row = this.questions.get(id);
      return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
    }

    if (sql.startsWith('SELECT') && sql.includes('COUNT(*)') && sql.includes('FROM question WHERE rubric_id =')) {
      const [rubricId] = params;
      const count = [...this.questions.values()].filter((q) => q.rubric_id === rubricId).length;
      return { rows: [{ count }], rowCount: 1 };
    }

    if (sql.startsWith('INSERT INTO rubric_criterion')) {
      const [rubricId, criterionName, weightPercent, description] = params;
      this._assertRubricExists(rubricId);
      this._assertCriterionWeight(weightPercent);
      this._assertUniqueCriterionName(rubricId, criterionName);

      const criterionId = this.nextCriterionId++;
      const row = {
        rubric_criterion_id: criterionId,
        rubric_id: rubricId,
        criterion_name: criterionName,
        weight_percent: weightPercent,
        description,
      };
      this.rubricCriteria.set(criterionId, row);
      return { rows: [row], rowCount: 1 };
    }

    if (sql.startsWith('INSERT INTO rubric (')) {
      const [maxScore] = params;
      if (Number(maxScore) <= 0) {
        const err = new Error('new row for relation "rubric" violates check constraint');
        err.code = '23514';
        throw err;
      }
      const rubricId = this.nextRubricId++;
      const row = { rubric_id: rubricId, max_score: maxScore };
      this.rubrics.set(rubricId, row);
      return { rows: [row], rowCount: 1 };
    }

    if (sql.startsWith('UPDATE rubric SET')) {
      const rubricId = params[params.length - 1];
      const current = this.rubrics.get(rubricId);
      if (!current) {
        return { rows: [], rowCount: 0 };
      }
      const patch = this._parseUpdatePatchForTable(sql, 'rubric', params);
      const updated = { ...current, ...patch };
      this.rubrics.set(rubricId, updated);
      return { rows: [updated], rowCount: 1 };
    }

    if (sql.startsWith('DELETE FROM rubric WHERE rubric_id =')) {
      const [rubricId] = params;
      const row = this.rubrics.get(rubricId);
      if (!row) {
        return { rows: [], rowCount: 0 };
      }
      this.rubrics.delete(rubricId);
      for (const [criterionId, criterion] of this.rubricCriteria.entries()) {
        if (criterion.rubric_id === rubricId) {
          this.rubricCriteria.delete(criterionId);
        }
      }
      return { rows: [row], rowCount: 1 };
    }

    if (sql.startsWith('INSERT INTO rubric_criterion')) {
      const [rubricId, criterionName, weightPercent, description] = params;
      this._assertRubricExists(rubricId);
      this._assertCriterionWeight(weightPercent);
      this._assertUniqueCriterionName(rubricId, criterionName);

      const criterionId = this.nextCriterionId++;
      const row = {
        rubric_criterion_id: criterionId,
        rubric_id: rubricId,
        criterion_name: criterionName,
        weight_percent: weightPercent,
        description,
      };
      this.rubricCriteria.set(criterionId, row);
      return { rows: [row], rowCount: 1 };
    }

    if (sql.startsWith('DELETE FROM rubric_criterion WHERE rubric_id =')) {
      const [rubricId] = params;
      for (const [criterionId, criterion] of this.rubricCriteria.entries()) {
        if (criterion.rubric_id === rubricId) {
          this.rubricCriteria.delete(criterionId);
        }
      }
      return { rows: [], rowCount: 0 };
    }

    if (sql.startsWith('SELECT') && sql.includes('FROM rubric_criterion WHERE rubric_criterion_id =')) {
      const [criterionId] = params;
      const row = this.rubricCriteria.get(criterionId);
      return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
    }

    if (sql.startsWith('SELECT') && sql.includes('FROM rubric_criterion WHERE rubric_id =')) {
      const [rubricId] = params;
      const rows = [...this.rubricCriteria.values()]
        .filter((row) => row.rubric_id === rubricId)
        .sort((a, b) => a.rubric_criterion_id - b.rubric_criterion_id);
      return { rows, rowCount: rows.length };
    }

    if (sql.startsWith('SELECT') && sql.includes('FROM rubric_criterion ORDER BY')) {
      const rows = [...this.rubricCriteria.values()].sort((a, b) => {
        if (a.rubric_id !== b.rubric_id) return a.rubric_id - b.rubric_id;
        return a.rubric_criterion_id - b.rubric_criterion_id;
      });
      return { rows, rowCount: rows.length };
    }

    if (sql.startsWith('SELECT') && sql.includes('FROM rubric ORDER BY rubric_id')) {
      const rows = [...this.rubrics.values()].sort((a, b) => a.rubric_id - b.rubric_id);
      return { rows, rowCount: rows.length };
    }

    if (sql.startsWith('SELECT') && sql.includes('FROM rubric WHERE rubric_id =')) {
      const [rubricId] = params;
      const row = this.rubrics.get(rubricId);
      return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
    }

    throw new Error(`Unsupported in-memory SQL: ${sql}`);
  }

  _parseUpdatePatch(sql, params) {
    return this._parseUpdatePatchForTable(sql, 'question', params);
  }

  _parseUpdatePatchForTable(sql, tableName, params) {
    const patch = {};
    const idColumn = tableName === 'question' ? 'question_id' : 'rubric_id';
    const match = sql.match(new RegExp(`UPDATE ${tableName} SET (.+?) WHERE ${idColumn} =`, 'is'));
    if (!match) {
      return patch;
    }

    const parts = match[1].split(',').map((part) => part.trim());
    parts.forEach((part, index) => {
      const column = part.split('=')[0].trim();
      patch[column] = params[index];
    });
    return patch;
  }

  _assertCriterionWeight(weightPercent) {
    if (Number(weightPercent) <= 0 || Number(weightPercent) > 100) {
      const err = new Error('new row for relation "rubric_criterion" violates check constraint');
      err.code = '23514';
      throw err;
    }
  }

  _assertUniqueCriterionName(rubricId, criterionName) {
    const normalized = String(criterionName).trim().toLowerCase();
    const duplicate = [...this.rubricCriteria.values()].find(
      (row) => row.rubric_id === rubricId && row.criterion_name.trim().toLowerCase() === normalized,
    );
    if (duplicate) {
      const err = new Error('duplicate key value violates unique constraint');
      err.code = '23505';
      err.constraint = 'uq_rubric_criterion_name';
      throw err;
    }
  }

  _assertTopicExists(topicId) {
    if (!this.topics.has(topicId)) {
      const err = new Error('insert or update on table "question" violates foreign key constraint');
      err.code = '23503';
      throw err;
    }
  }

  _assertRubricExists(rubricId) {
    if (!this.rubrics.has(rubricId)) {
      const err = new Error('insert or update on table "question" violates foreign key constraint');
      err.code = '23503';
      throw err;
    }
  }
}

class PgDatabase {
  constructor(connectionString) {
    this.pool = new Pool({ connectionString });
  }

  async query(text, params) {
    try {
      return await this.pool.query(text, params);
    } catch (error) {
      throw mapDbError(error);
    }
  }

  async withTransaction(callback) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const tx = {
        query: (text, params) => client.query(text, params),
      };
      const result = await callback(tx);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw mapDbError(error);
    } finally {
      client.release();
    }
  }

  async end() {
    await this.pool.end();
  }
}

function createDatabase(env) {
  if (env.dbMockMode) {
    return new InMemoryDatabase();
  }

  if (!env.databaseUrl) {
    const err = new Error('DATABASE_URL is required when DB_MOCK_MODE is false');
    err.statusCode = 500;
    throw err;
  }

  return new PgDatabase(env.databaseUrl);
}

module.exports = {
  createDatabase,
  InMemoryDatabase,
};
