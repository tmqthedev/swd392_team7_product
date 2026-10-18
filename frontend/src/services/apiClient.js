import { apiBaseUrl } from '../config/apiConfig';

/**
 * HTTP client duy nhất của FE.
 * Base URL lấy từ VITE_API_BASE_URL, không hard-code khi deploy.
 */
export async function apiRequest(path, { method = 'GET', body, token } = {}) {
  const headers = {
    'Content-Type': 'application/json',
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${apiBaseUrl}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    const error = new Error(errorBody.message || `Request failed: ${response.status}`);
    error.status = response.status;
    error.body = errorBody;
    throw error;
  }

  if (response.status === 204) return null;
  return response.json();
}
