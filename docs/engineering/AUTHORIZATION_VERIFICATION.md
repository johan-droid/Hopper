# Hopper — Endpoint-by-Endpoint Authorization & Tenant Isolation Matrix

**Auditor:** Independent Security Auditor  
**Date:** 2026-11-06  
**Status:** **VERIFIED**  

---

## 1. Role Hierarchy & Permission Model

Hopper implements a four-tiered role-based access control (RBAC) model per tenant workspace:
- **Owner:** Full administrative authority; exclusive right to delete workspaces and remove members (including admins and other owners).
- **Admin:** Administrative authority; manage workspace settings, invite members, change developer/viewer roles; cannot delete workspace or remove owners.
- **Developer:** Read access to workspace runs, failures, diagnostics; ability to run ad-hoc analyses and trigger re-runs; cannot modify workspace settings or manage members.
- **Viewer:** Read-only access to diagnostics and metrics; cannot modify state or members.
- **Non-Member / Outsider:** No access to private workspace data.
- **Unauthenticated:** Blocked at the gateway with HTTP 401.

---

## 2. Endpoint Authorization Matrix

| Endpoint | Method | Unauth | Outsider (Tenant B) | Viewer | Developer | Admin | Owner | Enforcement Mechanism |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|---|
| `/api/health` | GET | 200 | 200 | 200 | 200 | 200 | 200 | Public probe |
| `/api/diagnose/adhoc` | POST | 200 | 200 | 200 | 200 | 200 | 200 | Public CLI / Sandbox |
| `/api/webhooks/github` | POST | 401* | 401* | 401* | 401* | 401* | 401* | Constant-time HMAC-SHA256 (*200/202 if valid HMAC) |
| `/api/webhooks/stripe` | POST | 400* | 400* | 400* | 400* | 400* | 400* | Stripe-Signature HMAC (*200 if valid signature) |
| `/api/user/profile` | GET | 401 | 200 (Own) | 200 (Own) | 200 (Own) | 200 (Own) | 200 (Own) | `requireAuth()`, scoped to caller's `sub` |
| `/api/user/profile` | PUT | 401 | 200 (Own) | 200 (Own) | 200 (Own) | 200 (Own) | 200 (Own) | `requireAuth()`, updates only caller's profile |
| `/api/user/profile/workspace` | PATCH | 401 | 403 | 200 | 200 | 200 | 200 | `requireAuth()`, membership verification |
| `/api/workspaces` | GET | 401 | 200 (Own) | 200 (Own) | 200 (Own) | 200 (Own) | 200 (Own) | `requireAuth()`, lists only caller's workspaces |
| `/api/workspaces` | POST | 401 | 201 | 201 | 201 | 201 | 201 | `requireAuth()`, creator becomes Owner |
| `/api/workspaces/:id` | GET | 401 | 403 | 200 | 200 | 200 | 200 | `requireAuth()` + membership / public check |
| `/api/workspaces/:id` | PATCH | 401 | 403 | 403 | 403 | 200 | 200 | `requireWorkspaceRole(['owner', 'admin'])` |
| `/api/workspaces/:id` | DELETE | 401 | 403 | 403 | 403 | 403 | 200 | `requireWorkspaceRole(['owner'])` |
| `/api/workspaces/:id/members` | GET | 401 | 403 | 200 | 200 | 200 | 200 | `requireWorkspaceRole(['owner', 'admin', 'developer', 'viewer'])` |
| `/api/workspaces/:id/members` | POST | 401 | 403 | 403 | 403 | 201 | 201 | `requireWorkspaceRole(['owner', 'admin'])` |
| `/api/workspaces/:id/members/:userId` | PATCH | 401 | 403 | 403 | 403 | 200 | 200 | `requireWorkspaceRole(['owner', 'admin'])` |
| `/api/workspaces/:id/members/:userId` | DELETE | 401 | 403 | 403* | 403* | 200* | 200 | Self-leave allowed; Admins cannot delete Owners |
| `/api/billing/checkout` | POST | 400* | 200 | 200 | 200 | 200 | 200 | Requires valid `orgId`, `orgLogin` payload |

---

## 3. Insecure Direct Object Reference (IDOR) Test Results

Automated test results from [`backend/tests/authorization-matrix.test.ts`](file:///home/ashutoshsahoo/Downloads/Hopper/backend/tests/authorization-matrix.test.ts):

### IDOR-01: Cross-Tenant Workspace Inspection
- **Test:** Outsider with a valid JWT issued to `outsider@other.corp` attempts `GET /api/workspaces/:id` of a private workspace owned by `owner@acme.corp`.
- **Result:** **PASSED (HTTP 403 Forbidden)**. Payload: `{"success":false,"status":"error","error":{"code":"FORBIDDEN","message":"You do not have access to this private workspace"}}`.

### IDOR-02: Unauthorized Workspace Modification
- **Test:** Developer and Viewer attempt `PATCH /api/workspaces/:id` to alter workspace name and description.
- **Result:** **PASSED (HTTP 403 Forbidden)**. Blocked by `requireWorkspaceRole(['owner', 'admin'])`.

### IDOR-03: Privilege Escalation — Admin Removing Owner
- **Test:** Workspace Admin attempts `DELETE /api/workspaces/:id/members/:ownerUserId`.
- **Result:** **PASSED (HTTP 403 Forbidden)**. Explicitly rejected: `Only workspace owners can remove an owner`.

### IDOR-04: Non-Owner Deletion Attempt
- **Test:** Workspace Admin attempts `DELETE /api/workspaces/:id`.
- **Result:** **PASSED (HTTP 403 Forbidden)**. Restricted strictly to `owner`.

