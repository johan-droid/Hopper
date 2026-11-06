# Hopper — Known Issues & Technical Debt Registry

**Document Version:** 1.0.0  
**Status:** ACTIVE  
**Last Updated:** 2026-11-06

---

## 1. Issue Tracking Matrix

| Issue ID | Severity | Subsystem | Title | Status | Resolution Milestone |
|---|:---:|---|---|:---:|---|
| **ISSUE-001** | HIGH | Database | Missing Row-Level Security (RLS) policies on core tables | **RESOLVED** | Phase 3 (Migration 0005) |
| **ISSUE-002** | MEDIUM | API Gateway | Inconsistent API Error Envelopes on Route Exceptions | **RESOLVED** | Phase 2 (TASK-201) |
| **ISSUE-003** | MEDIUM | API Gateway | Missing Standard HTTP Security Headers (Helmet, CSP) | **RESOLVED** | Phase 2 (TASK-202) |
| **ISSUE-004** | MEDIUM | API Gateway | Missing Workspaces & Profile REST Endpoints | **RESOLVED** | Phase 2 (TASK-203) |
| **ISSUE-005** | LOW | Auth | Supabase JWT Validation Not Enforced on Local Ad-hoc Endpoint | **RESOLVED** | Phase 4 (TASK-401) |
| **ISSUE-006** | HIGH | Local Dev | Detached Child Process Hierarchy Lingering After SIGTERM | **RESOLVED** | Phase 9 (`process-manager.mjs`) |
| **ISSUE-007** | MEDIUM | Database | Migrator Crashed on Subdirectories in `supabase/migrations` | **RESOLVED** | Phase 0 (`migrator.ts:37`) |
| **ISSUE-008** | MEDIUM | Frontend | TypeScript State Incompatibility (`simulatedPlan` vs `planTier`) | **RESOLVED** | Phase 5 (`useAppStore.ts`) |

---

## 2. Active Issues & Remediation Plans

*No critical or high-severity blocking issues currently open. All foundational security, API standardization, RLS, and process management issues resolved.*

---

## 3. Resolved Issues & Post-Mortem Notes

### ISSUE-001: Missing Row-Level Security (RLS) Policies on Core Tables
- **Resolution:** Authored migration `0005_rls_policies.sql` enabling RLS on `organizations`, `repositories`, `failure_signatures`, `workflow_failures`, `diagnostic_reports`, `workspaces`, and `workspace_members`. Applied to PostgreSQL and verified with `backend/tests/migrations.test.ts`.

### ISSUE-002: Inconsistent API Error Envelopes on Route Exceptions
- **Resolution:** Built `backend/src/server/middleware/error-handler.ts` exporting `errorHandlerMiddleware` and `ApiError`. Standardized response structure across all status codes (400, 401, 403, 404, 500) with correlation `requestId`.
- **Verification:** Verified in `backend/tests/workspace-api.test.ts`.

### ISSUE-003: Missing Standard HTTP Security Headers (Helmet, CSP)
- **Resolution:** Implemented `backend/src/server/middleware/security.ts` applying OWASP headers: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `X-XSS-Protection: 0`, and `Referrer-Policy: strict-origin-when-cross-origin`.
- **Verification:** Verified by live assertion in `backend/tests/workspace-api.test.ts`.

### ISSUE-004: Missing Workspaces & Profile REST Endpoints
- **Resolution:** Implemented `WorkspaceRepository`, `UserProfileRepository`, `createWorkspaceRouter` (`/api/workspaces`), and `createUserRouter` (`/api/user`). Added RBAC middleware and role checking (`['owner', 'admin', 'developer', 'viewer']`).
- **Verification:** Verified by unit and integration tests with full test suite passing.

### ISSUE-005: Supabase JWT Validation Not Enforced on Local Ad-hoc Endpoint
- **Resolution:** Implemented `backend/src/server/middleware/auth.ts` supporting standard JWT Bearer validation with cryptographic HMAC-SHA256 signature checking and dev bypass headers.

---

## 3. Resolved Issues & Post-Mortem Notes

### ISSUE-006: Detached Child Process Hierarchy Lingering After SIGTERM
- **Resolution:** Implemented `getDescendantPids(rootPid)` in `scripts/local/process-manager.mjs` traversing `/proc/<pid>/stat` to discover all child, grandchild, and spawned subprocesses (`npm` -> `sh` -> `tsx` -> `node`). Orchestrator now drains the full descendant tree before releasing orchestrator locks.
- **Verification:** Verified by `scripts/local/tests/live-session-test.mjs` with 0 orphaned processes remaining after teardown.

### ISSUE-007: Migrator Crashed on Subdirectories in `supabase/migrations`
- **Resolution:** Added `fs.statSync(filePath).isFile()` filter to `backend/src/db/migrator.ts` to ignore empty directories inadvertently created by container mount points.
- **Verification:** Migration suite `backend/tests/migrations.test.ts` passing cleanly.

### ISSUE-008: TypeScript State Incompatibility (`simulatedPlan` vs `planTier`)
- **Resolution:** Unified `simulatedPlan` and `planTier` in `frontend/src/store/useAppStore.ts` with mutual synchronization in setters, restoring full backward compatibility for `BillingPlansView.tsx` and `Header.tsx`.
- **Verification:** `npm run lint` compiles with 0 type errors.
