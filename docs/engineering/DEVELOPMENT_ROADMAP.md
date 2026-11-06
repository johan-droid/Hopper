# Hopper — Master Development Roadmap & Engineering Backlog

**Document Version:** 1.0.0  
**Status:** ACTIVE  
**Last Updated:** 2026-11-06

---

## 1. Roadmap Overview & Milestones

The Hopper development roadmap tracks the systematic transformation of Hopper from an innovative prototype into a secure, hardened, multi-tenant enterprise CI/CD diagnostic platform.

```
[Phase 0: Audit] ===> [Phase 1: Architecture] ===> [Phase 2: Backend Hardening]
      DONE                     DONE                        IN PROGRESS
                                                                |
                                                                v
[Phase 5: Frontend] <=== [Phase 4: Auth & RBAC] <=== [Phase 3: Database & RLS]
   IN PROGRESS                 PLANNED                         PLANNED
        |
        v
[Phase 6: Integration] => [Phase 7: Security] => [Phase 8: Tests] => [Phase 9-11: Production]
      PLANNED                   PLANNED              PLANNED                 PLANNED
```

---

## 2. Phase-by-Phase Task Breakdown & Acceptance Criteria

### Phase 0: Initial Repository Intelligence (COMPLETE)
- [x] **TASK-001:** Complete repository code tree and dependency audit.
- [x] **TASK-002:** Execute existing test suites and baseline smoke tests (all passing).
- [x] **TASK-003:** Document system architecture, data models, and entry points.

### Phase 1: System Architecture & Auditing (COMPLETE)
- [x] **TASK-101:** Validate Decoupled Architecture (Option B) for Express backend on port 3000 and Vite frontend on port 5173.
- [x] **TASK-102:** Document component dependency map and boundary contracts in `docs/engineering/ARCHITECTURE_AUDIT.md`.
- [x] **TASK-103:** Create end-to-end integration and communication matrix in `docs/engineering/INTEGRATION_MATRIX.md`.

---

### Phase 2: Backend Completion & Hardening (ACTIVE)
- [ ] **TASK-201: Standardized Error Envelope Middleware**
  - *Objective:* Ensure every API error conforms to `{ "success": false, "error": { "code": string, "message": string, "details"?: any } }` with appropriate HTTP status codes (400, 401, 403, 404, 422, 500).
  - *Target File:* `backend/src/server/index.ts`, `backend/src/server/middleware/error-handler.ts`.
  - *Acceptance:* Uncaught route exceptions and validation errors return uniform JSON envelope; no raw stack traces leak in production.
- [ ] **TASK-202: HTTP Security Headers & Helmet Middleware**
  - *Objective:* Protect API against clickjacking, MIME sniffing, and cross-site scripting.
  - *Target File:* `backend/src/server/index.ts`.
  - *Acceptance:* Every response includes `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Strict-Transport-Security`, and restrictive `Content-Security-Policy`.
- [ ] **TASK-203: Workspaces & User Profiles REST APIs**
  - *Objective:* Implement controllers and routes for managing user workspaces, invites, and profile data against PostgreSQL schema `0004_workspace_tables.sql`.
  - *Target Files:* `backend/src/server/routes/workspaces.ts`, `backend/src/server/controllers/workspace.controller.ts`.
  - *Acceptance:* `GET /api/workspaces`, `POST /api/workspaces`, `GET /api/workspaces/:id/members`, `GET /api/user/profile` return validated schemas with unit tests.
- [ ] **TASK-204: Webhook Idempotency & Replay Defense**
  - *Objective:* Cache processed `x-github-delivery` IDs in Redis with 24-hour TTL to prevent duplicate processing on webhook redeliveries.
  - *Acceptance:* Sending the same delivery ID twice returns HTTP 200 with `idempotent: true` and skips BullMQ re-enqueue.

---

### Phase 3: Database & Data Integrity (PLANNED)
- [ ] **TASK-301: Migration 0005 — Row-Level Security (RLS)**
  - *Objective:* Enable RLS on all tables (`workspaces`, `workspace_members`, `runs`, `failures`, `embeddings`, `user_profiles`) with strict tenant isolation.
  - *Target File:* `backend/supabase/migrations/0005_rls_policies.sql`.
  - *Acceptance:* SQL policies enforce that users can only select/insert/update records belonging to workspaces where their `user_id` matches an active membership.
- [ ] **TASK-302: Migration Test Suite Synchronization**
  - *Objective:* Update `backend/tests/migrations.test.ts` to assert 4 migrations and verify RLS policy creation.
  - *Acceptance:* `npm run test:backend` passes cleanly.

---

### Phase 4: Authentication & Authorization (PLANNED)
- [ ] **TASK-401: Supabase JWT Verification Middleware**
  - *Objective:* Validate incoming `Authorization: Bearer <token>` against Supabase JWT secret or JWKS endpoint.
  - *Target File:* `backend/src/server/middleware/auth.ts`.
  - *Acceptance:* Valid token populates `req.user` with `{ id, email, role }`; missing/expired token returns HTTP 401 with standardized error envelope.
- [ ] **TASK-402: Tenant Role-Based Access Control (RBAC)**
  - *Objective:* Create authorization middleware verifying membership roles (`owner`, `admin`, `member`, `viewer`).
  - *Acceptance:* Restrict workspace deletion and billing management to `owner`/`admin`; members can view and rerun diagnoses.

---

### Phase 5: Frontend Architecture & UI Polish (ACTIVE)
- [x] **TASK-501: Developer Landing Page**
  - *Objective:* Design high-conversion, interactive landing page showcasing Hopper capabilities.
  - *Delivered:* `frontend/src/components/views/LandingPageView.tsx` with live in-page log analyzer, before/after comparison, pricing cards, and CLI guide.
- [ ] **TASK-502: Supabase Auth Modal & User Session State**
  - *Objective:* Add login/signup modal in `frontend/src/components/layout/Header.tsx` connecting to Supabase client.
  - *Acceptance:* User can sign in, token persists in local storage, and profile avatar displays in header.
- [ ] **TASK-503: Global Error Boundary & Toast Notification System**
  - *Objective:* Implement React error boundary preventing white-screen crashes and toast alerts for API network errors.
  - *Acceptance:* Uncaught React errors render a graceful recovery card with a reload action.

---

### Phase 6: Full-Stack Integration (PLANNED)
- [ ] **TASK-601: GitHub App Installation & Repository Sync Wizard**
  - *Objective:* Guided UI flow connecting a user's GitHub organization to their Hopper workspace.
  - *Acceptance:* Selecting a repo automatically configures webhook secrets and populates active PRs in the dashboard.
- [ ] **TASK-602: Real-Time Diagnostic Feed (Server-Sent Events / WebSockets)**
  - *Objective:* Stream diagnostic progress (Slicing -> Redacting -> Synthesizing) to the frontend in real time.
  - *Acceptance:* User sees animated progress indicators as BullMQ worker completes each stage.

---

### Phase 7: Security Hardening & Penetration Testing (PLANNED)
- [ ] **TASK-701: Multi-Tenant IDOR Audit Suite**
  - *Objective:* Automated security tests verifying that Tenant A cannot access, query, or mutate Tenant B's runs or diagnoses.
- [ ] **TASK-702: Content-Security-Policy & Cross-Origin Resource Sharing Hardening**
  - *Objective:* Restrict CORS to explicit origins and disallow inline scripts.

---

### Phase 8: Automated Testing & Continuous Verification (IN PROGRESS)
- [x] **TASK-801: Backend & Frontend Unit/Integration Suites** (89 tests passing).
- [x] **TASK-802: Orchestrator Reliability Suite** (17 tests passing).
- [ ] **TASK-803: End-to-End Browser Flow with Playwright**
  - *Objective:* Automated headless browser test of landing page diagnostic sandbox through to dashboard.

---

### Phase 9: Infrastructure & Local Development (COMPLETE)
- [x] **TASK-901: Single-Command Local Dev Orchestrator**
  - *Objective:* `npm run local`, `local:stop`, `local:status` supervising Docker, backend, worker, frontend, and Cloudflare tunnel.
  - *Delivered:* Verified under `scripts/local/` with 0 orphaned processes.

---

### Phase 10: Performance, Caching & Scalability (PLANNED)
- [ ] **TASK-1001: Redis Query Caching for Run History**
  - *Objective:* Cache frequent dashboard run listings with 60-second TTL invalidated on new webhook receipt.
- [ ] **TASK-1002: Batch Embedding Generator Worker**
  - *Objective:* Aggregate failure embeddings into batches of 10 to optimize OpenAI API throughput.

---

### Phase 11: Production Deployment & Acceptance (PLANNED)
- [ ] **TASK-1101: Multi-Stage Production Dockerfile Optimization**
  - *Objective:* Produce lean $(< 150\text{MB})$ Alpine/Debian-slim container images with non-root runtime users.
- [ ] **TASK-1102: Production Runbook & Health Probe Checklist**
  - *Objective:* Complete operational runbook for Kubernetes / Railway deployment.

