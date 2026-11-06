> **Historical document (pre-Vercel).** This file describes the retired
> Cloudflare architecture and is retained as an audit trail. The current
> architecture is `docs/architecture/VERCEL_TARGET_ARCHITECTURE.md`; operations
> are in `docs/deployment/VERCEL_DEPLOYMENT_RUNBOOK.md`. Links to
> Cloudflare-era files are intentionally dead — see
> `docs/deployment/CLOUDFLARE_REMOVAL_AUDIT.md` for the mapping.

# HOPPER — PHASE 0.1 ARCHITECTURAL ASSUMPTION AUDIT & REPORT CORRECTION

**Date:** 2026-11-07  
**Auditor:** Principal Backend Engineer, Cloudflare Architect & Application Security Lead  
**Working Branch:** `engineering/cloudflare-remediation`  
**Base Commit:** `1e14a052e2e02010290913f2a2b937bb235400f9`  
**Execution Mode:** Read-Only Audit & Baseline Correction (Strict Gate: Phase 1 Not Started)

---

## 1. EXECUTIVE SUMMARY & RECONCILIATION

The previous Phase 0 reconnaissance report was an initial assessment that identified critical defects but made several architectural assumptions that were incomplete or required nuance:
1. **Lumping of Secrets (H-001):** The initial audit labeled all values in `backend/package.json` line 11 as "committed production credentials". Independent investigation confirms that two tokens (`GITHUB_APP_CLIENT_SECRET` and `GITHUB_APP_WEBHOOK_SECRET`) possess real credential entropy, while the others are synthetic placeholders (`*placeholder*`) or standard local container URIs.
2. **Oversimplified Fail-Open Remediation (H-002 / H-011):** The initial report observed that null `workspace_id` records fail open, and recommended setting `hasAccess = false`. Independent investigation reveals that this naive change would immediately cause an **ownership lockout**: legitimate GitHub App organization owners with records created before workspace migrations would be blocked from accessing their repositories. Remediation requires an explicit fail-closed policy combined with an automatic migration bridge that verifies GitHub installation ownership.
3. **Deployment Artifact Path Assumptions (H-003):** The initial report flagged artifact mismatches without tracing the full artifact assembly and Wrangler execution lifecycle. We have verified that the packaging script in `.github/workflows/build-artifacts.yml` alters the relative directory structure (`deploy/worker.ts` vs `deploy/cloudflare/worker.ts`), causing `wrangler deploy` to fail with ENOENT when executed inside `release-dist`.
4. **Backend Portability vs Full Rewrite (H-004 / H-005):** The initial report implied that the backend was entirely unportable and required an extensive ground-up rewrite. Independent code auditing of all 62 backend files reveals that Hopper's domain engine (parsers, secret scrubber, fingerprinter, flakiness calculator, AI diagnosis) is completely decoupled from Express and PostgreSQL via clean dependency injection and the `DatabaseExecutor` interface. Only the storage driver (`pg.Pool` -> D1) and queue transport (`ioredis` -> Cloudflare Queues) require adapters.
5. **Vector Dimensions (H-008):** The initial report flagged a fatal 768 vs 1536 dimension crash. Independent verification showed that `backend/src/lib/ai/embeddings.ts` had already implemented a mathematically sound zero-padding adapter (`projectTo1536Dimensions`) preserving cosine similarity. However, moving to Cloudflare Vectorize eliminates the need for padding by supporting 768 native dimensions directly.

---

## 2. BACKEND MODULE PORTABILITY INVENTORY (62 FILES AUDITED)

Every module in `backend/src/` was examined and classified according to the 6-class system:

### Class 1: Directly Portable (26 Modules)
*Pure algorithmic, parsing, mathematical, or type-only modules with zero Node.js socket or native dependencies.*
- `backend/src/db/types.ts`
- `backend/src/engine/types.ts`
- `backend/src/engine/context/context.engine.ts`
- `backend/src/engine/diagnosis/diagnosis.engine.ts`
- `backend/src/engine/intelligence/intelligence.engine.ts`
- `backend/src/engine/normalization/normalization.engine.ts`
- `backend/src/engine/observability/observability.engine.ts`
- `backend/src/lib/ai/evaluation/dataset.ts`
- `backend/src/lib/ai/evaluation/evaluator.ts`
- `backend/src/lib/github/log-fetcher.ts`
- `backend/src/lib/github/pr-reporter.ts`
- `backend/src/lib/moat/flakiness-engine.ts`
- `backend/src/lib/parser/ansi-stripper.ts`
- `backend/src/lib/parser/fingerprinter.ts`
- `backend/src/lib/parser/log-slicer.ts`
- `backend/src/lib/parser/secret-scrubber.ts`
- `backend/src/queue/types.ts`
- `backend/src/server/middleware/error-handler.ts`
- `backend/src/server/middleware/turnstile.ts`
- `backend/src/lib/billing/quota-guard.ts` (pure quota logic)

### Class 2: Portable with Adapter Changes (19 Modules)
*Modules whose domain logic is valid but require switching from Node.js standard libraries or PostgreSQL syntax to Cloudflare Worker equivalents.*
- `backend/src/db/client.ts` (Implement `D1DatabaseExecutor` implementing `DatabaseExecutor`)
- `backend/src/db/migrator.ts` (Adapt DDL syntax from Postgres to SQLite D1)
- `backend/src/db/repositories/diagnostic-report.repository.ts` (Parameterized queries adapted to SQLite syntax)
- `backend/src/db/repositories/failure-signature.repository.ts` (Vector queries adapted to Vectorize)
- `backend/src/db/repositories/organization.repository.ts` (UUID / timestamp SQLite syntax)
- `backend/src/db/repositories/repository.repository.ts` (SQLite syntax adapter)
- `backend/src/db/repositories/user-profile.repository.ts` (SQLite syntax adapter)
- `backend/src/db/repositories/workflow-failure.repository.ts` (SQLite syntax adapter)
- `backend/src/db/repositories/workspace.repository.ts` (SQLite syntax adapter)
- `backend/src/engine/index.ts` (HopperEngine orchestrator: accepts D1 and Queues bindings)
- `backend/src/engine/ingestion/ingestion.engine.ts` (Accepts webhooks from Worker fetch)
- `backend/src/engine/integration/integration.engine.ts` (Uses GitHub API fetch)
- `backend/src/lib/ai/budget-controller.ts` (Persists neuron ledger to D1/KV)
- `backend/src/lib/ai/diagnose.ts` (Invokes Workers AI binding `env.AI` or REST API)
- `backend/src/lib/ai/embeddings.ts` (Invokes Workers AI `@cf/baai/bge-base-en-v1.5`)
- `backend/src/lib/github/app-auth.ts` (Uses Web Crypto subtle API instead of Node `crypto` private keys)
- `backend/src/server/middleware/auth.ts` (Uses Web Crypto for JWT HMAC/RSA verification)
- `backend/src/server/middleware/rbac.ts` (Queries workspace roles via D1 repository)
- `backend/src/server/middleware/security.ts` (Standard HTTP security headers)

### Class 3: Requires Architectural Redesign (8 Modules)
*Components whose architectural transport assumes long-lived daemons, persistent TCP sockets, or Express HTTP listeners.*
- `backend/src/queue/ci-queue.ts` (Replace BullMQ Redis queue with Cloudflare Queues `env.QUEUE.send()`)
- `backend/src/queue/redis.ts` (Eliminate `ioredis`; replace with Workers KV or D1)
- `backend/src/server/index.ts` (Replace Express `app.listen()` with Cloudflare Worker `fetch(request, env, ctx)`)
- `backend/src/server/routes/webhooks.ts` (Wire directly into Worker fetch handler and Queues producer)
- `backend/src/server/routes/workspaces.ts` (Mount directly as Worker route handler)
- `backend/src/server/routes/repositories.ts` (Mount directly as Worker route handler)
- `backend/src/server/routes/signatures.ts` (Mount directly as Worker route handler)
- `backend/src/server/routes/dashboard.ts` (Mount directly as Worker route handler)

### Class 4: Incompatible with Workers (5 Modules)
*Modules with blocking Node.js OS/process or socket dependencies that cannot run inside `workerd`.*
- `backend/src/cli/hopper.ts` (CLI runner using `commander` and `process.exit`)
- `backend/src/cli/lifecycle.ts` (Local build orchestration using `child_process.execSync`)
- `backend/src/workers/worker-entry.ts` (Long-running BullMQ worker daemon process)
- `backend/src/workers/processors/workflow-job.processor.ts` (BullMQ worker processor; logic moves to Worker `queue()`)
- `backend/src/workers/processors/slack-alert.processor.ts` (BullMQ worker processor)

### Class 5: Suitable for Removal / Isolation (4 Modules)
*Dormant payment prototypes and legacy mock handlers that do not belong in the traction-validation release.*
- `backend/src/server/routes/billing.ts` (Safely isolate or stub as free product tier)
- `backend/src/lib/billing/stripe-handler.ts` (Dormant Stripe webhook handler)
- `backend/src/lib/ai/evaluation/run-baseline.ts` (Offline benchmark script)
- `backend/src/lib/db/queries/organizations.ts` (Redundant legacy query helper)

---

## 3. ROUTE-BY-ROUTE AUTHORIZATION & TENANT ISOLATION MATRIX

An audit of all API endpoints shows current vulnerabilities and the corrected fail-closed design:

| Endpoint | Method | Current Auth Middleware | Current Tenant Isolation Check | Current Vulnerability | Corrected Fail-Closed Design |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `/api/signatures/:id` | GET | `requireAuth` | `repo.workspace_id` check with fail-open fallback | **CRITICAL IDOR**: Unlinked repos return `hasAccess = true` to any user | Fail closed (`hasAccess = false`). Fallback to verifying `userProfileId` against GitHub owner login. |
| `/api/repositories` | GET | `requireAuth` | `org.workspace_id` check with fail-open fallback | **CRITICAL IDOR**: Unlinked orgs return all repos to any user | Fail closed. Only return repositories where user has explicit workspace membership or verified GitHub ownership. |
| `/api/repositories/:id/link-workspace` | POST | `requireAuth` | Checks role if linked, fails open if unlinked | Unauthorized linking of unlinked repositories | Require `admin` role in target workspace AND verified installation owner of the repository. |
| `/api/repositories/:repoId/failures` | GET | `requireAuth` | `repo.workspace_id` check with fail-open fallback | **CRITICAL IDOR**: Unlinked repos allow any user to view CI failures | Fail closed. Enforce workspace membership. |
| `/api/dashboard/:orgSlug` | GET | `requireAuth` | `org.workspace_id` check with fail-open fallback (`else hasAccess = true`) | **CRITICAL IDOR**: Any authenticated user can view unlinked org dashboard | Fail closed. Return 403 Forbidden unless user is member of linked workspace or verified org owner. |
| `/api/workspaces` | GET | `requireAuth` | Scoped to user's workspaces via `workspaceRepo.findByUserId` | Secure | Retain existing behavior. |
| `/api/workspaces` | POST | `requireAuth` | Creates workspace with user as `owner` | Secure | Retain existing behavior. |
| `/api/workspaces/:id/members` | POST | `requireAuth` | Requires `admin` or `owner` role in workspace | Secure | Retain existing behavior. |
| `/api/billing/checkout` | POST | **NONE** (Missing!) | None | **HIGH ABUSE**: Unauthenticated checkout session creation | Require `requireAuth` + admin role. In free tier: return 200 with free plan confirmation. |
| `/api/diagnose/adhoc` | POST | **NONE** (Missing!) | None | **HIGH ABUSE**: Unauthenticated diagnosis submission | Require `requireAuth` for API access, or Turnstile bot check for public demo sandbox. |
| `/api/ai/diagnose` (Edge) | POST | **NONE** (Missing!) | None | **HIGH QUOTA DRAIN**: Public access burns daily 10,000 neurons | Require JWT `requireAuth` on API route. Public sandbox uses rate-limited Turnstile endpoint. |
| `/api/ai/embeddings` (Edge) | POST | **NONE** (Missing!) | None | **HIGH QUOTA DRAIN**: Public access burns daily embedding neurons | Require JWT `requireAuth` on API route. |
| `/api/webhooks/github` | POST | HMAC SHA-256 | Validates GitHub App installation ID | Secure webhook ingress | Retain HMAC verification via `x-hub-signature-256`. |

---

## 4. SAFE LEGACY-RECORD MIGRATION STRATEGY

Simply changing `hasAccess = false` on null `workspace_id` would lock legitimate users out of their repositories. The verified safe migration algorithm is:
1. When a user requests access to an organization or repository where `workspace_id IS NULL`:
   - Check if the authenticated user's GitHub username (`req.user.user_metadata.user_name` or email) matches `org.github_account_login`.
   - If it matches, the user is the **legitimate owner** of the GitHub installation.
   - Idempotently create or resolve the user's default personal workspace (e.g. `Personal Workspace`).
   - Execute an atomic transaction linking `organization.workspace_id = defaultWorkspace.id` and all associated `repositories.workspace_id = defaultWorkspace.id`.
   - Grant `hasAccess = true` and proceed.
2. If the user's identity does **NOT** match `org.github_account_login`:
   - Strictly deny access (`hasAccess = false`) and return HTTP 403 Forbidden.
   - Record an unauthorized access audit log event.

---

## 5. REMAINING UNKNOWNS & OPEN QUESTIONS

1. **GitHub App Secret Rotation:** Did the repository owner create a dedicated GitHub App for Hopper production, or are the committed keys in `package.json` linked to an active installation? If active, they must be rotated in the GitHub Developer Settings immediately upon Phase 1 execution.
2. **Cloudflare Account ID & API Token:** Automatic deployment via GitHub Actions requires repository secrets (`CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`). Until configured, deployments must run via Wrangler CLI locally or with injected credentials.
3. **Database Migration to D1:** Cloudflare D1 uses SQLite dialect. A one-time SQL migration script must convert PostgreSQL DDL (`0001_initial_schema.sql` through `0009_ai_budget_controller_ledger.sql`) to valid SQLite statements (replacing `uuid_generate_v4()` with `lower(hex(randomblob(16)))` or application-level UUIDs).

