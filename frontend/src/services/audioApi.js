import { apiBaseUrl } from '../config/api';

async function request(path, { method = 'GET', body } = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.message || `Request failed: ${response.status}`);
  }

  return response.json();
}

export function createUploadUrl(payload) {
  return request('/api/audio/upload-url', { method: 'POST', body: payload });
}

export function startAudioProcessing(sessionId) {
  return request('/api/audio/process', { method: 'POST', body: { sessionId } });
}

export function getAudioStatus(sessionId) {
  return request(`/api/audio/status/${sessionId}`);
}

export function getAudioResult(sessionId) {
  return request(`/api/audio/result/${sessionId}`);
}
