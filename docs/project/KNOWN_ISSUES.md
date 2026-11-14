# Hopper — Known Issues & Technical Debt Register (KNOWN_ISSUES.md)

---

## 1. Issue Tracking Matrix

| Issue ID | Severity | Subsystem | Title | Status | Resolution / Mitigation |
|---|:---:|---|---|:---:|---|
| **ISSUE-001** | HIGH | Database | Missing Row-Level Security (RLS) on core tables | **RESOLVED** | Migration `0005_rls_policies.sql` |
| **ISSUE-002** | MEDIUM | API Gateway | Inconsistent API Error Envelopes on Route Exceptions | **RESOLVED** | Standardized `ApiError` middleware |
| **ISSUE-003** | MEDIUM | API Gateway | Missing Standard HTTP Security Headers (Helmet, CSP) | **RESOLVED** | `securityHeadersMiddleware` |
| **ISSUE-004** | MEDIUM | API Gateway | Missing Workspaces & Profile REST Endpoints | **RESOLVED** | Added `/api/workspaces` & `/api/user` |
| **ISSUE-005** | LOW | Auth | Supabase JWT Validation Not Enforced on Local Ad-hoc | **RESOLVED** | `requireAuth` middleware added |
| **ISSUE-006** | HIGH | Local Dev | Detached Child Process Hierarchy Lingering After SIGTERM | **RESOLVED** | Process tree drain in `process-manager.mjs` |
| **ISSUE-007** | MEDIUM | Database | Migrator Crashed on Subdirectories in `supabase/migrations` | **RESOLVED** | Added `isFile()` filter in `migrator.ts` |
| **ISSUE-008** | MEDIUM | Frontend | TypeScript State Incompatibility (`simulatedPlan` vs `planTier`) | **RESOLVED** | Unified state in `useAppStore.ts` |
| **ISSUE-009** | HIGH | Auth | Serverless OAuth State Loss Across Function Instances | **RESOLVED** | Cryptographically signed HMAC state |
| **ISSUE-010** | MEDIUM | Database | Performance Overhead on Deep Leaf Table RLS Joins | **RESOLVED** | Denormalized `workspace_id` in Migration `0011` |
| **ISSUE-011** | HIGH | Architecture | Legacy Cloudflare, Redis & BullMQ Dependencies Lingering | **RESOLVED** | Fully removed; guarded by CI and Doctor |
| **ISSUE-012** | HIGH | Config | In-Memory Fallback Adapters Permitted in Production | **RESOLVED** | `validateRuntimeConfig()` fails closed |
| **LIMIT-001** | LOW | Deployment | Vercel Hobby Cron Frequency Limited to Daily | **ACTIVE** | Backstop only; primary path is push delivery |
| **LIMIT-002** | LOW | Queue | Vercel Queues Lacks Native Dead-Letter Queue | **ACTIVE** | Application-level DLQ in PostgreSQL |
| **LIMIT-003** | LOW | Dev / CI | Local Offline Runs Rely on Mock AI by Default | **ACTIVE** | By design; live keys optional |

---

## 2. Active Limitations & Architectural Constraints

### LIMIT-001: Vercel Hobby Cron Frequency Limited to Once Daily
- **Description:** On the Vercel Hobby plan, cron jobs are scheduled at most once per 24 hours (`cron: "0 0 * * *"` in `vercel.json`).
- **Impact:** If a queue consumer process crashes while holding a lease lock, the backstop drain (`/api/cron/queue-drain`) will only reap the expired lock during the daily run.
- **Mitigation:** Vercel Queues push delivery is the primary delivery mechanism; the cron drain is strictly an emergency backstop. On Vercel Pro, the cron frequency can be calibrated to every 10 minutes.

### LIMIT-002: Vercel Queues Has No Built-in Dead-Letter Queue
- **Description:** Vercel Queues does not natively provide a secondary DLQ topic for messages that exceed maximum delivery retries.
- **Impact:** Terminal failures could be silently lost if not explicitly intercepted.
- **Mitigation:** Hopper manages its own dead-letter ledger in PostgreSQL (`hopper_job_dead_letters`). When a job exhausts `max_attempts` (default 5), `hopper_fail_job` atomically transitions the row into `hopper_job_dead_letters` with full payload and error stack traces.

### LIMIT-003: Local Offline Runs Rely on Mock AI by Default
- **Description:** For out-of-the-box local developer convenience, `AI_PROVIDER` defaults to `mock`.
- **Impact:** Diagnostic outputs from the ad-hoc API in local dev return synthetic test diagnoses rather than live LLM completions unless `PUTER_AUTH_TOKEN`, `ANTHROPIC_API_KEY`, or `OPENAI_API_KEY` is provided.
- **Mitigation:** Developers can use the in-browser Puter AI option in `InvestigationPage.tsx` for real-time live LLM completions (DeepSeek V3, Qwen 2.5 Coder) without configuring any backend API keys.

---

## 3. Resolved Issues & Post-Mortems

### ISSUE-009: Serverless OAuth State Loss Across Function Instances
- **Symptom:** During GitHub OAuth, `/api/auth/github` generated an in-memory random state GUID stored in a local `Set<string>`. On Vercel, the subsequent callback to `/api/auth/github/callback` frequently hit a different serverless instance, resulting in `401 Unauthorized` ("Invalid OAuth state").
- **Resolution:** Replaced in-memory cache with HMAC-signed stateless tokens (`generateSignedOAuthState()` and `verifySignedOAuthState()` in `backend/src/lib/github/user-auth.ts`). The token encodes a timestamp and is signed by `JWT_SECRET`.
- **Verification:** Verified by `backend/tests/github-auth-sync.test.ts`.

### ISSUE-010: Performance Overhead on Deep Leaf Table RLS Joins
- **Symptom:** Evaluating Row-Level Security policies on `diagnostic_reports`, `workflow_failures`, and `failure_signatures` required 3-table joins through `repositories` and `organizations` to verify workspace membership, causing high query latency during burst ingestion.
- **Resolution:** Authored migration `0011_denormalize_workspace_id_and_leaf_rls.sql`, adding `workspace_id` directly onto leaf tables and indexing it. Simplified RLS policies to evaluate directly against `workspace_id = current_setting('app.current_workspace_id', true)::uuid`.
- **Verification:** Verified by `backend/tests/security-tenant-isolation.test.ts`.

### ISSUE-011: Legacy Cloudflare, Redis & BullMQ Dependencies Lingering
- **Symptom:** Early prototypes relied on Cloudflare Workers, Redis, and BullMQ. Traces of these configurations created confusion about the system of record.
- **Resolution:** Completely purged `wrangler.toml`, Cloudflare deployment scripts, `ioredis`, and `bullmq`. Built PostgreSQL durable outbox (`0010_durable_queue_and_coordination.sql`). Added CI and `npm run doctor` guards preventing reintroduction.
- **Verification:** `npm run doctor` executes retired-artifact checks with 100% pass rate.
