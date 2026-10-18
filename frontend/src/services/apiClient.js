import { apiBaseUrl } from '../config/apiConfig';

/**
 * Universal API client supporting both cookie-based auth and Bearer token fallback.
 * Base URL defaults to '/api' (same-origin, proxied by Nginx/Vite).
 */
export async function apiRequest(path, { method = 'GET', body, token, headers = {}, raw } = {}) {
  const reqHeaders = { ...headers };
  if (token) reqHeaders.Authorization = `Bearer ${token}`;

  const init = {
    method,
    credentials: 'include',
    headers: reqHeaders,
  };

  if (raw !== undefined) {
    init.body = raw;
  } else if (body !== undefined) {
    reqHeaders['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }

  // Normalize path to avoid double '/api/api'
  const cleanPath = path.startsWith('/api/') ? path.slice(4) : path;
  const url = cleanPath.startsWith('http') ? cleanPath : `${apiBaseUrl}${cleanPath}`;

  const response = await fetch(url, init);

  if (response.status === 204) return null;

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data.message || `Request failed: ${response.status}`);
    error.status = response.status;
    error.code = data.code;
    error.details = data;
    error.body = data;
    throw error;
  }

  return data;
}

