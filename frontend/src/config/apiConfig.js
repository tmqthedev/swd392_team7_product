const defaultLocalBaseUrl = 'http://localhost:3000';

const viteEnv = typeof import.meta !== 'undefined' ? import.meta.env : {};

export const apiBaseUrl =
  viteEnv.VITE_API_BASE_URL ||
  (typeof process !== 'undefined' && (process.env.VITE_API_BASE_URL || process.env.REACT_APP_API_BASE_URL)) ||
  defaultLocalBaseUrl;

export const wsBaseUrl =
  viteEnv.VITE_WS_BASE_URL ||
  (typeof process !== 'undefined' && process.env.VITE_WS_BASE_URL) ||
  apiBaseUrl.replace(/^http/, 'ws');
