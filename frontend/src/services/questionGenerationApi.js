import { apiRequest } from './authApi';

// --- question generation jobs ---------------------------------------------

// Enqueue a generation job. body: { topicId, materialIds[], requestedCount,
// bloomDistribution?, language }. Returns the created job (toApiJob shape:
// { id, topicId, materialIds, requestedCount, bloomDistribution, language,
// status, generatedCount, error }). Validation failures throw with a `code`:
// VALIDATION_ERROR / TOPIC_NOT_FOUND / FORBIDDEN / MATERIALS_NOT_READY /
// BLOOM_SUM_MISMATCH.
export function createGenerationJob(body) {
  return apiRequest('/question-generation-jobs', { method: 'POST', body });
}

// Poll a generation job by id. Status walks PENDING -> RUNNING -> COMPLETED |
// FAILED. On COMPLETED with zero survivors `error` carries the no-groundable
// message.
export function getGenerationJob(id) {
  return apiRequest(`/question-generation-jobs/${id}`);
}
