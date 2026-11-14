# Hopper — Technical Debt Register & Defect Matrix

**Document Status:** Approved Architecture Baseline (Phase A)  
**Author:** Principal Systems Architect & Lead Software Engineer  
**Date:** November 6, 2026  
**Target Repository:** [`/home/ashutoshsahoo/Downloads/Hopper`](file:///home/ashutoshsahoo/Downloads/Hopper)

---

## 1. Executive Summary

Phase A discovery identified 10 key architectural defects, structural couplings, and operational limitations across the codebase. These items represent technical debt accumulated across previous rapid-prototyping iterations and must be systematically resolved across Phases B through G.

---

## 2. Technical Debt Matrix

```
+-------------------------------------------------------------------------------------------------------------------------+
|                                              HOPPER TECHNICAL DEBT LEDGER                                               |
+----+-----------------------------+----------+---------------+-----------------------------------+-----------------------+
| ID | Title / Location            | Severity | Blast Radius  | Impact Summary                    | Remediation Phase     |
+----+-----------------------------+----------+---------------+-----------------------------------+-----------------------+
| 01 | Monolithic API Server       | HIGH     | Gateway / API | Inlines raw SQL, route logic,     | Phase B (Hopper Engine|
|    | (`server/index.ts`)         |          |               | and queue logic in 650 lines      | Deconstruction)       |
+----+-----------------------------+----------+---------------+-----------------------------------+-----------------------+
| 02 | Monolithic Job Processor    | HIGH     | Workers       | 390-line worker stitches parser,  | Phase B (Hopper Engine|
|    | (`workflow-job.processor.ts`)|         |               | fingerprint, AI, and PR comments  | Modularization)       |
+----+-----------------------------+----------+---------------+-----------------------------------+-----------------------+
| 03 | Dual-Tenant Model           | CRITICAL | Security /    | `repositories` link to `orgs`,    | Phase C (Backend & DB |
|    | Disconnect                  |          | Multi-Tenancy | while users belong to `workspaces`| Tenant Bridge)        |
+----+-----------------------------+----------+---------------+-----------------------------------+-----------------------+
| 04 | Inactive Stripe Prototypes  | MEDIUM   | Ingress / Env | Dead Stripe checkout/webhook code | Phase C (Preserve     |
|    | (`stripe-handler.ts`)       |          |               | and mandatory env validation      | inactive / isolate)   |
+----+-----------------------------+----------+---------------+-----------------------------------+-----------------------+
| 05 | Duplicate Pipeline Logic    | HIGH     | Maintainability| Slicing, fingerprinting, flaking | Phase B (Diagnosis    |
|    | (Triplicated across 4 files)|          |               | triplicated in worker, API, CLIs  | Engine Service)       |
+----+-----------------------------+----------+---------------+-----------------------------------+-----------------------+
| 06 | Uncached Anthropic Inference| MEDIUM   | Cost / Latency| `cache_control` omitted in        | Phase D (Prompt Caching|
|    | (`lib/ai/diagnose.ts`)      |          |               | Anthropic API calls               | Activation)           |
+----+-----------------------------+----------+---------------+-----------------------------------+-----------------------+
| 07 | Hardcoded Prompt Strings    | LOW      | AI System     | Prompts embedded as raw strings   | Phase D (Prompt       |
|    | (`diagnose.ts`)             |          |               | without modular versioning        | Engineering Module)   |
+----+-----------------------------+----------+---------------+-----------------------------------+-----------------------+
| 08 | Unpaginated Query Endpoints | MEDIUM   | Performance   | `/failures` and `/signatures`     | Phase C (API Layer    |
|    | (`server/index.ts`)         |          |               | lack cursor/limit pagination      | Pagination)           |
+----+-----------------------------+----------+---------------+-----------------------------------+-----------------------+
| 09 | Frontend IA Misalignment    | HIGH     | Usability     | Tabs (Overview, Signatures,       | Phase E (Frontend     |
|    | (`frontend/src/App.tsx`)    |          |               | Sandbox, Billing, Gateway)        | Full Redesign)        |
+----+-----------------------------+----------+---------------+-----------------------------------+-----------------------+
| 10 | Synthetic Dev Auth Inactive | LOW      | Security      | Dev HMAC generator in frontend    | Phase C (Supabase     |
|    | (`useAppStore.ts`)          |          |               | must never activate in prod       | Auth Hardening)       |
+----+-----------------------------+----------+---------------+-----------------------------------+-----------------------+
```

---

## 3. Detailed Item Analysis

### TD-01: Monolithic API Server (`server/index.ts`)
- **Symptoms:** 650 lines combining environment checks, body parsing, raw database queries, webhook processing, signature lookups, and static file serving.
- **Remediation:** Extract into discrete controllers:
  - `IngestionController` (GitHub webhook processing)
  - `DashboardController` (Flaky test leaderboard, organization metrics)
  - `SignatureController` (Cross-run timelines, signature details)
  - `RepositoryController` (Failure histories)

### TD-02: Monolithic Job Processor (`workflow-job.processor.ts`)
- **Symptoms:** A single function coordinates 12 distinct operations across ingestion, parsing, database persistence, external AI synthesis, and GitHub API interactions.
- **Remediation:** Refactor into modular engines conforming to Phase B mandate:
  - `IngestionEngine` & `NormalizationEngine`
  - `ContextEngine` (repository and previous failure retrieval)
  - `DiagnosisEngine` (selective slicing, fingerprinting, flakiness score, AI synthesis)
  - `IntegrationEngine` (GitHub PR comment formatting and API delivery)

### TD-03: Dual-Tenant Model Disconnect (Critical)
- **Symptoms:** `organizations` anchors GitHub installation IDs and owns `repositories`, whereas `workspaces` anchors human users, RBAC roles, and Supabase auth.
- **Remediation:** Implement a clean linking relationship:
  - Add `workspace_id UUID REFERENCES workspaces(id)` to `organizations`.
  - Provide an API endpoint allowing workspace admins to link an authorized GitHub installation to their workspace.
  - Enforce that queries for repositories, failures, and dashboards require verified membership in the parent workspace.

### TD-04: Inactive Stripe Prototypes & Mandatory Env Check
- **Symptoms:** `server/index.ts` enforces `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID_*` in `mandatoryEnvs` at startup, even though monetization is strictly deferred. If these keys are missing, the server exits.
- **Remediation:** Make Stripe environment variables optional or isolate them in an inactive billing module so the application boots cleanly in pure free/validation mode without dummy credentials.

### TD-05: Duplicate Pipeline Logic across Worker, API, and CLIs
- **Symptoms:** `workflow-job.processor.ts`, `server/index.ts`, `hopper.ts`, and `lifecycle.ts` all independently invoke `sliceFailedStepLog()`, `computeFailureSignature()`, `calculateFlakinessScore()`, and `synthesizeDiagnosis()`.
- **Remediation:** Create a unified `DiagnosisEngineService` that encapsulates this complete diagnostic transformation into a single callable method: `diagnoseFailureLog(context)`.

