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
