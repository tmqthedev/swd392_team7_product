#!/usr/bin/env node
// CI smoke test against the running docker compose stack (through nginx).
// Proves auth + Postgres + migrations + background job queue end-to-end.
// No dependencies: Node 20 global fetch only.
//
// Usage: node scripts/ci-smoke.mjs
// Env:   SMOKE_BASE_URL (default http://localhost:8080; must match APP_BASE_URL
//        because the backend's CSRF guard compares the Origin header to it)
//        SMOKE_ADMIN_EMAIL / SMOKE_ADMIN_PASSWORD (the admin created by CI)
//        SMOKE_MAILPIT_URL (default http://localhost:8025)

const BASE = process.env.SMOKE_BASE_URL || 'http://localhost:8080';
const MAILPIT = process.env.SMOKE_MAILPIT_URL || 'http://localhost:8025';
const ADMIN_EMAIL = process.env.SMOKE_ADMIN_EMAIL || 'admin@ci.local';
const ADMIN_PASSWORD = process.env.SMOKE_ADMIN_PASSWORD;
const RUN = Date.now().toString(36);

if (!ADMIN_PASSWORD) {
  console.error('SMOKE_ADMIN_PASSWORD is required');
  process.exit(1);
}

const jar = new Map();

function storeCookies(res) {
  for (const raw of res.headers.getSetCookie()) {
    const [pair] = raw.split(';');
    const idx = pair.indexOf('=');
    jar.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
  }
}

async function api(method, path, body, expected) {
  const headers = { Origin: BASE };
  if (jar.size) headers.Cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  storeCookies(res);
  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  if (res.status !== expected) {
    throw new Error(`${method} ${path} -> ${res.status} (expected ${expected}): ${text}`);
  }
  console.log(`ok  ${method} ${path} -> ${res.status}`);
  return json;
}

async function main() {
  const health = await fetch(`${BASE}/health`);
  if (!health.ok) throw new Error(`/health -> ${health.status}`);
  console.log('ok  GET /health');

  const login = await api('POST', '/api/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASSWORD }, 200);
  if (login.user.role !== 'ADMIN') throw new Error(`login role ${login.user.role}`);
  if (jar.size === 0) throw new Error('login set no cookies');

  const me = await api('GET', '/api/auth/me', undefined, 200);
  if (me.user.email !== ADMIN_EMAIL) throw new Error(`/me returned ${me.user.email}`);

  // CSRF: a state-changing request from a foreign Origin must be rejected.
  const foreign = await fetch(`${BASE}/api/admin/subjects`, {
    method: 'POST',
    headers: {
      Origin: 'http://evil.example',
      'Content-Type': 'application/json',
      Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; '),
    },
    body: JSON.stringify({ code: `X${RUN}`, name: 'csrf' }),
  });
  if (foreign.status !== 403) throw new Error(`foreign Origin -> ${foreign.status} (expected 403)`);
  console.log('ok  foreign Origin rejected -> 403');

  const lecturerEmail = `lecturer-${RUN}@ci.local`;
  const { user: lecturer } = await api('POST', '/api/admin/users', {
    code: `L${RUN}`, email: lecturerEmail, fullName: 'CI Lecturer', role: 'LECTURER',
  }, 201);

  const { subject } = await api('POST', '/api/admin/subjects', { code: `S${RUN}`, name: 'CI Subject' }, 201);
  const subjectId = subject.id;
  const lecturerId = lecturer.id;
  const assigned = await api('PUT', `/api/admin/subjects/${subjectId}/lecturers`, { lecturerIds: [lecturerId] }, 200);
  if (!assigned.lecturerIds.map(Number).includes(Number(lecturerId))) {
    throw new Error(`lecturer not assigned: ${JSON.stringify(assigned)}`);
  }

  const { subjects } = await api('GET', '/api/admin/subjects', undefined, 200);
  if (!subjects.some((s) => s.id === subjectId)) throw new Error('created subject not listed');

  // The account-setup email is sent by the SEND_EMAIL background job, so it
  // reaching Mailpit proves the Postgres job queue worker is running.
  const deadline = Date.now() + 60_000;
  for (;;) {
    const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${lecturerEmail}`)}`);
    const data = res.ok ? await res.json() : { messages_count: 0 };
    if (data.messages_count > 0) break;
    if (Date.now() > deadline) throw new Error('setup email never reached Mailpit (job queue not processing)');
    await new Promise((r) => setTimeout(r, 2000));
  }
  console.log('ok  SEND_EMAIL job delivered to Mailpit');

  console.log('SMOKE PASSED');
}

main().catch((err) => {
  console.error(`SMOKE FAILED: ${err.message}`);
  process.exit(1);
});
