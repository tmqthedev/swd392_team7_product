# AIVES production E2E acceptance script

Use this checklist with the approved F1–F10 business-flow specification and flow/class diagram. It is written for a witnessed customer acceptance run against the production URL selected by the project owner.

## Run details

| Field | Entry |
| --- | --- |
| Application URL | https://d36ezmiqpl9miu.cloudfront.net |
| Run date/time (include timezone) | |
| Release commit | |
| Customer witness | |
| AIVES operator | |
| Result | Accepted / Accepted with findings / Rejected |

## Safety and preparation

1. Schedule a test window and confirm there is no live examination or grading activity that may be interrupted.
2. Use only disposable users, subject, topic, material, rubric, question, exam, and interview records prefixed with `TEST_`. Use synthetic course content and a synthetic spoken answer. Do not use real student records or real exam content.
3. Provide credentials through the approved secret-sharing channel. Do not put passwords, reset links, cookies, tokens, or personal data in screenshots or this record.
4. Prepare two disposable lecturer identities, two student identities, one administrator, a workbook with the two test students, and a synthetic PDF about software architecture.
5. For F9, prepare either a short synthetic WAV in the configured accepted format or a quiet browser/microphone setup. If a WAV is used, state that this checks the production upload/STT path but does not verify the browser microphone hardware.
6. Record UTC timestamps, sanitized evidence, and test record IDs. Avoid screenshots containing credentials or private user data.

## Acceptance steps

### F1 — Authentication and lockout

1. Sign in as administrator. Verify the profile and `ADMIN` role.
2. Change the administrator password and immediately restore it. Verify success without recording either password.
3. Use a disposable test account to submit five incorrect passwords; submit one more attempt and verify the account-lock response (`423 ACCOUNT_LOCKED`).
4. Complete the documented unlock/recovery process for the disposable account.

**Pass when:** the correct profile is authenticated, the password can be changed and restored, and the lockout protects only the disposable test identity.

### F2 — User creation and import

1. Create two disposable lecturers with `TEST_` identifiers and activate them using their one-time setup links.
2. Import the prepared student workbook containing two `TEST_` rows.
3. Verify both rows were created, activate the accounts, and sign in as one test lecturer and one test student.
4. Verify the roles and role-specific navigation.

**Pass when:** both test lecturers and students are active and receive the expected roles.

### F3 — Subject and roster

1. Create subject `TEST_SWD`.
2. Assign the two test lecturers and enroll the two test students.
3. Verify the subject and roster in the admin interface.

**Pass when:** only the intended `TEST_` identities appear in the test subject roster.

### F4 — Topic management and scope

1. Sign in as an assigned lecturer and create `TEST_TOPIC01` under `TEST_SWD`.
2. Rename it to `TEST_TOPIC01_ARCH` and verify the subject-scoped list.
3. Where included in the approved run, use the second lecturer to attempt out-of-scope access and verify it is denied.

**Pass when:** assigned staff can manage the test topic and out-of-scope access is denied.

### F5 — Course material ingestion

1. Upload the synthetic architecture PDF to `TEST_SWD`.
2. Follow its processing state until it reaches `READY`.
3. Record the test material ID and elapsed time.

**Pass when:** the material reaches `READY` and can be used by question generation.

### F6 — Rubric, grounded question, and approval

1. Create a rubric with at least two weighted criteria totaling 100 percent. Record the criterion order.
2. Generate a question from the test material and verify the source citation.
3. Filter by `TEST_TOPIC01_ARCH`; approve the question and link it to the test rubric.

**Pass when:** the question is grounded in the test material, the citation is present, criterion order is preserved, and the question reaches `APPROVED`.

### F7 — Exam setup and schedule

1. Create exam `TEST_SESSION01` for the test subject and topic.
2. Assign one test student and the assigned test lecturer as examiner.
3. Submit to `SCHEDULED`, withdraw to `DRAFT`, then submit again.

**Pass when:** the test roster and examiner are correct and the specified state transitions succeed.

### F8 — Admin start and rubric lock

1. As administrator, locate `TEST_SESSION01` and start it.
2. Verify that it reaches `OPEN` and that its rubric is locked.

**Pass when:** the test session opens and its rubric cannot be changed during the exam.

### F9 — Student interview, audio, and STT

1. Sign in as the test student and open `TEST_SESSION01`.
2. If the acceptance scope includes browser audio, grant microphone permission, complete the microphone check, play the interviewer question, and answer using only the prepared synthetic sentence. Record whether the question playback and microphone capture were tested live.
3. If using the approved synthetic WAV path, submit the WAV through the test interview. Verify the selected language, transcript, and correct turn association.
4. Verify that answer audio, transcript, response latency, speech duration, words per minute, and pause count are recorded for the test interview.
5. During an active disposable turn, refresh once and verify the interview state and timer recover. Do not refresh after completion.
6. Complete the interview and verify its final state.

**Pass when:** the chosen audio path completes, the transcript and telemetry are associated with the correct test turn, and the interview completes. Record any technical-term substitution verbatim as an STT quality finding. A WAV-only run does not sign off browser microphone hardware or live acoustic quality.

### F10 — Examiner review, finalization, and student privacy

1. Wait for grading to complete. As the assigned examiner, inspect criterion scores, evidence, and transcript.
2. Adjust one score with a reason, confirm the total recalculates, and finalize the test result.
3. If a second test lecturer is available, verify they can view the result but cannot change scores or finalize it.
4. Sign in as the test student and open the finalized result. Verify the student view contains only permitted score and feedback fields.

**Pass when:** examiner controls work, the result is finalized, and the student view exposes no internal rationale, prompts, examiner-only evidence, or private interview data.

## Evidence register

| Flow | Result | Test record ID(s) | Sanitized evidence location | Witness initials |
| --- | --- | --- | --- | --- |
| F1 | Pass / Fail | | | |
| F2 | Pass / Fail | | | |
| F3 | Pass / Fail | | | |
| F4 | Pass / Fail | | | |
| F5 | Pass / Fail | | | |
| F6 | Pass / Fail | | | |
| F7 | Pass / Fail | | | |
| F8 | Pass / Fail | | | |
| F9 | Pass / Fail | | | |
| F10 | Pass / Fail | | | |

For each failure, record the flow and step, expected and actual results, HTTP/error code if applicable, sanitized evidence, severity, and linked issue or PR.

## Cleanup and sign-off

1. Wait for test background jobs to finish. The operator previews the repository's `TEST_` cleanup procedure and confirms its scope before applying it.
2. Apply cleanup and verify the preview reports zero remaining test rows. Verify linked test material/audio objects and test interview context items are removed.
3. Confirm production health and verify no unrelated records or the shared TTS cache were changed.
4. Attach the sanitized execution report and record the customer's disposition.

| Sign-off | Name | Signature / initials | Date |
| --- | --- | --- | --- |
| Customer representative | | | |
| AIVES operator | | | |
