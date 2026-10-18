// All backend routes live under /api. The default is same-origin so the browser
// sends the httpOnly auth cookies without CORS: nginx proxies /api in the
// docker stack, and the Vite dev server proxies it (see vite.config.js).
// Override with VITE_API_BASE_URL (including the /api suffix) to point at a
// different host.
const defaultBaseUrl = '/api';

export const apiBaseUrl =
  import.meta.env.VITE_API_BASE_URL || defaultBaseUrl;
