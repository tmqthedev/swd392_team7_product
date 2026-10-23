function parseId(rawId, label = 'id') {
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) {
    const err = new Error(`${label} must be a positive integer.`);
    err.statusCode = 400;
    err.code = 'VALIDATION_ERROR';
    throw err;
  }
  return id;
}

/**
 * Resolve the uploaded Excel buffer from the request. Supports a raw body
 * buffer (when a raw body parser is mounted) or a JSON body carrying the file
 * as base64 under `file` or `data`.
 */
function resolveImportBuffer(req) {
  if (Buffer.isBuffer(req.body) && req.body.length > 0) {
    return req.body;
  }
  const body = req.body || {};
  const base64 = body.file || body.data;
  if (typeof base64 === 'string' && base64.length > 0) {
    // Tolerate a data: URL prefix.
    const commaIdx = base64.indexOf(',');
    const raw = base64.startsWith('data:') && commaIdx !== -1 ? base64.slice(commaIdx + 1) : base64;
    return Buffer.from(raw, 'base64');
  }
  const err = new Error('An Excel file is required (raw body or base64 in `file`).');
  err.statusCode = 400;
  err.code = 'VALIDATION_ERROR';
  throw err;
}

class AdminController {
  // examSessionService backs the Step-12 exam schedule endpoints.
  constructor(service, { examSessionService } = {}) {
    this.service = service;
    this.examSessionService = examSessionService;
  }

  _requireExamSessions() {
    if (!this.examSessionService) {
      const e = new Error('Exam schedule is not available.');
      e.statusCode = 501;
      e.code = 'NOT_IMPLEMENTED';
      throw e;
    }
    return this.examSessionService;
  }

  // --- Exam schedule (Step 12) ---
  async listExamSchedule(req, res, next) {
    try {
      const {
        status, subjectId, from, to,
      } = req.query || {};
      const sessions = await this._requireExamSessions().listScheduleForAdmin({
        user: req.user, status, subjectId, from, to,
      });
      res.json({ sessions });
    } catch (err) { next(err); }
  }

  async startExamSession(req, res, next) {
    try {
      const session = await this._requireExamSessions().startSession({
        user: req.user, examSessionId: parseId(req.params.id),
      });
      res.json({ session });
    } catch (err) { next(err); }
  }

  async closeExamSession(req, res, next) {
    try {
      const session = await this._requireExamSessions().closeSession({
        user: req.user, examSessionId: parseId(req.params.id),
      });
      res.json({ session });
    } catch (err) { next(err); }
  }

  async warmExamSession(req, res, next) {
    try {
      const warmStatus = await this._requireExamSessions().warmSession({
        user: req.user, examSessionId: parseId(req.params.id),
      });
      res.json({ warm_status: warmStatus });
    } catch (err) { next(err); }
  }

  // --- Users ---
  async listUsers(req, res, next) {
    try {
      const role = req.query ? req.query.role : undefined;
      const users = await this.service.listUsers({ role });
      res.json({ users });
    } catch (err) { next(err); }
  }

  async createUser(req, res, next) {
    try {
      const { code, email, fullName, role } = req.body || {};
      // Admins create lecturer accounts here; students arrive via import.
      let user;
      if (role && role !== 'LECTURER') {
        const e = new Error('Only LECTURER accounts can be created here; use the import for students.');
        e.statusCode = 400;
        e.code = 'VALIDATION_ERROR';
        throw e;
      } else {
        user = await this.service.createLecturer({ code, email, fullName });
      }
      res.status(201).json({ user });
    } catch (err) { next(err); }
  }

  async updateUser(req, res, next) {
    try {
      const user = await this.service.updateUser(parseId(req.params.id), req.body || {});
      res.json({ user });
    } catch (err) { next(err); }
  }

  async lockUser(req, res, next) {
    try {
      const user = await this.service.lockUser(parseId(req.params.id));
      res.json({ user });
    } catch (err) { next(err); }
  }

  async unlockUser(req, res, next) {
    try {
      const user = await this.service.unlockUser(parseId(req.params.id));
      res.json({ user });
    } catch (err) { next(err); }
  }

  async resendSetup(req, res, next) {
    try {
      const result = await this.service.resendSetupLink(parseId(req.params.id));
      res.json(result);
    } catch (err) { next(err); }
  }

  async importStudents(req, res, next) {
    try {
      const buffer = resolveImportBuffer(req);
      const result = await this.service.importStudents(buffer);
      if (!result.ok) {
        res.status(422).json(result);
        return;
      }
      res.status(201).json(result);
    } catch (err) { next(err); }
  }

  // --- Subjects ---
  async listSubjects(_req, res, next) {
    try {
      const subjects = await this.service.listSubjects();
      res.json({ subjects });
    } catch (err) { next(err); }
  }

  async createSubject(req, res, next) {
    try {
      const subject = await this.service.createSubject(req.body || {});
      res.status(201).json({ subject });
    } catch (err) { next(err); }
  }

  async updateSubject(req, res, next) {
    try {
      const subject = await this.service.updateSubject(parseId(req.params.id), req.body || {});
      res.json({ subject });
    } catch (err) { next(err); }
  }

  async deleteSubject(req, res, next) {
    try {
      await this.service.deleteSubject(parseId(req.params.id));
      res.status(204).end();
    } catch (err) { next(err); }
  }

  async assignLecturers(req, res, next) {
    try {
      const { lecturerIds } = req.body || {};
      const result = await this.service.assignLecturers(parseId(req.params.id), lecturerIds);
      res.json(result);
    } catch (err) { next(err); }
  }

  async listSubjectStudents(req, res, next) {
    try {
      const result = await this.service.listSubjectStudents(parseId(req.params.id));
      res.json(result);
    } catch (err) { next(err); }
  }

  async assignStudents(req, res, next) {
    try {
      const { codes, studentIds } = req.body || {};
      const result = await this.service.assignStudents(parseId(req.params.id), { codes, studentIds });
      if (!result.ok) {
        res.status(422).json(result);
        return;
      }
      res.json(result);
    } catch (err) { next(err); }
  }
}

module.exports = { AdminController };
