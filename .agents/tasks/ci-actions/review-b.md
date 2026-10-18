# CI coverage for backend, frontend, and the Compose stack

This change adds a GitHub Actions pipeline that validates backend tests against a real pgvector/Postgres service, builds and lints the frontend, and exercises the containerized application through nginx. The Compose smoke path creates an administrator, verifies authenticated persistence and CSRF rejection, and confirms that the Postgres-backed email job reaches Mailpit. The recorded green run reports all four database-gated suites executing rather than skipping. **Watch for:** **confirmed** — no HIGH or MEDIUM blocking concerns remain in the requested security, database-gating, health-wait, or cleanup areas.

**Verdict**: APPROVED

## High-level view

The backend job supplies `TEST_DATABASE_URL` at job scope and maps it to the pgvector service on localhost, so the database-gated suites execute against CI Postgres. The recorded run confirms four gated suites and 21 tests ran with zero skips.

The container smoke job validates the runtime topology separately from the direct test job. It starts only Postgres, backend, Mailpit, and nginx under mock cloud providers, then drives authentication, persisted admin operations, CSRF enforcement, and asynchronous email delivery through public runtime boundaries.

The workflow uses read-only repository permissions and only explicit dummy credentials. Both readiness loops are bounded, the job itself has a timeout, failure logs are retained, and Compose volumes are removed under `always()` cleanup.

<details>
<summary>Issues (0)</summary>

No actionable HIGH/MEDIUM findings.

</details>

<details><summary>Details</summary>

## Postgres gating is exercised instead of silently skipped

The `pgvector/pgvector:pg16` service is exposed on localhost, and job-scoped `TEST_DATABASE_URL` is inherited by the backend test commands. The evidence in `ci-status.json` records all four gated suites running 21 tests with zero skips, while the smoke path separately proves persisted API behavior and Postgres job-queue processing through Mailpit.

## Runtime smoke crosses the deployed trust boundaries

Application requests run through nginx, and the smoke requires a foreign-origin state change to receive 403. Repository permissions are limited to `contents: read`; all database, JWT, and administrator credentials are explicit CI dummy values, and cloud providers run in mock mode.

## Readiness and teardown stay bounded on failures

Postgres has ten health retries, nginx/backend readiness has a 180-second ceiling, Mailpit delivery has a 60-second deadline, and the Compose job has a 20-minute outer timeout. Failure logs precede an `always()`-guarded `$DC down -v`, preserving diagnostics before containers and database volumes are removed.

The diff contains only the workflow and smoke script. The recorded full-local-Compose MinIO image problem is unchanged outside this branch and is out of scope; no local suites or builds were rerun for this review, as requested.

</details>

<details>
<summary>File map</summary>

- `.github/workflows/ci.yml` — adds backend, frontend, and bounded Compose smoke jobs with read-only permissions and unconditional teardown.
- `scripts/ci-smoke.mjs` — drives authenticated persistence, CSRF rejection, and queued email delivery through nginx.

Full diff: `git diff main -- .github/workflows/ci.yml scripts/ci-smoke.mjs`

</details>
