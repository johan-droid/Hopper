# Hopper — GitHub Integration Architecture Specification

**Document:** Target System Architecture & Integration Model  
**Author:** Principal Backend Engineer & GitHub Platform Integration Architect  
**Repository:** `johan-droid/Hopper`  
**Date:** November 14, 2026  
**Status:** Architecture Design Approved for Implementation  

---

## 1. Architectural Principles & Ownership Boundaries

1. **GitHub is the Authoritative Source for Code & CI:** GitHub owns repositories, commits, branch definitions, workflow definitions, workflow execution status, and installation permissions. Hopper never duplicates GitHub repository source trees or commits beyond transient, bounded snippets.
2. **Hopper is Authoritative for Failure Diagnosis & Intelligence:** Hopper owns diagnostic synthesis, flakiness computation, cost/quota accounting, and internal organization workspaces.
3. **Strict Server-Side Tenant Validation:** Every GitHub event and API request must resolve and validate the ownership chain:
   $$\text{Hopper Organization} \longrightarrow \text{GitHub Installation} \longrightarrow \text{GitHub Repository}$$
   Client-supplied identifiers are untrusted until verified against database foreign key constraints.
4. **Single Common Outgoing Request Layer:** No application module, engine, or worker may invoke `fetch('https://api.github.com/...')` directly. All outgoing calls must route through the centralized, rate-limit-aware `GitHubApiClient`.
5. **Decoupled Financial Accounting:** Monetary AI expenditure and subscription CI run quotas are maintained independently; webhook deliveries are never charged.

---

## 2. Target Component Architecture

```
                                  GITHUB PLATFORM
                                         │
                   ┌─────────────────────┴─────────────────────┐
                   │ Inbound Webhooks                          │ Outbound REST API
                   ▼                                           ▲
┌──────────────────────────────────────┐     ┌─────────────────┴───────────────────┐
│ Webhook Ingress Router               │     │ Centralized GitHubApiClient         │
│ (`src/server/routes/webhooks.ts`)    │     │ (`src/lib/github/api-client.ts`)    │
│ - HMAC-SHA256 signature verification │     │ - Rate-limit header parsing         │
│ - Delivery deduplication (Postgres)  │     │ - Priority queue scheduling         │
│ - Tenant rate limiting (120 req/min) │     │ - Secondary throttling cooldowns    │
│ - Event router:                      │     │ - Bounded pagination & redirects    │
│   * Workflow events -> CI Queue      │     │ - Exponential backoff + jitter      │
│   * Installation events -> Sync Svc  │     └─────────────────┬───────────────────┘
└──────────────────┬───────────────────┘                       │
                   │                                           │ State Updates & Reservations
                   ▼                                           ▼
┌──────────────────────────────────────┐     ┌─────────────────────────────────────┐
│ Durable PostgreSQL Outbox & Queue    │     │ PostgreSQL Rate-Limit Coordinator   │
│ (`src/queue/durable-queue.ts`)       │     │ (`src/lib/github/rate-limiter.ts`)  │
│ - At-least-once durable persistence  │     │ - Shared across multiple workers    │
│ - Claim & visibility timeouts        │     │ - Tracks limit, remaining, reset_at │
└──────────────────┬───────────────────┘     │ - Tracks secondary 403/429 cooldowns│
                   │                         └─────────────────────────────────────┘
                   ▼
┌──────────────────────────────────────┐
│ Background Worker & HopperEngine     │
│ (`workflow-job.processor.ts`)        │
│ - Matrix burst coordination locks    │
│ - Centralized diagnosis execution    │
└──────────────────────────────────────┘
```

---

## 3. GitHub App Authentication Lifecycle

### 3.1 App JWT Generation
* Algorithm: `RS256` using `GITHUB_APP_PRIVATE_KEY` and `GITHUB_APP_ID`.
* Lifetime: Max 10 minutes (`exp = now + 600`), issued with 60 seconds backdated skew (`iat = now - 60`).

### 3.2 Installation Access Tokens
* Generated via `POST /app/installations/{installation_id}/access_tokens`.
* Valid for 1 hour; proactively refreshed when remaining lifetime $< 5$ minutes.
* Distributed caching: Cached in memory with PostgreSQL fallback or synchronization to eliminate duplicate token generation across concurrent worker instances.

### 3.3 Lifecycle State Machine
* **`active`:** Normal operational state. Workflow events ingested; API calls permitted.
* **`suspended`:** Ingest paused; outbound notifications suppressed; status recorded in audit log.
* **`deleted`:** Associated repositories marked `is_active = FALSE`; token cache evicted; incoming events rejected.

---

## 4. Webhook Processing & Reliability Guarantees

1. **HMAC-SHA256 Signature Verification:**
   * Executed over unmodified raw request buffer (`req.rawBody`) using `crypto.timingSafeEqual`.
2. **Delivery Deduplication:**
   * Handled by PostgreSQL unique constraint on `hopper_webhook_deliveries(delivery_id)`.
   * Replayed events immediately return `200 status: 'duplicate_ignored'`.
3. **Fail-Closed Delivery Acceptance:**
   * Webhook router returns `202 Accepted` only after the event payload is durably persisted in `hopper_job_queue` or processed by the sync service.
   * If database coordination is degraded, the endpoint returns `503 Service Unavailable`, prompting GitHub's automatic retry backoff.
4. **Supported Webhook Events Allowlist:**
   * `workflow_job.completed`
   * `workflow_run.completed`
   * `installation.created`, `installation.deleted`, `installation.suspend`, `installation.unsuspend`
   * `installation_repositories.added`, `installation_repositories.removed`

