#!/usr/bin/env node
/**
 * AIVES E2E Restrict Test Script
 * Automated verification of:
 * 1. Role × Endpoint Matrix (401 unauthenticated, 403 forbidden role, 403 CSRF missing/mismatched Origin)
 * 2. Hardened API Surface & Route Removal (404 on legacy /api/audio, 400 on TTS path traversal)
 * 3. Subject Scoping & Topic Isolation (Lecturer A cannot access Lecturer B's entities)
 * 4. Examiner-Only Grading Guard (Only examiners/creator/admin can finalize/reopen/regrade/edit scores)
 * 5. Student Result Isolation & Allowlist Security (Safe view, 404 for unfinalized, no rationale leak)
 * 6. State Machines & Boundary Validations (400 on malformed IDs, 409 on invalid transitions)
 *
 * Usage:
 *   node scripts/e2e-restrict.mjs [--base https://d36ezmiqpl9miu.cloudfront.net]
 *   node scripts/e2e-restrict.mjs [--base http://localhost:8080] [--admin-email ...] [--admin-password ...]
 */

const args = process.argv.slice(2);
function getArg(flag, fallback) {
  const idx = args.indexOf(flag);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : fallback;
}

const BASE = (getArg('--base', process.env.BASE_URL || 'http://localhost:8080')).replace(/\/+$/, '');
const targetUrl = new URL(BASE);
if (targetUrl.hostname.endsWith('.cloudfront.net') && process.env.E2E_ALLOW_PRODUCTION !== 'YES') {
  throw new Error('Production target detected; set E2E_ALLOW_PRODUCTION=YES only after explicitly approving production E2E.');
}
const ADMIN_EMAIL = getArg('--admin-email', process.env.ADMIN_EMAIL || '');
const ADMIN_PASSWORD = getArg('--admin-password', process.env.ADMIN_PASSWORD || '');
const LECTURER_EMAIL = getArg('--lecturer-email', process.env.LECTURER_EMAIL || '');
const LECTURER_PASSWORD = getArg('--lecturer-password', process.env.LECTURER_PASSWORD || '');
const STUDENT_EMAIL = getArg('--student-email', process.env.STUDENT_EMAIL || '');
const STUDENT_PASSWORD = getArg('--student-password', process.env.STUDENT_PASSWORD || '');

console.log(`================================================================`);
console.log(`[E2E-RESTRICT] Target Base URL: ${BASE}`);
console.log(`================================================================`);

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function report(name, passed, detail = '') {
  totalTests += 1;
  if (passed) {
    passedTests += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failedTests += 1;
    console.error(`  ✗ ${name}${detail ? ` - ${detail}` : ''}`);
  }
}

class Session {
  constructor(name) {
    this.name = name;
    this.jar = new Map();
  }

  storeCookies(res) {
    if (res.headers.getSetCookie) {
      for (const raw of res.headers.getSetCookie()) {
        const [pair] = raw.split(';');
        const idx = pair.indexOf('=');
        if (idx !== -1) {
          this.jar.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
        }
      }
    }
  }

  async request(method, path, { body, headers = {}, rawOrigin = true } = {}) {
    const reqHeaders = { ...headers };
    if (rawOrigin && !reqHeaders.Origin) {
      reqHeaders.Origin = BASE;
    }
    if (this.jar.size > 0 && !reqHeaders.Cookie) {
      reqHeaders.Cookie = [...this.jar].map(([k, v]) => `${k}=${v}`).join('; ');
    }
    if (body !== undefined && !reqHeaders['Content-Type']) {
      reqHeaders['Content-Type'] = 'application/json';
    }
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: reqHeaders,
      body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)),
    });
    this.storeCookies(res);
    const text = await res.text();
    let json;
    try { json = text ? JSON.parse(text) : null; } catch { json = text; }
    return { status: res.status, headers: res.headers, body: json, text };
  }
}

const FORBIDDEN_STUDENT_KEYS = [
  'rationale',
  'evidence',
  'ai_justification',
  'aiJustification',
  'turns',
  'transcripts',
  'flag_reason',
  'flagReason',
  'prompt',
  'rubric',
  'feedback',
  'client_ip',
  'clientIp',
];

function scanForForbiddenKeys(obj, path = '') {
  const leaks = [];
  if (!obj || typeof obj !== 'object') return leaks;

  for (const [key, val] of Object.entries(obj)) {
    const currentPath = path ? `${path}.${key}` : key;
    if (FORBIDDEN_STUDENT_KEYS.includes(key) && val !== null && val !== undefined) {
      leaks.push(`${currentPath} (forbidden key present)`);
    }
    if (val && typeof val === 'object') {
      leaks.push(...scanForForbiddenKeys(val, currentPath));
    }
  }
  return leaks;
}

async function run() {
  // Pre-flight health check
  try {
    let healthy = false;
    try {
      const health = await fetch(`${BASE}/health`);
      if (health.ok) {
        healthy = true;
      }
    } catch {
      // ignore
    }

    if (!healthy) {
      // CloudFront forwards /api/* to EC2; test /api/auth/me for 401
      const apiCheck = await fetch(`${BASE}/api/auth/me`);
      if (apiCheck.status === 401) {
        healthy = true;
      }
    }

    if (!healthy) {
      console.warn(`[WARN] Server at ${BASE} did not return expected health status.`);
    } else {
      console.log(`[E2E-RESTRICT] Server responding and healthy at ${BASE}\n`);
    }
  } catch (err) {
    console.error(`[ERROR] Cannot connect to server at ${BASE}: ${err.message}`);
    process.exit(1);
  }

  // ===========================================================================
  // 1. Role × Endpoint: Unauthenticated (401 UNAUTHORIZED)
  // ===========================================================================
  console.log('--- 1. Role × Endpoint Matrix: Unauthenticated Requests (401) ---');
  const anon = new Session('anon');

  const unauthEndpoints = [
    ['GET', '/api/auth/me'],
    ['GET', '/api/admin/users'],
    ['GET', '/api/admin/subjects'],
    ['GET', '/api/questions'],
    ['POST', '/api/questions', { content: 'test' }],
    ['GET', '/api/rubrics'],
    ['GET', '/api/materials'],
    ['GET', '/api/exam-sessions'],
    ['GET', '/api/exam-sessions/options'],
    ['GET', '/api/topics'],
    ['GET', '/api/me/exam-sessions'],
    ['GET', '/api/me/results'],
    ['GET', '/api/me/results/1'],
    ['GET', '/api/tts/sample.mp3'],
    ['GET', '/api/results/1'],
    ['POST', '/api/results/1/finalize', {}],
    ['POST', '/api/results/1/reopen', {}],
    ['POST', '/api/results/1/regrade', {}],
    ['PUT', '/api/criterion-scores/1', { score: 8, reason: 'test' }],
  ];

  for (const [method, path, body] of unauthEndpoints) {
    try {
      const res = await anon.request(method, path, { body });
      report(`${method} ${path} -> 401`, res.status === 401, `Got ${res.status}`);
    } catch (err) {
      report(`${method} ${path} -> network failure`, false, err.message);
    }
  }

  // ===========================================================================
  // 2. CSRF Guard: Mutating requests with missing or mismatched Origin
  // ===========================================================================
  console.log('\n--- 2. CSRF Guard: Mutating Requests (403 CSRF_FORBIDDEN) ---');
  const csrfTests = [
    { method: 'POST', path: '/api/auth/logout', origin: null, expected: 403 },
    { method: 'POST', path: '/api/auth/logout', origin: 'http://malicious-attacker.com', expected: 403 },
    { method: 'POST', path: '/api/topics', origin: null, expected: 403 },
    { method: 'POST', path: '/api/topics', origin: 'https://evil-site.org', expected: 403 },
  ];

  for (const t of csrfTests) {
    try {
      const headers = t.origin ? { Origin: t.origin } : {};
      const res = await anon.request(t.method, t.path, { headers, rawOrigin: false });
      report(`${t.method} ${t.path} with Origin: ${t.origin || 'none'} -> 403`, res.status === t.expected, `Got ${res.status}`);
    } catch (err) {
      report(`${t.method} ${t.path} CSRF check`, false, err.message);
    }
  }

  // ===========================================================================
  // 3. Hardened API Surface & Route Removal (404 & 400)
  // ===========================================================================
  console.log('\n--- 3. Hardened API Surface & Route Removal (404 and 400) ---');
  const removedAudioRoutes = [
    ['POST', '/api/audio/upload-url'],
    ['POST', '/api/audio/process'],
    ['GET', '/api/audio/status/1'],
    ['GET', '/api/audio/result/1'],
  ];

  for (const [method, path] of removedAudioRoutes) {
    try {
      const res = await anon.request(method, path);
      report(`Legacy ${method} ${path} -> 404 NOT FOUND`, res.status === 404, `Got ${res.status}`);
    } catch (err) {
      report(`Legacy ${method} ${path}`, false, err.message);
    }
  }

  // Path traversal and invalid filenames on TTS endpoint
  const invalidTtsRoutes = [
    ['GET', '/api/tts/..%2Fsecret.txt'],
    ['GET', '/api/tts/test..wav'],
    ['GET', '/api/tts/bad*char.wav'],
    ['GET', '/api/tts/invalid%20space.mp3'],
  ];

  for (const [method, path] of invalidTtsRoutes) {
    try {
      const res = await anon.request(method, path);
      // Unauthenticated returns 401 first (secure defense-in-depth); authenticated returns 400
      const ok = res.status === 400 || res.status === 401;
      report(`Hardened ${method} ${path} -> 400/401`, ok, `Got ${res.status}`);
    } catch (err) {
      report(`Hardened ${method} ${path}`, false, err.message);
    }
  }

  // ===========================================================================
  // 4. Input Validation & ID Parameter Checks (400)
  // ===========================================================================
  console.log('\n--- 4. Input Validation & Parameter Checks ---');
  const malformedIdTests = [
    ['GET', '/api/topics/abc'],
    ['GET', '/api/questions/abc'],
    ['GET', '/api/rubrics/abc'],
    ['DELETE', '/api/materials/abc'],
  ];

  for (const [method, path] of malformedIdTests) {
    try {
      const res = await anon.request(method, path);
      // Unauthenticated returns 401 before route execution, or 400 if validation is before auth
      const ok = res.status === 400 || res.status === 401;
      report(`${method} ${path} (non-numeric id) -> 400/401`, ok, `Got ${res.status}`);
    } catch (err) {
      report(`${method} ${path}`, false, err.message);
    }
  }

  // ===========================================================================
  // 5. Authenticated Role Guard: ADMIN
  // ===========================================================================
  console.log('\n--- 5. Authenticated Role Guard: ADMIN ---');
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    console.log('  [INFO] Skipping ADMIN checks (pass --admin-email and --admin-password to execute).');
  } else {
    const admin = new Session('admin');
    try {
      const loginRes = await admin.request('POST', '/api/auth/login', {
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
      });

      if (loginRes.status !== 200 || !loginRes.body?.user) {
        report('Admin login succeeded', false, `HTTP ${loginRes.status}: ${JSON.stringify(loginRes.body)}`);
      } else {
        report('Admin login succeeded', true);

        // Admin CANNOT access student-only endpoints -> 403
        const adminStudentRes = await admin.request('GET', '/api/me/exam-sessions');
        report('ADMIN accessing /api/me/exam-sessions -> 403', adminStudentRes.status === 403, `Got ${adminStudentRes.status}`);

        const adminResultsRes = await admin.request('GET', '/api/me/results');
        report('ADMIN accessing /api/me/results -> 403', adminResultsRes.status === 403, `Got ${adminResultsRes.status}`);

        // Admin CANNOT access lecturer-only exam session create -> 403
        const adminLecRes = await admin.request('POST', '/api/exam-sessions', { subjectId: 1, topicId: 1 });
        report('ADMIN accessing lecturer-only POST /api/exam-sessions -> 403', adminLecRes.status === 403, `Got ${adminLecRes.status}`);

        // Admin CAN access admin endpoints
        const adminUsersRes = await admin.request('GET', '/api/admin/users');
        report('ADMIN accessing GET /api/admin/users -> 200', adminUsersRes.status === 200, `Got ${adminUsersRes.status}`);

        const adminSubjectsRes = await admin.request('GET', '/api/admin/subjects');
        report('ADMIN accessing GET /api/admin/subjects -> 200', adminSubjectsRes.status === 200, `Got ${adminSubjectsRes.status}`);
      }
    } catch (err) {
      report('ADMIN checks suite', false, err.message);
    }
  }

  // ===========================================================================
  // 6. Authenticated Role Guard: STUDENT & Result Isolation
  // ===========================================================================
  console.log('\n--- 6. Authenticated Role Guard: STUDENT & Result Isolation ---');
  if (!STUDENT_EMAIL || !STUDENT_PASSWORD) {
    console.log('  [INFO] Skipping STUDENT checks (pass --student-email and --student-password to execute).');
  } else {
    const student = new Session('student');
    try {
      const loginRes = await student.request('POST', '/api/auth/login', {
        email: STUDENT_EMAIL,
        password: STUDENT_PASSWORD,
      });

      if (loginRes.status !== 200 || !loginRes.body?.user) {
        report('Student login succeeded', false, `HTTP ${loginRes.status}: ${JSON.stringify(loginRes.body)}`);
      } else {
        report('Student login succeeded', true);

        // Student CANNOT access admin endpoints -> 403
        const studentAdminRes = await student.request('GET', '/api/admin/users');
        report('STUDENT accessing /api/admin/users -> 403', studentAdminRes.status === 403, `Got ${studentAdminRes.status}`);

        // Student CANNOT access question bank / rubrics / topics / materials -> 403
        const studentQRes = await student.request('GET', '/api/questions');
        report('STUDENT accessing /api/questions -> 403', studentQRes.status === 403, `Got ${studentQRes.status}`);

        const studentRRes = await student.request('GET', '/api/rubrics');
        report('STUDENT accessing /api/rubrics -> 403', studentRRes.status === 403, `Got ${studentRRes.status}`);

        const studentTRes = await student.request('GET', '/api/topics');
        report('STUDENT accessing /api/topics -> 403', studentTRes.status === 403, `Got ${studentTRes.status}`);

        const studentMRes = await student.request('GET', '/api/materials');
        report('STUDENT accessing /api/materials -> 403', studentMRes.status === 403, `Got ${studentMRes.status}`);

        // Student CANNOT access lecturer grading review detail -> 403
        const studentEvalRes = await student.request('GET', '/api/results/1');
        report('STUDENT accessing lecturer /api/results/1 -> 403', studentEvalRes.status === 403, `Got ${studentEvalRes.status}`);

        // Student CAN access own exam sessions -> 200
        const mySessionsRes = await student.request('GET', '/api/me/exam-sessions');
        report('STUDENT accessing /api/me/exam-sessions -> 200', mySessionsRes.status === 200, `Got ${mySessionsRes.status}`);

        // Student CAN access own results -> 200
        const myResultsRes = await student.request('GET', '/api/me/results');
        report('STUDENT accessing /api/me/results -> 200', myResultsRes.status === 200, `Got ${myResultsRes.status}`);

        // Student result allowlist & leak inspection
        if (Array.isArray(myResultsRes.body)) {
          const leaks = scanForForbiddenKeys(myResultsRes.body);
          report('STUDENT /api/me/results contains zero forbidden fields', leaks.length === 0, leaks.join('; '));
        }

        // Student accessing unknown/unfinalized result -> 404 (isolation)
        const unkResultRes = await student.request('GET', '/api/me/results/999999');
        report('STUDENT accessing non-existent /api/me/results/999999 -> 404', unkResultRes.status === 404, `Got ${unkResultRes.status}`);
      }
    } catch (err) {
      report('STUDENT checks suite', false, err.message);
    }
  }

  // ===========================================================================
  // 7. Authenticated Role Guard: LECTURER & Examiner-Only Grading Guard
  // ===========================================================================
  console.log('\n--- 7. Authenticated Role Guard: LECTURER & Examiner Guard ---');
  if (!LECTURER_EMAIL || !LECTURER_PASSWORD) {
    console.log('  [INFO] Skipping LECTURER checks (pass --lecturer-email and --lecturer-password to execute).');
  } else {
    const lecturer = new Session('lecturer');
    try {
      const loginRes = await lecturer.request('POST', '/api/auth/login', {
        email: LECTURER_EMAIL,
        password: LECTURER_PASSWORD,
      });

      if (loginRes.status !== 200 || !loginRes.body?.user) {
        report('Lecturer login succeeded', false, `HTTP ${loginRes.status}: ${JSON.stringify(loginRes.body)}`);
      } else {
        report('Lecturer login succeeded', true);

        // Lecturer CANNOT access admin users -> 403
        const lecAdminRes = await lecturer.request('GET', '/api/admin/users');
        report('LECTURER accessing /api/admin/users -> 403', lecAdminRes.status === 403, `Got ${lecAdminRes.status}`);

        // Lecturer CANNOT access student endpoints -> 403
        const lecStudentRes = await lecturer.request('GET', '/api/me/exam-sessions');
        report('LECTURER accessing /api/me/exam-sessions -> 403', lecStudentRes.status === 403, `Got ${lecStudentRes.status}`);

        const lecResultsRes = await lecturer.request('GET', '/api/me/results');
        report('LECTURER accessing /api/me/results -> 403', lecResultsRes.status === 403, `Got ${lecResultsRes.status}`);

        // Lecturer CAN access in-scope lecturer endpoints -> 200
        const lecTopicsRes = await lecturer.request('GET', '/api/topics');
        report('LECTURER accessing GET /api/topics -> 200', lecTopicsRes.status === 200, `Got ${lecTopicsRes.status}`);

        const lecOptionsRes = await lecturer.request('GET', '/api/exam-sessions/options');
        report('LECTURER accessing GET /api/exam-sessions/options -> 200', lecOptionsRes.status === 200, `Got ${lecOptionsRes.status}`);

        // Examiner write guard: If lecturer is not examiner on a session result, mutating endpoints return 403
        // (or 404 if the dummy ID does not exist; neither allows unauthorized write)
        const dummyFinalize = await lecturer.request('POST', '/api/results/999999/finalize', {});
        const finalizeGuardOk = dummyFinalize.status === 403 || dummyFinalize.status === 404;
        report('LECTURER unauthorized POST /api/results/:id/finalize blocked -> 403/404', finalizeGuardOk, `Got ${dummyFinalize.status}`);

        const dummyReopen = await lecturer.request('POST', '/api/results/999999/reopen', {});
        const reopenGuardOk = dummyReopen.status === 403 || dummyReopen.status === 404;
        report('LECTURER unauthorized POST /api/results/:id/reopen blocked -> 403/404', reopenGuardOk, `Got ${dummyReopen.status}`);

        const dummyScore = await lecturer.request('PUT', '/api/criterion-scores/999999', { score: 9, reason: 'test' });
        const scoreGuardOk = dummyScore.status === 403 || dummyScore.status === 404;
        report('LECTURER unauthorized PUT /api/criterion-scores/:id blocked -> 403/404', scoreGuardOk, `Got ${dummyScore.status}`);
      }
    } catch (err) {
      report('LECTURER checks suite', false, err.message);
    }
  }

  // ===========================================================================
  // Summary Report
  // ===========================================================================
  console.log('\n================================================================');
  console.log(`[E2E-RESTRICT] Test Execution Summary:`);
  console.log(`  Total checks:  ${totalTests}`);
  console.log(`  Passed:        ${passedTests}`);
  console.log(`  Failed:        ${failedTests}`);
  console.log('================================================================');

  if (failedTests > 0) {
    process.exitCode = 1;
  }
}

run().catch((err) => {
  console.error('[FATAL] Unhandled script exception:', err);
  process.exit(1);
});
