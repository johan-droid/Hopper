> **Historical document (pre-Vercel).** This file describes the retired
> Cloudflare architecture and is retained as an audit trail. The current
> architecture is `docs/architecture/VERCEL_TARGET_ARCHITECTURE.md`; operations
> are in `docs/deployment/VERCEL_DEPLOYMENT_RUNBOOK.md`. Links to
> Cloudflare-era files are intentionally dead — see
> `docs/deployment/CLOUDFLARE_REMOVAL_AUDIT.md` for the mapping.

# Hopper — System Architecture & Topology Audit

## 1. System Topology & Data Flow

```text
                               ┌─────────────────────────────────────────────────────────────┐
                               │                    GitHub Cloud Platform                    │
                               │  - Workflow job & run webhooks (completed: failure/success) │
                               │  - Log extraction via Octokit API (Installation Token)      │
                               │  - Sticky PR Comment Upsert via GitHub Issues REST API      │
                               └──────────────┬────────────────────────▲─────────────────────┘
                                              │ (1) HMAC-SHA256        │ (7) Sticky PR Comment
                                              ▼ Ingress                │
┌─────────────────────────┐    ┌───────────────────────────────────────┴─────────────────────┐
│  Cloudflare Tunnel      │◄───┤                Hopper API Gateway (Express 4)               │
│  (Quick Tunnel via      │    │  - Sub-10ms timingSafeEqual HMAC verification               │
│   trycloudflare.com)    │    │  - Tenant rate-limiting in Redis (120 req/min)              │
└─────────────────────────┘    │  - Webhook delivery deduplication (24h TTL)                 │
                               │  - Enqueues event payload to BullMQ ("ci-events")           │
                               │  - REST Endpoints for Dashboard, Signatures, Adhoc Diagnose │
                               └──────────────┬──────────────────────────────────────────────┘
                                              │ (2) Asynchronous Enqueue
                                              ▼
                               ┌─────────────────────────────────────────────────────────────┐
                               │                   Redis 7 Event Bus (BullMQ)                │
                               │  - Queue: "ci-events"                                       │
                               │  - Rate-limit sliding window counters                       │
                               │  - Concurrent lock tracking per failure signature           │
                               └──────────────┬──────────────────────────────────────────────┘
                                              │ (3) Dequeue Job Event
                                              ▼
                               ┌─────────────────────────────────────────────────────────────┐
                               │             Dedicated BullMQ Background Worker              │
                               │  - Stage A: Retry Pass Tracker (updates same-SHA pass rate) │
                               │  - Stage B: Memory-bounded Log Stream Slicer (300KB budget) │
                               │  - Stage C: Multi-pattern Secret Scrubber (AWS, JWT, PEM)   │
                               │  - Stage D: Deterministic SHA-256 Fingerprinter             │
                               │  - Stage E: Bayesian Flakiness Moat Engine                  │
                               │  - Stage F: Claude 3.5 Haiku / OpenAI Structured Diagnosis  │
                               │  - Stage G: PR Sticky Comment Renderer                      │
                               └──────────────┬────────────────────────┬─────────────────────┘
                                              │ (4) Vector & Metadata  │ (5) LLM Prompt
                                              ▼ Storage                ▼
                               ┌─────────────────────────────┐ ┌─────────────────────────────┐
                               │  PostgreSQL 16 + pgvector   │ │    AI Inference Providers   │
                               │  - organizations            │ │  - Anthropic Claude 3.5     │
                               │  - repositories             │ │  - OpenAI text-embedding-3  │
                               │  - failure_signatures       │ │  - Offline Deterministic    │
                               │  - workflow_failures        │ │    Rule-Based Fallback      │
                               │  - diagnostic_reports       │ └─────────────────────────────┘
                               │  - HNSW cosine vector index │
                               └─────────────────────────────┘
```

---

## 2. Decoupled Service Boundaries (Option B Architecture)

Hopper implements a decoupled architecture:

1. **API Gateway & Ingress Layer (`backend/src/server/index.ts`)**:
   - High-throughput Express gateway designed for sub-50ms webhook acknowledgment.
   - Decoupled from heavy LLM inference and long-running log extraction via BullMQ queueing.
   - Configured with CORS for local Vite development and production domains.

2. **Dedicated Background Worker Service (`backend/src/workers/worker-entry.ts`)**:
   - Executes as an independent Node process.
   - Handles the entire compute-intensive diagnosis pipeline: log streaming, regex sanitization, fingerprint hashing, vector embedding generation, LLM structured synthesis, and GitHub PR commenting.
   - Graceful shutdown handles `SIGINT`/`SIGTERM` by draining in-flight jobs before closing database and Redis connection pools.

3. **Frontend Application Layer (`frontend/src/`)**:
   - Modern React 18 single-page application built with Vite and Tailwind CSS.
   - Dual interface modes:
     - **Public Developer Landing Page (`LandingPageView.tsx`)**: High-converting interactive product showcase with live in-page log analyzer, before/after comparisons, and pricing matrix.
     - **Authenticated Web Console (`OverviewView`, `SignatureInspectorView`, `DiagnosticSandboxView`, `BillingPlansView`, `TelemetryView`)**: Real-time management of flaky test leaderboards, cross-run timelines, and billing quotas.

4. **Persistence & Semantic Search Layer (`backend/src/db/`)**:
   - PostgreSQL 16 with `pgvector` extension.
   - Uses HNSW (Hierarchical Navigable Small World) index for sub-10ms cosine similarity searches on 1536-dimensional error embeddings.
   - Relational repository pattern abstracting raw SQL queries.

---

## 3. Architectural Strengths

- **Non-blocking Webhook Processing**: GitHub webhooks are acknowledged in &lt;50ms, eliminating webhook delivery timeouts from GitHub.
- **Fail-Safe Offline Operation**: When external AI providers (Anthropic/OpenAI) are unavailable, rate-limited, or unconfigured, Hopper automatically activates its deterministic rule-based analysis engine, guaranteeing 100% pipeline uptime.
- **Defense-in-Depth Secret Sanitization**: High-entropy strings, AWS credentials, Bearer tokens, PEM keys, and connection strings are scrubbed before storage or AI ingestion.
- **Single-Command Local Development**: Full environment orchestration (`npm run local`) with Linux `/proc` process classification and zero-orphan teardown.

---

## 4. Architectural Gaps & Remediation Plan

1. **Standardized Error Envelope**: API error responses across endpoints currently vary. We will implement a uniform error envelope middleware (`{ status: "error", error: { code, message, requestId, timestamp } }`).
2. **Security Headers**: API responses lack standard HTTP security headers (CSP, HSTS, X-Frame-Options, X-Content-Type-Options). We will add a centralized security headers middleware.
3. **Workspace Management API**: Workspace tables (`user_profiles`, `workspaces`, `workspace_members`) exist in migration 0004 but lack REST controllers and services.
4. **Row-Level Security (RLS)**: Core database tables require comprehensive RLS policies to guarantee multi-tenant data isolation.

