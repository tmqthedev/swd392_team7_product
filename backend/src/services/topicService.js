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
  constructor({ repository, subjectScope }) {
    this.repository = repository;
    this.subjectScope = subjectScope;
  }

  _scopeFor(user) {
    return this.subjectScope ? this.subjectScope.forUser(user) : null;
  }

  async _assertAccess(user, subjectId) {
    const scope = this._scopeFor(user);
    if (scope) await scope.assert(subjectId);
  }

  async createTopic(data = {}, user) {
    const name = this._parseName(data.name);
    const course_id = data.course_id == null ? null : String(data.course_id).trim();
    // Material upload, RAG generation and exam creation all require the topic
    // to belong to the subject, so a topic is created inside one.
    const subject_id = this._parseSubjectId(data.subject_id ?? data.subjectId);
    await this._assertAccess(user, subject_id);
    return this.repository.create({ name, course_id, subject_id });
  }

  async getTopic(id, user) {
    if (typeof this.repository.getById !== 'function') throw notFound();
    const topic = await this.repository.getById(id);
    if (!topic) throw notFound();
    await this._assertAccess(user, topic.subject_id);
    return topic;
  }

  async listTopics(user) {
    const rows = await this.repository.list();
    const scope = this._scopeFor(user);
    if (!scope) return rows;
    const visible = [];
    for (const row of rows) {
      // eslint-disable-next-line no-await-in-loop
      if (await scope.allows(row.subject_id)) visible.push(row);
    }
    return visible;
  }

  async updateTopic(id, patch = {}, user) {
    if (typeof this.repository.getById === 'function') {
      const topic = await this.repository.getById(id);
      if (!topic) throw notFound();
      await this._assertAccess(user, topic.subject_id);
    }

    const clean = {};
    if (patch.name !== undefined) clean.name = this._parseName(patch.name);
    if (patch.course_id !== undefined) {
      clean.course_id = patch.course_id == null ? null : String(patch.course_id).trim();
    }
    const subjectInput = patch.subject_id !== undefined ? patch.subject_id : patch.subjectId;
    if (subjectInput !== undefined) clean.subject_id = this._parseSubjectId(subjectInput);
    if (Object.keys(clean).length === 0) {
      throw validationError('At least one of name, course_id, subject_id is required to update a topic.');
    }
    if (clean.subject_id !== undefined) {
      await this._assertAccess(user, clean.subject_id);
    }

    const updated = await this.repository.update(id, clean);
    if (!updated) throw notFound();
    return updated;
  }

  async deleteTopic(id, user) {
    if (typeof this.repository.getById === 'function') {
      const topic = await this.repository.getById(id);
      if (!topic) throw notFound();
      await this._assertAccess(user, topic.subject_id);
    }

    const deleted = await this.repository.delete(id);
    if (!deleted) throw notFound();
    return deleted;
  }

  _parseSubjectId(value) {
    if (value == null || value === '') return null;
    const id = Number(value);
    if (!Number.isInteger(id) || id <= 0) {
      throw validationError('subject_id must be a positive integer');
    }
    return id;
  }

  _parseName(value) {
    if (typeof value !== 'string' || value.trim() === '') {
      throw validationError('Topic name is required');
    }
    return value.trim();
  }
}

module.exports = { TopicService };
