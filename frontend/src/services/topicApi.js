import { apiRequest } from './authApi';

// List topics accessible to the current user (scoped by assigned subjects for LECTURER).
export function listTopics() {
  return apiRequest('/topics');
}

// Fetch a single topic by id.
export function getTopic(id) {
  return apiRequest(`/topics/${id}`);
}

// Create a new topic ({ name, subject_id, course_id }).
export function createTopic(body) {
  return apiRequest('/topics', { method: 'POST', body });
}

// Update a topic ({ name, subject_id, course_id }).
export function updateTopic(id, patch) {
  return apiRequest(`/topics/${id}`, { method: 'PATCH', body: patch });
}

// Delete a topic by id.
export function deleteTopic(id) {
  return apiRequest(`/topics/${id}`, { method: 'DELETE' });
}
