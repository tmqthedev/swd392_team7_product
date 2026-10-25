export function loginRequestOptions(email, password) {
  return { body: { email, password } };
}
