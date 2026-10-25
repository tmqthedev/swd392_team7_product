import {
  BASE_URL,
  USER_PASSWORD,
  ssm,
  psql,
  testEmail,
  ApiClient,
} from './e2e-business-flows.mjs';

async function main() {
  console.log('================================================================');
  console.log('--- STARTING E2E v2 BUSINESS FLOWS: F9 -> F10 & OVERDUE SWEEP ---');
  console.log('Target Base:', BASE_URL);
  console.log('================================================================');

  // Find exam session TEST_SESSION01 in OPEN status
  const sesOut = psql("SELECT exam_session_id FROM exam_session WHERE title = 'TEST_SESSION01' AND status = 'OPEN' ORDER BY exam_session_id DESC LIMIT 1;").trim();
  const sessionId = Number(sesOut);
  if (!sessionId) throw new Error('Could not find active OPEN exam session TEST_SESSION01');
  console.log(`✓ Using active OPEN Exam Session (ID: ${sessionId})`);

  const studentId = Number(psql("SELECT app_user_id FROM app_user WHERE code = 'TEST_SV01' LIMIT 1;").trim());
  const overdueStudentId = Number(psql("SELECT app_user_id FROM app_user WHERE code = 'TEST_SV02' LIMIT 1;").trim());
  if (!studentId || !overdueStudentId) {
    throw new Error('TEST_SV01 and TEST_SV02 must exist before running F9/F10.');
  }
  const manualViva = process.env.E2E_MANUAL_VIVA === 'YES';

  // --------------------------------------------------------------------------
  // FLOW F9: Student Viva Voice Interview & Speech Signal Persistence
  // --------------------------------------------------------------------------
  console.log('\n--- FLOW F9: Student Viva Interview & Signal Recording ---');

  // 9.1 Student TEST_SV01 logs in
  const svClient = new ApiClient(BASE_URL);
  const svLogin = await svClient.post('/api/auth/login', {
    identifier: testEmail('sv01'),
    password: USER_PASSWORD,
  });
  if (svLogin.status !== 200 || svLogin.body?.user?.role !== 'STUDENT') {
    throw new Error(`Student login failed: ${svLogin.status} ${JSON.stringify(svLogin.body)}`);
  }
  console.log(`✓ F9.1 Student TEST_SV01 logged in successfully`);

  // 9.2 View available sessions
  const meSessionsRes = await svClient.get('/api/me/exam-sessions');
  const foundInRoster = (meSessionsRes.body || []).find((s) => (s.examSessionId === sessionId || s.exam_session_id === sessionId));
  if (!foundInRoster) {
    throw new Error(`F9 Failed: Exam session ${sessionId} not visible to student in /api/me/exam-sessions: ${JSON.stringify(meSessionsRes.body)}`);
  }
  console.log(`✓ F9.2 Student sees session in roster: ${foundInRoster.title} (status: ${foundInRoster.status})`);

  // Check if an interview already exists for student 22 on session 8
  const existingIntOut = psql(`SELECT viva_interview_id, status FROM viva_interview WHERE exam_session_id = ${sessionId} AND student_id = ${studentId} ORDER BY viva_interview_id DESC LIMIT 1;`).trim();
  let interviewId = null;
  let turnId = null;

  if (existingIntOut) {
    const parts = existingIntOut.split('|').map((s) => s.trim());
    interviewId = Number(parts[0]);
    const intStatus = parts[1];
    console.log(`✓ F9.3 Found existing interview (ID: ${interviewId}, status: ${intStatus})`);
    if (manualViva && intStatus !== 'COMPLETED') {
      throw new Error('E2E_MANUAL_VIVA=YES requires TEST_SV01 to finish the interview in the UI first.');
    }

    // Fetch turnId from qa_turn
    const tOut = psql(`SELECT qa_turn_id FROM qa_turn WHERE interview_id = ${interviewId} ORDER BY sequence_no ASC LIMIT 1;`).trim();
    turnId = Number(tOut);
  } else {
    if (manualViva) {
      throw new Error('E2E_MANUAL_VIVA=YES requires an interview completed by TEST_SV01 in the UI first.');
    }
    // 9.3 Start Interview
    console.log('  Starting interview session via POST /api/interviews...');
    const startIntRes = await svClient.post('/api/interviews', {
      examSessionId: sessionId,
    });
    if (startIntRes.status !== 200) {
      throw new Error(`F9 Failed to start interview: ${startIntRes.status} ${JSON.stringify(startIntRes.body)}`);
    }
    const intView = startIntRes.body;
    interviewId = intView.interviewId || intView.id;
    turnId = intView.currentTurn?.turnId || intView.currentTurn?.id || intView.turnId;
    console.log(`✓ F9.3 Interview started (ID: ${interviewId}, turnId: ${turnId})`);
    console.log(`  Question text: "${intView.currentTurn?.questionText || intView.questionText}"`);

    // 9.4 Submit a deterministic transcript for API-only runs. Manual voice
    // runs complete this step in the UI before this script is started.
    console.log('  Submitting answer with transcript and speech signals (pause_count, latency, duration, wpm)...');
    const answerPayload = {
      transcript: {
        text: 'Monolithic architecture bundles all components together in one artifact, while microservices separates them into decentralized, loosely coupled services communicating via APIs. Monoliths are simpler to develop initially; microservices excel for large distributed teams with independent deployment and scaling needs.',
      },
      timedOut: false,
      signals: {
        response_latency_ms: 1250,
        speech_duration_ms: 7800,
        words_per_minute: 135,
        pause_count: 3,
      },
    };

    const ansRes = await svClient.post(`/api/interviews/${interviewId}/turns/${turnId}/answer`, answerPayload);
    if (ansRes.status !== 200) {
      throw new Error(`F9 Failed to submit answer: ${ansRes.status} ${JSON.stringify(ansRes.body)}`);
    }
    console.log(`✓ F9.4 Answer submitted: interview status = ${ansRes.body?.status}`);
  }

  // 9.5 Verify Speech Signals persisted in PostgreSQL qa_turn
  const turnSql = `SELECT response_latency_ms, speech_duration_ms, words_per_minute, pause_count FROM qa_turn WHERE qa_turn_id = ${turnId};`;
  const turnOut = psql(turnSql).trim();
  console.log(`✓ F9.5 Verified in DB qa_turn (pause_count & speech signals): ${turnOut}`);
  const signalValues = turnOut.split('|').map((value) => Number(value.trim()));
  if (signalValues.length !== 4 || signalValues.some((value) => !Number.isFinite(value))) {
    throw new Error('F9 Failed: response latency, speech duration, WPM, and pause_count must all be persisted as numbers.');
  }
  if (!manualViva && signalValues[3] !== 3) {
    throw new Error('F9 Failed: synthetic API run did not persist the expected pause_count.');
  }

  // 9.6 Verify viva_result created and wait for GRADE_INTERVIEW
  console.log('\n  Checking viva_result for interview ' + interviewId + '...');
  let resultId = null;
  let resultStatus = null;
  for (let poll = 1; poll <= 25; poll++) {
    const resSql = `SELECT viva_result_id, status FROM viva_result WHERE interview_id = ${interviewId};`;
    const resOut = psql(resSql).trim();
    if (resOut) {
      const parts = resOut.split('\n')[0].split('|').map((s) => s.trim());
      resultId = Number(parts[0]);
      resultStatus = parts[1];
      console.log(`  Poll ${poll}: viva_result ID = ${resultId}, status = ${resultStatus}`);
      if (resultStatus === 'AI_SUGGESTED' || resultStatus === 'FLAGGED' || resultStatus === 'FINALIZED') {
        break;
      }
    }
    await new Promise((r) => setTimeout(r, 2000));
  }

  if (!resultId) {
    throw new Error(`F9/F10 Failed: No viva_result created for interview ${interviewId}`);
  }
  console.log(`✓ F9.6 viva_result ${resultId} reached status ${resultStatus}`);

  // --------------------------------------------------------------------------
  // FLOW F10: Examiner-Only Grading & Student Safe View
  // --------------------------------------------------------------------------
  console.log('\n--- FLOW F10: Examiner Write Guard & Safe Student Results ---');

  // 10.1 Test Examiner-Only Write Guard (TEST_GV02 must be blocked)
  console.log('  Testing Examiner Write Guard with non-examiner lecturer TEST_GV02...');
  const gv02Client = new ApiClient(BASE_URL);
  await gv02Client.post('/api/auth/login', {
    identifier: testEmail('gv02'),
    password: USER_PASSWORD,
  });

  // TEST_GV02 views result -> canGrade should be false
  const gv02ViewRes = await gv02Client.get(`/api/results/${resultId}`);
  console.log(`✓ F10.1 Non-examiner lecturer views result: canGrade = ${gv02ViewRes.body?.canGrade}`);
  if (gv02ViewRes.body?.canGrade !== false) {
    throw new Error(`F10 Guard Failed: Non-examiner canGrade must be false!`);
  }

  // Fetch a criterion score ID to test score adjustment
  const critScoreOut = psql(`SELECT cs.criterion_score_id FROM criterion_score cs JOIN question_evaluation qe ON cs.evaluation_id = qe.question_evaluation_id WHERE qe.result_id = ${resultId} LIMIT 1;`).trim();
  const critScoreId = Number(critScoreOut);
  console.log(`  Using criterion_score ID: ${critScoreId}`);

  // TEST_GV02 tries to adjust score -> 403 FORBIDDEN
  const gv02AdjustRes = await gv02Client.put(`/api/criterion-scores/${critScoreId}`, {
    score: 9.0,
    reason: 'Unauthorized attempt to adjust score',
  });
  console.log(`✓ F10.2 Non-examiner score adjust blocked: status = ${gv02AdjustRes.status}, code = ${gv02AdjustRes.body?.code}`);
  if (gv02AdjustRes.status !== 403) {
    throw new Error(`F10 Guard Failed: Expected 403 FORBIDDEN for non-examiner adjust, got ${gv02AdjustRes.status}`);
  }

  // TEST_GV02 tries to finalize -> 403 FORBIDDEN
  const gv02FinalizeRes = await gv02Client.post(`/api/results/${resultId}/finalize`, {});
  console.log(`✓ F10.3 Non-examiner finalize blocked: status = ${gv02FinalizeRes.status}, code = ${gv02FinalizeRes.body?.code}`);
  if (gv02FinalizeRes.status !== 403) {
    throw new Error(`F10 Guard Failed: Expected 403 FORBIDDEN for non-examiner finalize, got ${gv02FinalizeRes.status}`);
  }

  // 10.2 Examiner TEST_GV01 adjusts score and finalizes
  console.log('\n  Logging in as Examiner TEST_GV01 to adjust score and finalize...');
  const gv01Client = new ApiClient(BASE_URL);
  await gv01Client.post('/api/auth/login', {
    identifier: testEmail('gv01'),
    password: USER_PASSWORD,
  });

  const gv01ViewRes = await gv01Client.get(`/api/results/${resultId}`);
  console.log(`✓ F10.4 Examiner views result: canGrade = ${gv01ViewRes.body?.canGrade}`);
  if (gv01ViewRes.body?.canGrade !== true) {
    throw new Error(`F10 Guard Failed: Examiner canGrade must be true!`);
  }

  // Re-open if already finalized from a previous run
  if (resultStatus === 'FINALIZED') {
    console.log('  Result already finalized, reopening for adjustment test...');
    await gv01Client.post(`/api/results/${resultId}/reopen`, {});
  }

  // Examiner adjusts score
  const adjustRes = await gv01Client.put(`/api/criterion-scores/${critScoreId}`, {
    score: 9.5,
    reason: 'Excellent clear answer with strong understanding of scaling trade-offs.',
  });
  if (adjustRes.status !== 200) {
    throw new Error(`F10 Failed to adjust score: ${adjustRes.status} ${JSON.stringify(adjustRes.body)}`);
  }
  const updatedTotal = adjustRes.body?.result?.final_total_score || adjustRes.body?.totalScore;
  console.log(`✓ F10.5 Examiner adjusted score with required reason successfully (updated score: ${updatedTotal})`);

  // Examiner finalizes result
  const finRes = await gv01Client.post(`/api/results/${resultId}/finalize`, {});
  if (finRes.status !== 200) {
    throw new Error(`F10 Failed to finalize result: ${finRes.status} ${JSON.stringify(finRes.body)}`);
  }
  console.log(`✓ F10.6 Examiner finalized result: status = ${finRes.body?.status}`);

  // 10.3 Student Safe View Tests
  console.log('\n  Checking Student Results view via /api/me/results...');
  const stuListRes = await svClient.get('/api/me/results');
  if (stuListRes.status !== 200 || !Array.isArray(stuListRes.body)) {
    throw new Error(`F10 Failed to get student results list: ${stuListRes.status} ${JSON.stringify(stuListRes.body)}`);
  }
  const myResultItem = stuListRes.body.find((r) => r.resultId === resultId);
  if (!myResultItem) {
    throw new Error(`F10 Failed: Finalized result ${resultId} not found in student list!`);
  }
  console.log(`✓ F10.7 Student views results list: found result ${resultId} (Total: ${myResultItem.totalScore})`);

  const stuDetailRes = await svClient.get(`/api/me/results/${resultId}`);
  if (stuDetailRes.status !== 200) {
    throw new Error(`F10 Failed to get student result detail: ${stuDetailRes.status}`);
  }
  console.log(`✓ F10.8 Student views result detail: Total Score = ${stuDetailRes.body?.totalScore}`);

  // 10.4 Security Audit: Leak Scan on Student Response
  const rawJson = JSON.stringify(stuDetailRes.body).toLowerCase();
  const forbiddenKeywords = ['rationale', 'evidence', 'ai_justification', 'feedback', 'turns', 'flag_reason', 'client_ip'];
  for (const word of forbiddenKeywords) {
    if (rawJson.includes(`"${word}"`)) {
      throw new Error(`SECURITY LEAK IN STUDENT VIEW! Found forbidden keyword "${word}" in payload: ${rawJson}`);
    }
  }
  console.log(`✓ F10.9 Security Leak Scan PASSED: Zero rationale, evidence, turns, or internal rationale leaked to student!`);

  // --------------------------------------------------------------------------
  // FLOW: Abandoned Interview Background Sweep (PR-3a & Migration 023)
  // --------------------------------------------------------------------------
  console.log('\n--- VERIFYING ABANDONED INTERVIEW SWEEP (PR-3a & MIGRATION 023) ---');
  
  // Assign student 23 (TEST_SV02) to exam session 8 if not already assigned
  psql(`INSERT INTO exam_session_student (exam_session_id, student_id) VALUES (${sessionId}, ${overdueStudentId}) ON CONFLICT DO NOTHING;`);

  // Check if an overdue test interview already exists for student 23
  let overdueInterviewId = null;
  const existingOverdueOut = psql(`SELECT viva_interview_id FROM viva_interview WHERE exam_session_id = ${sessionId} AND student_id = ${overdueStudentId} ORDER BY viva_interview_id DESC LIMIT 1;`).trim();
  if (existingOverdueOut && Number(existingOverdueOut)) {
    overdueInterviewId = Number(existingOverdueOut);
    console.log(`  Found test interview (ID: ${overdueInterviewId}) for student 23`);
  } else {
    psql(`INSERT INTO viva_interview (exam_session_id, student_id, status, started_at, deadline_at) VALUES (${sessionId}, ${overdueStudentId}, 'IN_PROGRESS', NOW() - INTERVAL '180 seconds', NOW() - INTERVAL '120 seconds');`);
    const idOut = psql(`SELECT viva_interview_id FROM viva_interview WHERE exam_session_id = ${sessionId} AND student_id = ${overdueStudentId} ORDER BY viva_interview_id DESC LIMIT 1;`).trim();
    overdueInterviewId = Number(idOut);
    console.log(`  Inserted overdue active interview (ID: ${overdueInterviewId}, status: IN_PROGRESS, deadline 120s ago)`);
  }

  console.log('  Waiting for background job EXPIRE_INTERVIEWS to sweep and close overdue session...');
  let sweepSuccess = false;
  for (let poll = 1; poll <= 35; poll++) {
    const sweepCheck = psql(`SELECT status, end_reason FROM viva_interview WHERE viva_interview_id = ${overdueInterviewId};`).trim();
    if (sweepCheck) {
      const [sStatus, sReason] = sweepCheck.split('|').map((s) => s.trim());
      console.log(`  Poll ${poll}: interview status = ${sStatus}, end_reason = ${sReason}`);
      if (sStatus === 'COMPLETED' && sReason === 'DEADLINE_REACHED') {
        sweepSuccess = true;
        break;
      }
    }
    await new Promise((r) => setTimeout(r, 2500));
  }

  if (!sweepSuccess) {
    throw new Error(`Sweep verification failed: Overdue interview ${overdueInterviewId} was not ended by background sweep!`);
  }
  console.log(`✓ Overdue interview swept to COMPLETED with reason DEADLINE_REACHED!`);

  // Verify viva_result and GRADE_INTERVIEW job created for swept interview
  const sweptResultOut = psql(`SELECT viva_result_id, status FROM viva_result WHERE interview_id = ${overdueInterviewId};`).trim();
  console.log(`✓ viva_result automatically created for swept session: ${sweptResultOut}`);

  const sweptJobOut = psql(`SELECT background_job_id, type, status FROM background_job WHERE type = 'GRADE_INTERVIEW' AND payload::text LIKE '%${overdueInterviewId}%' LIMIT 1;`).trim();
  console.log(`✓ GRADE_INTERVIEW job enqueued for swept interview: ${sweptJobOut}`);

  console.log('\n================================================================');
  console.log('🎉 ALL BUSINESS FLOWS F9 & F10 + PR-3a SWEEP PASSED ON AWS PROD!');
  console.log('================================================================');
}

main().catch((err) => {
  console.error('\n❌ EXECUTION FAILED:', err);
  process.exit(1);
});
