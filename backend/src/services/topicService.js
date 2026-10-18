function validationError(message) {
  const err = new Error(message);
  err.statusCode = 400;
  err.code = 'VALIDATION_ERROR';
  return err;
}

function notFound() {
  const err = new Error('Topic not found');
  err.statusCode = 404;
  return err;
}

class TopicService {
  constructor({ repository }) {
    this.repository = repository;
  }

  async createTopic(data = {}) {
    const name = this._parseName(data.name);
    const course_id = data.course_id == null ? null : String(data.course_id).trim();
    return this.repository.create({ name, course_id });
  }

  async getTopic(id) {
    const topic = await this.repository.getById(id);
    if (!topic) throw notFound();
    return topic;
  }

  async listTopics() {
    return this.repository.list();
  }

  async updateTopic(id, patch = {}) {
    const clean = {};
    if (patch.name !== undefined) clean.name = this._parseName(patch.name);
    if (patch.course_id !== undefined) {
      clean.course_id = patch.course_id == null ? null : String(patch.course_id).trim();
    }
    if (Object.keys(clean).length === 0) {
      throw validationError('At least one of name, course_id is required to update a topic.');
    }

    const updated = await this.repository.update(id, clean);
    if (!updated) throw notFound();
    return updated;
  }

  async deleteTopic(id) {
    const deleted = await this.repository.delete(id);
    if (!deleted) throw notFound();
    return deleted;
  }

  _parseName(value) {
    if (typeof value !== 'string' || value.trim() === '') {
      throw validationError('Topic name is required');
    }
    return value.trim();
  }
}

module.exports = { TopicService };
