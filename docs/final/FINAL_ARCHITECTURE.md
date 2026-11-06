> **Historical document (pre-Vercel).** This file describes the retired
> Cloudflare architecture and is retained as an audit trail. The current
> architecture is `docs/architecture/VERCEL_TARGET_ARCHITECTURE.md`; operations
> are in `docs/deployment/VERCEL_DEPLOYMENT_RUNBOOK.md`. Links to
> Cloudflare-era files are intentionally dead — see
> `docs/deployment/CLOUDFLARE_REMOVAL_AUDIT.md` for the mapping.

# HOPPER — FINAL SYSTEM ARCHITECTURE SPECIFICATION

## 1. Architectural Overview & System Philosophy

Hopper is a specialized CI/CD Failure Intelligence and Engineering Productivity platform designed to eliminate the developer toil associated with diagnosing continuous integration failures. 

The core architectural invariant is:
$$\text{CI Failure} \longrightarrow \text{Evidence Extraction} \longrightarrow \text{Root-Cause Analysis} \longrightarrow \text{Advisory Diagnosis} \longrightarrow \text{Developer Remediation}$$

Hopper deliberately rejects the premise of autonomous PR mutation or arbitrary code execution on developer repositories. All diagnostic outputs are strictly **passive and advisory**, empowering engineers with high-signal evidence, verified log lines, and exact reproduction commands.

```mermaid
flowchart TD
    subgraph Edge["Cloudflare Edge Tier (Free)"]
        Pages["Cloudflare Pages (React 18 SPA)"]
        Worker["Cloudflare Worker (hopper-edge Gateway)"]
    end

    subgraph API["Hopper Application Tier (Node.js 20+)"]
        Server["Express API Server (Port 3000)"]
        AuthMiddleware["JWT & Workspace RBAC Middleware"]
        WebhookHandler["GitHub HMAC-SHA256 Ingestion Handler"]
    end

    subgraph Queue["Async Task & Mutex Tier (Redis 7)"]
        BullQueue["BullMQ 'ci-failures' Queue"]
        MutexLock["Distributed Ingestion Locks (Key: webhook:run_id)"]
    end

    subgraph Engine["Diagnostic Engine Tier (HopperEngine)"]
        WorkerProcess["BullMQ Job Processor"]
        Scrubber["Secret Scrubber (Entropy + 14 Regex Patterns)"]
        Slicer["Log Slicer (100-line Error Window)"]
        Fingerprinter["Failure Fingerprinter (Template Normalization + SHA-256)"]
        BudgetController["Authoritative AI Budget Controller ($500 ACID Ledger)"]
        AIClient["Single AI Provider (Claude 3.5 Haiku / GPT-4o-mini)"]
        FallbackEngine["Deterministic Heuristic Synthesizer (10 Categories)"]
    end

    subgraph Storage["Authoritative Persistence Tier (PostgreSQL 16 + pgvector)"]
        RuntimeRole["hopper_app Unprivileged Role (NOSUPERUSER, NOBYPASSRLS)"]
        RLSTables["11 Multi-Tenant Tables (FORCE ROW LEVEL SECURITY)"]
        BudgetLedger["ai_budget_ledgers & ai_cost_reservations Tables"]
    end

    Pages -->|API Calls via Fetch| Worker
    Worker -->|Reverse Proxy / TLS| Server
    Server --> AuthMiddleware
    Server --> WebhookHandler
    WebhookHandler -->|HMAC Verified Event| BullQueue
    BullQueue --> WorkerProcess
    WorkerProcess --> Scrubber
    Scrubber --> Slicer
    Slicer --> Fingerprinter
    Fingerprinter --> BudgetController
    BudgetController -->|Pre-flight Reservation| BudgetLedger
    BudgetController --> AIClient
    AIClient -.->|On Timeout or Provider Error| FallbackEngine
    WorkerProcess -->|withTenantContext(sub)| RuntimeRole
    RuntimeRole --> RLSTables
```

---

## 2. Component Deconstruction

### 2.1 Ingestion & Asynchronous Decoupling Layer
- **Endpoint:** `POST /api/webhooks/github`
- **Security:** Verifies `X-Hub-Signature-256` using constant-time `crypto.timingSafeEqual` against the shared `GITHUB_WEBHOOK_SECRET`.
- **Deduplication:** Claims an atomic Redis lock (`SET lock:webhook:run_id 1 NX EX 60`). If a duplicate event arrives within 60 seconds, it is acknowledged with HTTP 200 without duplicate queue insertion.
- **Decoupling:** Returns immediate HTTP 202 Accepted (<25ms response time) and offloads the event payload to BullMQ.

### 2.2 Evidence Extraction & Sanitization Pipeline
When the BullMQ worker dequeues a workflow failure event:
1. **Secret Scrubbing (`LogScrubber`):** Scrubbed before any storage, caching, or LLM transmission. Replaces AWS access keys, GitHub tokens, Slack webhooks, private keys, JWTs, and database URLs with `[REDACTED_SECRET]`.
2. **Log Slicing (`LogSlicer`):** Identifies the highest-signal error window (up to 100 lines) by scanning for compiler diagnostics, stack traces, and exit code indicators.
3. **Template Normalization & Fingerprinting (`FailureFingerprinter`):** Normalizes dynamic tokens (timestamps, PIDs, hex memory addresses, UUIDs) and hashes the clean template using SHA-256 to create a durable `signature_hash`.

### 2.3 Single-Provider AI Architecture & Budget Controller
- **Single-Provider Guarantee:** Only one provider is configured (`anthropic` or `openai`). The application contains zero automatic multi-provider routing, zero secondary provider fallbacks, and zero hidden paid failovers.
- **Authoritative Budget Controller (`AiBudgetController`):**
  - **Hard Invoice Cap:** $500.00 USD monthly.
  - **Nominal Admission Cap:** $475.00 USD monthly ($25.00 concurrency buffer).
  - **Pre-Flight Reservation:** Atomically locks the active monthly ledger row via `SELECT ... FOR UPDATE` and reserves $0.0150 USD prior to dispatching HTTP calls.
  - **Settlement:** Settle actual token usage upon receiving HTTP 200 from the provider.
  - **Graceful Fallback:** If the budget cap is reached, or if the provider returns 429/5xx after bounded retries, the system falls back to the local `synthesizeDeterministicDiagnosis` engine at zero incremental cost.

### 2.4 Multi-Tenant Storage & Kernel-Level RLS
- **Database Engine:** PostgreSQL 16 with `pgvector` extension.
- **Unprivileged Runtime Role:** Application executes exclusively as `hopper_app`:
  - `NOSUPERUSER`, `NOCREATEDB`, `NOCREATEROLE`, `NOINHERIT`, `NOBYPASSRLS`.
- **Kernel-Level Policy:** All 11 application tables enforce `FORCE ROW LEVEL SECURITY`. Table owners and app queries are subjected to RLS filters.
- **Transaction-Scoped Tenant Claims:**
  - Queries are executed using `withTenantContext<T>(userId, callback)`.
  - Injects `SELECT set_config('request.jwt.claim.sub', userId, true)`.
  - The third parameter `is_local = true` guarantees that claims automatically expire on transaction commit/rollback, preventing connection pool pollution.

