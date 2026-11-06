> **Historical document (pre-Vercel).** This file describes the retired
> Cloudflare architecture and is retained as an audit trail. The current
> architecture is `docs/architecture/VERCEL_TARGET_ARCHITECTURE.md`; operations
> are in `docs/deployment/VERCEL_DEPLOYMENT_RUNBOOK.md`. Links to
> Cloudflare-era files are intentionally dead — see
> `docs/deployment/CLOUDFLARE_REMOVAL_AUDIT.md` for the mapping.

# Hopper — End-to-End Integration Matrix & Communication Architecture

**Document Version:** 1.0.0  
**Status:** ACTIVE  
**Last Verified:** 2026-11-06

---

## 1. Overview & System Integration Topology

Hopper functions as a high-throughput, fault-tolerant diagnostics platform spanning multiple heterogeneous subsystems: an event-driven webhook gateway, a Redis BullMQ asynchronous pipeline, an intelligent parsing and redaction layer, deterministic cryptographic fingerprinters, vector embeddings stored in PostgreSQL (`pgvector`), multi-provider LLM synthesis, automated GitHub pull request commenting, Stripe subscription management, and a high-performance React 18 single-page application.

This matrix documents the contracts, protocols, data payloads, timeout budgets, failure cascades, and fallback strategies connecting every subsystem.

```
       +-----------------------------------------------------------------------------------+
       |                                   EXTERNAL WORLD                                  |
       +-----------------------------------------------------------------------------------+
                 |                                      |                               |
                 | Webhook (POST)                       | Redirect / Webhook            | Browser (HTTPS)
                 v                                      v                               v
       +--------------------+                 +--------------------+         +--------------------+
       |   GitHub Actions   |                 |    Stripe API      |         |  Developer Client  |
       |  (check_run/ping)  |                 | (checkout/events)  |         | (Landing/Dashboard)|
       +--------------------+                 +--------------------+         +--------------------+
                 |                                      |                               |
                 | HMAC-SHA256 Signed                   | Stripe-Signature              | Bearer JWT / CORS
                 v                                      v                               v
+---------------------------------------------------------------------------------------------------+
|                                      HOPPER API GATEWAY                                           |
|                                    (Express 4 / Node.js)                                          |
|                                                                                                   |
|  [HMAC Verification]  [Stripe Signature Verification]  [JWT / Tenant Context]  [Error Envelope]   |
+---------------------------------------------------------------------------------------------------+
           |                                     |                                   |
           | Async Job Enqueue                   | Synchronous / Ad-hoc              | Read / Write
           v                                     v                                   v
+--------------------+                 +--------------------+             +------------------------+
|   Redis BullMQ     |                 |  Ad-Hoc Pipeline   |             | PostgreSQL 16 + Vector |
|   (Queue: ci-jobs) |                 | (Slicer + Engine)  |             |  (pgvector / HNSW)     |
+--------------------+                 +--------------------+             +------------------------+
           |                                     |                                   ^
           | Dequeue Job                         | Direct LLM Call                   | Queries / Upserts
           v                                     v                                   |
+-----------------------------------------------------------+                        |
|                     HOPPER WORKER PROCESS                 |------------------------+
|                                                           |
| 1. Download Runner Logs (GitHub API / Octokit)            |
| 2. Window Slicing (Anchor Regex, 40-line context)         |
| 3. Secret Redaction (AWS, JWT, Bearer, PEM, Secrets)      |
| 4. Failure Fingerprinting (Deterministic SHA-256)         |
| 5. Flakiness Scoring (Bayesian Heuristic Spread)          |
| 6. Diagnosis Generation (Claude 3.5 Haiku / GPT-4o)       |
| 7. Embedding Generation (text-embedding-3-small)          |
| 8. Sticky PR Commenting (Markdown Upsert / Collapse)      |
+-----------------------------------------------------------+
```

---

## 2. Integration Flows & Sequence Diagrams

### Flow 1: GitHub Webhook to Pull Request Diagnostics (Asynchronous Pipeline)

This is the primary production workflow executing when a CI job fails on a GitHub repository where Hopper is installed.

```
GitHub Runner           API Gateway               BullMQ/Redis              Hopper Worker             PostgreSQL           GitHub PR
     |                       |                          |                         |                        |                   |
     |--- 1. POST webhook -->|                          |                         |                        |                   |
     |    (check_run.completed)                         |                         |                        |                   |
     |                       |-- 2. Verify HMAC (<10ms)-|                         |                        |                   |
     |                       |-- 3. Enqueue job ------->|                         |                        |                   |
     |<-- 4. HTTP 202 Accepted                          |                         |                        |                   |
     |                       |                          |--- 5. Dequeue job ----->|                        |                   |
     |                       |                          |                         |-- 6. Fetch raw logs -->|                   |
     |                       |                          |                         |    (Octokit API)       |                   |
     |                       |                          |                         |-- 7. Slice & scrub --->|                   |
     |                       |                          |                         |-- 8. Compute hash ---->|                   |
     |                       |                          |                         |-- 9. Check flakiness ->|-- Query runs ---->|
     |                       |                          |                         |                        |<- Return history -|
     |                       |                          |                         |-- 10. AI Diagnosis --->|                   |
     |                       |                          |                         |    (Claude / OpenAI)   |                   |
     |                       |                          |                         |-- 11. Persist run ---->|-- INSERT run/fail |
     |                       |                          |                         |-- 12. Upsert comment --------------------->|
     |                       |                          |                         |    (GitHub Markdown)                       |
```

**Step Breakdown & Contracts:**
1. **GitHub Webhook Ingestion:** `POST /api/webhooks/github`. Headers: `x-hub-signature-256`, `x-github-event`, `x-github-delivery`. Body: raw JSON string parsed with `express.raw({ type: 'application/json' })` to preserve exact byte sequence for cryptographic validation.
2. **Signature Verification:** Constant-time `crypto.timingSafeEqual` between calculated HMAC-SHA256 and incoming header. Responds immediately with HTTP 401 if invalid.
3. **Queueing:** If Redis is available, enqueues to `ci-jobs` queue with backoff retries (`attempts: 3`, `backoff: exponential 5000ms`). Responds with `HTTP 202 {"status": "enqueued", "job_id": "..."}`.
4. **Fallback Sync Mode:** If Redis is offline, falls back to direct synchronous processing pipeline so development environments without Redis continue to function.
5. **Log Extraction:** Worker initializes authenticated Octokit client using repository installation token or GitHub App private key, streaming runner step logs via GitHub REST API.
6. **Slicing & Scrubbing:** Slices $\pm 20$ lines around failure anchors (`FAIL`, `Error:`, `assert`, `exit code 1`). Redacts high-entropy keys, AWS access keys, JWTs, and private PEM blocks with `[REDACTED:<type>]`.
7. **Fingerprinting:** Deterministic SHA-256 computed on normalized failure signature (stripped of timestamps, memory addresses, process IDs, and transient temp paths).
8. **Vector Embeddings & Flakiness:** Generates 1536-dimensional vector embedding for cross-repository similarity search; computes Bayesian score $P(\text{Flaky} \mid D)$ based on historical pass/fail flips on the same commit SHA.
9. **PR Comment Upsert:** Searches for existing Hopper sticky comment via HTML anchor tag `<!-- hopper-sticky-comment -->`. If found, updates in-place and folds previous diagnoses into an HTML `<details>` disclosure; if not found, posts a new comment.

---

### Flow 2: Ad-Hoc Diagnostic Ingestion (Landing Page & Web Console)

Enables users to paste stack traces and terminal logs directly into the Landing Page or Developer Console for instant analysis.

```
Browser Client                API Gateway                 Log Slicer & Redactor        LLM Diagnosis Engine
      |                            |                                |                           |
      |-- 1. POST /api/diagnose -->|                                |                           |
      |      { log_text, env }     |-- 2. Schema Validation (Zod) ->|                           |
      |                            |-- 3. Slice window & redact --->|                           |
      |                            |<-- 4. Clean snippet & hash ----|                           |
      |                            |-- 5. Synthesize diagnosis -------------------------------->|
      |                            |      (Structured output JSON)                              |
      |                            |<-- 6. Validated diagnosis payload -------------------------|
      |<-- 7. HTTP 200 Diagnostic -|
```

- **Contract:**
  - **Request:** `POST /api/diagnose/adhoc`
  - **Request Schema:** `{ log_text: string (min 10 chars), repository?: string, environment?: Record<string, string> }`
  - **Response Schema:**
    ```typescript
    {
      fingerprint: string;           // Deterministic SHA-256
      signature: string;             // Human-readable normalized failure signature
      confidence_score: number;      // 0.00 to 1.00
      flakiness_score: number;       // 0.00 to 1.00
      root_cause_clues: string[];    // Top diagnostic insights
      relevant_log_lines: string[];  // Extracted relevant snippet lines
      recommended_next_checks: string[]; // Actionable debugging commands
      reproduction_script?: string;  // Generated bash command to reproduce locally
      model_used: string;            // Provider identifier (e.g., "claude-3-5-haiku", "gpt-4o", "mock")
    }
    ```

---

### Flow 3: Stripe Subscription & Checkout Lifecycle

```
User (Browser)          API Gateway            Stripe Hosted Checkout          Hopper Database
      |                      |                           |                            |
      |-- 1. POST /billing/ -|                           |                            |
      |      checkout        |-- 2. Create Session ----->|                            |
      |                      |<-- 3. Return session URL -|                            |
      |<-- 4. Redirect URL --|                           |                            |
      |                      |                           |                            |
      |-- 5. Complete payment on stripe.com ------------>|                            |
      |                      |                           |-- 6. POST /billing/webhook |
      |                      |<--------------------------|      (checkout.completed)  |
      |                      |-- 7. Verify Stripe Signature                           |
      |                      |-- 8. UPDATE workspaces SET plan_tier = 'team' -------->|
      |<-- 9. Return to app -|
```

- **Webhook Events Monitored:**
  - `checkout.session.completed`: Upgrades workspace tier from `free` to `developer` or `team`.
  - `customer.subscription.updated`: Synchronizes tier changes, seat counts, and renewal dates.
  - `customer.subscription.deleted`: Gracefully downgrades workspace to `free` tier.

---

## 3. Subsystem Communication Matrix

| Source Subsystem | Destination Subsystem | Protocol / Channel | Payload Type | Auth Mechanism | Timeout Budget | Fallback Behavior |
|---|---|---|---|---|---|---|
| **GitHub Actions** | **Hopper API Gateway** | HTTPS POST | JSON Webhook (`check_run`, `workflow_run`) | HMAC-SHA256 (`x-hub-signature-256`) | 10,000 ms | Discard or retry via GitHub delivery retry |
| **API Gateway** | **Redis BullMQ** | Redis TCP / RESP | BullMQ Job JSON | Redis Auth (`REDIS_URL` credentials) | 2,500 ms | Synchronous in-memory pipeline fallback |
| **BullMQ Worker** | **GitHub REST API** | HTTPS REST | Gzip/Plain Text Runner Logs | GitHub App Installation JWT | 15,000 ms | Retry with exponential backoff (max 3) |
| **BullMQ Worker** | **Anthropic / OpenAI API**| HTTPS REST | JSON (System prompt + redacted context) | API Key Bearer Header | 25,000 ms | Deterministic heuristic rule-based diagnosis |
| **BullMQ Worker** | **PostgreSQL** | TCP / SQL (pg) | Parameterized SQL + Vector Float Arrays | SCRAM-SHA-256 / SSL | 5,000 ms | Queue retry; write failure event to logs |
| **BullMQ Worker** | **GitHub Comments API**| HTTPS REST | GitHub Flavored Markdown | GitHub App Installation JWT | 10,000 ms | Retry with backoff; log failure |
| **Vite Frontend** | **Hopper API Gateway** | HTTPS REST / JSON | JSON Requests / SSE Streams | Bearer JWT (Supabase Auth) | 8,000 ms | Display user-facing notification with retry |
| **Stripe API** | **Hopper API Gateway** | HTTPS POST | Stripe Event Payload | HMAC-SHA256 (`Stripe-Signature`) | 10,000 ms | Stripe automated webhook retry |
| **Local Orchestrator**| **Child Processes** | IPC / POSIX Signals | Process stdin/stdout & SIGTERM/SIGKILL | Operating System / File permissions | 5,000 ms | Bounded SIGKILL escalation |

---

## 4. Failure Cascades & Degraded Mode Resilience

| Failure Scenario | Immediate Impact | Subsystem Isolation & Degraded Behavior | Recovery Action |
|---|---|---|---|
| **Redis Down / OOM** | Background queues inaccessible | Gateway auto-detects Redis connection error and falls back to synchronous execution pipeline. Webhooks return HTTP 200/202 with warning. | Reconnect loop; health check surfaces status via `/api/health`. |
| **Database Network Partition** | State persistence unavailable | API Gateway immediately responds with HTTP 503 (`SERVICE_UNAVAILABLE`). BullMQ pauses job dequeuing to avoid job loss. | Automatic pool reconnect with exponential backoff. |
| **LLM Provider Outage (Anthropic/OpenAI)** | AI synthesis unavailable | Fallback mechanism activates: deterministic rule engine parses stack trace, extracts regex error clues, and delivers structural diagnosis marked `confidence_score: 0.5`. | Multi-provider failover (Claude -> OpenAI -> Mock/Heuristic). |
| **GitHub Rate Limit Exceeded (HTTP 429)** | Cannot fetch logs or post comments | Octokit client inspects `x-ratelimit-reset` header, delays BullMQ job until reset timestamp, and requeues without losing state. | BullMQ delayed retry. |
| **Cloudflare Quick Tunnel Drop** | Public URL unreachable | Local orchestrator health monitor probes tunnel child process, detects termination, and restarts tunnel process automatically. | Auto-restart by `tunnel-manager.mjs`. |
| **Frontend Disconnection** | Dashboard loses connection | React TanStack Query enters exponential backoff retry state; optimistic mutations rolled back safely. | Reconnects on network recovery. |

---

## 5. Security & Isolation Boundaries

1. **Cryptographic Validation Gate:**
   - Every external webhook must cross a constant-time HMAC check before any business logic or JSON parsing occurs.
   - Unauthenticated or invalid signature requests are rejected in $< 5\text{ms}$ to prevent CPU starvation attacks.

2. **Secret Redaction Sandbox:**
   - No raw CI runner log is ever stored in the database or sent to LLM providers before passing through `backend/src/parsers/redactor.ts`.
   - Redaction patterns match RFC-standard API tokens, private keys, and environment variables defined in the repository's `.env.example`.

3. **Tenant & Workspace Boundary:**
   - All database queries filter by `workspace_id`.
   - Database migrations enforce Row-Level Security (RLS) guaranteeing cross-tenant data isolation even if application-layer filters fail.

