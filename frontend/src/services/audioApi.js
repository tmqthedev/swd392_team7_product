import { errorMessage } from '../i18n/core';
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
    throw new Error(errorMessage({ code: errorBody.code, status: response.status }));
  }

  return response.json();
}

export function createUploadUrl(payload) {
  return request('/audio/upload-url', { method: 'POST', body: payload });
}

export function startAudioProcessing(sessionId) {
  return request('/audio/process', { method: 'POST', body: { sessionId } });
}

export function getAudioStatus(sessionId) {
  return request(`/audio/status/${sessionId}`);
}

export function getAudioResult(sessionId) {
  return request(`/audio/result/${sessionId}`);
}
