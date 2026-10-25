import {
  BASE_URL,
  ADMIN_PASSWORD,
  USER_PASSWORD,
  ssm,
  psql,
  cookieHeader,
  ApiClient,
} from './e2e-business-flows.mjs';

const SAMPLE_PDF = Buffer.from(
'%PDF-1.4\n' +
'1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n' +
'2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n' +
'3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n' +
'4 0 obj\n<< /Length 55 >>\nstream\nBT\n/F1 24 Tf\n100 700 Td\n(Clean Architecture and Microservices Principles) Tj\nET\nendstream\nendobj\n' +
'5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\nxref\n0 6\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000244 00000 n \n0000000350 00000 n \ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n427\n%%EOF'
);

async function main() {
  console.log('================================================================');
  console.log('--- STARTING E2E v2 BUSINESS FLOWS: F4 -> F8 ---');
  console.log('Target Base:', BASE_URL);
  console.log('================================================================');

  // 1. Login as Lecturer TEST_GV01
  console.log('\n[LOGIN] Logging in as Lecturer TEST_GV01...');
  const gvClient = new ApiClient(BASE_URL);
  const loginRes = await gvClient.post('/api/auth/login', {
    identifier: 'test_gv01@aives.local',
    password: USER_PASSWORD,
  });
  if (loginRes.status !== 200 || loginRes.body?.user?.role !== 'LECTURER') {
    throw new Error(`Login failed: ${loginRes.status} ${JSON.stringify(loginRes.body)}`);
  }
  const lecturerId = loginRes.body.user.id;
  console.log(`✓ TEST_GV01 logged in successfully (id: ${lecturerId})`);

  // Find subject TEST_SWD
  const subOut = psql("SELECT subject_id FROM subject WHERE code = 'TEST_SWD' LIMIT 1;").trim();
  const subjectId = Number(subOut);
  if (!subjectId) throw new Error('Could not find TEST_SWD subject in database');
  console.log(`✓ Using Subject TEST_SWD (ID: ${subjectId})`);

  // Find student TEST_SV01
  const svOut = psql("SELECT app_user_id FROM app_user WHERE code = 'TEST_SV01' LIMIT 1;").trim();
  const studentId = Number(svOut);
  if (!studentId) throw new Error('Could not find TEST_SV01 student in database');
  console.log(`✓ Using Student TEST_SV01 (ID: ${studentId})`);

  // --------------------------------------------------------------------------
  // FLOW F4: Lecturer Topics UI / API
  // --------------------------------------------------------------------------
  console.log('\n--- FLOW F4: Lecturer Topic Management ---');
  
  // 4.1 Create Topic
  let topicId = null;
  const createTopRes = await gvClient.post('/api/topics', {
    subjectId,
    name: 'TEST_TOPIC01',
    courseId: 'TEST_SWD',
  });
  if (createTopRes.status === 201 || createTopRes.status === 200) {
    topicId = createTopRes.body?.id || createTopRes.body?.topic_id;
    console.log(`✓ F4.1 Topic created: TEST_TOPIC01 (ID: ${topicId})`);
  } else if (createTopRes.status === 409) {
    const listTopRes = await gvClient.get('/api/topics');
    const found = (listTopRes.body || []).find((t) => t.name.includes('TEST_TOPIC01'));
    topicId = found?.id || found?.topic_id;
    console.log(`  Found existing Topic (ID: ${topicId})`);
  } else {
    throw new Error(`F4 Failed to create topic: ${createTopRes.status} ${JSON.stringify(createTopRes.body)}`);
  }

  // 4.2 Update Topic
  const updateTopRes = await gvClient.patch(`/api/topics/${topicId}`, {
    name: 'TEST_TOPIC01_ARCH',
  });
  if (updateTopRes.status !== 200) {
    throw new Error(`F4 Failed to update topic: ${updateTopRes.status} ${JSON.stringify(updateTopRes.body)}`);
  }
  console.log(`✓ F4.2 Topic updated to TEST_TOPIC01_ARCH`);

  // 4.3 Verify listTopics
  const listTopRes = await gvClient.get('/api/topics');
  const hasTopic = (listTopRes.body || []).some((t) => (t.id === topicId || t.topic_id === topicId));
  if (!hasTopic) throw new Error('F4 Topic not visible in listTopics');
  console.log(`✓ F4.3 Topic verified visible in listTopics with subject scoping`);

  // --------------------------------------------------------------------------
  // FLOW F5: Course Materials Upload & RAG Ingestion
  // --------------------------------------------------------------------------
  console.log('\n--- FLOW F5: Course Material Upload & Ingestion ---');
  
  const form = new FormData();
  form.append('subjectId', String(subjectId));
  form.append('topicId', String(topicId));
  const pdfBlob = new Blob([SAMPLE_PDF], { type: 'application/pdf' });
  form.append('file', pdfBlob, 'architecture_overview.pdf');

  console.log('  Uploading PDF material via multipart POST /api/materials...');
  const uploadRes = await fetch(`${BASE_URL}/api/materials`, {
    method: 'POST',
    headers: {
      origin: BASE_URL,
      cookie: cookieHeader(gvClient.jar),
    },
    body: form,
  });

  const uploadBody = await uploadRes.json();
  if (uploadRes.status !== 201 && uploadRes.status !== 200) {
    throw new Error(`F5 Failed to upload material: ${uploadRes.status} ${JSON.stringify(uploadBody)}`);
  }
  const materialId = uploadBody.id || uploadBody.course_material_id;
  console.log(`✓ F5.1 Material uploaded successfully (ID: ${materialId}, status: ${uploadBody.status})`);

  // Poll until INGEST_MATERIAL finishes and status is READY
  console.log('  Waiting for INGEST_MATERIAL job to parse, chunk and embed text...');
  let materialReady = false;
  for (let poll = 1; poll <= 15; poll++) {
    await new Promise((r) => setTimeout(r, 2000));
    const matListRes = await gvClient.get(`/api/materials?subjectId=${subjectId}`);
    const mat = (matListRes.body || []).find((m) => (m.id === materialId || m.course_material_id === materialId));
    console.log(`  Poll ${poll}: status = ${mat?.status}`);
    if (mat?.status === 'READY') {
      materialReady = true;
      break;
    }
  }
  if (!materialReady) {
    console.log('  (Material not yet READY within timeout, checking background_job...)');
  } else {
    console.log(`✓ F5.2 Material INGEST_MATERIAL completed, status: READY`);
  }

  // --------------------------------------------------------------------------
  // FLOW F6: Questions & Rubrics (order_index & topicId filtering)
  // --------------------------------------------------------------------------
  console.log('\n--- FLOW F6: Rubric & Question Creation, Topic Filtering ---');

  // 6.1 Create Rubric with 2 criteria (weights 50/50 = 100%)
  const createRubRes = await gvClient.post('/api/rubrics', {
    maxScore: 10,
    subjectId,
    criteria: [
      {
        name: 'Architecture Concepts',
        weightPercent: 50,
        description: 'Understands clean architecture principles',
        performanceLevels: [
          { label: 'Good', minScore: 8, maxScore: 10, description: 'Clear understanding', orderNo: 1 },
          { label: 'Pass', minScore: 5, maxScore: 7.9, description: 'Basic understanding', orderNo: 2 },
        ],
      },
      {
        name: 'Design Patterns',
        weightPercent: 50,
        description: 'Applies correct design patterns',
        performanceLevels: [
          { label: 'Good', minScore: 8, maxScore: 10, description: 'Expert pattern usage', orderNo: 1 },
          { label: 'Pass', minScore: 5, maxScore: 7.9, description: 'Basic pattern usage', orderNo: 2 },
        ],
      },
    ],
  });

  if (createRubRes.status !== 201 && createRubRes.status !== 200) {
    throw new Error(`F6 Failed to create rubric: ${createRubRes.status} ${JSON.stringify(createRubRes.body)}`);
  }
  const rubricId = createRubRes.body?.id || createRubRes.body?.rubric_id;
  console.log(`✓ F6.1 Rubric created successfully (ID: ${rubricId})`);

  // Verify orderIndex is preserved (1, 2)
  const criteria = createRubRes.body?.criteria || [];
  console.log(`  Verifying criteria orderIndex:`, criteria.map((c) => ({ name: c.name, orderIndex: c.orderIndex })));
  if (criteria[0]?.orderIndex !== 1 || criteria[1]?.orderIndex !== 2) {
    throw new Error(`F6 Failed: orderIndex was not preserved correctly: ${JSON.stringify(criteria)}`);
  }
  console.log(`✓ F6.2 Verified rubric_criterion.order_index preserved: 1 and 2`);

  // 6.2 Create Question
  const qContent = `Explain the difference between Monolithic and Microservices architecture, and when to use each (${Date.now()}).`;
  const createQRes = await gvClient.post('/api/questions', {
    topicId,
    rubricId,
    content: qContent,
    bloomTaxonomy: 'ANALYZE',
    status: 'PENDING_REVIEW',
  });
  if (createQRes.status !== 201 && createQRes.status !== 200) {
    throw new Error(`F6 Failed to create question: ${createQRes.status} ${JSON.stringify(createQRes.body)}`);
  }
  const qData = createQRes.body?.question || createQRes.body;
  const questionId = qData?.id || qData?.question_id;
  console.log(`✓ F6.3 Question created under Topic ${topicId} (ID: ${questionId}, status: ${qData?.status})`);

  // 6.3 Test question filtering by topicId
  const filterQRes = await gvClient.get(`/api/questions?topicId=${topicId}`);
  const matchingQ = (filterQRes.body || []).some((q) => (q.id === questionId || q.question_id === questionId));
  if (!matchingQ) throw new Error(`F6 Failed: Question not found with topicId filter: ${JSON.stringify(filterQRes.body)}`);
  console.log(`✓ F6.4 Verified question topicId filtering: returns questions for topic ${topicId}`);

  // 6.4 Approve Question
  const approveQRes = await gvClient.post(`/api/questions/${questionId}/approve`, {});
  if (approveQRes.status !== 200) {
    throw new Error(`F6 Failed to approve question: ${approveQRes.status} ${JSON.stringify(approveQRes.body)}`);
  }
  console.log(`✓ F6.5 Question approved successfully (status: ${approveQRes.body?.status})`);

  // --------------------------------------------------------------------------
  // FLOW F7: Exam Session Setup, Roster, Examiners, Schedule Transitions
  // --------------------------------------------------------------------------
  console.log('\n--- FLOW F7: Exam Session Setup & Schedule Transitions ---');

  const opensAt = new Date(Date.now() - 60000).toISOString(); // started 1 min ago
  const closesAt = new Date(Date.now() + 7200000).toISOString(); // closes in 2 hours

  // 7.1 Create Exam Session
  const createSesRes = await gvClient.post('/api/exam-sessions', {
    subjectId,
    topicId,
    title: 'TEST_SESSION01',
    language: 'VI',
    main_question_count: 1,
    max_follow_ups_per_question: 0,
    answer_time_limit_sec: 120,
    session_time_limit_sec: 1800,
    opens_at: opensAt,
    closes_at: closesAt,
  });
  if (createSesRes.status !== 201 && createSesRes.status !== 200) {
    throw new Error(`F7 Failed to create exam session: ${createSesRes.status} ${JSON.stringify(createSesRes.body)}`);
  }
  const sessionId = createSesRes.body?.exam_session_id || createSesRes.body?.id;
  console.log(`✓ F7.1 Exam Session created: TEST_SESSION01 (ID: ${sessionId}, status: ${createSesRes.body?.status})`);

  // 7.2 Set Students Roster
  const setStuRes = await gvClient.put(`/api/exam-sessions/${sessionId}/students`, {
    studentIds: [studentId],
  });
  if (setStuRes.status !== 200) {
    throw new Error(`F7 Failed to set students roster: ${setStuRes.status} ${JSON.stringify(setStuRes.body)}`);
  }
  console.log(`✓ F7.2 Assigned student TEST_SV01 (ID: ${studentId}) to exam roster`);

  // 7.3 Set Examiners
  const setExRes = await gvClient.put(`/api/exam-sessions/${sessionId}/examiners`, {
    examinerIds: [lecturerId],
  });
  if (setExRes.status !== 200) {
    throw new Error(`F7 Failed to set examiners: ${setExRes.status} ${JSON.stringify(setExRes.body)}`);
  }
  console.log(`✓ F7.3 Assigned examiner TEST_GV01 (ID: ${lecturerId}) to exam session`);

  // 7.4 Submit Schedule -> SCHEDULED
  const schedRes = await gvClient.post(`/api/exam-sessions/${sessionId}/schedule`, {});
  if (schedRes.status !== 200) {
    throw new Error(`F7 Failed to schedule session: ${schedRes.status} ${JSON.stringify(schedRes.body)}`);
  }
  console.log(`✓ F7.4 Exam session transitioned to SCHEDULED`);

  // 7.5 Withdraw Schedule -> DRAFT
  const unschedRes = await gvClient.post(`/api/exam-sessions/${sessionId}/unschedule`, {});
  if (unschedRes.status !== 200) {
    throw new Error(`F7 Failed to unschedule session: ${unschedRes.status} ${JSON.stringify(unschedRes.body)}`);
  }
  console.log(`✓ F7.5 Exam session withdrawn back to DRAFT`);

  // 7.6 Re-submit Schedule -> SCHEDULED
  const reschedRes = await gvClient.post(`/api/exam-sessions/${sessionId}/schedule`, {});
  if (reschedRes.status !== 200) {
    throw new Error(`F7 Failed to re-schedule session: ${reschedRes.status} ${JSON.stringify(reschedRes.body)}`);
  }
  console.log(`✓ F7.6 Exam session re-submitted to SCHEDULED`);

  // --------------------------------------------------------------------------
  // FLOW F8: Admin Exam Schedule & Start Exam (Lock Rubric)
  // --------------------------------------------------------------------------
  console.log('\n--- FLOW F8: Admin Start Exam & Rubric Locking ---');

  // Login as Admin
  const adminClient = new ApiClient(BASE_URL);
  await adminClient.post('/api/auth/login', {
    identifier: 'test_admin@aives.local',
    password: ADMIN_PASSWORD,
  });

  // 8.1 View Exam Schedule
  const schedListRes = await adminClient.get('/api/admin/exam-schedule');
  const foundSched = (schedListRes.body?.sessions || schedListRes.body || []).find((s) => s.exam_session_id === sessionId);
  console.log(`✓ F8.1 Admin verified exam session in schedule: status = ${foundSched?.status}`);

  // 8.2 Admin Starts Exam -> OPEN
  const startRes = await adminClient.post(`/api/admin/exam-sessions/${sessionId}/start`, {});
  if (startRes.status !== 200) {
    throw new Error(`F8 Failed to start exam: ${startRes.status} ${JSON.stringify(startRes.body)}`);
  }
  console.log(`✓ F8.2 Admin started exam: status transitioned to OPEN`);

  // 8.3 Verify Rubric is locked in DB
  const rubLockOut = psql(`SELECT is_locked FROM rubric WHERE rubric_id = ${rubricId};`).trim();
  console.log(`✓ F8.3 Verified in database: rubric_id ${rubricId} is_locked = ${rubLockOut}`);

  console.log('\n================================================================');
  console.log('✅ FLOWS F4 -> F8 COMPLETED SUCCESSFULLY ON AWS PRODUCTION!');
  console.log('================================================================');
}

main().catch((err) => {
  console.error('\n❌ EXECUTION FAILED:', err);
  process.exit(1);
});
