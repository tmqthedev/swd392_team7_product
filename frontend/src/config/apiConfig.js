import { apiBaseUrl } from './api';

export { apiBaseUrl };

const viteEnv = typeof import.meta !== 'undefined' ? import.meta.env : {};

export const wsBaseUrl =
  viteEnv.VITE_WS_BASE_URL ||
  (typeof process !== 'undefined' && process.env.VITE_WS_BASE_URL) ||
  '';

