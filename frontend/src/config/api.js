const defaultLocalBaseUrl = 'http://localhost:3000';

export const apiBaseUrl =
  import.meta.env.VITE_API_BASE_URL || defaultLocalBaseUrl;
