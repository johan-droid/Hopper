# Hopper — Backend API Verification & Endpoint Inventory

**Auditor:** Independent Backend Quality & API Engineer  
**Date:** 2026-11-06  
**Status:** **VERIFIED**  

---

## 1. Complete REST API Endpoint Inventory

| # | Route | Method | Auth | Primary Status | Error Codes | Description & Contract |
|---|---|:---:|:---:|:---:|:---:|---|
| 1 | `/api/health` | GET | None | 200 OK | 503 | Probes API uptime, PostgreSQL pool, and Redis connection |
| 2 | `/api/webhooks/github` | POST | HMAC | 200 / 202 | 400, 401, 429, 503 | Sub-50ms GitHub check_run/workflow_run ingress |
| 3 | `/api/webhooks/stripe` | POST | Stripe | 200 OK | 400, 500, 503 | Stripe subscription checkout & renewal handler |
| 4 | `/api/billing/checkout` | POST | Optional/Auth | 200 OK | 400, 500 | Creates Stripe hosted checkout session for Pro/Team tiers |
| 5 | `/api/diagnose/adhoc` | POST | None | 200 OK | 400, 500 | Ad-hoc log analysis sandbox (Zod validated response) |
| 6 | `/api/dashboard/:orgSlug` | GET | None | 200 OK | 500 | Organization dashboard telemetry & flaky test leaderboard |
| 7 | `/api/signatures/:id` | GET | None | 200 OK | 500 | Failure signature cross-run timeline and historical occurrences |
| 8 | `/api/repositories/:repoId/failures` | GET | None | 200 OK | 500 | Recent workflow failure feed for repository |
| 9 | `/api/workspaces` | GET | Bearer | 200 OK | 401, 500 | Lists workspaces associated with authenticated caller |
| 10 | `/api/workspaces` | POST | Bearer | 201 Created | 400, 401, 500 | Creates workspace (caller becomes owner) |
| 11 | `/api/workspaces/:id` | GET | Bearer | 200 OK | 401, 403, 404 | Workspace details (enforces membership/public visibility) |
| 12 | `/api/workspaces/:id` | PATCH | Bearer (Admin+) | 200 OK | 400, 401, 403, 404 | Updates workspace name, description, public status |
| 13 | `/api/workspaces/:id` | DELETE | Bearer (Owner) | 200 OK | 401, 403, 404 | Deletes workspace and cascades to child memberships |
| 14 | `/api/workspaces/:id/members` | GET | Bearer (Member) | 200 OK | 401, 403 | Lists all members in workspace with profiles and roles |
| 15 | `/api/workspaces/:id/members` | POST | Bearer (Admin+) | 201 Created | 400, 401, 403 | Adds/invites member with assigned role |
| 16 | `/api/workspaces/:id/members/:userId` | PATCH | Bearer (Admin+) | 200 OK | 400, 401, 403, 404 | Updates role for an existing workspace member |
| 17 | `/api/workspaces/:id/members/:userId` | DELETE | Bearer | 200 OK | 401, 403, 404 | Removes member (Admins cannot remove Owners) |
| 18 | `/api/user/profile` | GET | Bearer | 200 OK | 401, 500 | Retrieves authenticated user profile |
| 19 | `/api/user/profile` | PUT | Bearer | 200 OK | 400, 401, 500 | Upserts user profile information |
| 20 | `/api/user/profile/workspace` | PATCH | Bearer | 200 OK | 400, 401, 403 | Switches current active workspace for user |
| 21 | `/` | GET | None | 200 OK | — | API Gateway root info metadata |

---

## 2. Standardized Error Envelope Verification

All routes are bound to the centralized error handling middleware in [`backend/src/server/middleware/error-handler.ts`](file:///home/ashutoshsahoo/Downloads/Hopper/backend/src/server/middleware/error-handler.ts).

### Error Envelope Contract:
```json
{
  "success": false,
  "status": "error",
  "error": {
    "code": "UNAUTHORIZED | FORBIDDEN | BAD_REQUEST | NOT_FOUND | INTERNAL_ERROR",
    "message": "Human readable explanation",
    "path": "/api/workspaces",
    "method": "GET",
    "requestId": "hopper-1793953649679-mbxl2ke",
    "details": []
  }
}
```

### Verified Behaviors:
- **No Stack Leakage:** In production environments (`NODE_ENV === 'production'`), error responses omit internal stack traces while logging full traces with correlation `requestId` to stdout/stderr.
- **Consistent Status Codes:** Validation errors return `400 Bad Request`, auth failures return `401 Unauthorized`, permission denials return `403 Forbidden`, missing resources return `404 Not Found`.

---

## 3. Data Mutation Verification

Database modifications were verified by asserting state before and after execution:
1. `POST /api/workspaces` inserts rows into both `workspaces` and `workspace_members` tables.
2. `PATCH /api/workspaces/:id` modifies the database record and returns the updated `updated_at` timestamp.
3. `DELETE /api/workspaces/:id` physically removes the record from PostgreSQL.
4. `PUT /api/user/profile` persists bio, username, and avatar URL to `user_profiles`.

