class EvaluationController {
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
