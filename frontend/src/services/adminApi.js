import { apiRequest } from './authApi';

// --- users ----------------------------------------------------------------

export function listUsers(role) {
  const query = role ? `?role=${encodeURIComponent(role)}` : '';
  return apiRequest(`/admin/users${query}`);
}

export function createLecturer({ code, email, fullName }) {
  return apiRequest('/admin/users', { method: 'POST', body: { code, email, fullName } });
}

export function updateUser(id, patch) {
  return apiRequest(`/admin/users/${id}`, { method: 'PUT', body: patch });
}

export function lockUser(id) {
  return apiRequest(`/admin/users/${id}/lock`, { method: 'POST' });
}

export function unlockUser(id) {
  return apiRequest(`/admin/users/${id}/unlock`, { method: 'POST' });
}

export function resendSetup(id) {
  return apiRequest(`/admin/users/${id}/resend-setup`, { method: 'POST' });
}

// Sends the raw .xlsx bytes with the spreadsheet content type so the backend
// reads it as a binary body. Returns { ok, created } on success; on an invalid
// file the backend answers 422 with { ok:false, errors:[{row,errors[]}] },
// which arrives as the thrown error's `details`.
export function importStudents(file) {
  return apiRequest('/admin/users/import', {
    method: 'POST',
    raw: file,
    headers: {
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    },
  });
}

// --- subjects --------------------------------------------------------------

export function listSubjects() {
  return apiRequest('/admin/subjects');
}

export function createSubject({ code, name }) {
  return apiRequest('/admin/subjects', { method: 'POST', body: { code, name } });
}

export function updateSubject(id, patch) {
  return apiRequest(`/admin/subjects/${id}`, { method: 'PUT', body: patch });
}

export function deleteSubject(id) {
  return apiRequest(`/admin/subjects/${id}`, { method: 'DELETE' });
}

export function assignLecturers(id, lecturerIds) {
  return apiRequest(`/admin/subjects/${id}/lecturers`, {
    method: 'PUT',
    body: { lecturerIds },
  });
}

export function listSubjectStudents(id) {
  return apiRequest(`/admin/subjects/${id}/students`);
}

export function assignStudents(id, payload) {
  const body = typeof payload === 'string'
    ? { codes: payload }
    : (payload && typeof payload === 'object' ? payload : { studentIds: payload });
  return apiRequest(`/admin/subjects/${id}/students`, {
    method: 'PUT',
    body,
  });
}

// --- exam schedule ---------------------------------------------------------

// Returns { sessions: [...] } with subject/creator info, roster size,
// interview progress and the Lambda warm-up status per session.
export function listExamSchedule({ status, subjectId, from, to } = {}) {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (subjectId) params.set('subjectId', subjectId);
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const query = params.toString();
  return apiRequest(`/admin/exam-schedule${query ? `?${query}` : ''}`);
}

// SCHEDULED -> OPEN. Returns { session }; 409 INVALID_TRANSITION or
// EXAM_WINDOW_PASSED.
export function startExamSession(id) {
  return apiRequest(`/admin/exam-sessions/${id}/start`, { method: 'POST' });
}

// OPEN -> CLOSED. Returns { session }.
export function closeExamSessionAsAdmin(id) {
  return apiRequest(`/admin/exam-sessions/${id}/close`, { method: 'POST' });
}

// Re-run the STT/TTS Lambda warm-up. Returns { warm_status }.
export function warmExamSession(id) {
  return apiRequest(`/admin/exam-sessions/${id}/warm`, { method: 'POST' });
}
