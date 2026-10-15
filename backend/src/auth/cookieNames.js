// Single source of truth for auth cookie names. Shared by the controller
// (which sets/clears them) and the auth middleware (which reads them).
const ACCESS_COOKIE = 'aives_access';
const REFRESH_COOKIE = 'aives_refresh';

module.exports = { ACCESS_COOKIE, REFRESH_COOKIE };
