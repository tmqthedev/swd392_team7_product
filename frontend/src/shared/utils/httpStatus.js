export const ROLE_HOME = {
  ADMIN: '/admin',
  LECTURER: '/lecturer',
  STUDENT: '/student',
};

/** HTTP status carried by an API error (authApi sets `status`, gradingApi `statusCode`). */
export function httpStatusOf(err) {
  const s = Number(err?.status ?? err?.statusCode);
  return Number.isFinite(s) && s > 0 ? s : null;
}
