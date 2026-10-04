import os

def write_file(path, content):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)

# TOPIC
topic_repo = """class TopicRepository {
  constructor(db) {
    this.db = db;
  }
  async create({ name, course_id }) {
    const result = await this.db.query(
      'INSERT INTO topic (name, course_id) VALUES ($1, $2) RETURNING *',
      [name, course_id]
    );
    return result.rows[0];
  }
  async getById(id) {
    const result = await this.db.query('SELECT * FROM topic WHERE topic_id = $1', [id]);
    return result.rows[0] || null;
  }
  async list() {
    const result = await this.db.query('SELECT * FROM topic ORDER BY topic_id');
    return result.rows;
  }
  async update(id, patch) {
    const sets = [];
    const values = [];
    let idx = 1;
    for (const [key, val] of Object.entries(patch)) {
      sets.push(`${key} = $${idx++}`);
      values.push(val);
    }
    if (sets.length === 0) return this.getById(id);
    values.push(id);
    const result = await this.db.query(
      `UPDATE topic SET ${sets.join(', ')} WHERE topic_id = $${idx} RETURNING *`,
      values
    );
    return result.rows[0];
  }
  async delete(id) {
    const result = await this.db.query('DELETE FROM topic WHERE topic_id = $1 RETURNING *', [id]);
    return result.rows[0] || null;
  }
}
module.exports = { TopicRepository };
"""
write_file('backend/src/repositories/topicRepository.js', topic_repo)

topic_service = """class TopicService {
  constructor({ repository }) {
    this.repository = repository;
  }
  async createTopic(data) {
    if (!data.name) {
      const err = new Error('Topic name is required');
      err.statusCode = 400;
      throw err;
    }
    return this.repository.create(data);
  }
  async getTopic(id) {
    const topic = await this.repository.getById(id);
    if (!topic) {
      const err = new Error('Topic not found');
      err.statusCode = 404;
      throw err;
    }
    return topic;
  }
  async listTopics() {
    return this.repository.list();
  }
  async updateTopic(id, patch) {
    const updated = await this.repository.update(id, patch);
    if (!updated) {
      const err = new Error('Topic not found');
      err.statusCode = 404;
      throw err;
    }
    return updated;
  }
  async deleteTopic(id) {
    const deleted = await this.repository.delete(id);
    if (!deleted) {
      const err = new Error('Topic not found');
      err.statusCode = 404;
      throw err;
    }
    return deleted;
  }
}
module.exports = { TopicService };
"""
write_file('backend/src/services/topicService.js', topic_service)

topic_controller = """class TopicController {
  constructor(service) {
    this.service = service;
  }
  async create(req, res, next) {
    try {
      const topic = await this.service.createTopic(req.body);
      res.status(201).json(topic);
    } catch (err) { next(err); }
  }
  async get(req, res, next) {
    try {
      const topic = await this.service.getTopic(Number(req.params.id));
      res.json(topic);
    } catch (err) { next(err); }
  }
  async list(req, res, next) {
    try {
      const topics = await this.service.listTopics();
      res.json(topics);
    } catch (err) { next(err); }
  }
  async update(req, res, next) {
    try {
      const topic = await this.service.updateTopic(Number(req.params.id), req.body);
      res.json(topic);
    } catch (err) { next(err); }
  }
  async delete(req, res, next) {
    try {
      await this.service.deleteTopic(Number(req.params.id));
      res.status(204).end();
    } catch (err) { next(err); }
  }
}
module.exports = { TopicController };
"""
write_file('backend/src/controllers/topicController.js', topic_controller)

topic_routes = """const { Router } = require('express');
function createTopicRouter(controller) {
  const router = Router();
  router.post('/', controller.create.bind(controller));
  router.get('/', controller.list.bind(controller));
  router.get('/:id', controller.get.bind(controller));
  router.patch('/:id', controller.update.bind(controller));
  router.delete('/:id', controller.delete.bind(controller));
  return router;
}
module.exports = { createTopicRouter };
"""
write_file('backend/src/routes/topicRoutes.js', topic_routes)

# EVALUATION
eval_repo = """class EvaluationRepository {
  constructor(db) {
    this.db = db;
  }
  async create({ session_id, student_id, question_id, ai_suggested_score, ai_feedback, final_score, lecturer_feedback, status }) {
    const result = await this.db.query(
      'INSERT INTO evaluation (session_id, student_id, question_id, ai_suggested_score, ai_feedback, final_score, lecturer_feedback, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
      [session_id, student_id, question_id, ai_suggested_score, ai_feedback, final_score, lecturer_feedback, status]
    );
    return result.rows[0];
  }
  async getById(id) {
    const result = await this.db.query('SELECT * FROM evaluation WHERE evaluation_id = $1', [id]);
    return result.rows[0] || null;
  }
  async list() {
    const result = await this.db.query('SELECT * FROM evaluation ORDER BY evaluation_id');
    return result.rows;
  }
  async update(id, patch) {
    const sets = [];
    const values = [];
    let idx = 1;
    for (const [key, val] of Object.entries(patch)) {
      sets.push(`${key} = $${idx++}`);
      values.push(val);
    }
    if (sets.length === 0) return this.getById(id);
    values.push(id);
    const result = await this.db.query(
      `UPDATE evaluation SET ${sets.join(', ')} WHERE evaluation_id = $${idx} RETURNING *`,
      values
    );
    return result.rows[0];
  }
  async delete(id) {
    const result = await this.db.query('DELETE FROM evaluation WHERE evaluation_id = $1 RETURNING *', [id]);
    return result.rows[0] || null;
  }
}
module.exports = { EvaluationRepository };
"""
write_file('backend/src/repositories/evaluationRepository.js', eval_repo)

eval_service = """class EvaluationService {
  constructor({ repository }) {
    this.repository = repository;
  }
  async createEvaluation(data) {
    if (!data.session_id || !data.student_id) {
      const err = new Error('session_id and student_id are required');
      err.statusCode = 400;
      throw err;
    }
    return this.repository.create({ status: 'PENDING', ...data });
  }
  async getEvaluation(id) {
    const evaluation = await this.repository.getById(id);
    if (!evaluation) {
      const err = new Error('Evaluation not found');
      err.statusCode = 404;
      throw err;
    }
    return evaluation;
  }
  async listEvaluations() {
    return this.repository.list();
  }
  async updateEvaluation(id, patch) {
    const updated = await this.repository.update(id, patch);
    if (!updated) {
      const err = new Error('Evaluation not found');
      err.statusCode = 404;
      throw err;
    }
    return updated;
  }
  async deleteEvaluation(id) {
    const deleted = await this.repository.delete(id);
    if (!deleted) {
      const err = new Error('Evaluation not found');
      err.statusCode = 404;
      throw err;
    }
    return deleted;
  }
}
module.exports = { EvaluationService };
"""
write_file('backend/src/services/evaluationService.js', eval_service)

eval_controller = """class EvaluationController {
  constructor(service) {
    this.service = service;
  }
  async create(req, res, next) {
    try {
      const evaluation = await this.service.createEvaluation(req.body);
      res.status(201).json(evaluation);
    } catch (err) { next(err); }
  }
  async get(req, res, next) {
    try {
      const evaluation = await this.service.getEvaluation(Number(req.params.id));
      res.json(evaluation);
    } catch (err) { next(err); }
  }
  async list(req, res, next) {
    try {
      const evaluations = await this.service.listEvaluations();
      res.json(evaluations);
    } catch (err) { next(err); }
  }
  async update(req, res, next) {
    try {
      const evaluation = await this.service.updateEvaluation(Number(req.params.id), req.body);
      res.json(evaluation);
    } catch (err) { next(err); }
  }
  async delete(req, res, next) {
    try {
      await this.service.deleteEvaluation(Number(req.params.id));
      res.status(204).end();
    } catch (err) { next(err); }
  }
}
module.exports = { EvaluationController };
"""
write_file('backend/src/controllers/evaluationController.js', eval_controller)

eval_routes = """const { Router } = require('express');
function createEvaluationRouter(controller) {
  const router = Router();
  router.post('/', controller.create.bind(controller));
  router.get('/', controller.list.bind(controller));
  router.get('/:id', controller.get.bind(controller));
  router.patch('/:id', controller.update.bind(controller));
  router.delete('/:id', controller.delete.bind(controller));
  return router;
}
module.exports = { createEvaluationRouter };
"""
write_file('backend/src/routes/evaluationRoutes.js', eval_routes)

print("Generated Topic and Evaluation files.")
