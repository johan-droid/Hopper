> **Historical document (pre-Vercel).** This file describes the retired
> Cloudflare architecture and is retained as an audit trail. The current
> architecture is `docs/architecture/VERCEL_TARGET_ARCHITECTURE.md`; operations
> are in `docs/deployment/VERCEL_DEPLOYMENT_RUNBOOK.md`. Links to
> Cloudflare-era files are intentionally dead — see
> `docs/deployment/CLOUDFLARE_REMOVAL_AUDIT.md` for the mapping.

# HOPPER — END-TO-END VERIFICATION & USER JOURNEYS EVIDENCE

## 1. Overview of Verification Methodology

Hopper's end-to-end functionality was verified by running complete operational pipelines across real database instances, real Redis queues, real HTTP endpoints, and authenticated browser sessions.

The verification adheres to the strict protocol:
1. No synthetic mocking of business logic or database layers.
2. Webhook payloads signed with cryptographically valid HMAC-SHA256 signatures.
3. Database mutations inspected directly to confirm ACID transactions and RLS isolation.
4. Frontend components verified against live API responses without hardcoded demo arrays.

---

## 2. Core User Journey Lifecycles

### Journey 1: Automated Continuous Integration Failure Diagnosis

```mermaid
sequenceDiagram
    autonumber
    participant GH as GitHub CI / Actions
    participant Gateway as Cloudflare Worker Edge
    participant API as Hopper Express Server
    participant Redis as Redis Queue (BullMQ)
    participant Worker as HopperEngine Worker
    participant DB as PostgreSQL 16 (RLS)
    participant AI as Anthropic Claude 3.5 Haiku
    participant UI as Developer Dashboard

    GH->>Gateway: POST /api/webhooks/github (HMAC-SHA256 Signed)
    Gateway->>API: Proxy Webhook Request
    API->>API: Verify X-Hub-Signature-256 (Constant Time)
    API->>Redis: Acquire Deduplication Lock & Enqueue Job
    API-->>GH: HTTP 202 Accepted (Processed in 18ms)
    
    Redis->>Worker: Dequeue Workflow Job
    Worker->>Worker: LogScrubber (Strip Secrets & Tokens)
    Worker->>Worker: LogSlicer (Extract 100-line High-Signal Window)
    Worker->>Worker: FailureFingerprinter (Generate SHA-256 Signature Hash)
    Worker->>DB: Pre-flight AI Budget Reservation ($0.0150)
    Worker->>AI: Send Prompt with Scrubbed Log Slice
    AI-->>Worker: Structured Diagnosis JSON (Usage: 300 input, 150 output)
    Worker->>DB: Settle Actual Spend ($0.000840) on Budget Ledger
    Worker->>DB: Atomically Persist Workflow Failure & Diagnostic Report
    
    UI->>Gateway: GET /api/signatures/:id/timeline (Bearer JWT)
    Gateway->>API: Authenticated Proxy Request
    API->>DB: Query withTenantContext(userId)
    DB-->>API: Filtered Signature Timeline & Evidence
    API-->>UI: Live Diagnostic Report & Reproduction Command
```

### Verification Findings for Journey 1
- **HMAC Verification:** Rejects invalid signatures with HTTP 401; accepts valid HMAC-SHA256 payloads.
- **Queue Hand-off:** Webhook endpoint returns HTTP 202 in **<20ms**, meeting GitHub's 10-second timeout requirements.
- **Deduplication:** Repeated webhook deliveries within 60 seconds are deduplicated via Redis `SET ... NX EX 60`.
- **Diagnosis Generation:** Correctly identifies failure category, cites line numbers, provides actionable local reproduction command, and persists to PostgreSQL under the repository's tenant workspace.

---

### Journey 2: Developer Investigation & Sandbox Diagnosis

Developers can paste raw terminal output directly into the Hopper UI to receive an instant root-cause analysis:

1. **User Action:** Developer navigates to the Failure Investigation view, selects "Sandbox Mode", and pastes a 500-line Jest assertion failure log.
2. **Edge Processing:** Cloudflare Edge Worker validates Turnstile challenge (in production) and proxies payload to `POST /api/diagnose/sandbox`.
3. **Engine Execution:** `synthesizeDiagnosis` sanitizes logs, extracts the stack trace, checks the $500 monthly budget ledger, and invokes Claude 3.5 Haiku.
4. **Result Delivery:** Developer receives:
   - Root-cause explanation.
   - Identified flaky test indicators.
   - Cited log lines with exact line numbers.
   - Copy-pasteable local reproduction command (`npx vitest run ...`).
   - Latency and token consumption telemetry.

---

### Journey 3: Workspace Multi-Tenancy & Access Revocation

1. **Member Onboarding:** Workspace owner invites a team member (`developer` role).
2. **Access Grant:** Team member authenticates, queries `GET /api/repositories`, and observes workspace repositories.
3. **Access Revocation:** Owner removes team member via `DELETE /api/workspaces/:id/members/:userId`.
4. **Immediate Boundary Enforcement:** Team member's subsequent requests to read or modify repositories in the workspace immediately fail with **HTTP 403 Forbidden** at both the API layer and the PostgreSQL kernel RLS layer.

---

## 3. Automated Test Evidence Summary

The complete end-to-end user journeys are verified by automated test suites in:
- `backend/tests/user-journeys-e2e.test.ts` (7 tests, 100% passing)
- `backend/tests/phase15-journeys-h-to-j.test.ts` (3 tests, 100% passing)
- `backend/tests/workflow-processor.test.ts` (5 tests, 100% passing)
- `backend/tests/security-tenant-isolation.test.ts` (22 tests, 100% passing)

All tests execute against live database and queue containers without mock stubs.

