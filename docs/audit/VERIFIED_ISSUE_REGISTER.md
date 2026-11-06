# HOPPER — VERIFIED ISSUE REGISTER (PHASE 0.1)

**Date:** 2026-11-07  
**Auditor:** Principal DevOps Engineer, Cloud Security Architect & Platform Lead  
**Working Branch:** `engineering/cloudflare-remediation`  
**Base Commit:** `1e14a052e2e02010290913f2a2b937bb235400f9`  
**Evaluation Standard:** Independent Evidence-Backed Verification (Phase 1 Not Started)

---

## 1. ISSUE SUMMARY MATRIX

| Issue ID | Category | Original Severity | Corrected Severity | Final Classification | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **H-001** | Secret Exposure | CRITICAL | **CRITICAL** | **PARTIALLY VERIFIED** | Open (Contain in Phase 1) |
| **H-002** | Tenant Isolation | CRITICAL | **CRITICAL** | **VERIFIED** | Open (Remediate in Phase 2) |
| **H-003** | CI/CD Artifacts | HIGH | **HIGH** | **VERIFIED** | Open (Remediate in Phase 3) |
| **H-004** | Cloudflare Architecture | CRITICAL | **CRITICAL** | **VERIFIED** | Open (Redesign in Phase 4) |
| **H-005** | Node.js Runtime Sockets | CRITICAL | **CRITICAL** | **VERIFIED** | Open (Adapt in Phase 4/5) |
| **H-006** | Edge AI Security | HIGH | **HIGH** | **VERIFIED** | Open (Remediate in Phase 2/4) |
| **H-007** | AI Diagnosis Integrity | HIGH | **HIGH** | **VERIFIED** | Open (Remediate in Phase 6) |
| **H-008** | Vector Embeddings | HIGH | **MEDIUM** | **PARTIALLY VERIFIED** | Mitigated / Redesign Phase 5 |
| **H-009** | Identity / Auth Provider | HIGH | **HIGH** | **VERIFIED** | Open (Resolve in Phase 2) |
| **H-010** | GitHub Actions Secrets | HIGH | **MEDIUM** | **VERIFIED** | Actionable via Repo Admin |
| **H-011** | Unauthenticated Endpoints | HIGH | **HIGH** | **VERIFIED** | Open (Remediate in Phase 2) |
| **H-012** | CI Secret Scanner Gaps | MEDIUM | **MEDIUM** | **VERIFIED** | Open (Remediate in Phase 1) |

---

## 2. DEEP-DIVE INDEPENDENT REASSESSMENTS

### H-001: Credential Exposure in `backend/package.json`
- **Original Claim:** Production credentials hardcoded in `backend/package.json` line 11.
- **Source Evidence:** `backend/package.json` lines 10-12 (`dev` script):
  - `GITHUB_APP_CLIENT_SECRET=e2a3...[REDACTED_40_HEX_SECRET]`
  - `GITHUB_APP_WEBHOOK_SECRET=1134...[REDACTED_64_HEX_SECRET]`
  - `GITHUB_APP_PRIVATE_KEY=placeholder-private-key-for-development` (dummy string)
  - `STRIPE_SECRET_KEY=sk_test_placeholder` (dummy string)
  - `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/hopper_db` (local docker connection)
  - `REDIS_URL=redis://localhost:6379` (local docker connection)
- **Independent Verification:** The GitHub App Client Secret and Webhook Secret match exact production entropy and format. Even if originally generated for a test sandbox app, they must be treated as compromised. The inline script also shadows `.env` files during `npm run dev`.
- **Counter-Evidence:** `GITHUB_APP_PRIVATE_KEY` and `STRIPE_SECRET_KEY` are obvious dummy placeholders (`*placeholder*`). The database and redis strings are local container endpoints.
- **Runtime Implications:** Developers running `npm run dev` unknowingly run with inline credentials rather than their locally configured `.env`.
- **Confidence Level:** HIGH (100%).
- **Corrected Severity:** CRITICAL.
- **Final Classification:** PARTIALLY VERIFIED.

---

### H-002: Tenant Isolation & Fail-Open Authorization on Legacy Records
- **Original Claim:** API routes fail open when `workspace_id` is null on an organization or repository.
- **Source Evidence:**
  - `backend/src/server/routes/signatures.ts` lines 55-62:
    ```typescript
    if (org?.workspace_id) { ... } else { hasAccess = true; } // line 56
    ```
  - `backend/src/server/routes/repositories.ts` lines 53-61 and 128-133: `hasAccess = true` when unlinked.
  - `backend/src/server/routes/dashboard.ts` lines 46-48: `else { hasAccess = true; }`
- **Independent Verification:** Any authenticated user can view dashboards, list failure signatures, and retrieve diagnostic reports for any organization that has not yet been linked to a workspace.
- **Nuance & Historical Context:** The fail-open condition was written as a temporary bridge during migration from `0001_initial_schema.sql` (single-tenant organization model) to `0004_workspace_tables.sql` (multi-tenant workspace model). Naively flipping the condition to `hasAccess = false` would lock legitimate organization owners out of their repositories.
- **Remediation Strategy:** Strict fail-closed policy (`hasAccess = false` by default). For legacy unlinked records, fallback to verifying the user's GitHub identity against the installation owner (`org.github_account_login`) and trigger an idempotent link to the user's default workspace.
- **Confidence Level:** HIGH (100%).
- **Corrected Severity:** CRITICAL.
- **Final Classification:** VERIFIED.

---

### H-003: Deployment Artifact Packaging & Wrangler Path Mismatch
- **Original Claim:** Build artifacts created in CI do not match Wrangler configuration paths.
- **Source Evidence:**
  - `.github/workflows/build-artifacts.yml` lines 54, 64-65:
    ```bash
    cp -r frontend/dist/* release-dist/frontend/
    cp deploy/cloudflare/worker.ts release-dist/deploy/
    cp wrangler.toml release-dist/
    ```
  - `wrangler.toml`:
    ```toml
    main = "deploy/cloudflare/worker.ts"
    [assets]
    directory = "frontend/dist"
    ```
- **Independent Verification:** Running `wrangler deploy` inside `release-dist` fails with ENOENT: `deploy/cloudflare/worker.ts` does not exist (file is at `deploy/worker.ts`) and `frontend/dist` does not exist (assets are at `frontend/`).
- **Counter-Evidence:** Deploying directly from repository root succeeds because paths match the source tree. The bug is exclusively in the immutable artifact assembly step.
- **Confidence Level:** HIGH (100%).
- **Corrected Severity:** HIGH.
- **Final Classification:** VERIFIED.

---

### H-004: Incomplete Cloudflare Deployment (Unhosted Backend & Queues)
- **Original Claim:** Backend Express API and BullMQ worker are unhosted in staging/production Cloudflare deployments.
- **Source Evidence:**
  - `.github/workflows/deploy-staging.yml` only deploys `deploy/cloudflare/worker.ts` and Cloudflare Pages.
  - `wrangler.toml` targets `ORIGIN_API_URL = "https://api.hopper.dev"`.
  - DNS for `https://api.hopper.dev` returns HTTP 530 (origin unreachable).
- **Independent Verification:** The backend Express server and BullMQ worker daemon have no compute target in the Cloudflare deployment workflows.
- **Counter-Evidence:** The edge worker returns synthetic JSON on origin 530, masking the backend absence.
- **Runtime Implications:** Live failure diagnosis, background queue processing, and persistent repository queries fail in deployed Cloudflare environments.
- **Confidence Level:** HIGH (100%).
- **Corrected Severity:** CRITICAL.
- **Final Classification:** VERIFIED.

---

### H-005: Backend Runtime Incompatibilities with Cloudflare Workers
- **Original Claim:** Backend relies on Node.js TCP sockets (`pg`, `ioredis`) which cannot run on serverless Workers.
- **Source Evidence:**
  - `backend/src/db/client.ts` uses `pg.Pool` (TCP socket connection pool).
  - `backend/src/queue/redis.ts` uses `ioredis` (TCP connection to Redis 6379).
  - `backend/src/server/index.ts` uses `express` HTTP listener on port 3000.
- **Independent Verification:** Cloudflare Workers runtime (`workerd`) does not support standard Node.js TCP socket connection pools or blocking server listeners without Cloudflare Hyperdrive or TCP socket shims.
- **Counter-Evidence:** Cloudflare provides native serverless replacements: Cloudflare D1 (SQLite-based relational store) and Cloudflare Queues (asynchronous message passing). Hopper's domain repositories already utilize an abstract `DatabaseExecutor` interface, simplifying D1 adapter implementation.
- **Confidence Level:** HIGH (100%).
- **Corrected Severity:** CRITICAL.
- **Final Classification:** VERIFIED.

---

### H-006: Unauthenticated Edge AI Endpoints
- **Original Claim:** `/api/ai/diagnose` and `/api/ai/embeddings` exposed without authentication.
- **Source Evidence:** `deploy/cloudflare/worker.ts` lines 149-245 handles POST requests without validating JWT authorization headers.
- **Independent Verification:** Public unauthenticated requests consume Hopper's daily 10,000 Workers AI Neurons quota.
- **Nuance:** Cloudflare Turnstile bot protection (`requireTurnstile`) exists in the codebase but was not applied to edge AI routes, and Turnstile is bot defense rather than tenant authentication.
- **Confidence Level:** HIGH (100%).
- **Corrected Severity:** HIGH.
- **Final Classification:** VERIFIED.

---

### H-007: Simulated Diagnosis Presented as High-Confidence Success
- **Original Claim:** Edge worker returns simulated diagnosis claiming high confidence when AI binding is absent.
- **Source Evidence:** `deploy/cloudflare/worker.ts` lines 190-220 returns:
  ```json
  {
    "success": true,
    "provider": "cloudflare-workers-ai-simulated",
    "result": {
      "response": "{\"confidence\":{\"level\":\"high\",\"score\":90}...}"
    }
  }
  ```
- **Independent Verification:** The stub returns `success: true` and a 90% confidence score, misleading clients into treating unverified mock data as real diagnosis.
- **Counter-Evidence:** The backend `synthesizeDiagnosis` in `backend/src/lib/ai/diagnose.ts` properly assigns `level: 'low'`, `score: 20`, and explicit `fallbackReason`. The edge worker stub failed to adhere to this contract.
- **Remediation Strategy:** Return HTTP 503 with status `'unavailable'` when AI binding is missing, or execute the deterministic rule-based engine with explicit `confidence: { level: 'low', score: 20 }`.
- **Confidence Level:** HIGH (100%).
- **Corrected Severity:** HIGH.
- **Final Classification:** VERIFIED.

---

### H-008: Vector Dimension Mismatch between pgvector and Workers AI
- **Original Claim:** Workers AI embedding outputs 768 dimensions, while database schema expects 1536 dimensions.
- **Source Evidence:**
  - `backend/supabase/migrations/0001_initial_schema.sql` line 54: `embedding vector(1536)`.
  - Workers AI model `@cf/baai/bge-base-en-v1.5` outputs 768 dimensions.
- **Independent Verification:** The model output and database column dimensions differ.
- **Counter-Evidence:** `backend/src/lib/ai/embeddings.ts` implements `projectTo1536Dimensions(rawVector)`, which zero-pads 768 dimensions to 1536 and normalizes to L2 unit length. Cosine similarity between two zero-padded unit vectors is mathematically identical to the cosine similarity between the original 768-dim vectors.
- **Target Resolution:** In the Cloudflare Free Plan architecture, Vectorize allows creating an index natively configured for 768 dimensions and cosine metric, rendering zero-padding unnecessary.
- **Confidence Level:** HIGH (100%).
- **Corrected Severity:** MEDIUM (downgraded from HIGH due to mathematical adapter).
- **Final Classification:** PARTIALLY VERIFIED.

---

### H-009: Frontend Supabase Project Configuration
- **Original Claim:** Frontend auth depends on placeholder Supabase credentials.
- **Source Evidence:**
  - `frontend/src/lib/supabase.ts` lines 3-4 uses `https://placeholder-project.supabase.co`.
  - `frontend/src/store/useAppStore.ts` invokes `supabase.auth.signInWithPassword`.
- **Independent Verification:** Clicking login/signup fails due to unresolvable DNS for the placeholder host.
- **Counter-Evidence:** Local development and unit tests mock auth tokens via `localStorage` and verify them locally with `DEFAULT_DEV_JWT_SECRET`.
- **Confidence Level:** HIGH (100%).
- **Corrected Severity:** HIGH.
- **Final Classification:** VERIFIED.

---

### H-010: GitHub Actions Secrets Missing
- **Original Claim:** Automated deployment workflows fail due to missing GitHub repository secrets.
- **Source Evidence:** Workflows require `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_TURNSTILE_SECRET_KEY`. Running `gh secret list` shows 0 secrets configured.
- **Independent Verification:** GitHub Actions CI/CD runs fail or skip deployment jobs.
- **Confidence Level:** HIGH (100%).
- **Corrected Severity:** MEDIUM.
- **Final Classification:** VERIFIED.

---

### H-011: Unauthenticated Backend Route Exposure
- **Original Claim:** Core API routes lack authentication middleware.
- **Source Evidence:**
  - `backend/src/server/routes/billing.ts` line 13: `POST /api/billing/checkout` lacks `auth` middleware.
  - `backend/src/server/routes/diagnose.ts` line 78: `POST /api/diagnose/adhoc` lacks `auth` middleware.
- **Independent Verification:** Unauthenticated clients can trigger checkout sessions and submit ad-hoc diagnosis jobs.
- **Confidence Level:** HIGH (100%).
- **Corrected Severity:** HIGH.
- **Final Classification:** VERIFIED.

---

### H-012: CI Secret Scanner Pattern Blind Spot
- **Original Claim:** `scripts/ci/verify-no-committed-secrets.py` failed to detect high-entropy credentials in `backend/package.json`.
- **Source Evidence:**
  - `scripts/ci/verify-no-committed-secrets.py` regexes only matched AWS, GitHub PATs (`ghp_`), Slack tokens, and private keys.
  - `GITHUB_APP_CLIENT_SECRET` (40-hex) and `GITHUB_APP_WEBHOOK_SECRET` (64-hex) bypassed the scanner completely.
- **Independent Verification:** The scanner passed with code 0 on the existing codebase despite high-entropy secrets being present.
- **Confidence Level:** HIGH (100%).
- **Corrected Severity:** MEDIUM.
- **Final Classification:** VERIFIED.

