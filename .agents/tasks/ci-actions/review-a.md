# GitHub Actions CI pipeline for AIVES (backend tests, frontend build, compose smoke)

Adds a single `CI` workflow with three jobs — backend tests against a Postgres service, a frontend build/lint, and a docker-compose smoke test gated on the backend — plus a dependency-free `scripts/ci-smoke.mjs` that drives auth, admin CRUD, the CSRF guard, and the Postgres-backed job queue end-to-end through nginx. The approach keeps all secrets as obvious dummies, runs the stack in `AWS_MOCK_MODE` so no cloud provider is touched, and starts only the four services the mock stack actually talks to (postgres, backend, mailpit, nginx) to sidestep the dead `minio/minio` image. The recorded run (`39131840709`) is green with all four Postgres-gated Jest suites executing (21 tests, 0 skipped).

Watch for: nothing blocking. The `actions/checkout@v7` / `actions/setup-node@v7` major-version pins are ahead of the publicly known latest majors, but the green run proves they resolved in this environment (possible, non-blocking).

**Verdict**: APPROVED

## High-level view

Secrets posture is clean: every credential in the workflow and smoke script is a self-labeled dummy (`ci-dummy-jwt-secret-not-real`, `ci-dummy-password-123`, `aives:aives`), and the compose job synthesizes `.env.ci` from `.env.example` with dummy overrides rather than committing a real env file.

Token/permissions scope is minimal — `permissions: contents: read` at the workflow level, no `GITHUB_TOKEN` writes, no deploy credentials. The deploy workflow coupling is handled by a comment pinning the workflow name to `CI`.

The Postgres gating is real and correctly wired. All four suites (step4, examSessions, jobQueue, migrations) use `const describeDb = DB_URL ? describe : describe.skip`, the backend job sets `TEST_DATABASE_URL` to a DSN that matches the `pgvector/pgvector:pg16` service (user/pass/db all `aives`, port 5432), and the recorded `postgresSuitesExecuted: 4` matches those exact files with 0 skips.

Health waits and cleanup are bounded and complete: the Postgres service uses a capped health-retry policy, the nginx health loop is bounded at 180s and exits non-zero on timeout, the Mailpit job-queue poll is bounded at 60s, and teardown runs `docker compose down -v` under `if: always()`.

<details>
<summary>Issues (1)</summary>

1. **Action major-version pins ahead of known latest** — `actions/checkout@v7` and `actions/setup-node@v7` are newer majors than the publicly documented latest (v4); harmless since the green run resolved them, but double-check they aren't typos that could break on a fresh runner. Non-blocking (possible).

</details>

<details>
<summary>Details</summary>

### Postgres gating is real, not cosmetic

This is the criterion most worth confirming, because a CI that claims to exercise Postgres but silently self-skips is worse than no CI. The four suites each resolve their gate the same way — `const DB_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;` followed by `const describeDb = DB_URL ? describe : describe.skip;` — so they only run when a DSN is present (confirmed by reading `step4.e2e.test.js`, `examSessions.e2e.test.js`, `jobQueue.e2e.test.js`, `migrations.e2e.test.js`).

The backend job provides that DSN from the service it stands up:

```
postgres: image pgvector/pgvector:pg16, user/pass/db = aives
ports: 5432:5432
env: TEST_DATABASE_URL = postgres://aives:aives@localhost:5432/aives
```

The DSN credentials and port line up with the service, so the gate opens. `ci-status.json` records `postgresSuitesExecuted: 4` with 21 tests and 0 skipped, which maps one-to-one onto the four gated files (step4 7, exam-sessions 7, jobQueue 3, migrations 4). The count is a real nonzero result from the service Postgres, not an artifact of the self-skip path staying closed. Migrations 001–015 applied against pgvector pg16 in the same run.

### Node 22 on backend, Node 20 elsewhere

The backend job pins Node 22 specifically because `npm test` runs `node --test "test/*Service.test.js"` and glob expansion for `node --test` only exists on Node >= 21; Node 20 reports "Could not find test/*Service.test.js". The compose-smoke and frontend jobs stay on Node 20, and the comment notes the node:20 runtime is still exercised through the compose image. The version split is deliberate and documented inline.

### Compose smoke trims the stack to the mock-mode surface

The smoke job starts only `postgres backend mailpit nginx`. The reasoning, captured in the workflow comment and the status file, is that `minio/dynamodb` are unused under `AWS_MOCK_MODE` and `minio/minio` has been pulled from Docker Hub (pull access denied), so starting the full compose file would fail the job on an image the mock stack never calls. `docker-compose.yml` itself is left unchanged, so this is a CI-scoping decision rather than a product change. The dead `minio/minio` reference remains a real problem for a full local `docker compose up` outside CI — out of scope for this diff but worth tracking.

### Admin creation passes every flag deliberately

`create-admin` is invoked with `--code --email --full-name --password` all supplied. The comment explains the trap: an omitted optional flag falls back to a readline prompt, and on the closed stdin of `docker compose exec -T` that prompt exits 0 without creating the user — a silent no-op that would surface later as a confusing login failure in the smoke test. Passing all flags avoids that failure mode.

### Smoke script proves the job queue, not just HTTP

`ci-smoke.mjs` is dependency-free (Node 20 global `fetch`, a hand-rolled cookie jar) and checks more than liveness. After logging in as the created admin and confirming the `ADMIN` role and `/me` identity, it fires a state-changing POST from `Origin: http://evil.example` and asserts a 403, which exercises the CSRF guard rather than assuming it. It then creates a lecturer and subject, assigns the lecturer, and lists subjects to confirm persistence. The final check polls Mailpit for the lecturer's account-setup email — that email is emitted by the `SEND_EMAIL` background job, so its arrival is a genuine end-to-end proof that the Postgres job queue worker is running, not just that the API responded. Both the nginx health loop (180s) and the Mailpit poll (60s) are bounded and throw on timeout, so neither can hang the job.

The `Origin: BASE` header on every request matters because the backend's CSRF guard compares Origin to `APP_BASE_URL`; the script documents that `SMOKE_BASE_URL` must match `APP_BASE_URL`, and the env file sets `APP_BASE_URL=http://localhost:8080` to agree with the default.

### Secrets, permissions, and cleanup

Every credential is a self-labeled dummy and the compose job builds `.env.ci` by copying `.env.example` and `sed`-patching dummy values, so no real secret or real env file is committed. The workflow grants only `contents: read` and uses no `GITHUB_TOKEN` writes or cloud credentials. Teardown runs `$DC down -v` under `if: always()`, and a failure branch dumps `ps -a` and logs before teardown, so volumes are reclaimed on every outcome.

</details>

<details>
<summary>File map</summary>

- `.github/workflows/ci.yml` — new CI workflow: backend (Node 22 + Postgres service), frontend (build + lint), compose-smoke (mock-mode stack + smoke test + `down -v`).
- `scripts/ci-smoke.mjs` — new dependency-free smoke test: health, login, CSRF 403, admin CRUD, and Mailpit-based job-queue verification.

Full diff: `git diff main` on branch `feat/ci-actions`.

</details>
