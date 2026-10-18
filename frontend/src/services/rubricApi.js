import { apiRequest } from './authApi';

// --- rubrics --------------------------------------------------------------

export function listRubrics() {
  return apiRequest('/rubrics');
}

export function getRubric(id) {
  return apiRequest(`/rubrics/${id}`);
}

// body carries criteria[], each with a nested performanceLevels[] array.
export function createRubric(body) {
  return apiRequest('/rubrics', { method: 'POST', body });
}

export function updateRubric(id, patch) {
  return apiRequest(`/rubrics/${id}`, { method: 'PUT', body: patch });
}

export function deleteRubric(id) {
  return apiRequest(`/rubrics/${id}`, { method: 'DELETE' });
}

// Returns the cloned rubric (version + 1, isLocked false) with its criteria
// and performance levels copied.
export function cloneRubric(id) {
  return apiRequest(`/rubrics/${id}/clone`, { method: 'POST' });
}
