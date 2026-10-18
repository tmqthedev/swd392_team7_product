import { apiBaseUrl } from '../config/api';

// Thin fetch wrapper that always sends the httpOnly auth cookies and the
// Origin header (required by the backend CSRF check). Throws an Error whose
// `code` and `details` carry the backend error shape when available.
export async function apiRequest(path, { method = 'GET', body, headers = {}, raw } = {}) {
  const init = {
    method,
    credentials: 'include',
    headers: { ...headers },
  };

  if (raw !== undefined) {
    init.body = raw;
  } else if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }

  const response = await fetch(`${apiBaseUrl}${path}`, init);

  if (response.status === 204) {
    return null;
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data.message || `Request failed: ${response.status}`);
    error.status = response.status;
    error.code = data.code;
    error.details = data;
    throw error;
  }

  return data;
}

// --- auth endpoints -------------------------------------------------------

export function getMe() {
  return apiRequest('/auth/me');
}

export function postLogin(identifier, password) {
  return apiRequest('/auth/login', { method: 'POST', body: { identifier, password } });
}

export function postLogout() {
  return apiRequest('/auth/logout', { method: 'POST' });
}

export function postRefresh() {
  return apiRequest('/auth/refresh', { method: 'POST' });
}

export function postForgotPassword(identifier) {
  return apiRequest('/auth/forgot-password', { method: 'POST', body: { identifier } });
}

export function postResetPassword(token, password) {
  return apiRequest('/auth/reset-password', { method: 'POST', body: { token, password } });
}

export function postSetPassword(token, password) {
  return apiRequest('/auth/set-password', { method: 'POST', body: { token, password } });
}

export function putChangePassword(currentPassword, newPassword) {
  return apiRequest('/auth/password', { method: 'PUT', body: { currentPassword, newPassword } });
}
