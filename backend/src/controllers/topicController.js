function parseId(rawId) {
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) {
    const err = new Error('Topic id must be a positive integer.');
    err.statusCode = 400;
    err.code = 'VALIDATION_ERROR';
    throw err;
  }
  return id;
}

class TopicController {
  constructor(service) {
    this.service = service;
  }
  async create(req, res, next) {
    try {
      const topic = await this.service.createTopic(req.body || {});
      res.status(201).json(topic);
    } catch (err) { next(err); }
  }
  async get(req, res, next) {
    try {
      const topic = await this.service.getTopic(parseId(req.params.id));
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
      const topic = await this.service.updateTopic(parseId(req.params.id), req.body || {});
      res.json(topic);
    } catch (err) { next(err); }
  }
  async delete(req, res, next) {
    try {
      await this.service.deleteTopic(parseId(req.params.id));
      res.status(204).end();
    } catch (err) { next(err); }
  }
}
module.exports = { TopicController };
