# Hopper — GitHub Integration Engineering & Security Audit

**Document:** GitHub Integration Discovery & Implementation Baseline (Phase 0 Audit)  
**Author:** Principal Backend Engineer & GitHub Integration Architect  
**Repository:** `johan-droid/Hopper`  
**Date:** November 14, 2026  
**Status:** Audit Complete — Remediation Required  

---

## 1. Executive Summary

Hopper's primary value proposition is automated failure diagnosis and engineering intelligence for CI/CD pipelines, with GitHub Actions serving as its primary event source and diagnostic interface. 

This audit provides an exhaustive evaluation of Hopper's existing GitHub integration across authentication, webhook ingestion, tenant isolation, database architecture, rate limiting, and result publication. 

While core proof-of-concept components exist (HMAC signature verification, RS256 JWT generation, log streaming, and sticky PR comments), the integration exhibits significant architectural gaps:
1. **Webhook Event Blindness:** Webhook ingress drops all lifecycle events (`installation.*`, `installation_repositories.*`), processing only `workflow_job.completed` and `workflow_run.completed`.
2. **Missing Rate-Limit Coordination:** All outgoing GitHub API calls (`log-fetcher.ts`, `pr-reporter.ts`, `app-auth.ts`, `sync-service.ts`) execute uncoordinated `fetch()` calls without interpreting `X-RateLimit-*` headers, secondary throttling cooldowns (HTTP 403/429), or distributed worker scheduling.
3. **Database Schema Gaps:** No centralized persistence exists for GitHub API rate-limit state, installation permissions, installation lifecycle status (`active`, `suspended`, `deleted`), or integration audit logs.
4. **Tenant Ownership Validation:** Installation-to-organization bindings rely on webhook payload fields without strict server-side verification against authenticated workspace memberships.

---

## 2. Existing Architecture & Verified Implementation Paths

The GitHub integration spans five primary subsystem layers:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        GitHub Platform (Cloud)                         │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │ Webhooks (HMAC-SHA256)
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Ingress Layer: Express Webhook Router                                  │
│ (`backend/src/server/routes/webhooks.ts`)                             │
│ - Validates HMAC-SHA256 via `verifyGitHubWebhookSignature`             │
│ - Replay protection: `claimWebhookDelivery` (PostgreSQL dedup)         │
│ - In-memory / DB tenant rate check: `checkTenantRateLimit`             │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │ Enqueues Event Payload
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Queue & Worker Layer: PostgreSQL Durable Queue & Vercel Queue          │
│ (`backend/src/queue/ci-queue.ts` & `workflow-job.processor.ts`)        │
│ - Durable enqueue to `hopper_job_queue`                                │
│ - Matrix lock coordination via `acquireDiagnosisLock`                  │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │ Dispatches Canonical CI Event
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Core Pipeline: HopperEngine & Specialized Engines                      │
│ (`backend/src/engine/index.ts`)                                        │
│ - ContextEngine: Resolves Org & Repo (`context.engine.ts`)             │
│ - NormalizationEngine: Slices & scrubs logs (`normalization.engine.ts`)│
│ - IntelligenceEngine: Fingerprints & flakiness (`intelligence.ts`)     │
│ - DiagnosisEngine: AI/deterministic root cause (`diagnosis.engine.ts`) │
│ - IntegrationEngine: GitHub API interactions (`integration.engine.ts`) │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │ Publication Back to GitHub
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Outgoing GitHub API Calls (`backend/src/lib/github/`)                  │
│ - `app-auth.ts`: Mints App Installation Tokens via App JWT (RS256)     │
│ - `log-fetcher.ts`: Streams job logs & commit diffs                    │
│ - `pr-reporter.ts`: Creates Check Runs & Sticky PR Comments            │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Existing Database Tables & Schema Relationships

Inspected in chronological order from migrations `0001` through `0012`:

### 3.1 Relevant Existing Tables
1. **`organizations`** (`0001_initial_schema.sql#L16`, `0007_link_workspace_organizations.sql#L5`):
   - Mapped 1:1 with GitHub App installations via `github_installation_id BIGINT UNIQUE NOT NULL`.
   - Contains: `github_account_login`, `github_account_type`, `plan`, `monthly_run_limit`, `runs_used_this_period`, `workspace_id`.
   - *Gap:* Lacks `installation_status` (`active`, `suspended`, `deleted`), `permissions` JSONB, and `installed_at`.
2. **`repositories`** (`0001_initial_schema.sql#L33`, `0007_link_workspace_organizations.sql#L18`):
   - Foreign key: `org_id UUID REFERENCES organizations(id) ON DELETE CASCADE`.
   - Contains: `github_repo_id BIGINT UNIQUE NOT NULL`, `full_name`, `default_branch`, `is_active`, `workspace_id`.
   - *Gap:* Lacks `visibility` (`public`/`private`), `is_archived`, and sync timestamps.
3. **`hopper_webhook_deliveries`** (`0010_durable_queue_and_coordination.sql#L74`):
   - Columns: `delivery_id TEXT PRIMARY KEY`, `received_at TIMESTAMPTZ`, `source TEXT`.
   - Provides replay protection via `hopper_claim_webhook_delivery`.
   - *Gap:* Does not store event type, installation ID, repository ID, or processing error details.
4. **`hopper_rate_limits`** (`0010_durable_queue_and_coordination.sql#L86`):
   - Columns: `tenant_key TEXT`, `window_start TIMESTAMPTZ`, `window_seconds INT`, `count INT`.
   - Used only for tenant ingress rate limiting.
   - *Gap:* Completely absent of outgoing GitHub API rate-limit tracking.
5. **`workflow_failures` & `diagnostic_reports`** (`0001_initial_schema.sql#L77-L125`, `0011_denormalize_workspace_id_and_leaf_rls.sql`):
   - Tracks `github_run_id`, `github_job_id`, `github_run_attempt`, `commit_sha`, `branch`, `pr_number`.

---

## 4. Existing GitHub API Call Inventory

All outgoing GitHub API requests across the backend codebase:

| Location | Function | GitHub Endpoint | HTTP Method | Auth Header | Rate-Limit Aware? |
|---|---|---|---|---|---|
| `src/lib/github/app-auth.ts#L142` | `getInstallationToken` | `/app/installations/{id}/access_tokens` | `POST` | `Bearer <App-JWT>` | **NO** |
| `src/lib/github/log-fetcher.ts#L160` | `fetchJobLogStream` | `/repos/{owner}/{repo}/actions/jobs/{job_id}/logs` | `GET` | `Bearer <Inst-Token>` | **NO** |
| `src/lib/github/log-fetcher.ts#L235` | `fetchCommitDiff` | `/repos/{owner}/{repo}/commits/{sha}` | `GET` (Diff) | `Bearer <Inst-Token>` | **NO** |
| `src/lib/github/log-fetcher.ts#L292` | `fetchWorkflowDefinition` | `/repos/{owner}/{repo}/contents/{path}` | `GET` | `Bearer <Inst-Token>` | **NO** |
| `src/lib/github/log-fetcher.ts#L329` | `fetchModifiedFiles` | `/repos/{owner}/{repo}/commits/{sha}` | `GET` (JSON) | `Bearer <Inst-Token>` | **NO** |
| `src/lib/github/pr-reporter.ts#L121` | `publishStickyPullRequestComment` | `/repos/{owner}/{repo}/issues/{pr}/comments` | `GET` | `Bearer <Inst-Token>` | **NO** |
| `src/lib/github/pr-reporter.ts#L131` | `publishStickyPullRequestComment` | `/repos/{owner}/{repo}/issues/comments/{comment_id}` | `PATCH` | `Bearer <Inst-Token>` | **NO** |
| `src/lib/github/pr-reporter.ts#L147` | `publishStickyPullRequestComment` | `/repos/{owner}/{repo}/issues/{pr}/comments` | `POST` | `Bearer <Inst-Token>` | **NO** |
| `src/lib/github/pr-reporter.ts#L208` | `createGitHubCheckRun` | `/repos/{owner}/{repo}/check-runs` | `POST` | `Bearer <Inst-Token>` | **NO** |
| `src/lib/github/pr-reporter.ts#L322` | `triggerWorkflowRerun` | `/repos/{owner}/{repo}/actions/runs/{run_id}/rerun-failed-jobs` | `POST` | `Bearer <Inst-Token>` | **NO** |
| `src/lib/github/sync-service.ts#L100` | `syncUserGitHubResources` | `/user/orgs` | `GET` | `Bearer <OAuth-Token>` | **NO** |
| `src/lib/github/sync-service.ts#L120` | `syncUserGitHubResources` | `/user/repos` | `GET` | `Bearer <OAuth-Token>` | **NO** |
| `src/lib/github/user-auth.ts#L157` | `fetchGitHubUser` | `/user` | `GET` | `Bearer <OAuth-Token>` | **NO** |
| `src/lib/github/user-auth.ts#L176` | `fetchGitHubUser` | `/user/emails` | `GET` | `Bearer <OAuth-Token>` | **NO** |

**Critical Observation:** Zero calls currently inspect `X-RateLimit-Remaining`, handle HTTP 403 secondary throttling, or coordinate request budgets across background worker processes.

---

## 5. Current Authentication & Credential Architecture

1. **GitHub App Authentication (`app-auth.ts`):**
   - Implements RS256 JWT generation signed by `GITHUB_APP_PRIVATE_KEY` (`iss: GITHUB_APP_ID`, valid for 10 minutes with 60s clock skew compensation).
   - In-memory `installationTokenCache` (`Map<number, { token: string, expiresAt: number }>`).
   - *Vulnerability:* Memory-only token cache loses all state on process restarts and is isolated per worker instance, causing duplicate token-minting requests across concurrent processes.
2. **User OAuth (`user-auth.ts`):**
   - Web application flow via `/login/oauth/authorize` with state verification.
   - User tokens are ephemeral and exchanged for Hopper session JWTs.

---

## 6. Existing Webhook Guarantees

* **Signature Verification (`app-auth.ts#L25-L51`):** HMAC-SHA256 verification using `crypto.timingSafeEqual` over `(req as any).rawBody`. Timing-safe and mathematically sound.
* **Delivery Replay Defense (`webhooks.ts#L57-L69`):** Claims `x-github-delivery` in `hopper_webhook_deliveries` using an atomic PostgreSQL insert (`hopper_claim_webhook_delivery`). Duplicate deliveries return `200 status: 'duplicate_ignored'`.
* **Event Limitation Flaw:** In `webhooks.ts#L73-L81`, only `workflow_job` and `workflow_run` completed actions are accepted. All installation, repository, and membership webhooks are silently ignored.

---

## 7. Identified Vulnerabilities & Architectural Gaps

| ID | Category | Severity | File Reference | Finding Description |
|---|---|---|---|---|
| **GAP-01** | Lifecycle | **Critical** | `src/server/routes/webhooks.ts:73` | Ignores `installation` and `installation_repositories` events. When an App is uninstalled or suspended, Hopper maintains active records. |
| **GAP-02** | Rate Limiting | **Critical** | `src/lib/github/log-fetcher.ts`, `pr-reporter.ts` | Complete absence of centralized rate-limit coordination. Concurrent workers can trigger secondary limits (HTTP 403/429) and cascade failures. |
| **GAP-03** | Schema | **High** | `migrations/0001_initial_schema.sql` | Missing rate-limit accounting table, installation permission schema, and integration audit log table. |
| **GAP-04** | Auth/Cache | **High** | `src/lib/github/app-auth.ts:10` | In-memory token cache causes thundering-herd token generation across multiple Node processes. |
| **GAP-05** | Security | **Medium** | `src/server/routes/webhooks.ts:102` | Fallback installation ID `1010101` when payload lacks installation ID risks cross-tenant collision in test/edge events. |
| **GAP-06** | Pagination | **Medium** | `src/lib/github/sync-service.ts:120` | Repository discovery hardcodes `per_page=100` on page 1 without following `Link` header pagination for accounts with >100 repos. |

---

## 8. Prioritized Remediation Plan

1. **Phase 1 — Schema Migration `0013_github_integration_and_rate_limiting.sql`:**
   - Create `github_api_rate_limits` table for PostgreSQL-backed multi-process rate limiting.
   - Create `github_integration_audit_events` table for security audit logging.
   - Add `installation_status`, `permissions`, and `repository_selection` columns to `organizations`.
   - Add `visibility`, `is_archived`, and `last_synced_at` to `repositories`.
2. **Phase 2 — Centralized GitHub API Client & Distributed Rate Limiter:**
   - Build `GitHubApiClient` wrapping all outgoing HTTP requests.
   - Parse and persist `X-RateLimit-*` headers into `github_api_rate_limits`.
   - Implement priority queues (Critical Diagnosis > Results Publication > Sync > Background).
   - Support secondary rate-limit cooldowns (`Retry-After`, HTTP 429/403).
3. **Phase 3 — Webhook Lifecycle Ingress Expansion:**
   - Add handlers for `installation.created`, `installation.deleted`, `installation.suspend`, `installation.unsuspend`.
   - Add handlers for `installation_repositories.added` and `installation_repositories.removed`.
4. **Phase 4 — Distributed Token Cache & Ownership Validation:**
   - Cache installation tokens with PostgreSQL backing or shared locking to eliminate redundant token minting.
   - Strictly validate `Hopper Organization → GitHub Installation → Repository` before admitting events.
5. **Phase 5 — Complete Automated Verification & Testing:**
   - Test rate-limit exhaustion, secondary throttling, webhook lifecycle events, and token security.

