function parseId(rawId) {
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) {
    const err = new Error('Evaluation id must be a positive integer.');
    err.statusCode = 400;
    err.code = 'VALIDATION_ERROR';
    throw err;
  }
  return id;
}

class EvaluationController {
  constructor(service) {
    this.service = service;
  }
  async create(req, res, next) {
    try {
      const evaluation = await this.service.createEvaluation(req.body || {});
      res.status(201).json(evaluation);
    } catch (err) { next(err); }
  }
  async get(req, res, next) {
    try {
      const evaluation = await this.service.getEvaluation(parseId(req.params.id));
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
      const evaluation = await this.service.updateEvaluation(parseId(req.params.id), req.body || {});
      res.json(evaluation);
    } catch (err) { next(err); }
  }
  async delete(req, res, next) {
    try {
      await this.service.deleteEvaluation(parseId(req.params.id));
      res.status(204).end();
    } catch (err) { next(err); }
  }
}
module.exports = { EvaluationController };
