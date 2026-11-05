# Phase 0 — Repository Inventory

## Executive Summary

Hopper is a CI/CD failure diagnosis and flaky-test intelligence SaaS platform. The repository contains a backend Express.js API with BullMQ queue workers, PostgreSQL + pgvector database, and a stub React/Vite frontend. The system is designed to ingest GitHub webhook events, process failed CI logs, generate fingerprints, compute flakiness scores, and produce LLM-powered diagnostics.

---
## 1. Root Configuration and Documentation

| File | Responsibility | Status |
|---|---|---|
| `SPEC.md` | Product specification, architecture diagrams, API contracts, pricing tiers, sprint plan | **COMPLETE** — Comprehensive 700+ line specification |
| `README.md` | User documentation, quick start (Docker), architecture diagram, requirements, security model, pricing, known limitations | **COMPLETE** — Well-structured docs |
| `package.json` (root) | Monorepo workspace orchestrator, defines test/lint/build scripts | **COMPLETE** |
| `.env.example` | Documents all required environment variables | **COMPLETE** |
| `.env` (local dev) | Local development configuration template | **COMPLETE** |
| `docker-compose.yml` | Orchestrates API, Postgres/pgvector, Redis services | **COMPLETE** |
| `LIFECYCLE_REPORT.md` | SDLC lifecycle report | **COMPLETE** |
## 2. GitHub Actions Workflows

| File | Responsibility | Status |
|---|---|---|
| `.github/workflows/ci.yml` | CI pipeline: `npm ci`, full lifecycle, Docker build on pushes/PRs to main | **COMPLETE** — Verified green builds |
## 3. Frontend Source Files

### Directory: `/frontend/`

| File | Responsibility | Status |
|---|---|---|
| `src/main.tsx` | React entry point | **PARTIAL** — Exists but minimal |
| `src/App.tsx` | Root React component with routing | **PARTIAL** — Sparse implementation |
| `src/store/useAppStore.ts` | Global state store (Zustand/Redux-like) | **PARTIAL** — Minimal store |
| `src/store/schema.ts` | Store schema validation | **PARTIAL** — Basic schema |
| `src/store/schema.test.ts` | Store schema tests | **PARTIAL** — Basic tests |
| `src/api/client.ts` | API client for backend calls | **PARTIAL** — Basic setup |
| `src/api/hooks.ts` | React hooks for data fetching | **PARTIAL** — Minimal |
| `src/components/layout/Header.tsx` | Page header component | **PARTIAL** — Exists |
| `src/components/layout/NavTabs.tsx` | Navigation tabs | **PARTIAL** — Exists |
| `src/components/views/OverviewView.tsx` | Dashboard overview page | **PARTIAL** — Exists but incomplete |
| `src/components/views/SignatureInspectorView.tsx` | Failure signature explorer | **PARTIAL** — Exists but incomplete |
| `src/components/views/DiagnosticSandboxView.tsx` | Diagnostic sandbox | **PARTIAL** — Exists but incomplete |
| `src/components/views/BillingPlansView.tsx` | Billing plans page | **PARTIAL** — Exists but incomplete |
| `src/components/views/TelemetryView.tsx` | Telemetry view | **PARTIAL** — Exists but incomplete |
| `src/styles/` | Tailwind CSS configuration | **COMPLETE** — Tailwind configured |
| `src/public/` | Static assets, HTML page | **COMPLETE** — index.html exists |
| `vite.config.ts` | Vite build configuration | **COMPLETE** |
| `tailwind.config.js` | Tailwind CSS customization | **COMPLETE** |

### Key Findings:
- **No complete application shell** — The frontend lacks a proper authenticated app shell, workspace selector, sidebar, or navigation.
- **Duplicate/Scattered implementations** — Multiple view components exist but none are connected to a working data-fetching layer or auth context.
- **No API integration** — `api/client.ts` and `api/hooks.ts` exist but are not connected to any functional UI.
- **No responsive design considerations** — Tailwind config exists but layout components are not fully responsive.## 4. Backend Source Files

### Directory: `/backend/src/`

#### 4.1 Server and API Gateway

| File | Responsibility | Status |
|---|---|---|
| `src/server/index.ts` | Express app factory — health check, webhook ingress, REST API, Stripe webhooks, error handling | **COMPLETE** — Fully implemented endpoint suite |
| `src/lib/github/app-auth.ts` | GitHub App JWT generation, installation token minting, webhook signature verification | **COMPLETE** — HMAC verify, RS256 JWT, token cache |
| `src/queue/ci-queue.ts` | BullMQ CI events queue producer | **COMPLETE** — Deterministic job ID for deduplication |
| `src/queue/redis.ts` | Redis connection, rate limiting, webhook delivery claim, diagnosis locking | **COMPLETE** — Rate limit, delivery claim, diagnosis lock |
| `src/tests/` | Test fixtures and simulation scripts | **PARTIAL** — Simulation scripts exist |

#### 4.2 Parsers and Fingerprinting

| File | Responsibility | Status |
|---|---|---|
| `src/lib/parser/log-slicer.ts` | Extract 15-45 line context window around failure, strip ANSI/noise, scrub secrets | **COMPLETE** — Bounded O(1) memory |
| `src/lib/parser/ansi-stripper.ts` | Strip ANSI escape sequences, GitHub timestamps, runner noise | **COMPLETE** |
| `src/lib/parser/secret-scrubber.ts` | Regex-based secret redaction (GitHub tokens, API keys, DB URLs, private keys) | **COMPLETE** |
| `src/lib/parser/fingerprinter.ts` | Normalize stack traces, compute SHA-256 signature hash, mask UUIDs/line numbers/ports | **COMPLETE** |

#### 4.3 AI and Diagnostics

| File | Responsibility | Status |
|---|---|---|
| `src/lib/ai/diagnose.ts` | LLM diagnosis with Zod schema validation, Anthropic/OpenAI with deterministic fallback | **COMPLETE** — Mock + live provider support |
| `src/lib/ai/embeddings.ts` | OpenAI text-embedding-3-small + deterministic offline generator | **COMPLETE** |
| `src/lib/moat/flakiness-engine.ts` | Bayesian flakiness scoring (same-SHA, cross-PR, main-branch, transient patterns) | **COMPLETE** |

#### 4.4 Database and Repositories

| File | Responsibility | Status |
|---|---|---|
| `src/db/client.ts` | pg Pool management, query execution, withTransaction, health checks | **COMPLETE** |
| `src/db/index.ts` | Repository barrel export | **COMPLETE** |
| `src/db/types.ts` | Zod-aligned type definitions (Organization, Repository, FailureSignature, WorkflowFailure, DiagnosticReport) | **COMPLETE** |
| `src/db/migrator.ts` | Migration executor (reads supabase/migrations/*.sql) | **COMPLETE** |
| `src/db/repositories/organization.repository.ts` | Organization CRUD operations | **TO BE INSPECTED** |
| `src/db/repositories/repository.repository.ts` | Repository CRUD operations | **TO BE INSPECTED** |
| `src/db/repositories/failure-signature.repository.ts` | Failure signature persistence | **TO BE INSPECTED** |
| `src/db/repositories/workflow-failure.repository.ts` | Workflow failure persistence | **TO BE INSPECTED** |
| `src/db/repositories/diagnostic-report.repository.ts` | Diagnostic report persistence | **TO BE INSPECTED** |

#### 4.5 Job Processor

| File | Responsibility | Status |
|---|---|---|
| `src/workers/index.ts` | Worker lifecycle — createWorkflowJobWorker, startWorkers, stopWorkers | **COMPLETE** — Worker orchestrator |
| `src/workers/processors/workflow-job.processor.ts` | Main BullMQ consumer — full pipeline: org/repo ensure, signature dedup, log slicing, fingerprinting, flakiness scoring, LLM diagnosis, PR comment, quota check | **COMPLETE** — End-to-end pipeline |
| `src/workers/processors/slack-alert.processor.ts` | Slack alert handler | **COMPLETE** — Exists |

#### 4.6 Billing and Stripe

| File | Responsibility | Status |
|---|---|---|
| `src/lib/billing/quota-guard.ts` | Plan tier limits, monthly run quota enforcement | **COMPLETE** |
| `src/lib/billing/stripe-handler.ts` | Stripe checkout session creation, webhook handling, customer/subscription management | **TO BE INSPECTED** |
## 5. Database Schema (PostgreSQL + pgvector)

### Tables and Key Fields

| Table | Key Fields | RLS Status |
|---|---|---|
| `organizations` | `id`, `github_installation_id` (UNIQUE), `plan`, `stripe_customer_id`, `stripe_subscription_id`, `monthly_run_limit`, `runs_used_this_period` | **NO RLS** — Known issue from README |
| `repositories` | `id`, `org_id` (FK → organizations), `github_repo_id` (UNIQUE), `full_name`, `default_branch`, `is_active` | **NO RLS** |
| `failure_signatures` | `id`, `repo_id` (FK → repositories), `signature_hash` (CHAR(64)), `normalized_template`, `test_identifier`, `error_category`, `embedding`(vector(1536)), `total_occurrences`, `main_branch_occurrences`, `unique_prs_affected`, `same_sha_retry_passes`, `flakiness_score`, `cached_root_cause`, `cached_next_check` | **NO RLS** — UNIQUE(repo_id, signature_hash) |
| `workflow_failures` | `id`, `repo_id` (FK → repositories), `signature_id` (FK → failure_signatures), `github_run_id`, `github_job_id`, `github_run_attempt`, `workflow_name`, `job_name`, `failed_step_name`, `commit_sha`, `branch`, `pr_number`, `actor_login`, `exit_code`, `duration_ms`, `sanitized_log_snippet`, `failed_at` | **NO RLS** |
| `diagnostic_reports` | `id`, `failure_id` (FK → workflow_failures), `root_cause_clues`, `likely_flaky_test`, `flaky_confidence`, `relevant_log_lines`(JSONB), `suggested_next_check`, `local_repro_command`, `github_comment_id`, `llm_model_used`, `prompt_tokens`, `completion_tokens` | **NO RLS** |

### Indexes
- `idx_repos_org_id` — on organizations
- `idx_signatures_repo_hash` — failure_signatures(repo_id, signature_hash)
- `idx_signatures_flakiness` — failure_signatures(repo_id, flakiness_score DESC)
- `idx_failures_repo_sha` — workflow_failures(repo_id, commit_sha)
- `idx_failures_signature_id` — workflow_failures(signature_id, failed_at DESC)
- `idx_failures_repo_date` — workflow_failures(repo_id, failed_at DESC)
- HNSW vector index (from `0002_hnsw_index.sql`)## 6. Queue and Worker Architecture

### Queue: `ci-events` (BullMQ)
- Producer: `enqueueWorkflowJob()` in `src/queue/ci-queue.ts`
- Worker: `startWorkers()` in `src/workers/index.ts`
- Job options: attempts=3, exponential backoff delay=1000ms, removeOnComplete=100, removeOnFail=500

### Worker Pipeline (workflow-job.processor.ts)
1. Ensure Organization exists in DB (upsert by github_installation_id)
2. Ensure Repository exists in DB (upsert by org_id + githubRepoId)
3. **Pass-on-Retry Tracker**: If conclusion===`success`, increment `same_sha_retry_passes` on prior failures
4. **Log Slicing**: sliceFailedStepLog() — cap at 300KB, strip ANSI/noise, scrub secrets
5. **Fingerprinting**: computeFailureSignature() — normalize volatile tokens, SHA-256 hash
6. **Flakiness Scoring**: calculateFlakinessScore() — same-SHA, cross-PR, main-branch, transient patterns
7. **Diagnosis**: synthesizeDiagnosis() — LLM (Anthropic/OpenAI) or deterministic fallback
8. **Persist**: Save signature + workflow failure + diagnostic report to DB
9. **PR Comment**: Render and upsert sticky PR comment
10. **Diagnosis Lock**: Acquire/release Redis lock to prevent parallel LLM calls for same fingerprint

### Known Gaps
- **No standalone worker entrypoint** — `startWorkers()` is exported but neither npm scripts nor docker-compose.yml start a worker (README item #303)
- **Redis fail-open behavior** — Rate limiter and webhook delivery claim fail open when Redis is unavailable (redis.ts lines 99, 119) — intentional to avoid dropping webhooks, but requires explicit documentation## 7. Stripe Billing Integration

| File | Responsibility | Status |
|---|---|---|
| `src/lib/billing/stripe-handler.ts` | Checkout session creation, webhook signature verification, customer/subscription management, entitlement calculation | **TO BE INSPECTED** |
| `src/lib/billing/quota-guard.ts` | Plan tier limits, monthly run quota enforcement | **COMPLETE** |

### Stripe Configuration (from .env.example)
- `STRIPE_SECRET_KEY=sk_test_placeholder`
- `STRIPE_WEBHOOK_SECRET=whsec_test_placeholder`
- `STRIPE_PRICE_ID_PRO_DEV_9=price_1PxyzProDev9Monthly`
- `STRIPE_PRICE_ID_TEAM_29=price_1PxyzTeam29Monthly`

### Known Gaps
- Billing logic exists but end-to-end verification with live Stripe API not completed
- Webhook idempotency needs verification## 8. Integration Summary

| Integration | Status |
|---|---|
| GitHub App webhook ingestion + HMAC verification | **COMPLETE** |
| GitHub App installation token minting | **COMPLETE** (mock/synthetic fallback) |
| BullMQ queue enqueue + worker consumption | **COMPLETE** (but no worker starter) |
| PostgreSQL + pgvector data persistence | **COMPLETE** |
| Stripe checkout + webhook (skeleton) | **PARTIAL** — Needs end-to-end verification |
| AI diagnosis (Anthropic/OpenAI/mock) | **COMPLETE** — With fallback |
| Redis rate limiting + delivery deduplication | **COMPLETE** (fail-open) |
| Row-Level Security | **MISSING** — Known issue |
| Supabase Auth integration | **MISSING** — Not implemented |
| Frontend application shell | **MISSING** — Components exist but no app |
## 9. Test Coverage

| Test Suite | Status |
|---|---|
| `npm test` — vitest run all suites | **PARTIAL** — Some unit tests exist |
| `npm run test:smoke` — backend smoke test | **PARTIAL** |
| `npm run lint` — tsc --noEmit | **COMPLETE** |
| `npm run build` — tsup production bundle | **COMPLETE** |
| `npm run lifecycle` — full pipeline + simulation | **PARTIAL** |

### Test Gaps
- No integration tests for end-to-end workflows
- No authentication/authorization tests
- No cross-tenant isolation tests
- No Stripe webhook signature verification tests
- No GitHub webhook replay/idempotency tests
- Worker lifecycle tests not found## 10. Summary Classification

| Category | Classification | Evidence |
|---|---|---|
| Backend API | **COMPLETE** | Full Express route suite, webhook verification, queue integration, DB persistence |
| Database Schema | **COMPLETE** | Full DDL with migrations, pgvector, proper constraints |
| Queue/Worker Architecture | **COMPLETE** (with gaps) | BullMQ pipeline designed but no starter script |
| Parsers/Fingerprinting | **COMPLETE** | Log slicing, secret scrubbing, signature fingerprinting |
| AI/Diagnostic Engine | **COMPLETE** | LLM calls with fallback to deterministic |
| Billing/Stripe | **PARTIAL** | Skeleton implementation, needs verification |
| Frontend Application | **MISSING** | No app shell, no auth, no workspace management |
| Authentication | **MISSING** | No Supabase Auth integration |
| Authorization/Tenancy | **MISSING** | No RLS, no workspace membership enforcement |
| Security | **PARTIAL** | Webhook HMAC verified, secrets scrubbed, but no RLS |
| Testing | **PARTIAL** | Some unit tests, no integration/E2E |
