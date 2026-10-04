class EvaluationService {
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
