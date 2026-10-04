class TopicController {
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
