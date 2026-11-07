# Hopper: Current State Architecture & Baseline Audit

*Audit Date: 2026-11-07*  
*Repository Ref: `main`*  
*Auditor: Principal Software Architect, Senior Full-Stack Engineer, AppSec & AI Systems Engineer*

---

## 1. Executive Summary

Hopper is structured as a mono-repository containing:
- **Frontend** (`frontend/`): React 18, Vite 5, Tailwind CSS, TanStack Query v5, Zustand, React Router v7.
- **Backend** (`backend/`): Node 20+, Express, TypeScript, Zod, PostgreSQL (via `pg`), Supabase Auth/DB client.
- **Puter Serverless App** (`puter/` & `frontend/public/puter/`): Zero-backend implementation using Puter.js v2 SDK (`puter.ai`, `puter.kv`, `puter.fs`, `puter.net`).
- **Serverless API** (`api/index.ts` & `vercel.json`): Express control-plane adapter for Vercel Functions.

---

## 2. Answers to the 10 Required Audit Questions

### 1. Is Puter.js called by the primary Hopper workflow, or is it only used by a standalone demonstration?
- **Evidence**:
  - `backend/src/lib/ai/diagnose.ts` (`callPuterLlm`): Integrated into the backend AI pipeline when `AI_PROVIDER=puter`.
  - Standalone app in `puter/index.html` and `frontend/public/puter/index.html` directly invokes `window.puter.ai.chat()`.
  - **Gap Identified**: The primary React app's `InvestigationPage.tsx` previously posted ad-hoc requests only to `/api/diagnose/adhoc`. If the backend lacks `PUTER_AUTH_TOKEN`, it defaulted to deterministic mode without offering in-browser Puter AI execution. Phase 2 must bridge browser Puter.js directly into the primary React interface.

### 2. Does the primary AI diagnosis path really invoke Puter, and can its output pass the existing validation schema?
- **Evidence**:
  - In `backend/src/lib/ai/diagnose.ts`, `callPuterLlm` calls `https://api.puter.com/drivers/call/puter-chat-completion` with `buildDiagnosisSystemPrompt()` and `buildDiagnosisUserPrompt()`.
  - Raw JSON completion is parsed with `extractAndParseJson` and validated against `DiagnosisOutputSchema` (`zod`).
  - Strict evidence tagging `<UNTRUSTED_CI_LOG>` ensures passive log analysis.

### 3. Are authentication, repository authorization, and AI identity/usage handled independently?
- **Evidence**:
  - **User Identity (Auth)**: Handled via GitHub OAuth (`/api/auth/github` and `/login/callback`), issuing Hopper session JWTs.
  - **Repository Authorization**: Handled via GitHub App installation tokens (`backend/src/lib/github/app-auth.ts`), scoped to specific repos.
  - **AI Identity/Usage**: Completely decoupled; uses Puter user-pays browser session or `PUTER_AUTH_TOKEN`. No GitHub tokens are passed to AI providers.

### 4. Is there exactly one authoritative application identity and session model?
- **Evidence**:
  - Session token is minted by `createSessionToken()` in `backend/src/lib/github/user-auth.ts` and validated by `requireAuth()` in `backend/src/server/middleware/auth.ts`.
  - **Gap Identified**: In `backend/src/server/middleware/auth.ts` and `user-auth.ts`, `DEFAULT_DEV_JWT_SECRET` was allowed as a fallback. In production (`NODE_ENV === 'production'`), missing `JWT_SECRET` must fail closed. Also, in-memory `oauthStateCache` (`Set<string>`) in `auth.ts` cannot scale across Vercel serverless function instances; it needs signed state verification.

### 5. Can a GitHub webhook create a durable job and reliably trigger processing?
- **Evidence**:
  - `backend/src/server/routes/webhooks.ts` verifies HMAC-SHA256 signatures with `timingSafeEqual`.
  - Replay deduplication claims delivery IDs via `claimWebhookDelivery(deliveryId)`.
  - Durable job persistence via `enqueueWorkflowJob(eventData)` into PostgreSQL (`hopper_job_queue`) *before* returning HTTP 202.

### 6. What happens when a queue delivery is duplicated, delayed, retried, or lost?
- **Evidence**:
  - `backend/src/queue/job-store.ts` uses PostgreSQL `hopper_claim_jobs` (`FOR UPDATE SKIP LOCKED`).
  - Unique idempotency keys prevent duplicate rows.
  - Exponential backoff is calculated per attempt.
  - After `maxAttempts` (default 3), jobs move to `hopper_job_dead_letters`.

### 7. Can a task recover after a function timeout or process crash?
- **Evidence**:
  - `reapExpired()` invokes `hopper_reap_expired_job_locks()`, unlocking abandoned jobs whose `lock_expires_at < NOW()`.
  - A crashed serverless function does not cause dropped jobs.

### 8. Where does arbitrary repository code execute, and what credentials can it access?
- **Evidence**:
  - No arbitrary repository code executes in Vercel Functions or the backend API.
  - Only vetted diagnostic routines (log parsing, secret scrubbing, AST checks) run on the control plane.
  - Any future automated checks must run in an isolated sandbox (e.g. GitHub Actions workflow runners) with ephemeral tokens, never control-plane database credentials.

### 9. Which integrations have been verified against real external services, and which have only passed mocks or unit tests?
- **Verified Live**:
  - Puter.js in-browser AI catalog and HTTP serving (`http://localhost:8088` test passed).
  - GitHub OAuth initiation redirect (`github.com/login/oauth/authorize`).
- **Mocked / Unit Tested**:
  - GitHub App token minting (tested with mock tokens in Vitest).
  - PostgreSQL queues (tested with in-memory executor and local PG).
  - Stripe billing endpoints (mock webhooks).
  - Vercel production deployment (staged, not live-deployed).

### 10. Which required features are genuinely available within free-tier limits and current plan terms?
- **Vercel Hobby**: 60s function timeout, 1024MB RAM, free web hosting. (Vercel Queues are non-standard on Hobby; PostgreSQL outbox in Supabase acts as durable queue).
- **Supabase Free**: 500MB PostgreSQL, 50,000 MAU Auth, Row Level Security.
- **GitHub Free**: Free OAuth, GitHub Apps, 2,000 Actions minutes/month.
- **Puter.js**: Free user-pays allowance across DeepSeek V3, Qwen 2.5 Coder, GPT-4o Mini, Gemini 1.5 Flash.

---

## 3. Verified Risk Inventory

1. **Serverless OAuth State Verification**:
   `oauthStateCache` used an in-memory `Set<string>`. On Vercel, requests for `/github` and `/github/callback` can hit different serverless instances, leading to false rejection or state loss.
2. **Production Fail-Closed Secret Enforcement**:
   `DEFAULT_DEV_JWT_SECRET` must be strictly forbidden in production.
3. **Synthetic App Token Fallback**:
   `getInstallationToken()` in `backend/src/lib/github/app-auth.ts` returned synthetic tokens when `GITHUB_APP_PRIVATE_KEY` was missing. Must strictly throw in production.
4. **Primary Frontend AI Integration**:
   The primary React UI (`InvestigationPage.tsx`) must directly embed Puter.js AI capabilities with model selection rather than relying solely on a link to `/puter/`.
