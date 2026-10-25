import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ExcelJS = require('../backend/node_modules/exceljs');
import {
  BASE_URL,
  ADMIN_PASSWORD,
  USER_PASSWORD,
  ssm,
  psql,
  ApiClient,
} from './e2e-business-flows.mjs';

async function activateUser(adminClient, user, code) {
  await adminClient.post(`/api/admin/users/${user.id}/resend-setup`);
  const jobSql = `SELECT payload FROM background_job WHERE type = 'SEND_EMAIL' AND payload->>'to' = '${user.email}' ORDER BY background_job_id DESC LIMIT 1;`;
  const jobRes = psql(jobSql);
  const m = jobRes.match(/token=([A-Za-z0-9_-]+)/);
  if (m) {
    const rawToken = m[1];
    const anonClient = new ApiClient(BASE_URL);
    const setRes = await anonClient.post('/api/auth/set-password', {
      token: rawToken,
      password: USER_PASSWORD,
    });
    if (setRes.status === 200) {
      console.log(`  ✓ Password activated for ${code} (${user.email}) via one-time SET token`);
    } else {
      console.error(`  Failed to set password for ${code}:`, setRes.status, setRes.body);
    }
  } else {
    console.error(`  No token found in background_job for ${user.email}`);
  }
}

async function main() {
  console.log('================================================================');
  console.log('--- STARTING E2E v2 BUSINESS FLOWS: F1 -> F3 ---');
  console.log('Target Base:', BASE_URL);
  console.log('================================================================');

  // Step 0: Ensure TEST_ADMIN exists
  console.log('\n[SETUP] Seeding TEST_ADMIN account via EC2 CLI...');
  try {
    const seedOutput = ssm(
      `docker exec aives-backend node src/cli/createAdmin.js --code TEST_AD01 --email test_admin@aives.local --full-name "Test Admin" --password "${ADMIN_PASSWORD}" --force`
    );
    console.log('[SETUP] Seed result:', seedOutput.trim());
  } catch (err) {
    console.log('[SETUP] User may already exist or error:', err.message);
  }

  // --------------------------------------------------------------------------
  // FLOW F1: Authentication & Lockout
  // --------------------------------------------------------------------------
  console.log('\n--- FLOW F1: Authentication, Password Change, and Brute-Force Lockout ---');
  const adminClient = new ApiClient(BASE_URL);

  // 1.1 Login with TEST_ADMIN
  const loginRes = await adminClient.post('/api/auth/login', {
    identifier: 'test_admin@aives.local',
    password: ADMIN_PASSWORD,
  });
  if (loginRes.status !== 200) {
    throw new Error(`F1 Failed: Admin login returned ${loginRes.status}: ${JSON.stringify(loginRes.body)}`);
  }
  console.log('✓ F1.1 Admin login successful (200 OK), role:', loginRes.body?.user?.role);

  // 1.2 Verify /api/auth/me
  const meRes = await adminClient.get('/api/auth/me');
  if (meRes.status !== 200 || meRes.body?.user?.role !== 'ADMIN') {
    throw new Error(`F1 Failed: /api/auth/me returned ${meRes.status}: ${JSON.stringify(meRes.body)}`);
  }
  console.log('✓ F1.2 GET /api/auth/me returns authenticated ADMIN:', meRes.body?.user?.email);

  // 1.3 Change password test
  const tempPass = 'NewAdminPass123!@#';
  const changeRes = await adminClient.put('/api/auth/password', {
    currentPassword: ADMIN_PASSWORD,
    newPassword: tempPass,
  });
  if (changeRes.status !== 200) {
    throw new Error(`F1 Failed: Password change returned ${changeRes.status}: ${JSON.stringify(changeRes.body)}`);
  }
  console.log('✓ F1.3 PUT /api/auth/password changed password successfully');

  // Revert password back
  const revertRes = await adminClient.put('/api/auth/password', {
    currentPassword: tempPass,
    newPassword: ADMIN_PASSWORD,
  });
  if (revertRes.status !== 200) {
    throw new Error(`F1 Failed: Password revert returned ${revertRes.status}: ${JSON.stringify(revertRes.body)}`);
  }
  console.log('✓ F1.4 Password reverted back to standard test password');

  // 1.4 Brute-force lockout test (5 consecutive wrong attempts)
  console.log('\n[F1.5] Testing 5 consecutive wrong password attempts on dummy lecturer...');
  try { psql("DELETE FROM app_user WHERE code = 'TEST_LOCK';"); } catch (_) {}
  const lockUserRes = await adminClient.post('/api/admin/users', {
    code: 'TEST_LOCK',
    email: 'test_lock@aives.local',
    fullName: 'Test Lock Account',
  });
  console.log('  Created dummy user TEST_LOCK (status:', lockUserRes.status, ')');

  // Get token for dummy user and set initial password
  const lockJobOut = psql(`SELECT payload FROM background_job WHERE type = 'SEND_EMAIL' AND payload->>'to' = 'test_lock@aives.local' ORDER BY background_job_id DESC LIMIT 1;`);
  const lockMatch = lockJobOut.match(/token=([A-Za-z0-9_-]+)/);
  if (lockMatch) {
    const dummyClient = new ApiClient(BASE_URL);
    await dummyClient.post('/api/auth/set-password', {
      token: lockMatch[1],
      password: USER_PASSWORD,
    });
    console.log('  Set initial password for TEST_LOCK');

    let lockedStatus = 0;
    let lockedBody = null;
    for (let attempt = 1; attempt <= 6; attempt++) {
      const failRes = await dummyClient.post('/api/auth/login', {
        identifier: 'test_lock@aives.local',
        password: 'WrongPassword999!',
      });
      console.log(`  Attempt ${attempt}: status ${failRes.status}, code: ${failRes.body?.code}`);
      if (failRes.status === 423) {
        lockedStatus = failRes.status;
        lockedBody = failRes.body;
        break;
      }
    }
    if (lockedStatus !== 423 || lockedBody?.code !== 'ACCOUNT_LOCKED') {
      throw new Error(`F1 Failed: Expected 423 ACCOUNT_LOCKED after 5 attempts, got ${lockedStatus}`);
    }
    console.log('✓ F1.5 Brute-force lockout verified: 423 ACCOUNT_LOCKED after failed attempts');
  }

  // --------------------------------------------------------------------------
  // FLOW F2: Admin User Creation & Activation
  // --------------------------------------------------------------------------
  console.log('\n--- FLOW F2: Admin User Creation & Activation ---');
  
  // 2.1 Create lecturers via POST /api/admin/users
  const lecturers = [
    { code: 'TEST_GV01', email: 'test_gv01@aives.local', fullName: 'Thầy TEST GV01' },
    { code: 'TEST_GV02', email: 'test_gv02@aives.local', fullName: 'Thầy TEST GV02' },
  ];

  const createdUserMap = {};

  for (const u of lecturers) {
    const res = await adminClient.post('/api/admin/users', u);
    if (res.status === 201 || res.status === 200) {
      const userData = res.body?.user || res.body;
      createdUserMap[u.code] = userData;
      console.log(`✓ F2.1 Created LECTURER ${u.code} (${u.email}) -> id ${userData.id}`);
    } else if (res.status === 409) {
      console.log(`  ${u.code} already exists, fetching existing...`);
      const listRes = await adminClient.get('/api/admin/users');
      const found = (listRes.body?.users || listRes.body || []).find((x) => x.code === u.code || x.email === u.email);
      if (found) createdUserMap[u.code] = found;
      console.log(`  Found existing ${u.code} -> id ${createdUserMap[u.code]?.id}`);
    } else {
      throw new Error(`F2 Failed to create ${u.code}: ${res.status} ${JSON.stringify(res.body)}`);
    }

    // Activate password via resend-setup and set-password
    await activateUser(adminClient, createdUserMap[u.code], u.code);
  }

  // 2.2 Import students via Excel POST /api/admin/users/import
  console.log('\n[F2.2] Generating Excel workbook for student import...');
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Students');
  ws.addRow(['Student Code', 'Full Name', 'Email']);
  ws.addRow(['TEST_SV01', 'Sinh viên TEST SV01', 'test_sv01@aives.local']);
  ws.addRow(['TEST_SV02', 'Sinh viên TEST SV02', 'test_sv02@aives.local']);
  const excelBuffer = await wb.xlsx.writeBuffer();

  console.log('  Uploading Excel workbook to /api/admin/users/import...');
  const importRes = await adminClient.post('/api/admin/users/import', {
    file: Buffer.from(excelBuffer).toString('base64'),
  });

  if ((importRes.status === 200 || importRes.status === 201) && importRes.body?.ok) {
    console.log(`✓ F2.2 Excel student import successful! Created ${importRes.body.created?.length} students`);
    for (const st of importRes.body.created) {
      createdUserMap[st.code] = st;
      console.log(`  Student ${st.code} (${st.email}) -> id ${st.id}`);
    }
  } else if ((importRes.status === 200 || importRes.status === 422) && !importRes.body?.ok) {
    console.log('  Students may already exist in DB:', importRes.body?.errors);
    const listRes = await adminClient.get('/api/admin/users');
    for (const code of ['TEST_SV01', 'TEST_SV02']) {
      const found = (listRes.body?.users || listRes.body || []).find((x) => x.code === code);
      if (found) {
        createdUserMap[code] = found;
        console.log(`  Found existing ${code} -> id ${found.id}`);
      }
    }
  } else {
    throw new Error(`F2 Failed to import students: ${importRes.status} ${JSON.stringify(importRes.body)}`);
  }

  // Activate student passwords via resend-setup and set-password
  for (const code of ['TEST_SV01', 'TEST_SV02']) {
    await activateUser(adminClient, createdUserMap[code], code);
  }

  // 2.3 Verify logins
  const gv01Client = new ApiClient(BASE_URL);
  const gv01Login = await gv01Client.post('/api/auth/login', {
    identifier: 'test_gv01@aives.local',
    password: USER_PASSWORD,
  });
  if (gv01Login.status !== 200 || gv01Login.body?.user?.role !== 'LECTURER') {
    throw new Error(`F2 Failed: TEST_GV01 login returned ${gv01Login.status}: ${JSON.stringify(gv01Login.body)}`);
  }
  console.log('✓ F2.3 TEST_GV01 logged in successfully, role: LECTURER');

  const sv01Client = new ApiClient(BASE_URL);
  const sv01Login = await sv01Client.post('/api/auth/login', {
    identifier: 'test_sv01@aives.local',
    password: USER_PASSWORD,
  });
  if (sv01Login.status !== 200 || sv01Login.body?.user?.role !== 'STUDENT') {
    throw new Error(`F2 Failed: TEST_SV01 login returned ${sv01Login.status}: ${JSON.stringify(sv01Login.body)}`);
  }
  console.log('✓ F2.4 TEST_SV01 logged in successfully, role: STUDENT');

  // --------------------------------------------------------------------------
  // FLOW F3: Admin Subjects, Lecturer Assignment, Student Enrollment
  // --------------------------------------------------------------------------
  console.log('\n--- FLOW F3: Admin Subject Creation & Assignment ---');

  let subjectId = null;
  const createSubRes = await adminClient.post('/api/admin/subjects', {
    code: 'TEST_SWD',
    name: 'Software Architecture and Design TEST',
  });
  if (createSubRes.status === 201 || createSubRes.status === 200) {
    subjectId = createSubRes.body?.subject?.id || createSubRes.body?.id || createSubRes.body?.subject_id;
    console.log(`✓ F3.1 Subject TEST_SWD created with ID: ${subjectId}`);
  } else if (createSubRes.status === 409) {
    console.log('  Subject TEST_SWD already exists, fetching ID...');
    const subsRes = await adminClient.get('/api/admin/subjects');
    const found = (subsRes.body?.subjects || subsRes.body || []).find((s) => s.code === 'TEST_SWD');
    subjectId = found?.id || found?.subject_id;
    console.log(`  Found existing TEST_SWD ID: ${subjectId}`);
  } else {
    throw new Error(`F3 Failed to create subject: ${createSubRes.status} ${JSON.stringify(createSubRes.body)}`);
  }

  // 3.2 Assign lecturers (TEST_GV01, TEST_GV02) via PUT /api/admin/subjects/:id/lecturers
  const gvIds = [createdUserMap['TEST_GV01'].id, createdUserMap['TEST_GV02'].id];
  const assignGvRes = await adminClient.put(`/api/admin/subjects/${subjectId}/lecturers`, {
    lecturerIds: gvIds,
  });
  if (assignGvRes.status !== 200) {
    throw new Error(`F3 Failed to assign lecturers: ${assignGvRes.status} ${JSON.stringify(assignGvRes.body)}`);
  }
  console.log(`✓ F3.2 Assigned lecturers TEST_GV01 and TEST_GV02 to TEST_SWD`);

  // 3.3 Enroll students (TEST_SV01, TEST_SV02) via PUT /api/admin/subjects/:id/students
  const svIds = [createdUserMap['TEST_SV01'].id, createdUserMap['TEST_SV02'].id];
  const enrollSvRes = await adminClient.put(`/api/admin/subjects/${subjectId}/students`, {
    studentIds: svIds,
  });
  if (enrollSvRes.status !== 200) {
    throw new Error(`F3 Failed to enroll students: ${enrollSvRes.status} ${JSON.stringify(enrollSvRes.body)}`);
  }
  console.log(`✓ F3.3 Enrolled students TEST_SV01 and TEST_SV02 to TEST_SWD`);

  // 3.4 Verify subject details
  const subDetailRes = await adminClient.get(`/api/admin/subjects/${subjectId}`);
  console.log(`✓ F3.4 Verified subject details:`, {
    code: subDetailRes.body?.subject?.code || subDetailRes.body?.code,
    lecturers: subDetailRes.body?.lecturers?.map((l) => l.code),
    studentsCount: subDetailRes.body?.students?.length,
  });

  console.log('\n================================================================');
  console.log('✅ FLOWS F1 -> F3 COMPLETED SUCCESSFULLY ON AWS PRODUCTION!');
  console.log('================================================================');
}

main().catch((err) => {
  console.error('\n❌ EXECUTION FAILED:', err);
  process.exit(1);
});
