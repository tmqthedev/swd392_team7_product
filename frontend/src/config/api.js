const defaultLocalBaseUrl = 'http://localhost:3000';

export const apiBaseUrl =
  process.env.REACT_APP_API_BASE_URL ||
  process.env.VITE_API_BASE_URL ||
  defaultLocalBaseUrl;
