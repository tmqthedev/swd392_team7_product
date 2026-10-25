# INCIDENT REPORT: UNREVIEWED MERGE & SYSTEM RECONCILIATION

- **Incident ID:** `INC-20261019-MAIN-UNREVIEWED-MERGE`
- **Severity:** P1 (Critical)
- **Resolved By:** Senior DevOps & Lead System Architect
- **Resolution Timestamp:** 2026-10-19T03:38:00+07:00

---

## 1. Root Cause Analysis (RCA)

Commit `35628e8` merged branch `982434a` (an old prototype branch branched off Step 2 at `3e6b650`) directly into `origin/main` (`d4460c0`).
The merge kept the real pages and real auth context, but introduced prototype files in `frontend/src/features/`, added SCSS dependencies, and modified shared UI wrappers.

### Critical Git Trap Discovery:
- **Parent 1 (`HEAD~1`):** `982434a` (old prototype branch).
- **Parent 2 (`HEAD^2`):** `d4460c0` (production release Step 11).
- **Hazard:** Running `git revert -m 1 35628e8` would treat `Parent 1` as the mainline and revert `Parent 2`, effectively deleting all 369 files from Steps 4–11 (backend services, PostgreSQL migrations, Docker stack, Terraform, Lambda STT).
- **Decision:** Do NOT blindly run `git revert -m 1`. Instead, perform targeted reconciliation and hardening.

---

## 2. Applied Fixes & Port/API Reconciliation

1. **SCSS Build Hardening:** Executed `npm ci` in `frontend/` to ensure `sass` is properly installed in `node_modules`. Verified `vite build` and Docker multi-stage build succeed.
2. **API Client Reconciliation (`apiClient.js`):** Added `credentials: 'include'` for cookie auth, normalized paths to prevent `/api/api` double prefixes, and preserved error codes.
3. **Audio Service Sync (`audioService.js`):** Re-exported from `audioApi.js` to eliminate stale mocked stubs.
4. **Shared Components Hardening:**
   - `Feedback`: Added support for `onClose` callback to handle user dismiss actions.
   - `Input` & `Textarea`: Added `useId` fallback to ensure accessible label-input associations.
5. **Contract Documentation Alignment:**
   - Synchronized `frontend/docs/api-for-backend.md` and `frontend/docs/openapi.yaml` with production cookie-based authentication, uppercase domain enums (`APPROVED`, `DRAFT`, etc.), and Socket.IO `/socket.io/` namespace `/interview`.

---

## 3. Verification & Test Evidence

| Test Suite | Environment | Result |
|---|---|---|
| Backend Unit Tests (`npm test`) | Local Node 22 | 401/401 Passed (12.1s) |
| Backend E2E Tests (with PostgreSQL) | Local PostgreSQL `:5432` | 125/125 Passed (11.5s) |
| Frontend Lint (`npm run lint`) | Local Vite/Oxlint | 0 Errors, 15 Warnings |
| Frontend Production Build (`npm run build`) | Local Vite 8.3 | 0 Errors, `dist/` built (2.27s) |
| Nginx Reverse Proxy Docker Build | Docker Engine 29.8 | Succeeded (`docker build -f nginx/Dockerfile .`) |
| Local Stack Health & Smoke | Docker Compose `:8080` | `GET /health` 200 OK, `ci-smoke.mjs` SMOKE PASSED |
| Production CloudFront & Live EC2 | AWS Live `https://d36ezmiqpl9miu.cloudfront.net` | `GET /api/auth/me` 401 Unauthorized (Express alive, ~90ms latency) |
