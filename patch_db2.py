import re
import os

db_path = os.path.join('backend', 'src', 'db', 'createDatabase.js')

with open(db_path, 'r', encoding='utf-8') as f:
    code = f.read()

# 1. Update constructor
constructor_replacement = """    this.evaluations = new Map();
    this.nextEvaluationId = 1;
    this.nextTopicId = 2;
    this._load();"""
code = re.sub(r'this\._load\(\);\s*', constructor_replacement + '\n  ', code)

# 2. Update _load
load_replacement = """        if (data.nextCriterionId) this.nextCriterionId = data.nextCriterionId;
        if (data.evaluations) this.evaluations = new Map(data.evaluations);
        if (data.nextEvaluationId) this.nextEvaluationId = data.nextEvaluationId;
        if (data.nextTopicId) this.nextTopicId = data.nextTopicId;"""
code = code.replace("if (data.nextCriterionId) this.nextCriterionId = data.nextCriterionId;", load_replacement)

# 3. Update _save
save_replacement = """      nextRubricId: this.nextRubricId,
      nextCriterionId: this.nextCriterionId,
      evaluations: Array.from(this.evaluations.entries()),
      nextEvaluationId: this.nextEvaluationId,
      nextTopicId: this.nextTopicId,"""
code = code.replace("nextRubricId: this.nextRubricId,\n      nextCriterionId: this.nextCriterionId,", save_replacement)

# 4. Update _dispatch
dispatch_addition = """
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
    
    throw new Error(`Unsupported in-memory SQL: ${sql}`);"""

code = code.replace("throw new Error(`Unsupported in-memory SQL: ${sql}`);", dispatch_addition.strip())

# 5. Update _parseUpdatePatchForTable
patch_update = """  _parseUpdatePatchForTable(sql, tableName, params) {
    const patch = {};
    let idColumn = 'id';
    if (tableName === 'question') idColumn = 'question_id';
    else if (tableName === 'rubric') idColumn = 'rubric_id';
    else if (tableName === 'topic') idColumn = 'topic_id';
    else if (tableName === 'evaluation') idColumn = 'evaluation_id';"""

code = re.sub(r"  _parseUpdatePatchForTable\(sql, tableName, params\) \{[\s\S]*?const idColumn = tableName === 'question' \? 'question_id' : 'rubric_id';", patch_update, code)


with open(db_path, 'w', encoding='utf-8') as f:
    f.write(code)

print("Patched createDatabase.js with Topic and Evaluation support.")
