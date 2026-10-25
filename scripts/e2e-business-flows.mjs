/**
 * End-to-End Business Flow Automation Script (G2 & G4) for AWS Production
 *
 * Runs all business flows F1 -> F10 against CloudFront with real backend:
 *   - F1: Auth (login, change password, brute-force lockout)
 *   - F2: Admin Users (create lecturer, students, setup tokens)
 *   - F3: Admin Subjects (create subject, assign lecturer, enroll students)
 *   - F4: Lecturer Topics (create topic, subject scope, update)
 *   - F5: Materials (PDF upload, verify INGEST_MATERIAL -> READY)
 *   - F6: Questions & Rubrics (rubric order_index, topicId filtering, approve question)
 *   - F7: Exam Session Setup (create session, roster, examiners, submit/withdraw/re-submit)
 *   - F8: Admin Schedule & Start (start exam -> OPEN, lock rubric)
 *   - F9: Student Viva Voice Interview (start interview, submit answer with speech signals, pause_count persistence)
 *   - F10: Grading & Review (examiner-only write guard, adjust score with reason, finalize, student results safe view)
 *   - Overdue Sweep: Abandoned interview swept by EXPIRE_INTERVIEWS
 *   - G4: Zero-residue cleanup and 29-table baseline verification
 */
import { execFileSync } from 'node:child_process';

const BASE_URL = process.env.BASE_URL || 'https://d36ezmiqpl9miu.cloudfront.net';
const ADMIN_PASSWORD = 'TestAdminPass123!@#';
const USER_PASSWORD = 'TestUserPass123!@#';

function ssm(cmd) {
  return execFileSync('node', ['scripts/aws-ssm.js', cmd], { encoding: 'utf8' });
}

function psql(sql) {
  const sanitized = sql.replace(/\n/g, ' ').replace(/"/g, '\\"');
  return ssm(`docker exec aives-postgres psql -U aives -d aives -t -c "${sanitized}"`);
}

function extractCookies(res, jar) {
  const raw = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get('set-cookie')].filter(Boolean);
  for (const c of raw) {
    const parts = c.split(';')[0].split('=');
    const name = parts[0].trim();
    const val = parts.slice(1).join('=').trim();
    jar.set(name, val);
  }
}

function cookieHeader(jar) {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

class ApiClient {
  constructor(base = BASE_URL) {
    this.base = base;
    this.jar = new Map();
  }

  async request(method, path, { body, headers = {} } = {}) {
    const reqHeaders = {
      origin: this.base,
      ...headers,
    };
    if (this.jar.size > 0) {
      reqHeaders['cookie'] = cookieHeader(this.jar);
    }
    let reqBody = body;
    if (body && typeof body === 'object' && !(body instanceof Buffer) && !(body instanceof FormData)) {
      reqHeaders['content-type'] = 'application/json';
      reqBody = JSON.stringify(body);
    }

    const res = await fetch(`${this.base}${path}`, {
      method,
      headers: reqHeaders,
      body: reqBody,
    });

    extractCookies(res, this.jar);

    let resBody = null;
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      try { resBody = await res.json(); } catch (_) {}
    } else {
      try { resBody = await res.text(); } catch (_) {}
    }

    return { status: res.status, body: resBody, headers: res.headers };
  }

  get(path, opts) { return this.request('GET', path, opts); }
  post(path, body, opts) { return this.request('POST', path, { body, ...opts }); }
  put(path, body, opts) { return this.request('PUT', path, { body, ...opts }); }
  patch(path, body, opts) { return this.request('PATCH', path, { body, ...opts }); }
  delete(path, opts) { return this.request('DELETE', path, opts); }
}

export {
  BASE_URL,
  ADMIN_PASSWORD,
  USER_PASSWORD,
  ssm,
  psql,
  cookieHeader,
  ApiClient,
};
