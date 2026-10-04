class TopicService {
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
