# AIVES E2E v2 Production Execution Report

## Document control

| Field | Value |
| --- | --- |
| Project | AIVES / SWD392 Team 7 |
| Execution date | 26 October 2026 (Asia/Ho_Chi_Minh) |
| Environment | Production, AWS `ap-southeast-1` |
| Application | https://d36ezmiqpl9miu.cloudfront.net |
| Deployed commit | `0edad4a8853b732bce01c49d8ff30fdda9b46a6d` |
| Deploy workflow | GitHub Actions run `40221914510`, completed successfully |
| Scope | E2E v2 F1–F10 and abandoned-interview expiry sweep |
| Result | All business-flow checks passed; one STT recognition deviation recorded |

## Executive summary

The production run exercised the E2E v2 business flows using disposable `TEST_` identities, subject, material, rubric, exam, interview, and synthetic speech. F1–F10 and the `EXPIRE_INTERVIEWS` sweep completed successfully. Production was left healthy on the deployed commit above.

The run found a persistence defect in multipart interview answers: JSON-encoded `transcript` and `signals` fields arrive as strings, while the controller expected objects. The controller now parses those fields and rejects malformed JSON with a validation response. Focused controller tests and the full backend unit suite passed (530 passed, 0 failed). The fix was merged in PR [#50](https://github.com/tmqthedev/swd392_team7_product/pull/50) after all 5 required CI checks passed, then deployed by the successful workflow above.

## Test approach and safeguards

- Executed against the production CloudFront endpoint explicitly selected by the project owner.
- Used only disposable records prefixed with `TEST_`; the uploaded PDF and spoken response were synthetic.
- Did not alter any non-test roster, course material, exam, or grade. The admin password change in F1 was immediately restored.
- Used a generated Vietnamese WAV through the real production interview submission and STT route. No real student recording was used.
- Captured only sanitized record IDs, statuses, and telemetry in this report; credentials and tokens are omitted.
- The test does not establish microphone hardware/browser capture quality because it submitted a generated WAV file directly.

## Results by flow

| Flow | Result | Evidence |
| --- | --- | --- |
| F1 Authentication | PASS | Admin login/profile and password change/restore succeeded. A disposable locked account returned `423 ACCOUNT_LOCKED` after six invalid attempts. |
| F2 User creation/import | PASS | Two disposable lecturers and two students were created and activated; lecturer and student logins returned the expected roles. |
| F3 Subject/roster | PASS | `TEST_SWD` was created and assigned only the test lecturers and students. |
| F4 Topics | PASS | `TEST_TOPIC01` was created, renamed to `TEST_TOPIC01_ARCH`, and visible under subject scope. |
| F5 Material/RAG | PASS | Synthetic PDF reached `READY`; RAG generated one grounded question. |
| F6 Rubric/questions | PASS | Rubric ID 8 retained criterion order 1 and 2; generated question retained one citation, passed topic filtering, and was approved with the rubric. |
| F7 Exam setup | PASS | `TEST_SESSION01` ID 10 followed `DRAFT → SCHEDULED → DRAFT → SCHEDULED`; test student and examiner were assigned. |
| F8 Start/lock | PASS | Session moved to `OPEN`; the linked rubric was locked. |
| F9 Interview/STT | PASS with recognition deviation | Interview ID 14 completed. WAV upload and answer object key were persisted; transcript and telemetry were stored. See STT details below. |
| F10 Grading/privacy | PASS | Non-examiner score adjustment/finalization returned `403 FORBIDDEN`; examiner finalized at 7.30. Student result view exposed no rationale, evidence, turns, or internal rationale. |
| Expiry sweep | PASS | Overdue interview ID 15 changed to `COMPLETED` with `DEADLINE_REACHED`; an `AI_SUGGESTED` result was created and its `GRADE_INTERVIEW` job completed. |

## STT and audio findings

The synthetic Vietnamese sentence supplied to the production TTS service was:

> Xin chào. Hôm nay tôi trình bày cách hệ thống microservice giúp nhóm triển khai phần mềm độc lập.

The production STT result was:

> xin chào hôm nay tôi trình bày các hệ thống microsoft giúp nhóm triển khai phần mềm độc lập.

The recording path itself succeeded: a 292,844-byte WAV was submitted; interview ID 14 and turn ID 24 completed; the answer audio key, transcript, and signal fields were persisted. Recorded signals were response latency 1,250 ms, speech duration 6,100 ms, 187 words/minute, and 3 pauses. A separate direct TTS-to-STT Lambda check returned confidence `0.918` and duration `6.1` seconds.

The utterance was substantially recognized, but `cách hệ thống microservice` was rendered as `các hệ thống microsoft`. Treat technical vocabulary recognition as a known quality limitation for Vietnamese speech. The browser microphone, live playback, and acoustic conditions were not part of this synthetic-file run.

## Defect fixed

Multipart form fields are strings. The interview controller previously passed JSON-encoded `transcript` and `signals` strings through unchanged, so validated telemetry fields were not persisted. The fix parses the JSON fields at the HTTP boundary, preserves JSON request handling, and maps malformed JSON to a 400 validation error. Tests cover object parsing, JSON request compatibility, and malformed input.

## Verification, deployment, and production state

- Backend unit suite: 530 passed, 0 failed.
- PR #50: merged after 5/5 required CI checks succeeded.
- Deployment workflow `40221914510`: completed successfully, including backend, STT/TTS images and Lambdas, SPA, and CloudFront invalidation.
- EC2 backend container was confirmed healthy on the deployed commit.
- Pre-run log review for the preceding 72 hours found three matching 401 responses and no matching 5xx responses.
- Initial cleanup removed leftover test data from an earlier attempt. Final cleanup removed 1 test material object, 1 answer audio object, and 2 DynamoDB test session-context items. TTS cache was not touched.
- A final cleanup preview reported zero rows for every `TEST_` database deletion statement and rolled back the preview transaction. This confirms no matching test database records remained after cleanup.
- Local generated WAV and repository extraction scratch files were removed.

The baseline database inventory was captured before the run and compared after cleanup. Representative pre-existing counts remained in scope for that comparison:

| Table | Baseline rows |
| --- | ---: |
| `app_user` | 8 |
| `subject` | 3 |
| `subject_lecturer` | 3 |
| `subject_student` | 4 |
| `topic` | 1 |
| `course_material` | 0 |
| `material_chunk` | 0 |
| `question` | 2 |
| `rubric` | 1 |
| `rubric_criterion` | 3 |
| `exam_session` | 3 |
| `exam_session_examiner` | 3 |
| `exam_session_student` | 5 |
| `viva_interview` | 4 |
| `qa_turn` | 7 |
| `transcript` | 3 |
| `viva_result` | 4 |
| `criterion_score` | 18 |
| `score_adjustment` | 1 |

Test-created rows were removed and pre-existing production records were retained. The cleanup used the repository's `TEST_`-scoped procedure. It did not change deployment configuration or run migrations during the test.

## Disposition

E2E v2 is accepted for the exercised business flows, with the Vietnamese technical-term STT substitution recorded for follow-up quality tuning. For customer sign-off steps and evidence fields, use [Customer acceptance E2E script](customer-acceptance-e2e.md). The governing product and flow references are [business-flow specification](business-flows-specification.md), [E2E plan](e2e-execution-plan-v2.md), and [flow/class diagram](flow-class-diagram.png).
