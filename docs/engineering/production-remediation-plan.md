# Hopper — Production Backend Remediation & Architecture Hardening Plan

**Document:** Engineering Remediation Plan (Phase 0 Baseline)  
**Status:** In Progress / Active Execution  
**Target Architecture:** Production-Grade Reliability, Tenant Isolation, Financial Correctness & Concurrency Safety  
**Repository:** `johan-droid/Hopper`  

---

## 1. Executive Summary & Baseline Architecture

Hopper is a specialized CI/CD failure diagnosis and engineering intelligence platform built on Node.js/TypeScript and PostgreSQL. It ingests GitHub Actions webhook events, streams and normalizes build logs, extracts commit-diff and workflow context, correlates failure fingerprints with a Bayesian flakiness engine, synthesizes AI/deterministic root causes, and publishes sticky pull request comments and GitHub Check Run annotations.

### 1.1 Discovered Runtime Architecture & Core Contracts
The backend operates across three primary layers:
1. **API & Webhook Ingestion Boundary:**
   - Express server (`src/server/index.ts`) handling GitHub webhooks (`/api/webhooks/github`), Supabase Auth verification, and workspace management.
   - Idempotency guard (`hopper_claim_webhook_delivery`) to enforce replay protection against repeated GitHub webhook deliveries.
2. **Central Engine Pipeline (`HopperEngine`):**
   - Coordinates eight specialized modular engines:
     - `ContextEngine`: Resolves tenant organizations, repositories, modified files, commit diffs, and workflow definitions.
     - `NormalizationEngine`: ANSI stripping, secret scrubbing (API keys, JWTs, OAuth tokens), and log slicing.
     - `IntelligenceEngine`: Generates deterministic and semantic failure signatures, computes Bayesian flakiness scores, and manages cache hits.
     - `DiagnosisEngine`: Orchestrates AI/deterministic failure diagnosis, schema validation via Zod, and passive-data constraint enforcement.
     - `WorkflowEngine`: State tracking and workflow failure persistence.
     - `IntegrationEngine`: External GitHub/Slack/Discord integrations, sticky PR commenting, check runs, and rerun triggers.
     - `ObservabilityEngine`: Structured logging with correlation IDs and execution telemetry.
3. **Queue & Worker Execution Boundary:**
   - PostgreSQL-backed durable queue (`hopper_jobs`, `hopper_acquire_job`, `hopper_complete_job`) in `src/queue/durable-queue.ts`.
   - `workflow-job.processor.ts`: Worker process executing background jobs without bypassing `HopperEngine`.
   - Matrix coordination and coalescing locks (`hopper_diagnosis_locks`, `hopper_acquire_diagnosis_lock`, `hopper_complete_diagnosis_lock`).

---

## 2. Comprehensive Defect Analysis Across Workstreams

Through exhaustive codebase inspection of migrations 0001 through 0011 and runtime call paths, the following architectural and security defects were identified:

| Defect ID | Component | Severity | Description |
|---|---|---|---|
| **DEF-01** | `AiBudgetController` & Ledger | **Critical (Financial)** | `ai_budget_ledgers` and `ai_cost_reservations` lack `organization_id`. AI spend is pooled into a single global $500 monthly ceiling (`chk_ai_budget_bounds`), allowing one tenant's spend to exhaust another tenant's budget. |
| **DEF-02** | RLS on Financial Tables | **Critical (Security)** | `0009_ai_budget_controller_ledger.sql` used `USING (TRUE) WITH CHECK (TRUE)` for `ai_budget_ledgers` and `ai_cost_reservations`, completely disabling tenant isolation on financial tables. |
| **DEF-03** | Diagnosis Coordination | **High (Reliability)** | In `src/queue/coordination.ts`, `acquireDiagnosisLock` caught exceptions and returned `{ acquired: true }` (failing open), risking concurrent un-coalesced LLM diagnosis calls during database degradation. |
| **DEF-04** | Log Fetcher Credential Leak & Mock Fallback | **High (Security/Integrity)** | `fetchJobLogStream` in `log-fetcher.ts` followed redirects with default `redirect: 'follow'`, forwarding GitHub `Authorization` headers to third-party signed S3/Azure storage hosts, and silently substituted synthetic Jest logs on failure even in production. |
| **DEF-05** | Subscription Quota Unit & Period Race | **Medium (Billing)** | Quota was checked per job rather than per unique GitHub workflow run (`github_run_id`), penalizing multi-job matrix builds. Period reset required concurrency-safe row-level locking. |
| **DEF-06** | Commit Diff Bounded Context | **Medium (Security/Performance)** | Diff fetching lacked explicit byte bounds, binary exclusion, and untrusted-data boundary tagging in prompt synthesis. |
| **DEF-07** | Flakiness Bayesian Scoring | **Medium (Accuracy)** | Flakiness scoring did not strictly isolate run attempts on the same commit SHA from multi-commit branch code iterations. |

---

## 3. Implementation Phases & Dependency Order

The remediation is executed in strict dependency order:

```
Phase 0: Baseline & Plan (Completed)
   │
   ▼
Phase 1: Organization-Level AI Budget Architecture & Migration 0012
   │
   ▼
Phase 2: Independent Subscription Run Quota (Workflow Run Level)
   │
   ▼
Phase 3: PostgreSQL Tenant Isolation & Database Security Hardening
   │
   ▼
Phase 4: Matrix Coordination Fail-Closed & Lock Lifecycle
   │
   ▼
Phase 5: Bounded GitHub Log Ingestion (Streaming & Header Isolation)
   │
   ▼
Phase 6: Commit-Diff Intelligence & Untrusted Data Boundaries
   │
   ▼
Phase 7: Flakiness Intelligence Calibration
   │
   ▼
Phase 8: HopperEngine & Worker Boundary Preservation
   │
   ▼
Phase 9: Adversarial Test Suite Verification
   │
   ▼
Phase 10: Operational Reliability & Remediation Report
```

---

## 4. Migration Strategy: Migration `0012_organization_ai_budget_ledgers.sql`

To preserve historical financial integrity without breaking production databases:
1. **Create Table `organization_ai_budget_settings`:**
   - `organization_id UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE`
   - `monthly_limit_usd NUMERIC(10, 4) NOT NULL DEFAULT 50.0000`
   - `enabled BOOLEAN NOT NULL DEFAULT TRUE`
   - `created_at`, `updated_at`
2. **Alter `ai_budget_ledgers`:**
   - Add `organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE` (nullable to allow historical global records).
   - Drop constraint `chk_ai_budget_bounds` (which hardcoded `budget_limit_usd = 500.0000`).
   - Add constraint `chk_ai_budget_bounds_v2` enforcing `settled_spend_usd >= 0`, `reserved_spend_usd >= 0`, `uncertain_spend_usd >= 0`, and `budget_limit_usd > 0`.
   - Add unique partial index: `CREATE UNIQUE INDEX idx_ai_budget_ledgers_org_period ON ai_budget_ledgers(organization_id, period_start, period_end) WHERE organization_id IS NOT NULL;`
3. **Alter `ai_cost_reservations`:**
   - Add `organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE`.
   - Add unique partial index: `CREATE UNIQUE INDEX idx_ai_cost_reservations_org_idempotency ON ai_cost_reservations(organization_id, idempotency_key) WHERE organization_id IS NOT NULL;`
4. **Harden RLS Policies:**
   - Drop `USING (TRUE)` policies.
   - Implement organization-scoped policies using workspace authorization bridge:
     `organization_id IN (SELECT id FROM organizations WHERE workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())))`.
   - Grant unprivileged runtime permissions to `hopper_app`.

---

## 5. Verification & Test Strategy

Verification is conducted using real PostgreSQL execution:
- **Financial Accounting:** Concurrent multi-organization reservation isolation, duplicate key replay safety, timeout uncertain spend accounting, and settlement idempotency.
- **Quota Accounting:** Atomic reservation under parallel matrix bursts, ensuring identical `github_run_id` events do not double-decrement quota.
- **Coordination:** Verifying `acquireDiagnosisLock` fails closed when the database is unreachable or lock is contentious.
- **Log Fetching:** Streaming chunk buffer tests ($O(1)$ memory, max 320 KB), redirect header stripping, and production error throw behavior.
- **Security:** RLS boundary checks ensuring Tenant A cannot read or mutate Tenant B's ledgers or reservations.

---

## 6. Rollback Considerations

All migrations use the expand-and-contract pattern:
- Columns added to `ai_budget_ledgers` and `ai_cost_reservations` are nullable with foreign keys. Existing queries that omit `organization_id` continue to hit the global ledger as a fallback.
- Dropping constraints is replaced with broader valid checks.
- If rollback of application code occurs, schema additions remain non-breaking.

