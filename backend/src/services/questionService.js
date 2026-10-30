const ExcelJS = require('exceljs');
const {
  STATUSES,
  assertTransition,
} = require('../domain/questionStatus');
const { cosineSimilarity } = require('../embedding/cosineSimilarity');
const { normalizeQuestionLanguage } = require('../domain/questionLanguage');

// Header row for the question import template (and the columns the parser maps).
const IMPORT_HEADERS = [
  'Content',
  'Topic Code',
  'Bloom',
  'Language',
  'Reference Answer',
  'Key Points',
  'Rubric Code',
];

// Bloom levels accepted by the question model (mirrors the DB CHECK in 007).
const BLOOM_LEVELS = ['REMEMBER', 'UNDERSTAND', 'APPLY', 'ANALYZE'];
const SOURCES = ['MANUAL', 'IMPORT', 'AI'];
const NEAR_DUPLICATE_THRESHOLD = 0.9;

function normalizeContent(content) {
  return String(content).trim().toLowerCase();
}

function validationError(message) {
  const err = new Error(message);
  err.statusCode = 400;
  err.code = 'VALIDATION_ERROR';
  return err;
}

function parseJsonColumn(value) {
  if (value == null) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function toApiQuestion(row) {
  if (!row) return null;
  const rationale = parseJsonColumn(row.rationale);
  const keyPoints = parseJsonColumn(row.key_points);
  return {
    id: row.question_id,
    topicId: row.topic_id,
    rubricId: row.rubric_id ?? null,
    content: row.content,
    status: row.status,
    bloomLevel: row.bloom_level ?? null,
    language: row.language ?? null,
    referenceAnswer: row.reference_answer ?? null,
    keyPoints: Array.isArray(keyPoints) ? keyPoints : [],
    source: row.source ?? null,
    purpose: rationale && rationale.purpose !== undefined ? rationale.purpose : null,
    rationale: rationale ?? null,
    createdBy: row.created_by ?? null,
    reviewedBy: row.reviewed_by ?? null,
    reviewedAt: row.reviewed_at ?? null,
    reviewNote: row.review_note ?? null,
  };
}

class QuestionService {
  constructor({
    repository, embeddingAdapter, rubricRepository, topicRepository,
    db, questionSourceRefRepository, subjectScope,
  } = {}) {
    this.repository = repository;
    this.embeddingAdapter = embeddingAdapter;
    this.rubricRepository = rubricRepository;
    this.topicRepository = topicRepository;
    this.db = db;
    this.questionSourceRefRepository = questionSourceRefRepository;
    this.subjectScope = subjectScope;
  }

  // --- Subject scope -------------------------------------------------------

  async _subjectOfTopic(topicId) {
    if (topicId == null || !this.topicRepository) return null;
    const topic = await this.topicRepository.getById(Number(topicId));
    return topic ? topic.subject_id : null;
  }

  _scopeFor(user) {
    return this.subjectScope ? this.subjectScope.forUser(user) : null;
  }

  async _assertTopicAccess(user, topicId, scope = this._scopeFor(user)) {
    if (!scope) return;
    await scope.assert(await this._subjectOfTopic(topicId));
  }

  async listQuestions(filters = {}, user) {
    const rows = await this.repository.findAllFiltered({
      status: filters.status,
      bloom: filters.bloom,
      source: filters.source,
      topicId: filters.topicId ?? filters.topic_id,
    });
    const scope = this._scopeFor(user);
    if (!scope) return rows.map(toApiQuestion);
    const subjectByTopic = new Map();
    const visible = [];
    for (const row of rows) {
      if (!subjectByTopic.has(row.topic_id)) {
        // eslint-disable-next-line no-await-in-loop
        subjectByTopic.set(row.topic_id, await this._subjectOfTopic(row.topic_id));
      }
      // eslint-disable-next-line no-await-in-loop
      if (await scope.allows(subjectByTopic.get(row.topic_id))) visible.push(row);
    }
    return visible.map(toApiQuestion);
  }

  async getQuestionById(questionId, user) {
    const row = await this.repository.findById(questionId);
    if (!row) {
      throw this._notFound();
    }
    await this._assertTopicAccess(user, row.topic_id);
    return toApiQuestion(row);
  }

  async createQuestion(payload, user) {
    const validated = this._validateCreatePayload(payload);
    await this._assertTopicAccess(user, validated.topicId);
    await this._assertRubricMatchesTopic(validated.rubricId, validated.topicId);
    await this._assertNotDuplicate(validated.content);

    // Compute the embedding and scan same-subject questions for a near
    // duplicate. The warning is NON-blocking: we still persist the question.
    const warnings = [];
    let embedding = null;
    if (this.embeddingAdapter) {
      embedding = await this.embeddingAdapter.embed(validated.content);
      const warning = await this._detectNearDuplicateByTopic(
        validated.topicId,
        embedding,
      );
      if (warning) warnings.push(warning);
    }

    const rationale = this._buildRationale(null, validated.purpose);

    const row = await this.repository.create({
      topicId: validated.topicId,
      rubricId: validated.rubricId,
      content: validated.content,
      status: validated.status,
      bloomLevel: validated.bloomLevel,
      language: normalizeQuestionLanguage(validated.language, validated.content),
      referenceAnswer: validated.referenceAnswer,
      keyPoints: validated.keyPoints,
      source: validated.source,
      rationale,
      embedding,
      createdBy: validated.createdBy,
    });

    return { question: toApiQuestion(row), warnings };
  }

  async updateQuestion(questionId, payload, user) {
    const existing = await this.repository.findById(questionId);
    if (!existing) {
      throw this._notFound();
    }
    const scope = this._scopeFor(user);
    await this._assertTopicAccess(user, existing.topic_id, scope);

    const validated = this._validateUpdatePayload(payload);
    if (validated.patch.topicId !== undefined) {
      await this._assertTopicAccess(user, validated.patch.topicId, scope);
    }
    if (validated.content !== undefined) {
      await this._assertNotDuplicate(validated.content, questionId);
    }
    if (validated.patch.rubricId != null || validated.patch.topicId !== undefined) {
      const rubricId = validated.patch.rubricId !== undefined ? validated.patch.rubricId : existing.rubric_id;
      const topicId = validated.patch.topicId !== undefined ? validated.patch.topicId : existing.topic_id;
      await this._assertRubricMatchesTopic(rubricId, topicId);
    }

    const patch = { ...validated.patch };
    if (patch.status !== undefined) {
      if (patch.status === existing.status) {
        delete patch.status;
      } else if (patch.status !== 'DRAFT' && patch.status !== 'PENDING_REVIEW') {
        throw validationError(`Use the approve/reject/archive endpoints to move a question to ${patch.status}.`);
      } else {
        assertTransition(existing.status, patch.status);
      }
    }
    if (patch.rubricId === null && existing.status === 'APPROVED') {
      const err = new Error('An approved question must keep its rubric.');
      err.statusCode = 409;
      err.code = 'RUBRIC_REQUIRED';
      throw err;
    }
    if (Object.keys(patch).length === 0 && validated.purpose === undefined) {
      return toApiQuestion(existing);
    }
    if (validated.purpose !== undefined) {
      patch.rationale = this._buildRationale(
        parseJsonColumn(existing.rationale),
        validated.purpose,
      );
    }

    const row = await this.repository.update(questionId, patch);
    if (!row) {
      throw this._notFound();
    }
    return toApiQuestion(row);
  }

  async deleteQuestion(questionId, user) {
    const existing = await this.repository.findById(questionId);
    if (!existing) {
      throw this._notFound();
    }
    await this._assertTopicAccess(user, existing.topic_id);
    const row = await this.repository.deleteById(questionId);
    if (!row) {
      throw this._notFound();
    }
    return toApiQuestion(row);
  }

  // --- Lifecycle -----------------------------------------------------------

  async approve(questionId, { reviewedBy, user } = {}) {
    const existing = await this.repository.findById(questionId);
    if (!existing) throw this._notFound();
    await this._assertTopicAccess(user, existing.topic_id);
    assertTransition(existing.status, 'APPROVED');
    if (existing.rubric_id == null) {
      const err = new Error('A rubric must be attached before approving a question.');
      err.statusCode = 409;
      err.code = 'RUBRIC_REQUIRED';
      throw err;
    }
    const row = await this.repository.updateStatusFields(questionId, {
      status: 'APPROVED',
      reviewedBy: reviewedBy ?? null,
      reviewedAt: new Date(),
      reviewNote: null,
    });
    return toApiQuestion(row);
  }

  async reject(questionId, { reason, reviewedBy, user } = {}) {
    const existing = await this.repository.findById(questionId);
    if (!existing) throw this._notFound();
    await this._assertTopicAccess(user, existing.topic_id);
    const trimmedReason = typeof reason === 'string' ? reason.trim() : '';
    if (!trimmedReason) {
      const err = new Error('A rejection reason is required.');
      err.statusCode = 400;
      err.code = 'REASON_REQUIRED';
      throw err;
    }
    assertTransition(existing.status, 'REJECTED');
    const row = await this.repository.updateStatusFields(questionId, {
      status: 'REJECTED',
      reviewedBy: reviewedBy ?? null,
      reviewedAt: new Date(),
      reviewNote: trimmedReason,
    });
    return toApiQuestion(row);
  }

  async archive(questionId, { user } = {}) {
    const existing = await this.repository.findById(questionId);
    if (!existing) throw this._notFound();
    await this._assertTopicAccess(user, existing.topic_id);
    assertTransition(existing.status, 'ARCHIVED');
    const row = await this.repository.updateStatusFields(questionId, {
      status: 'ARCHIVED',
    });
    return toApiQuestion(row);
  }

  /**
   * Approve several questions atomically against ONE shared rubric
   * [Finding 6]. Validation happens up front (every id must exist and be
   * PENDING_REVIEW; the rubric must resolve and belong to each question's
   * subject). The status flips then run inside a single db.withTransaction so
   * the batch is all-or-nothing: any failing transition or rubric check rolls
   * back the whole batch and surfaces the offending id. Does NOT loop
   * this.approve (which runs one update per item without a shared tx).
   */
  async approveBatch({
    questionIds, rubricId, reviewedBy, user,
  } = {}) {
    if (!Array.isArray(questionIds) || questionIds.length === 0) {
      throw validationError('questionIds must be a non-empty array.');
    }
    const ids = [];
    const seen = new Set();
    for (const raw of questionIds) {
      const id = Number(raw);
      if (!Number.isInteger(id) || id <= 0) {
        throw validationError('Each questionId must be a positive integer.');
      }
      if (!seen.has(id)) {
        seen.add(id);
        ids.push(id);
      }
    }

    const parsedRubricId = Number(rubricId);
    if (!Number.isInteger(parsedRubricId) || parsedRubricId <= 0) {
      throw validationError('rubricId must be a positive integer.');
    }
    const rubric = await this.rubricRepository.findById(parsedRubricId);
    if (!rubric) {
      const err = new Error('A rubric must be attached before approving a question.');
      err.statusCode = 409;
      err.code = 'RUBRIC_REQUIRED';
      throw err;
    }

    // --- Up-front validation: every id must exist, be PENDING_REVIEW, and sit
    // in the rubric's subject. A failure here is reported with the offending id
    // BEFORE any write happens.
    const existingRows = [];
    const batchScope = this._scopeFor(user);
    for (const id of ids) {
      // eslint-disable-next-line no-await-in-loop
      const existing = await this.repository.findById(id);
      if (!existing) {
        const err = new Error(`Question ${id} not found.`);
        err.statusCode = 404;
        err.code = 'NOT_FOUND';
        err.questionId = id;
        throw err;
      }
      // eslint-disable-next-line no-await-in-loop
      await this._assertTopicAccess(user, existing.topic_id, batchScope);
      // assertTransition validates PENDING_REVIEW -> APPROVED is legal; any
      // other current status throws 409 INVALID_TRANSITION carrying the id.
      try {
        assertTransition(existing.status, 'APPROVED');
      } catch (err) {
        err.questionId = id;
        throw err;
      }
      // eslint-disable-next-line no-await-in-loop
      await this._assertRubricInSubject(existing, rubric, id);
      existingRows.push(existing);
    }

    // --- Atomic flip: all ids share ONE transaction client. Threading tx to
    // the repo calls means a throw rolls the whole batch back.
    const run = async (tx) => {
      const approved = [];
      for (const existing of existingRows) {
        const id = existing.question_id;
        // eslint-disable-next-line no-await-in-loop
        const row = await this.repository.updateStatusFields(id, {
          status: 'APPROVED',
          rubricId: parsedRubricId,
          reviewedBy: reviewedBy ?? null,
          reviewedAt: new Date(),
          reviewNote: null,
        }, tx);
        approved.push(toApiQuestion(row));
      }
      return approved;
    };

    if (this.db && typeof this.db.withTransaction === 'function') {
      return this.db.withTransaction((tx) => run(tx));
    }
    // No transactional db wired (unit fakes): fall back to the repo defaults.
    return run(this.repository.db || undefined);
  }

  // Return the source citations (material chunks) backing a question so the
  // review UI can show where it came from. 404 when the question is missing.
  async getQuestionSources(questionId, user) {
    const existing = await this.repository.findById(questionId);
    if (!existing) {
      throw this._notFound();
    }
    await this._assertTopicAccess(user, existing.topic_id);
    if (!this.questionSourceRefRepository
      || typeof this.questionSourceRefRepository.listByQuestionWithMaterial !== 'function') {
      return [];
    }
    return this.questionSourceRefRepository.listByQuestionWithMaterial(questionId);
  }

  // The rubric must belong to the question's subject (derived from the topic).
  // When subject info is unavailable (mock DB rows without subject_id), we skip
  // the check rather than reject a valid batch.
  // Create/update: the rubric (if any) must exist and belong to the topic's
  // subject; an unscoped rubric or topic (no subject) is accepted.
  async _assertRubricMatchesTopic(rubricId, topicId) {
    if (rubricId == null || !this.rubricRepository || typeof this.rubricRepository.findById !== 'function') return;
    const rubric = await this.rubricRepository.findById(rubricId);
    if (!rubric) {
      const err = new Error('Rubric not found.');
      err.statusCode = 400;
      err.code = 'VALIDATION_ERROR';
      throw err;
    }
    if (rubric.subject_id == null) return;
    if (!this.topicRepository || typeof this.topicRepository.getById !== 'function') return;
    const topic = await this.topicRepository.getById(topicId);
    if (topic && topic.subject_id != null && Number(topic.subject_id) !== Number(rubric.subject_id)) {
      const err = new Error('The rubric belongs to a different subject than the topic.');
      err.statusCode = 400;
      err.code = 'RUBRIC_SUBJECT_MISMATCH';
      throw err;
    }
  }

  async _assertRubricInSubject(questionRow, rubric, id) {
    if (rubric.subject_id == null) return;
    if (!this.topicRepository || typeof this.topicRepository.getById !== 'function') return;
    const topic = await this.topicRepository.getById(questionRow.topic_id);
    if (!topic || topic.subject_id == null) return;
    if (Number(topic.subject_id) !== Number(rubric.subject_id)) {
      const err = new Error(`Rubric does not belong to the subject of question ${id}.`);
      err.statusCode = 400;
      err.code = 'VALIDATION_ERROR';
      err.questionId = id;
      throw err;
    }
  }

  // --- Excel import --------------------------------------------------------

  /**
   * Parse an XLSX buffer with the columns content / topic code / Bloom /
   * language / reference answer / key points (|-separated) / rubric code and
   * validate the WHOLE file before writing anything. On any invalid row it
   * returns { ok:false, errors:[{row, errors:[...]}] } with ZERO writes.
   * Otherwise every row is inserted with source='IMPORT' status='APPROVED' and
   * it returns { ok:true, created:[...] }. Mirrors adminService.importStudents.
   */
  async importQuestions(buffer, user) {
    let rows;
    try {
      rows = await this._parseQuestionWorkbook(buffer);
    } catch (err) {
      const e = new Error(err.message || 'Could not read the uploaded file.');
      e.statusCode = 400;
      e.code = 'INVALID_FILE';
      throw e;
    }

    if (rows.length === 0) {
      return { ok: false, errors: [{ row: 0, errors: ['The file contains no data rows.'] }] };
    }

    const errors = [];
    const importScope = this._scopeFor(user);
    const seenContent = new Map();
    const resolved = new Map(); // rowNumber -> { topicId, rubricId }

    for (const entry of rows) {
      const rowErrors = [];
      const {
        rowNumber, content, topicCode, bloom, language, rubricCode,
      } = entry;

      if (!content) {
        rowErrors.push('Content is required.');
      } else {
        const normalized = normalizeContent(content);
        if (seenContent.has(normalized)) {
          rowErrors.push(`Duplicate content within the file (also row ${seenContent.get(normalized)}).`);
        } else {
          seenContent.set(normalized, rowNumber);
          const dbDuplicate = await this.repository.findByNormalizedContent(normalized);
          if (dbDuplicate) {
            rowErrors.push('A question with this content already exists.');
          }
        }
      }

      if (!language) {
        rowErrors.push('Language is required.');
      }

      let bloomLevel = null;
      if (bloom) {
        bloomLevel = String(bloom).trim().toUpperCase();
        if (!BLOOM_LEVELS.includes(bloomLevel)) {
          rowErrors.push(`Bloom must be one of: ${BLOOM_LEVELS.join(', ')}.`);
        }
      } else {
        rowErrors.push('Bloom is required.');
      }

      let topicId = null;
      if (!topicCode) {
        rowErrors.push('Topic code is required.');
      } else {
        const topic = await this._resolveTopicByCode(topicCode);
        if (!topic) {
          rowErrors.push(`Topic code "${topicCode}" does not resolve to a topic.`);
        } else if (importScope && !(await importScope.allows(topic.subject_id))) {
          rowErrors.push(`Topic code "${topicCode}" is outside your assigned subjects.`);
        } else {
          topicId = topic.topic_id;
        }
      }

      let rubricId = null;
      if (rubricCode) {
        const rubric = await this._resolveRubricByCode(rubricCode);
        if (!rubric) {
          rowErrors.push(`Rubric code "${rubricCode}" does not resolve to a rubric.`);
        } else {
          rubricId = rubric.rubric_id;
        }
      }

      if (rowErrors.length > 0) {
        errors.push({ row: rowNumber, errors: rowErrors });
      } else {
        resolved.set(rowNumber, {
          topicId, rubricId, bloomLevel, entry,
        });
      }
    }

    if (errors.length > 0) {
      errors.sort((a, b) => a.row - b.row);
      return { ok: false, errors };
    }

    const created = [];
    for (const entry of rows) {
      const info = resolved.get(entry.rowNumber);
      let embedding = null;
      if (this.embeddingAdapter) {
        embedding = await this.embeddingAdapter.embed(entry.content);
      }
      const row = await this.repository.create({
        topicId: info.topicId,
        rubricId: info.rubricId,
        content: entry.content,
        status: 'APPROVED',
        bloomLevel: info.bloomLevel,
        language: normalizeQuestionLanguage(entry.language, entry.content),
        referenceAnswer: entry.referenceAnswer || null,
        keyPoints: entry.keyPoints,
        source: 'IMPORT',
        embedding,
        createdBy: user ? user.id : null,
      });
      created.push(toApiQuestion(row));
    }
    return { ok: true, created };
  }

  // Build an xlsx Buffer with just the header row for the import template.
  async buildImportTemplate() {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Questions');
    sheet.addRow(IMPORT_HEADERS);
    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  async _resolveTopicByCode(code) {
    if (!this.topicRepository || typeof this.topicRepository.findByCode !== 'function') {
      return null;
    }
    return this.topicRepository.findByCode(String(code).trim());
  }

  async _resolveRubricByCode(code) {
    if (!this.rubricRepository || typeof this.rubricRepository.findByCode !== 'function') {
      return null;
    }
    return this.rubricRepository.findByCode(String(code).trim());
  }

  async _parseQuestionWorkbook(buffer) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.worksheets[0];
    if (!sheet) {
      throw new Error('The workbook has no worksheets.');
    }

    const headerRow = sheet.getRow(1);
    const headerMap = {};
    headerRow.eachCell((cell, colNumber) => {
      const label = String(cell.value ?? '').trim().toLowerCase();
      if (!label) return;
      if (label.includes('content')) headerMap.content = colNumber;
      else if (label.includes('topic')) headerMap.topicCode = colNumber;
      else if (label.includes('bloom')) headerMap.bloom = colNumber;
      else if (label.includes('language')) headerMap.language = colNumber;
      else if (label.includes('reference')) headerMap.referenceAnswer = colNumber;
      else if (label.includes('key')) headerMap.keyPoints = colNumber;
      else if (label.includes('rubric')) headerMap.rubricCode = colNumber;
    });

    if (headerMap.content === undefined || headerMap.topicCode === undefined) {
      throw new Error('The header row must contain at least content and topic code columns.');
    }

    const read = (row, colNumber) => {
      if (colNumber === undefined) return '';
      const value = row.getCell(colNumber).value;
      if (value === null || value === undefined) return '';
      if (typeof value === 'object' && value.text !== undefined) return String(value.text).trim();
      return String(value).trim();
    };

    const rows = [];
    for (let r = 2; r <= sheet.rowCount; r += 1) {
      const row = sheet.getRow(r);
      const content = read(row, headerMap.content);
      const topicCode = read(row, headerMap.topicCode);
      const bloom = read(row, headerMap.bloom);
      const language = read(row, headerMap.language);
      const referenceAnswer = read(row, headerMap.referenceAnswer);
      const keyPointsRaw = read(row, headerMap.keyPoints);
      const rubricCode = read(row, headerMap.rubricCode);
      if (!content && !topicCode && !bloom && !language && !keyPointsRaw && !rubricCode) {
        continue; // skip fully blank rows
      }
      const keyPoints = keyPointsRaw
        ? keyPointsRaw.split('|').map((p) => p.trim()).filter((p) => p !== '')
        : [];
      rows.push({
        rowNumber: r,
        content,
        topicCode,
        bloom,
        language,
        referenceAnswer,
        keyPoints,
        rubricCode,
      });
    }
    return rows;
  }

  // --- Internals -----------------------------------------------------------

  _notFound() {
    const err = new Error('Question not found');
    err.statusCode = 404;
    err.code = 'NOT_FOUND';
    return err;
  }

  _buildRationale(existingRationale, purpose) {
    const base = (existingRationale && typeof existingRationale === 'object')
      ? { ...existingRationale }
      : {};
    if (purpose !== undefined) {
      if (purpose === null || purpose === '') {
        delete base.purpose;
      } else {
        base.purpose = purpose;
      }
    }
    return Object.keys(base).length > 0 ? base : null;
  }

  async _detectNearDuplicateByTopic(topicId, embedding) {
    if (!embedding || typeof this.repository.findSubjectEmbeddingsByTopic !== 'function') {
      return null;
    }
    const candidates = await this.repository.findSubjectEmbeddingsByTopic(topicId);
    let best = null;
    for (const candidate of candidates) {
      const similarity = cosineSimilarity(embedding, candidate.embedding);
      if (similarity >= NEAR_DUPLICATE_THRESHOLD
        && (!best || similarity > best.similarity)) {
        best = { questionId: candidate.question_id, similarity };
      }
    }
    if (!best) return null;
    return {
      type: 'NEAR_DUPLICATE',
      questionId: best.questionId,
      similarity: best.similarity,
    };
  }

  _validateCreatePayload(payload) {
    const errors = [];
    const topicId = this._parseRequiredInt(payload?.topicId, 'topicId', errors);
    const content = this._parseRequiredContent(payload?.content, errors);
    const rubricId = this._parseOptionalInt(payload?.rubricId, 'rubricId', errors);
    const bloomLevel = this._parseOptionalBloom(payload?.bloomLevel, errors);
    const language = this._parseOptionalLanguage(payload?.language, errors);
    const keyPoints = this._parseOptionalKeyPoints(payload?.keyPoints, errors);
    const source = this._parseOptionalSource(payload?.source, errors);
    const status = this._resolveCreateStatus(payload, { content, rubricId });

    if (errors.length > 0) {
      throw validationError(errors.join(' '));
    }

    return {
      topicId,
      content,
      rubricId,
      status,
      bloomLevel,
      language,
      referenceAnswer: this._optionalString(payload?.referenceAnswer),
      keyPoints,
      source: source ?? 'MANUAL',
      purpose: payload?.purpose === undefined ? undefined : this._optionalString(payload.purpose),
      createdBy: payload?.createdBy != null ? Number(payload.createdBy) : null,
    };
  }

  // Default status APPROVED when content + topic + rubric are all present,
  // otherwise DRAFT. An explicit, valid status in the payload wins.
  _resolveCreateStatus(payload, { content, rubricId }) {
    if (payload?.status !== undefined && payload.status !== null && String(payload.status).trim() !== '') {
      const status = String(payload.status).trim();
      if (!STATUSES.includes(status)) {
        throw validationError(`Question status must be one of: ${STATUSES.join(', ')}.`);
      }
      // Review outcomes are only reachable through the lifecycle endpoints so
      // the rubric rule and reviewer bookkeeping cannot be skipped.
      if (status !== 'DRAFT' && status !== 'PENDING_REVIEW') {
        throw validationError(`A new question cannot be created as ${status}; use the review endpoints.`);
      }
      return status;
    }
    const complete = content && payload?.topicId != null && rubricId != null;
    return complete ? 'APPROVED' : 'DRAFT';
  }

  _validateUpdatePayload(payload) {
    const errors = [];
    const patch = {};
    let purpose;

    if (payload?.topicId !== undefined) {
      patch.topicId = this._parseRequiredInt(payload.topicId, 'topicId', errors);
    }
    if (payload?.content !== undefined) {
      patch.content = this._parseRequiredContent(payload.content, errors);
    }
    if (payload?.status !== undefined) {
      const status = String(payload.status).trim();
      if (!STATUSES.includes(status)) {
        errors.push(`Question status must be one of: ${STATUSES.join(', ')}.`);
      } else {
        patch.status = status;
      }
    }
    if (payload?.rubricId !== undefined) {
      patch.rubricId = payload.rubricId === null
        ? null
        : this._parseRequiredInt(payload.rubricId, 'rubricId', errors);
    }
    if (payload?.bloomLevel !== undefined) {
      patch.bloomLevel = this._parseOptionalBloom(payload.bloomLevel, errors);
    }
    if (payload?.language !== undefined) {
      patch.language = this._parseOptionalLanguage(payload.language, errors);
    }
    if (payload?.referenceAnswer !== undefined) {
      patch.referenceAnswer = this._optionalString(payload.referenceAnswer);
    }
    if (payload?.keyPoints !== undefined) {
      patch.keyPoints = this._parseOptionalKeyPoints(payload.keyPoints, errors);
    }
    if (payload?.source !== undefined) {
      patch.source = this._parseOptionalSource(payload.source, errors);
    }
    if (payload?.purpose !== undefined) {
      purpose = this._optionalString(payload.purpose);
    }

    if (Object.keys(patch).length === 0 && purpose === undefined) {
      throw validationError('At least one field is required to update a question.');
    }
    if (errors.length > 0) {
      throw validationError(errors.join(' '));
    }

    return { patch, purpose };
  }

  _parseRequiredContent(value, errors) {
    if (value === undefined || value === null || String(value).trim() === '') {
      errors.push('Question content is required.');
      return null;
    }
    return String(value).trim();
  }

  _parseRequiredInt(value, fieldName, errors) {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      errors.push(`${fieldName} must be a positive integer.`);
      return null;
    }
    return parsed;
  }

  _parseOptionalInt(value, fieldName, errors) {
    if (value === undefined || value === null) {
      return null;
    }
    return this._parseRequiredInt(value, fieldName, errors);
  }

  _parseOptionalBloom(value, errors) {
    if (value === undefined || value === null || String(value).trim() === '') {
      return null;
    }
    const bloom = String(value).trim().toUpperCase();
    if (!BLOOM_LEVELS.includes(bloom)) {
      errors.push(`bloomLevel must be one of: ${BLOOM_LEVELS.join(', ')}.`);
      return null;
    }
    return bloom;
  }

  _parseOptionalLanguage(value, errors) {
    if (value === undefined || value === null) {
      return null;
    }
    const language = String(value).trim();
    if (language === '') {
      errors.push('language cannot be empty when provided.');
      return null;
    }
    return language;
  }

  _parseOptionalKeyPoints(value, errors) {
    if (value === undefined || value === null) {
      return null;
    }
    if (!Array.isArray(value)) {
      errors.push('keyPoints must be an array.');
      return null;
    }
    return value.map((item) => String(item).trim()).filter((item) => item !== '');
  }

  _parseOptionalSource(value, errors) {
    if (value === undefined || value === null || String(value).trim() === '') {
      return null;
    }
    const source = String(value).trim().toUpperCase();
    if (!SOURCES.includes(source)) {
      errors.push(`source must be one of: ${SOURCES.join(', ')}.`);
      return null;
    }
    return source;
  }

  _optionalString(value) {
    if (value === undefined || value === null) return null;
    const str = String(value).trim();
    return str === '' ? null : str;
  }

  async _assertNotDuplicate(content, excludeQuestionId = null) {
    const normalized = normalizeContent(content);
    const duplicate = await this.repository.findByNormalizedContent(normalized, excludeQuestionId);
    if (duplicate) {
      const err = new Error('This question already exists.');
      err.statusCode = 409;
      err.code = 'DUPLICATE_QUESTION';
      throw err;
    }
  }
}

module.exports = {
  QuestionService,
  STATUSES,
  BLOOM_LEVELS,
  SOURCES,
  NEAR_DUPLICATE_THRESHOLD,
  IMPORT_HEADERS,
  normalizeContent,
  toApiQuestion,
};
