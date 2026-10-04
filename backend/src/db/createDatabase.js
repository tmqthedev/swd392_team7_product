const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const { mapDbError } = require('./mapDbError');

class InMemoryDatabase {
  /**
   * @param {object} [options]
   * @param {string} [options.filePath] JSON file used for persistence.
   *   Defaults to $MOCK_DB_FILE or <cwd>/mock-database.json.
   * @param {boolean} [options.persist=true] When false, never reads from or writes to disk
   *   (pure in-memory, used by unit tests).
   */
  constructor({ filePath, persist = true } = {}) {
    this.persist = persist;
    this.dbFilePath = filePath
      || process.env.MOCK_DB_FILE
      || path.join(process.cwd(), 'mock-database.json');
    this._writePromise = Promise.resolve();
    this.topics = new Map([[1, { topic_id: 1, name: 'Default topic' }]]);
    this.rubrics = new Map();
    this.rubricCriteria = new Map();
    this.questions = new Map();
    this.nextQuestionId = 1;
    this.nextRubricId = 1;
    this.nextCriterionId = 1;
        this.evaluations = new Map();
    this.nextEvaluationId = 1;
    this.nextTopicId = 2;
    this._load();
  }

  _load() {
    if (!this.persist) return;
    if (fs.existsSync(this.dbFilePath)) {
      try {
        const data = JSON.parse(fs.readFileSync(this.dbFilePath, 'utf8'));
        if (data.topics) this.topics = new Map(data.topics);
        if (data.rubrics) this.rubrics = new Map(data.rubrics);
        if (data.rubricCriteria) this.rubricCriteria = new Map(data.rubricCriteria);
        if (data.questions) this.questions = new Map(data.questions);
        if (data.nextQuestionId) this.nextQuestionId = data.nextQuestionId;
        if (data.nextRubricId) this.nextRubricId = data.nextRubricId;
                if (data.nextCriterionId) this.nextCriterionId = data.nextCriterionId;
        if (data.evaluations) this.evaluations = new Map(data.evaluations);
        if (data.nextEvaluationId) this.nextEvaluationId = data.nextEvaluationId;
        if (data.nextTopicId) this.nextTopicId = data.nextTopicId;
      } catch (err) {
        console.error('Failed to load mock database:', err);
      }
    }
  }

  _save() {
    if (!this.persist) return this._writePromise;
    const data = {
      topics: Array.from(this.topics.entries()),
      rubrics: Array.from(this.rubrics.entries()),
      rubricCriteria: Array.from(this.rubricCriteria.entries()),
      questions: Array.from(this.questions.entries()),
      nextQuestionId: this.nextQuestionId,
            nextRubricId: this.nextRubricId,
      nextCriterionId: this.nextCriterionId,
      evaluations: Array.from(this.evaluations.entries()),
      nextEvaluationId: this.nextEvaluationId,
      nextTopicId: this.nextTopicId,
    };
    
    this._writePromise = this._writePromise.then(() => 
      fs.promises.writeFile(this.dbFilePath, JSON.stringify(data, null, 2), 'utf8')
    ).catch(err => console.error('Failed to save mock database', err));
    
    return this._writePromise;
  }

  async withTransaction(callback) {
    return callback({
      query: (text, params) => this.query(text, params),
    });
  }

  async query(text, params = []) {
    try {
      const result = await this._dispatch(text, params);
      const upperText = text.toUpperCase().trim();
      if (upperText.startsWith('INSERT') || upperText.startsWith('UPDATE') || upperText.startsWith('DELETE')) {
        await this._save();
      }
      return result;
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

    if (sql.startsWith('INSERT INTO topic')) {
      const [name, courseId] = params;
      const topicId = this.nextTopicId++;
      const row = { topic_id: topicId, name, course_id: courseId };
      this.topics.set(topicId, row);
      return { rows: [row], rowCount: 1 };
    }

    if (sql.startsWith('UPDATE topic SET')) {
      const topicId = params[params.length - 1];
      const current = this.topics.get(topicId);
      if (!current) return { rows: [], rowCount: 0 };
      const patch = this._parseUpdatePatchForTable(sql, 'topic', params);
      const updated = { ...current, ...patch };
      this.topics.set(topicId, updated);
      return { rows: [updated], rowCount: 1 };
    }

    if (sql.startsWith('DELETE FROM topic WHERE topic_id =')) {
      const [topicId] = params;
      const row = this.topics.get(topicId);
      if (!row) return { rows: [], rowCount: 0 };
      // Mirror Postgres: question.topic_id REFERENCES topic (no ON DELETE CASCADE)
      const inUse = [...this.questions.values()].some((q) => q.topic_id === topicId);
      if (inUse) {
        const err = new Error('update or delete on table "topic" violates foreign key constraint on table "question"');
        err.code = '23503';
        throw err;
      }
      this.topics.delete(topicId);
      return { rows: [row], rowCount: 1 };
    }

    if (sql.startsWith('SELECT') && sql.includes('FROM topic ORDER BY topic_id')) {
      const rows = [...this.topics.values()].sort((a, b) => a.topic_id - b.topic_id);
      return { rows, rowCount: rows.length };
    }

    if (sql.startsWith('SELECT') && sql.includes('FROM topic WHERE topic_id =')) {
      const [topicId] = params;
      const row = this.topics.get(topicId);
      return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
    }

    if (sql.startsWith('INSERT INTO evaluation')) {
      const [sessionId, studentId, questionId, aiSuggestedScore, aiFeedback, finalScore, lecturerFeedback, status] = params;
      const evaluationId = this.nextEvaluationId++;
      const row = { 
        evaluation_id: evaluationId, session_id: sessionId, student_id: studentId, 
        question_id: questionId, ai_suggested_score: aiSuggestedScore, ai_feedback: aiFeedback, 
        final_score: finalScore, lecturer_feedback: lecturerFeedback, status: status 
      };
      this.evaluations.set(evaluationId, row);
      return { rows: [row], rowCount: 1 };
    }

    if (sql.startsWith('UPDATE evaluation SET')) {
      const evaluationId = params[params.length - 1];
      const current = this.evaluations.get(evaluationId);
      if (!current) return { rows: [], rowCount: 0 };
      const patch = this._parseUpdatePatchForTable(sql, 'evaluation', params);
      const updated = { ...current, ...patch };
      this.evaluations.set(evaluationId, updated);
      return { rows: [updated], rowCount: 1 };
    }

    if (sql.startsWith('DELETE FROM evaluation WHERE evaluation_id =')) {
      const [evaluationId] = params;
      const row = this.evaluations.get(evaluationId);
      if (!row) return { rows: [], rowCount: 0 };
      this.evaluations.delete(evaluationId);
      return { rows: [row], rowCount: 1 };
    }

    if (sql.startsWith('SELECT') && sql.includes('FROM evaluation ORDER BY evaluation_id')) {
      const rows = [...this.evaluations.values()].sort((a, b) => a.evaluation_id - b.evaluation_id);
      return { rows, rowCount: rows.length };
    }

    if (sql.startsWith('SELECT') && sql.includes('FROM evaluation WHERE evaluation_id =')) {
      const [evaluationId] = params;
      const row = this.evaluations.get(evaluationId);
      return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
    }
    
    throw new Error(`Unsupported in-memory SQL: ${sql}`);
  }

  _parseUpdatePatch(sql, params) {
    return this._parseUpdatePatchForTable(sql, 'question', params);
  }

  _parseUpdatePatchForTable(sql, tableName, params) {
    const patch = {};
    let idColumn = 'id';
    if (tableName === 'question') idColumn = 'question_id';
    else if (tableName === 'rubric') idColumn = 'rubric_id';
    else if (tableName === 'topic') idColumn = 'topic_id';
    else if (tableName === 'evaluation') idColumn = 'evaluation_id';
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
    return new InMemoryDatabase({ filePath: env.mockDbFile });
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
