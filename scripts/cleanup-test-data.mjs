import { ssm } from './e2e-business-flows.mjs';

async function main() {
  const sqlStatements = [
    // 1. Score adjustments for test evaluations/users
    `DELETE FROM score_adjustment WHERE adjusted_by IN (SELECT app_user_id FROM app_user WHERE code LIKE 'TEST_%') OR criterion_score_id IN (SELECT cs.criterion_score_id FROM criterion_score cs JOIN question_evaluation qe ON cs.evaluation_id = qe.question_evaluation_id JOIN viva_result vr ON qe.result_id = vr.viva_result_id JOIN viva_interview vi ON vr.interview_id = vi.viva_interview_id WHERE vi.exam_session_id = 8);`,
    // 2. Criterion scores for test evaluations
    `DELETE FROM criterion_score WHERE evaluation_id IN (SELECT qe.question_evaluation_id FROM question_evaluation qe JOIN viva_result vr ON qe.result_id = vr.viva_result_id JOIN viva_interview vi ON vr.interview_id = vi.viva_interview_id WHERE vi.exam_session_id = 8);`,
    // 3. Question evaluations for test results
    `DELETE FROM question_evaluation WHERE result_id IN (SELECT vr.viva_result_id FROM viva_result vr JOIN viva_interview vi ON vr.interview_id = vi.viva_interview_id WHERE vi.exam_session_id = 8);`,
    // 4. Viva results for test interviews
    `DELETE FROM viva_result WHERE interview_id IN (SELECT viva_interview_id FROM viva_interview WHERE exam_session_id = 8);`,
    // 5. Transcripts for test interviews
    `DELETE FROM transcript WHERE interview_id IN (SELECT viva_interview_id FROM viva_interview WHERE exam_session_id = 8);`,
    // 6. QA turns for test interviews
    `DELETE FROM qa_turn WHERE interview_id IN (SELECT viva_interview_id FROM viva_interview WHERE exam_session_id = 8);`,
    // 7. Assigned questions for test interviews
    `DELETE FROM assigned_question WHERE interview_id IN (SELECT viva_interview_id FROM viva_interview WHERE exam_session_id = 8);`,
    // 8. Viva interviews for test session
    `DELETE FROM viva_interview WHERE exam_session_id = 8;`,
    // 9. Exam session rosters & session
    `DELETE FROM exam_session_examiner WHERE exam_session_id = 8;`,
    `DELETE FROM exam_session_student WHERE exam_session_id = 8;`,
    `DELETE FROM exam_session WHERE exam_session_id = 8;`,
    // 10. Question references and questions
    `DELETE FROM question_source_ref WHERE question_id IN (SELECT question_id FROM question WHERE topic_id IN (5, 6, 7, 8, 9) OR rubric_id IN (4, 5, 6));`,
    `DELETE FROM question WHERE topic_id IN (5, 6, 7, 8, 9) OR rubric_id IN (4, 5, 6);`,
    // 11. Performance levels & Rubric criteria & Rubrics
    `DELETE FROM performance_level WHERE criterion_id IN (SELECT rubric_criterion_id FROM rubric_criterion WHERE rubric_id IN (4, 5, 6));`,
    `DELETE FROM rubric_criterion WHERE rubric_id IN (4, 5, 6);`,
    `DELETE FROM rubric WHERE rubric_id IN (4, 5, 6);`,
    // 12. Material chunks and course materials
    `DELETE FROM material_chunk WHERE material_id IN (SELECT course_material_id FROM course_material WHERE subject_id = 5);`,
    `DELETE FROM course_material WHERE subject_id = 5;`,
    // 13. Topics under subject 5
    `DELETE FROM topic WHERE topic_id IN (5, 6, 7, 8, 9);`,
    // 14. Subject rosters & Subject 5
    `DELETE FROM subject_lecturer WHERE subject_id = 5;`,
    `DELETE FROM subject_student WHERE subject_id = 5;`,
    `DELETE FROM subject WHERE subject_id = 5;`,
    // 15. User tokens, sessions, and users
    `DELETE FROM password_token WHERE user_id IN (SELECT app_user_id FROM app_user WHERE code LIKE 'TEST_%');`,
    `DELETE FROM auth_session WHERE user_id IN (SELECT app_user_id FROM app_user WHERE code LIKE 'TEST_%');`,
    `DELETE FROM app_user WHERE code LIKE 'TEST_%';`,
    // 16. Background jobs created during tests
    `DELETE FROM background_job WHERE background_job_id > 11;`,
  ];

  const oneLiner = `BEGIN; ${sqlStatements.join(' ')} COMMIT;`;
  console.log('Executing one-line cleanup transaction via SSM...');
  const out = ssm(`docker exec aives-postgres psql -U aives -d aives -c "${oneLiner}"`);
  console.log(out);
}

main().catch(console.error);
