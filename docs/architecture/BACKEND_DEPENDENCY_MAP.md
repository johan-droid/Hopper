# Hopper — Backend Dependency Map & Module Couplings

**Document Status:** Approved Architecture Baseline (Phase A)  
**Author:** Principal Systems Architect & Lead Software Engineer  
**Date:** November 6, 2026  
**Target Repository:** [`/home/ashutoshsahoo/Downloads/Hopper`](file:///home/ashutoshsahoo/Downloads/Hopper)

---

## 1. Architectural Layering Model

Hopper's backend is logically stratified into 6 architectural layers:

```
[ Layer 1: Ingress & Entrypoints ]
  ├── CLI Commands (hopper.ts, lifecycle.ts)
  ├── HTTP API Gateway (server/index.ts, routes/workspaces.ts, routes/users.ts)
  └── Queue Worker Daemons (worker-entry.ts)
        │
[ Layer 2: Middleware & Gateways ]
  ├── Security Headers (security.ts)
  ├── Supabase JWT Authenticator (auth.ts)
  ├── Workspace RBAC Enforcer (rbac.ts)
  └── Error Handling & Correlation (error-handler.ts)
        │
[ Layer 3: Orchestration & Consumers ]
  ├── CI Workflow Processor (workflow-job.processor.ts)
  ├── Slack Alert Processor (slack-alert.processor.ts)
  └── Queue Ingestion Producer (ci-queue.ts)
        │
[ Layer 4: Domain & Intelligence Libraries ]
  ├── AI Diagnosis Synthesizer (diagnose.ts)
  ├── Semantic Embeddings (embeddings.ts)
  ├── Flakiness Moat Engine (flakiness-engine.ts)
  ├── Log Parser & Slicer (log-slicer.ts, ansi-stripper.ts)
  ├── Fingerprint Normalizer (fingerprinter.ts)
  └── Secret Scrubber (secret-scrubber.ts)
        │
[ Layer 5: Data Access Repositories ]
  ├── Workspace & User Repositories (workspace.repository.ts, user-profile.repository.ts)
  ├── Organization & Repo Repositories (organization.repository.ts, repository.repository.ts)
  └── Failure & Report Repositories (workflow-failure.repository.ts, failure-signature.repository.ts, diagnostic-report.repository.ts)
        │
[ Layer 6: Infrastructure & Drivers ]
  ├── PostgreSQL Connection Pool (pg, client.ts, migrator.ts)
  └── Redis Coordination (ioredis, redis.ts)
```

---

## 2. Dependency Direction Matrix

The table below catalogs internal package imports across major subsystem modules:

| Subsystem Module | Primary Inbound Dependents | Outbound Internal Dependencies | Coupling Assessment |
| :--- | :--- | :--- | :--- |
| **`server/index.ts`** | Entrypoint (`server.ts`, tests) | `app-auth.ts`, `log-slicer.ts`, `fingerprinter.ts`, `flakiness-engine.ts`, `diagnose.ts`, `redis.ts`, `ci-queue.ts`, `workflow-job.processor.ts`, `stripe-handler.ts`, `db/repositories/*` | **High Coupling (God Object).** Inlines raw SQL, route registration, parser invocations, and queue dispatches. |
| **`workflow-job.processor.ts`** | `worker-entry.ts`, `server/index.ts` (test harness) | `log-slicer.ts`, `fingerprinter.ts`, `flakiness-engine.ts`, `diagnose.ts`, `embeddings.ts`, `pr-reporter.ts`, `quota-guard.ts`, `log-fetcher.ts`, `app-auth.ts`, `redis.ts`, `db/repositories/*` | **High Coupling.** Orchestrates the entire pipeline end-to-end within a single 390-line function. |
| **`lib/ai/diagnose.ts`** | `workflow-job.processor.ts`, `server/index.ts`, `cli/hopper.ts`, `cli/lifecycle.ts` | Zod schema, fetch API, `performance` API. | **Low / Clean Coupling.** Self-contained single-provider module with zero outbound database or network dependencies outside the provider endpoint. |
| **`lib/parser/*`** | Processors, CLI, Server | Regex utilities, node:crypto. | **Clean / Pure Functions.** Deterministic, zero side-effects. |
| **`db/repositories/*`** | Processors, Server Routes | `db/client.ts`, `db/types.ts`. | **Clean Data Access.** Encapsulates SQL queries using parameterized parameters. |
| **`queue/redis.ts`** | Processors, Server, Queue | `ioredis`. | **Shared State.** Provides distributed locking, rate-limiting, and webhook deduplication. |

---

## 3. Duplicate Business Logic Analysis

A critical finding from Phase A discovery is the **triplication of failure processing logic** across disparate entrypoints:

```
+--------------------------------------------------------------------------------------------------+
|                                    DUPLICATE PIPELINE ORCHESTRATION                              |
+------------------------------+--------------------+---------------------+------------------------+
| Pipeline Step                | worker-processor   | server/index.ts     | cli/hopper.ts &        |
|                              |                    | (/api/diagnose/adhoc)| cli/lifecycle.ts       |
+------------------------------+--------------------+---------------------+------------------------+
| 1. Log Slicing               | sliceFailedStepLog | sliceFailedStepLog  | sliceFailedStepLog     |
| 2. Fingerprinting            | computeFailureSig  | computeFailureSig   | computeFailureSig      |
| 3. Flakiness Scoring         | calculateFlakiness | calculateFlakiness  | calculateFlakiness     |
| 4. AI Diagnosis Synthesis    | synthesizeDiagnosis| synthesizeDiagnosis | synthesizeDiagnosis    |
| 5. PR Markdown Rendering     | renderGitHubPrComm | (Not rendered)      | renderGitHubPrComment  |
+------------------------------+--------------------+---------------------+------------------------+
```

### The Problem
If the heuristic slicing algorithm or flakiness equation is updated, changes must currently be synchronized across 4 different files (`workflow-job.processor.ts`, `server/index.ts`, `hopper.ts`, `lifecycle.ts`). Any omission causes behavioral divergence between real worker jobs and adhoc developer CLI simulations.

### Phase B Solution (The Hopper Engine Refactoring)
Extract this common pipeline into a unified, reusable **Diagnosis Pipeline Service** (`backend/src/engine/diagnosis/diagnosis-engine.service.ts`) that standardizes the execution flow across workers, REST APIs, and developer CLIs.

---

## 4. Circular Dependency Audit

An analysis of module import graphs confirms:
- **No Circular Imports Exist:** TypeScript compilation (`tsc --noEmit`) passes with 0 errors. Modules import downwards according to Layer 1 $\to$ Layer 6 hierarchy.
- **Transitive Coupling:** `server/index.ts` imports `workflow-job.processor.ts` solely to support local synchronous test runs in `scripts/local/tests/test-orchestrator.mjs`. This direct coupling of HTTP gateway to worker processing should be decoupled via a shared queue interface.

---

## 5. Architectural Recommendations for Phase B

1. **Deconstruct `server/index.ts`:**
   - Extract GitHub Webhook Controller to `backend/src/engine/ingestion/github-webhook.controller.ts`.
   - Extract Dashboard & Signature Query Handlers to `backend/src/server/routes/dashboard.ts` and `backend/src/server/routes/signatures.ts`.
2. **Deconstruct `workflow-job.processor.ts`:**
   - Separate the monolithic worker into discrete domain engines:
     - `IngestionEngine`: Payload normalization and idempotency.
     - `ContextEngine`: Repository and historical failure context retrieval.
     - `DiagnosisEngine`: Slicing, fingerprinting, flakiness scoring, and AI synthesis.
     - `IntegrationEngine`: GitHub PR sticky comment upserting and Slack alerting.
3. **Bridge the Dual-Tenant Model:**
   - Link `repositories` to `workspaces` so authenticated workspace members can access failure intelligence for their team's repositories.

