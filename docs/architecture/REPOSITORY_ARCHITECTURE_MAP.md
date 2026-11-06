> **Historical document (pre-Vercel).** This file describes the retired
> Cloudflare architecture and is retained as an audit trail. The current
> architecture is `docs/architecture/VERCEL_TARGET_ARCHITECTURE.md`; operations
> are in `docs/deployment/VERCEL_DEPLOYMENT_RUNBOOK.md`. Links to
> Cloudflare-era files are intentionally dead — see
> `docs/deployment/CLOUDFLARE_REMOVAL_AUDIT.md` for the mapping.

# Hopper — Repository Architecture Map

**Document Status:** Approved Architecture Baseline (Phase A)  
**Author:** Principal Systems Architect & Lead Software Engineer  
**Date:** November 6, 2026  
**Repository:** [`/home/ashutoshsahoo/Downloads/Hopper`](file:///home/ashutoshsahoo/Downloads/Hopper)

---

## 1. High-Level System Topology

Hopper is architected as an asynchronous, event-driven CI/CD Failure Intelligence Platform. It intercepts GitHub Actions pipeline failure events, sanitizes raw log artifacts, generates deterministic error fingerprints, tracks test flakiness across branches, executes structured AI root-cause analysis under passive-data constraints, and delivers verified remediation guidance back to developers via pull request comments and an engineering dashboard.

```mermaid
flowchart TD
    subgraph ExternalSources ["External Ingress & Providers"]
        GH["GitHub Actions Webhooks"]
        LLM["Single AI Provider (Anthropic Claude 3.5 Haiku)"]
        SupaAuth["Supabase Authentication"]
    end

    subgraph HopperGateway ["Hopper API Gateway & Ingress (:3001)"]
        Ingress["Express Server (server/index.ts)"]
        HMAC["Webhook HMAC-SHA256 Verifier"]
        SecHeaders["OWASP Security Middleware"]
        AuthMiddleware["Supabase JWT & RBAC Middleware"]
        APIRoutes["Workspace & User Domain Routers"]
    end

    subgraph HopperQueue ["Distributed Queue & Coordination"]
        Redis["Redis (ioredis :6379)"]
        RateLimiter["Token-Bucket Tenant Rate Limiter"]
        LockMgr["Matrix Burst Lock Manager"]
        BullMQ["BullMQ Queue ('ci-failure-intake')"]
    end

    subgraph HopperWorkers ["Hopper Worker Cluster"]
        WorkerEntry["Worker Entry (worker-entry.ts)"]
        JobProcessor["Workflow Job Processor (workflow-job.processor.ts)"]
        LogSlicer["Log Slicer & Secret Scrubber"]
        Fingerprinter["Deterministic SHA-256 Fingerprinter"]
        FlakinessEngine["Cloud Moat Flakiness Engine"]
        AIDiagnosis["Diagnosis Engine (diagnose.ts)"]
        PRReporter["GitHub Sticky PR Reporter"]
    end

    subgraph HopperStorage ["Authoritative Data Layer (:5432)"]
        PG["PostgreSQL Database"]
        RepoTables["organizations, repositories, user_profiles, workspaces"]
        FailureTables["workflow_failures, failure_signatures, diagnostic_reports"]
        RLS["Supabase Row-Level Security Policies"]
    end

    subgraph FrontendApp ["Hopper Frontend Application (:5173)"]
        ViteApp["Vite + React 18 + TailwindCSS SPA"]
        ZustandStore["App Store (useAppStore.ts)"]
        TanStackQuery["TanStack Query Cache"]
        Views["Overview, Signatures, Diagnostic Sandbox, Telemetry"]
    end

    GH -->|"POST /api/webhooks/github"| HMAC
    HMAC --> Ingress
    Ingress --> RateLimiter
    RateLimiter --> BullMQ
    BullMQ --> Redis
    Redis --> WorkerEntry
    WorkerEntry --> JobProcessor

    JobProcessor --> LogSlicer
    LogSlicer --> Fingerprinter
    Fingerprinter --> FlakinessEngine
    FlakinessEngine --> AIDiagnosis
    AIDiagnosis -->|"Inference Request"| LLM
    LLM -->>|"Passive JSON Diagnosis"| AIDiagnosis
    AIDiagnosis --> JobProcessor
    JobProcessor --> PRReporter
    PRReporter -->|"Sticky PR Comment"| GH

    JobProcessor --> PG
    Ingress --> PG
    AuthMiddleware --> SupaAuth

    FrontendApp -->|"REST API / Bearer JWT"| Ingress
```

---

## 2. Repository Directory Organization

```
Hopper/
├── backend/                              # Core Node.js / TypeScript Backend
│   ├── bin/hopper.js                     # CLI executable wrapper
│   ├── src/
│   │   ├── cli/                          # Hopper developer & lifecycle CLI
│   │   │   ├── hopper.ts                 # CLI command definitions (doctor, migrate, simulate, lifecycle)
│   │   │   └── lifecycle.ts              # End-to-end SDLC validation pipeline
│   │   ├── db/                           # Authoritative Database & Data Access Layer
│   │   │   ├── client.ts                 # PostgreSQL connection pool & health checks
│   │   │   ├── migrator.ts               # Up-migration orchestrator
│   │   │   ├── types.ts                  # Domain model interfaces & DTOs
│   │   │   └── repositories/             # Repository pattern data access objects
│   │   │       ├── diagnostic-report.repository.ts
│   │   │       ├── failure-signature.repository.ts
│   │   │       ├── organization.repository.ts
│   │   │       ├── repository.repository.ts
│   │   │       ├── user-profile.repository.ts
│   │   │       ├── workflow-failure.repository.ts
│   │   │       └── workspace.repository.ts
│   │   ├── lib/                          # Domain Logic & Utility Libraries
│   │   │   ├── ai/                       # AI Synthesis & Vector Embeddings
│   │   │   │   ├── diagnose.ts           # Single-provider AI synthesis & deterministic fallback
│   │   │   │   ├── embeddings.ts         # Semantic vector generation
│   │   │   │   └── evaluation/           # AI Benchmark evaluation suite (50 cases)
│   │   │   ├── billing/                  # Frozen Billing Prototypes & Quota Guards
│   │   │   │   ├── quota-guard.ts        # Quota checks & feature gates
│   │   │   │   └── stripe-handler.ts     # Prototype Stripe webhook & checkout stubs
│   │   │   ├── github/                   # GitHub Integration Adapters
│   │   │   │   ├── app-auth.ts           # GitHub App installation token generator & HMAC verifier
│   │   │   │   ├── log-fetcher.ts        # GitHub API raw build log fetcher
│   │   │   │   └── pr-reporter.ts        # Pull request markdown renderer & sticky comment upsert
│   │   │   ├── moat/                     # Intellectual Property & Moat Algorithms
│   │   │   │   └── flakiness-engine.ts   # Bayesian flakiness scoring across retry passes
│   │   │   └── parser/                   # Deterministic Log Processing
│   │   │       ├── ansi-stripper.ts      # Terminal color & control character scrubber
│   │   │       ├── fingerprinter.ts      # Template normalization & SHA-256 signature hasher
│   │   │       ├── log-slicer.ts         # Targeted stack frame & error window extractor
│   │   │       └── secret-scrubber.ts    # High-entropy credential & token redactor
│   │   ├── queue/                        # BullMQ Producers & Redis Infrastructure
│   │   │   ├── ci-queue.ts               # Ingestion enqueue handler
│   │   │   ├── redis.ts                  # Redis client, rate limiter & matrix lock manager
│   │   │   └── types.ts                  # Queue payload contracts
│   │   ├── server/                       # HTTP API Server
│   │   │   ├── index.ts                  # Express server & route registration
│   │   │   ├── middleware/               # Express middleware (auth, rbac, security, error-handler)
│   │   │   └── routes/                   # Modular Express routers (users, workspaces)
│   │   └── workers/                      # Asynchronous Queue Consumers
│   │       ├── index.ts                  # Worker module exporter
│   │       ├── worker-entry.ts           # Worker standalone process runner
│   │       └── processors/
│   │           ├── slack-alert.processor.ts # Slack notification dispatch
│   │           └── workflow-job.processor.ts # Central failure diagnosis processor
│   ├── supabase/migrations/              # Ordered PostgreSQL schema migrations
│   └── tests/                            # Comprehensive Vitest test suite (26 files, 147 tests)
│
├── frontend/                             # Vite + React 18 Single Page Application
│   ├── src/
│   │   ├── api/                          # Frontend API Client, Schemas & React Query Hooks
│   │   ├── components/                   # UI Components (auth, layout, views)
│   │   ├── store/                        # Zustand global application state
│   │   └── App.tsx                       # Main application shell
│   └── tests/                            # Frontend schema and contract tests
│
├── scripts/local/                        # Local Development & Orchestration Tooling
└── docs/                                 # Architectural, Engineering, Strategy & Audit Documents
    ├── architecture/                     # System architecture blueprints & dataflow maps
    ├── engineering/                      # Autonomous execution logs & Phase reports
    └── strategy/                         # India-first commercial & validation blueprints
```

---

## 3. Operational Entrypoints

| Entrypoint | Command / Script | Primary Responsibility |
| :--- | :--- | :--- |
| **API Server** | `npm --prefix backend run dev` / `node dist/server/index.js` | Starts HTTP API Gateway on port 3001, handles webhooks and REST endpoints. |
| **Worker Daemon** | `npm --prefix backend run worker` | Starts BullMQ consumer daemon, polling `ci-failure-intake` queue. |
| **Frontend Dev** | `npm --prefix frontend run dev` | Starts Vite dev server on port 5173 with hot module replacement. |
| **Local Orchestrator**| `npm run local` (`scripts/local/start.mjs`) | Manages background Postgres, Redis, API, Worker, Frontend, and Cloudflare tunnel. |
| **Hopper CLI** | `npm --prefix backend run doctor` / `migrate` / `simulate` | Developer diagnostics, schema migrations, and synthetic CI event simulation. |
| **Unified Test Suite**| `npm run test:backend` & `npm run test:frontend` | Executes all 147 backend unit/integration tests and 8 frontend contract tests. |

---

## 4. Key Architectural Boundaries & Constraints

1. **Passive-Data Recommendation Boundary:**
   Hopper strictly operates as an advisory failure intelligence engine. It has zero authority to execute shell commands, mutate git repositories, or trigger automatic deployments.
2. **Deterministic-First Fallback:**
   When AI rate limits, network timeouts, or operational budgets are reached, the system falls back seamlessly to deterministic regex pattern matching, guaranteeing zero disruption to developer CI pipelines.
3. **Strict Separation of Operational Budgets:**
   The internal \$500 monthly AI API ceiling operates as an infrastructure safety brake on provider keys, entirely decoupled from customer commercial subscription status.

