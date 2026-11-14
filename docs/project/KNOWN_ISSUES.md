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
| **ISSUE-013** | HIGH | Security | Session Token in URL Query & Over-Privileged OAuth Scopes | **RESOLVED** | HttpOnly cookie session + scoped `read:user,user:email` |
| **ISSUE-014** | MEDIUM | Frontend | Login Button Statically Prerendered Disabled During SSR | **RESOLVED** | Removed `status === 'loading'` check on login button |
| **ISSUE-015** | MEDIUM | Frontend | Landing Telemetry Fabricated/Wrong-Shaped When Backend Absent | **RESOLVED** | Real `/api/health` metric paths, no invented values |
| **ISSUE-016** | LOW | Security | Client-Supplied OAuth `redirect_uri` Passthrough | **RESOLVED** | `GET /api/auth/github` no longer accepts `redirect_uri` |
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

### LIMIT-003: Local Offline Runs Rely on Mock / Deterministic AI by Default
- **Description:** For out-of-the-box local developer convenience, `AI_PROVIDER` can run offline without external API keys.
- **Impact:** Diagnostic outputs from the ad-hoc API in local dev return deterministic heuristic diagnoses rather than live LLM completions unless `GROQ_API_KEY` or `NVIDIA_NIM_API_KEY` is provided.
- **Mitigation:** Developers can configure a free Groq API key (`GROQ_API_KEY`) or NVIDIA NIM key (`NVIDIA_NIM_API_KEY`) in `.env` to enable live multi-provider inference with automatic failover. Deterministic fallback ensures no breakage when offline.

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

### ISSUE-013: Session Token Exfiltration in OAuth Callback Query Parameters & Excessive Identity Scopes
- **Symptom:** OAuth callback returned JWT sessions via URL query string `?token=...`, exposing tokens to browser history, proxy access logs, and referrer headers. User sign-in also requested `repo` and `read:org` scopes when only identity was needed.
- **Resolution:** Reduced OAuth scopes to minimal identity scopes (`read:user,user:email`). Removed `github_token` from serialized JWT session payloads. Implemented HttpOnly, Secure, SameSite=Lax cookie delivery (`hopper_session`) and clean 302 redirect to `/app/overview`.
- **Verification:** Verified by `backend/tests/github-auth-sync.test.ts` and automated end-to-end auth flows.

### ISSUE-014: Login Button Statically Prerendered Disabled During SSR
- **Symptom:** Next.js static prerendering of `/login` initialized `useSession` with `status: 'loading'`, resulting in HTML output with `<button disabled="">` and `cursor-not-allowed`, preventing immediate user interaction.
- **Resolution:** Removed `status === 'loading'` guard from the primary "Continue with GitHub" button in `LoginPage.tsx`, keeping it interactable immediately upon page view.
- **Verification:** Verified with production Next.js prerender build (`20/20` static pages).

### ISSUE-015: Landing Backend-State Section Read Wrong Metric Shape and Fabricated Values
- **Symptom:** `BackendStateVisualization` read `dependencies.queue.pending` although `/api/health` nests counts under `dependencies.queue.metrics` (`pending`, `processing`, `completed`, `failed`, `dead`), so the outbox pending count was always 0 regardless of real queue state. A hardcoded `?? 2.1` database-latency fallback and a `0 jobs` offline placeholder presented invented telemetry, and "System 100% Operational" overstated the health contract.
- **Resolution:** Metric paths corrected to `queue.metrics.*`; queue-derived node states (`outbox`, `claim`) render `unknown` until live metrics exist; offline/missing values render `Offline` / `—`; status copy now reads "All Systems Operational"; internal infra advice (`npm run infra:up`) removed from the public page.
- **Verification:** `npm run lint`, `npm test` (226/226), `npm run test:frontend` (34/34), `npm run build` — all passing.

### ISSUE-016: Client-Supplied OAuth `redirect_uri` Passthrough on the Authorization Entry Point
- **Symptom:** `GET /api/auth/github` forwarded any client-provided `redirect_uri` into the GitHub authorize URL, exposing a prefix-match open-redirect surface against the registered callback.
- **Resolution:** The query parameter is ignored; the authorization URL is always built from server-side configuration only. A duplicate `POST /api/auth/logout` route declaration left by an intermediate edit was also removed.
- **Verification:** `npm run lint` and `npm test` (226/226) after removal.

### ISSUE-017: Missing Multi-Resolution Favicon 404 & Squished Login Button Height
- **Symptom:** Browser navigation to `/login` triggered a 404 on `/favicon.ico` because only a legacy cyan SVG icon was present. Furthermore, the "Continue with GitHub" button on `LoginPage.tsx` inherited the button primitive's default `h-9` (36px) constraint, causing vertical padding conflicts.
- **Resolution:** Generated multi-resolution `favicon.ico` (16x16, 32x32, 48x48) in `frontend/public/` and `frontend/app/`. Configured Next.js metadata `layout.tsx` with dual SVG and ICO entries aligned with Hopper's crimson brand palette (`#f43f5e`). Updated `LoginPage.tsx` button to explicitly declare `h-12` (48px) with `px-4` and balanced `h-5 w-5` GitHub icon.
- **Verification:** Verified with `agent-browser` CDP automation (live click redirected to GitHub OAuth), `file` icon validation, `npm run test:frontend` (34/34), and `npm run build` (21/21 static pages).

### ISSUE-018: Vercel Analytics Script Failure & Aggressive Viewport Prefetch Saturation
- **Symptom:** Console reported `Loading failed for script https://hopper-rho.vercel.app/_vercel/insights/script.js` and `[Vercel Web Analytics] Failed to load script` because Web Analytics was not activated on the Vercel project. In parallel, Next.js `<Link>` components in the viewport automatically initiated 15+ concurrent prefetch requests for deep app routes (such as Monaco editor bundles), saturating network bandwidth and causing initial page sluggishness.
- **Resolution:** Removed `<Analytics />` from `Providers` and `AppRoot`. Defaulted `prefetch={false}` on `Link` and `NavLink` in `router-compat.tsx`. Added a 10-second server cache with HTTP edge caching (`s-maxage=10, stale-while-revalidate=30`) on `/api/health` to eliminate multi-query database latency on health polling.
- **Verification:** Verified with `npm run lint`, `npm test` (226/226), `npm run test:frontend` (34/34), and `npm run build` (21/21 static pages).
