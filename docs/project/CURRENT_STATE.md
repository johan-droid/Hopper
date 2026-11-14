# Hopper — Current Implementation Status & Verification Ledger (CURRENT_STATE.md)

> **Document Status:** Authoritative System Baseline  
> **Repository Branch:** `main`  
> **Last Verified:** November 14, 2026  
> **Auditor / Architect:** Principal Software Engineer & Repository Maintainer  

---

## 1. Executive Summary

Hopper is a fully functional, verified, and architecturally consolidated multi-tenant CI/CD failure diagnosis engine. The core application logic, database schemas, background workers, security verifiers, and user interfaces are completed, typechecked, and verified by automated test suites.

The local development environment is 100% self-contained (requiring only PostgreSQL 16 + pgvector via Docker). Full production deployment to general public users is gated exclusively by external cloud provider account creation (Supabase Cloud, GitHub App credentials, and Stripe billing keys).

---

## 2. Capability Implementation Matrix

| Subsystem / Capability | Status | Implementation Evidence | Verification Method |
|---|:---:|---|---|
| **GitHub Webhook Ingress** | **WORKING** | `backend/src/server/routes/webhooks.ts` | Constant-time HMAC-SHA256 test in `webhook.test.ts` |
| **Durable Job Outbox** | **WORKING** | `backend/src/queue/job-store.ts` | PostgreSQL `SKIP LOCKED` test in `queue.test.ts` |
| **Log Slicing & Parsing** | **WORKING** | `backend/src/lib/parser/log-slicer.ts` | Tail 300KB window slicing tested in `parser.test.ts` |
| **Secret Redaction** | **WORKING** | `backend/src/lib/parser/secret-scrubber.ts` | AWS/GitHub token regex scrubbing in `scrubber.test.ts` |
| **Failure Fingerprinting** | **WORKING** | `backend/src/lib/parser/fingerprinter.ts` | Dynamic token normalization in `fingerprint.test.ts` |
| **Bayesian Flakiness Engine**| **WORKING** | `backend/src/lib/moat/flakiness-engine.ts` | 4-signal heuristic scoring in `flakiness.test.ts` |
| **Multi-Provider AI** | **WORKING** | `backend/src/lib/ai/diagnose.ts` | Zod validation tested in `ai.test.ts` |
| **Puter.js Browser AI** | **WORKING** | `frontend/src/lib/puter-ai.ts` | Interactive execution in `InvestigationPage.tsx` |
| **Sticky PR Reporting** | **WORKING** | `backend/src/lib/github/pr-reporter.ts` | Comment upsert & gating tested in `pr-reporter.test.ts` |
| **Workspaces & RBAC** | **WORKING** | `backend/src/server/routes/workspaces.ts` | Multi-tenant tests in `workspace-api.test.ts` |
| **Row-Level Security (RLS)** | **WORKING** | `backend/supabase/migrations/0005`, `0011` | Cross-tenant rejection in `security-tenant-isolation.test.ts` |
| **Serverless OAuth State** | **WORKING** | `backend/src/server/routes/auth.ts` | HMAC-signed state tested in `github-auth-sync.test.ts` |
| **Stripe Billing Lifecycle** | **WORKING** | `backend/src/server/routes/billing.ts` | Webhooks and checkout tested in `stripe-billing.test.ts` |
| **Next.js 14 App Router** | **WORKING** | `frontend/app/` (20 prerendered routes) | `next build` static export & SSR compilation check (0 errors, 0 warnings) |
| **HttpOnly Cookie Sessions** | **WORKING** | `backend/src/server/routes/auth.ts`, `frontend/src/features/auth/useSession.ts` | Eliminates tokens in URL; verified cookie extraction |
| **Minimal OAuth Identity** | **WORKING** | `backend/src/lib/github/user-auth.ts` | Scoped strictly to `read:user,user:email`; tested in `github-auth-sync.test.ts` |
| **Single-Agent Governance** | **ENFORCED** | `AGENTS.md` | Single primary agent policy documented and enforced |
| **Live GitHub App Ingress** | **GATED** | `backend/src/lib/github/` | Requires production `GITHUB_APP_PRIVATE_KEY` |
| **Live Stripe Webhooks** | **GATED** | `backend/src/lib/billing/` | Requires production `STRIPE_WEBHOOK_SECRET` |
| **Live Supabase Auth** | **GATED** | `backend/src/server/middleware/auth.ts` | Requires production `SUPABASE_JWT_PUBLIC_KEY` |

---

## 3. Build & Test Verification Ledger

### 3.1 Static Analysis & Compilation
- **TypeScript Typecheck (`npm run lint`):**
  - Backend: `tsc --noEmit` -> **0 errors, 0 warnings**
  - Frontend: `tsc --noEmit` -> **0 errors, 0 warnings**

### 3.2 Production Compilation (`npm run build`)
- **Backend Build (`npm run build:backend`):**
  - Compiler: `tsup` (Node 20 ESM + DTS)
  - Output: `dist/index.js`, `dist/cli/hopper.js`, `dist/server/index.js`, `dist/workers/worker-entry.js`
  - Result: **Clean build, 0 errors**
- **Frontend Build (`npm run build:frontend`):**
  - Compiler: Next.js 14.2.35 App Router (`next build`)
  - Output: 20/20 prerendered static & dynamic routes (`.next`)
  - Build Warnings: **0 warnings** (resolved `cache-dir`, `allowScripts` for `esbuild`, and Rollup Zod annotations)
  - Result: **Clean build, 0 errors**

### 3.3 Automated Test Execution
- **Backend Test Suite (`npm test`):**
  - Test runner: Vitest v2.1.9
  - Result: **33 passed (33 test files)**
  - Test count: **226 passed (226 tests)**
  - Duration: ~22.8s
- **Frontend Test Suite (`npm run test:frontend`):**
  - Test runner: Vitest v2.1.9
  - Result: **4 passed (4 test files)**
  - Test count: **34 passed (34 tests)**
  - Duration: ~1.1s

### 3.3 Environment Preflight (`npm run doctor`)
- 17 passed checks: Node.js (v24), npm, Docker, Docker Compose, root/backend/frontend dependencies, `.env` configs, database connectivity, port availability, and retired Cloudflare artifact guards.

---

## 4. Production Release Blockers

The code is production-ready. Public deployment is gated on account setup for external SaaS services:

| Blocker ID | External Service | Required Configuration Keys | Impact if Unconfigured | Resolution |
|---|---|---|---|---|
| **BLOCKER-01** | **Supabase Cloud** | `VITE_SUPABASE_URL`<br>`VITE_SUPABASE_ANON_KEY`<br>`SUPABASE_JWT_SECRET` | External users cannot register via Supabase Auth | Create Supabase project; configure secrets in Vercel |
| **BLOCKER-02** | **GitHub App** | `GITHUB_APP_ID`<br>`GITHUB_APP_CLIENT_ID`<br>`GITHUB_APP_CLIENT_SECRET`<br>`GITHUB_APP_WEBHOOK_SECRET`<br>`GITHUB_APP_PRIVATE_KEY` | External repos cannot install Hopper; cannot receive live webhooks or post PR comments | Register GitHub App in GitHub Developer Settings; generate `.pem` private key |
| **BLOCKER-03** | **Stripe Billing** | `STRIPE_SECRET_KEY`<br>`STRIPE_WEBHOOK_SECRET`<br>`STRIPE_PRICE_ID_PRO_DEV_9`<br>`STRIPE_PRICE_ID_TEAM_29` | Users cannot checkout or upgrade to Pro ($9) or Team ($29) | Create Stripe account; create products; register webhook endpoint |
| **BLOCKER-04** | **Repository License** | Add standard `LICENSE` file | Repository declares Apache-2.0 in `package.json` but lacks root `LICENSE` file | Commit standard Apache-2.0 license file to root |

---

## 5. Security Posture Assessment

- **Authentication:** Dual-mode auth supporting Hopper session JWTs (with cryptographic HMAC-signed serverless state) and Supabase JWTs. Strict algorithm allowlisting (HS256, RS256, ES256).
- **Tenant Isolation:** Enforced at the database engine level via PostgreSQL Row-Level Security (`FORCE ROW LEVEL SECURITY`) under the non-superuser `hopper_app` runtime role. Leaf tables (`failure_signatures`, `workflow_failures`, `diagnostic_reports`) include denormalized `workspace_id` for direct RLS enforcement.
- **Log Data Scrubbing:** Regex-based scrubbing redacts AWS credentials, GitHub tokens, database URIs, and SSH keys before storage or LLM prompting.
- **Prompt Injection Hardening:** Log content is wrapped in `<UNTRUSTED_CI_LOG>` boundaries with strict non-instructional parsing directives.
- **Webhook Authenticity:** Constant-time HMAC comparison prevents timing attacks on GitHub and Stripe webhooks.
- **Legacy Artifact Guard:** Automated CI guards prevent the reintroduction of retired Cloudflare, Redis, or BullMQ configuration files.
