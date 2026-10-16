import { apiRequest } from './authApi';

// --- AI question review ---------------------------------------------------

// List the AI-generated questions awaiting review (status PENDING_REVIEW,
// source AI). Returns toApiQuestion rows.
export function listPendingAiQuestions() {
  return apiRequest('/questions?status=PENDING_REVIEW&source=AI');
}

// The source citations backing a question: [{ chunkId, excerpt, materialTitle,
// location, content }].
export function getQuestionSources(id) {
  return apiRequest(`/questions/${id}/sources`);
}

export function approveQuestion(id) {
  return apiRequest(`/questions/${id}/approve`, { method: 'POST' });
}

export function rejectQuestion(id, reason) {
  return apiRequest(`/questions/${id}/reject`, { method: 'POST', body: { reason } });
}

export function archiveQuestion(id) {
  return apiRequest(`/questions/${id}/archive`, { method: 'POST' });
}

export function updateQuestion(id, patch) {
  return apiRequest(`/questions/${id}`, { method: 'PUT', body: patch });
}

// Approve several questions atomically against one shared rubric. body:
// { questionIds[], rubricId }. All-or-nothing on the backend; a failing id
// surfaces as the thrown error (INVALID_TRANSITION / RUBRIC_REQUIRED /
// VALIDATION_ERROR).
export function approveBatch(questionIds, rubricId) {
  return apiRequest('/questions/approve-batch', {
    method: 'POST',
    body: { questionIds, rubricId },
  });
}
