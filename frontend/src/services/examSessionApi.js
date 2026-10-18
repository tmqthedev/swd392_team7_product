import { apiRequest } from './authApi';

// --- exam sessions --------------------------------------------------------
// All /exam-sessions routes are LECTURER-only on the backend (requireAuth +
// requireRole('LECTURER')). apiRequest sends the auth cookie and surfaces the
// backend error shape via the thrown error's `code`/`details`.

// List the lecturer's exam sessions. The backend scopes by the authenticated
// lecturer (own sessions + in-scope subjects) and returns the raw exam_session
// rows.
export function listExamSessions() {
  return apiRequest('/exam-sessions');
}

// Fetch a single session plus its participants ({ ...session, students,
// examiners }).
export function getExamSession(id) {
  return apiRequest(`/exam-sessions/${id}`);
}

// Create a session. Body carries subjectId, topicId, title, language and the
// Nhom-3 config fields plus session_time_limit_sec (lecturer-set total
// interview time); omitted config fields fall back to the backend defaults
// (3/2/120/0/1800s).
export function createExamSession(body) {
  return apiRequest('/exam-sessions', { method: 'POST', body });
}

// Patch a DRAFT session (title, language, config fields).
export function updateExamSession(id, patch) {
  return apiRequest(`/exam-sessions/${id}`, { method: 'PUT', body: patch });
}

// Set the roster from pasted student codes. The backend splits/trims/dedupes
// the string itself. On any invalid row it answers HTTP 422 with
// { ok:false, errors:[{ code, error }] }, which arrives as the thrown error's
// `details` so the page can render per-row messages.
export function setExamStudents(id, codesText) {
  return apiRequest(`/exam-sessions/${id}/students`, {
    method: 'PUT',
    body: { codes: codesText },
  });
}

// Replace the examiner set. Each id must resolve to a LECTURER on the backend.
export function setExamExaminers(id, lecturerIds) {
  return apiRequest(`/exam-sessions/${id}/examiners`, {
    method: 'PUT',
    body: { lecturerIds },
  });
}

// Transition DRAFT -> OPEN (sets opens_at). Fails with 409 when the topic has
// fewer than main_question_count APPROVED questions.
export function openExamSession(id) {
  return apiRequest(`/exam-sessions/${id}/open`, { method: 'POST' });
}

// Transition OPEN -> CLOSED (sets closes_at).
export function closeExamSession(id) {
  return apiRequest(`/exam-sessions/${id}/close`, { method: 'POST' });
}

// Topics are fetched from the shared /topics endpoint and filtered client-side
// by subject_id (there is no per-subject topics route), mirroring materialApi.
export function listTopics() {
  return apiRequest('/topics');
}
