const ExcelJS = require('exceljs');
const { sha256, randomToken } = require('../auth/tokenService');

function adminError(statusCode, code, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.code = code;
  return err;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function toSafeUser(user) {
  if (!user) return null;
  return {
    id: user.app_user_id,
    code: user.code ?? null,
    email: user.email,
    fullName: user.full_name ?? null,
    role: user.role,
    status: user.status,
    mustChangePassword: user.must_change_password === true,
    lockedUntil: user.locked_until ?? null,
    lastLoginAt: user.last_login_at ?? null,
  };
}

function toSubject(subject) {
  if (!subject) return null;
  return {
    id: subject.subject_id,
    code: subject.code,
    name: subject.name,
  };
}

/**
 * Admin domain service: user management, all-or-nothing Excel student import,
 * subject CRUD and lecturer assignment. Plaintext passwords are never placed in
 * email payloads; account setup always goes through a single-use SET token link.
 */
class AdminService {
  constructor({
    appUserRepository,
    subjectRepository,
    passwordTokenRepository,
    backgroundJobRepository,
    env,
    clock,
  }) {
    this.appUserRepository = appUserRepository;
    this.subjectRepository = subjectRepository;
    this.passwordTokenRepository = passwordTokenRepository;
    this.backgroundJobRepository = backgroundJobRepository;
    this.env = env;
    this.clock = clock || (() => new Date());
  }

  _now() {
    return this.clock();
  }

  // --- Users ---------------------------------------------------------------

  async listUsers({ role } = {}) {
    const users = await this.appUserRepository.list({ role });
    return users.map(toSafeUser);
  }

  async createLecturer({ code, email, fullName }) {
    return this._createPasswordlessUser({ code, email, fullName, role: 'LECTURER' });
  }

  async _createPasswordlessUser({ code, email, fullName, role }) {
    const normalizedEmail = typeof email === 'string' ? email.trim() : '';
    if (!normalizedEmail || !EMAIL_RE.test(normalizedEmail)) {
      throw adminError(400, 'VALIDATION_ERROR', 'A valid email is required.');
    }
    const existingByEmail = await this.appUserRepository.findByEmail(normalizedEmail);
    if (existingByEmail) {
      throw adminError(409, 'EMAIL_TAKEN', 'A user with this email already exists.');
    }
    if (code) {
      const existingByCode = await this.appUserRepository.findByCode(code);
      if (existingByCode) {
        throw adminError(409, 'CODE_TAKEN', 'A user with this code already exists.');
      }
    }
    const user = await this.appUserRepository.create({
      code: code ?? null,
      email: normalizedEmail,
      fullName: fullName ?? null,
      passwordHash: null,
      role,
      status: 'ACTIVE',
    });
    await this._enqueueSetupEmail(user);
    return toSafeUser(user);
  }

  async updateUser(id, patch) {
    const user = await this.appUserRepository.findById(id);
    if (!user) throw adminError(404, 'NOT_FOUND', 'User not found.');
    const allowed = {};
    if (patch.fullName !== undefined) allowed.full_name = patch.fullName;
    if (patch.email !== undefined) {
      const normalizedEmail = typeof patch.email === 'string' ? patch.email.trim() : '';
      if (!normalizedEmail || !EMAIL_RE.test(normalizedEmail)) {
        throw adminError(400, 'VALIDATION_ERROR', 'A valid email is required.');
      }
      const other = await this.appUserRepository.findByEmail(normalizedEmail);
      if (other && other.app_user_id !== user.app_user_id) {
        throw adminError(409, 'EMAIL_TAKEN', 'A user with this email already exists.');
      }
      allowed.email = normalizedEmail;
    }
    if (patch.code !== undefined) {
      if (patch.code) {
        const other = await this.appUserRepository.findByCode(patch.code);
        if (other && other.app_user_id !== user.app_user_id) {
          throw adminError(409, 'CODE_TAKEN', 'A user with this code already exists.');
        }
      }
      allowed.code = patch.code;
    }
    const updated = await this.appUserRepository.update(id, allowed);
    return toSafeUser(updated);
  }

  async lockUser(id) {
    const user = await this.appUserRepository.findById(id);
    if (!user) throw adminError(404, 'NOT_FOUND', 'User not found.');
    const updated = await this.appUserRepository.update(id, { status: 'LOCKED' });
    return toSafeUser(updated);
  }

  async unlockUser(id) {
    const user = await this.appUserRepository.findById(id);
    if (!user) throw adminError(404, 'NOT_FOUND', 'User not found.');
    const updated = await this.appUserRepository.update(id, {
      status: 'ACTIVE',
      locked_until: null,
      failed_login_count: 0,
    });
    return toSafeUser(updated);
  }

  async resendSetupLink(id) {
    const user = await this.appUserRepository.findById(id);
    if (!user) throw adminError(404, 'NOT_FOUND', 'User not found.');
    await this._enqueueSetupEmail(user);
    return { ok: true };
  }

  async _enqueueSetupEmail(user) {
    await this.passwordTokenRepository.invalidateActiveForUser(user.app_user_id, 'SET');
    const rawToken = randomToken(32);
    const expiresAt = new Date(this._now().getTime() + this.env.passwordSetTtlHours * 3600 * 1000);
    await this.passwordTokenRepository.create({
      userId: user.app_user_id,
      tokenHash: sha256(rawToken),
      purpose: 'SET',
      expiresAt,
    });
    const base = this.env.appBaseUrl.replace(/\/+$/, '');
    const link = `${base}/set-password?token=${encodeURIComponent(rawToken)}`;
    // NOTE: only the one-time link is sent; no plaintext password is ever
    // included in the email payload.
    await this.backgroundJobRepository.enqueue('SEND_EMAIL', {
      to: user.email,
      template: 'SET_PASSWORD',
      subject: 'Set your AIVES password',
      variables: {
        fullName: user.full_name ?? null,
        link,
        purpose: 'SET',
      },
    });
  }

  // --- Student Excel import -----------------------------------------------

  /**
   * Parse an XLSX buffer with the columns student code / full name / email and
   * validate the WHOLE file before writing anything. If any row is invalid the
   * method returns {ok:false, errors:[{row, errors:[...]}]} and performs zero
   * inserts. Otherwise every student is created and SET emails are enqueued.
   */
  async importStudents(buffer) {
    let rows;
    try {
      rows = await this._parseStudentWorkbook(buffer);
    } catch (err) {
      throw adminError(400, 'INVALID_FILE', err.message || 'Could not read the uploaded file.');
    }

    if (rows.length === 0) {
      return { ok: false, errors: [{ row: 0, errors: ['The file contains no data rows.'] }] };
    }

    const errors = [];
    const seenCodes = new Map();
    const seenEmails = new Map();

    // First pass: per-row shape + in-file duplicate detection.
    for (const entry of rows) {
      const rowErrors = [];
      const { rowNumber, code, fullName, email } = entry;

      if (!code) rowErrors.push('Student code is required.');
      if (!fullName) rowErrors.push('Full name is required.');
      if (!email) {
        rowErrors.push('Email is required.');
      } else if (!EMAIL_RE.test(email)) {
        rowErrors.push('Email is not a valid address.');
      }

      if (code) {
        if (seenCodes.has(code)) {
          rowErrors.push(`Duplicate student code within the file (also row ${seenCodes.get(code)}).`);
        } else {
          seenCodes.set(code, rowNumber);
        }
      }
      if (email) {
        const key = email.toLowerCase();
        if (seenEmails.has(key)) {
          rowErrors.push(`Duplicate email within the file (also row ${seenEmails.get(key)}).`);
        } else {
          seenEmails.set(key, rowNumber);
        }
      }

      if (rowErrors.length > 0) {
        errors.push({ row: rowNumber, errors: rowErrors });
      }
    }

    // Second pass: DB duplicate detection (only for rows that passed shape).
    for (const entry of rows) {
      const { rowNumber, code, email } = entry;
      if (!code || !email || !EMAIL_RE.test(email)) continue;
      const rowErrors = [];
      const byCode = await this.appUserRepository.findByCode(code);
      if (byCode) rowErrors.push('A user with this student code already exists.');
      const byEmail = await this.appUserRepository.findByEmail(email);
      if (byEmail) rowErrors.push('A user with this email already exists.');
      if (rowErrors.length > 0) {
        const existing = errors.find((e) => e.row === rowNumber);
        if (existing) existing.errors.push(...rowErrors);
        else errors.push({ row: rowNumber, errors: rowErrors });
      }
    }

    if (errors.length > 0) {
      errors.sort((a, b) => a.row - b.row);
      return { ok: false, errors };
    }

    // All rows valid: insert every student and enqueue a setup email.
    const created = [];
    for (const entry of rows) {
      const user = await this.appUserRepository.create({
        code: entry.code,
        email: entry.email,
        fullName: entry.fullName,
        passwordHash: null,
        role: 'STUDENT',
        status: 'ACTIVE',
      });
      await this._enqueueSetupEmail(user);
      created.push(toSafeUser(user));
    }
    return { ok: true, created };
  }

  async _parseStudentWorkbook(buffer) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.worksheets[0];
    if (!sheet) {
      throw new Error('The workbook has no worksheets.');
    }

    // Resolve the three expected columns from the header row, tolerating order
    // and label variations (student code / full name / email).
    const headerRow = sheet.getRow(1);
    const headerMap = {};
    headerRow.eachCell((cell, colNumber) => {
      const label = String(cell.value ?? '').trim().toLowerCase();
      if (!label) return;
      if (label.includes('code')) headerMap.code = colNumber;
      else if (label.includes('name')) headerMap.fullName = colNumber;
      else if (label.includes('email') || label.includes('e-mail')) headerMap.email = colNumber;
    });

    if (headerMap.code === undefined || headerMap.fullName === undefined || headerMap.email === undefined) {
      throw new Error('The header row must contain student code, full name, and email columns.');
    }

    const read = (row, colNumber) => {
      const value = row.getCell(colNumber).value;
      if (value === null || value === undefined) return '';
      if (typeof value === 'object' && value.text !== undefined) return String(value.text).trim();
      return String(value).trim();
    };

    const rows = [];
    for (let r = 2; r <= sheet.rowCount; r += 1) {
      const row = sheet.getRow(r);
      const code = read(row, headerMap.code);
      const fullName = read(row, headerMap.fullName);
      const email = read(row, headerMap.email);
      if (!code && !fullName && !email) continue; // skip fully blank rows
      rows.push({ rowNumber: r, code, fullName, email });
    }
    return rows;
  }

  // --- Subjects ------------------------------------------------------------

  async listSubjects() {
    const subjects = await this.subjectRepository.list();
    return subjects.map(toSubject);
  }

  async createSubject({ code, name }) {
    const trimmedCode = typeof code === 'string' ? code.trim() : '';
    const trimmedName = typeof name === 'string' ? name.trim() : '';
    if (!trimmedCode || !trimmedName) {
      throw adminError(400, 'VALIDATION_ERROR', 'Subject code and name are required.');
    }
    const subject = await this.subjectRepository.create({ code: trimmedCode, name: trimmedName });
    return toSubject(subject);
  }

  async updateSubject(id, patch) {
    const subject = await this.subjectRepository.findById(id);
    if (!subject) throw adminError(404, 'NOT_FOUND', 'Subject not found.');
    const allowed = {};
    if (patch.code !== undefined) allowed.code = String(patch.code).trim();
    if (patch.name !== undefined) allowed.name = String(patch.name).trim();
    const updated = await this.subjectRepository.update(id, allowed);
    return toSubject(updated);
  }

  async deleteSubject(id) {
    const removed = await this.subjectRepository.remove(id);
    if (!removed) throw adminError(404, 'NOT_FOUND', 'Subject not found.');
    return { ok: true };
  }

  async assignLecturers(subjectId, lecturerIds) {
    const subject = await this.subjectRepository.findById(subjectId);
    if (!subject) throw adminError(404, 'NOT_FOUND', 'Subject not found.');
    const ids = Array.isArray(lecturerIds) ? lecturerIds.map(Number).filter(Number.isInteger) : [];
    const assigned = await this.subjectRepository.setLecturers(subjectId, ids);
    return { subjectId, lecturerIds: assigned };
  }

  _parseCodes(codes) {
    const raw = Array.isArray(codes) ? codes.join('\n') : String(codes || '');
    const seen = new Set();
    const result = [];
    for (const token of raw.split(/[\n,]+/)) {
      const code = token.trim();
      if (code === '') continue;
      if (seen.has(code)) continue;
      seen.add(code);
      result.push(code);
    }
    return result;
  }

  async listSubjectStudents(subjectId) {
    const subject = await this.subjectRepository.findById(subjectId);
    if (!subject) throw adminError(404, 'NOT_FOUND', 'Subject not found.');
    const rows = await this.subjectRepository.listStudents(subjectId);
    return { subjectId, students: rows.map(toSafeUser) };
  }

  async assignStudents(subjectId, { codes, studentIds } = {}) {
    const subject = await this.subjectRepository.findById(subjectId);
    if (!subject) throw adminError(404, 'NOT_FOUND', 'Subject not found.');

    if (codes !== undefined) {
      const parsed = this._parseCodes(codes);
      const errors = [];
      const resolved = [];
      for (const code of parsed) {
        const row = await this.appUserRepository.findByCode(code);
        if (!row) {
          errors.push({ code, error: 'Unknown student code.' });
        } else if (row.role !== 'STUDENT') {
          errors.push({ code, error: 'Code does not belong to a STUDENT.' });
        } else if (row.status !== 'ACTIVE') {
          errors.push({ code, error: 'Student account is not ACTIVE.' });
        } else {
          resolved.push(row);
        }
      }
      if (errors.length > 0) {
        return { ok: false, errors };
      }
      const assigned = await this.subjectRepository.setStudents(
        subjectId,
        resolved.map((r) => r.app_user_id),
      );
      return {
        ok: true,
        subjectId,
        studentIds: assigned,
        students: resolved.map(toSafeUser),
      };
    }

    const ids = Array.isArray(studentIds)
      ? Array.from(new Set(studentIds.map(Number).filter((n) => Number.isInteger(n) && n > 0)))
      : [];
    const errors = [];
    const resolved = [];
    for (const id of ids) {
      const row = await this.appUserRepository.findById(id);
      if (!row) {
        errors.push({ id, error: `Unknown student ID ${id}.` });
      } else if (row.role !== 'STUDENT') {
        errors.push({ id, code: row.code, error: 'User is not a STUDENT.' });
      } else if (row.status !== 'ACTIVE') {
        errors.push({ id, code: row.code, error: 'Student account is not ACTIVE.' });
      } else {
        resolved.push(row);
      }
    }
    if (errors.length > 0) {
      return { ok: false, errors };
    }
    const assigned = await this.subjectRepository.setStudents(subjectId, ids);
    return {
      ok: true,
      subjectId,
      studentIds: assigned,
      students: resolved.map(toSafeUser),
    };
  }
}

module.exports = { AdminService, toSafeUser, toSubject };
