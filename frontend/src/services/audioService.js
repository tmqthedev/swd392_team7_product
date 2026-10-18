import { apiRequest } from './apiClient';

export function createUploadUrl(payload) {
  return apiRequest('/api/audio/upload-url', { method: 'POST', body: payload });
}

export function startAudioProcessing(sessionId) {
  return apiRequest('/api/audio/process', { method: 'POST', body: { sessionId } });
}

export function getAudioStatus(sessionId) {
  return apiRequest(`/api/audio/status/${sessionId}`);
}

export function getAudioResult(sessionId) {
  return apiRequest(`/api/audio/result/${sessionId}`);
}
