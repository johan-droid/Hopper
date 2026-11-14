# Hopper — Agent Governance & Technical Operating Manual (AGENTS.md)

> **Mandatory Entry Point:** This document is the single authoritative entry point for any AI coding agent working in the Hopper repository. Every agent must read this file first before inspecting or altering code.

---

## 1. What Hopper Is

**Hopper** is an automated CI/CD failure diagnosis engine and SDLC lifecycle runner named after Rear Admiral Grace Hopper (compiler pioneer and finder of the first literal computer bug).

When automated tests or workflow jobs fail in CI (e.g. GitHub Actions), developers waste hours scrolling through 50MB+ raw terminal logs, debugging non-deterministic flaky failures, and diagnosing opaque infrastructure timeouts.

Hopper solves this by:
1. **Ingesting failed CI events** via cryptographically verified GitHub webhooks (<50ms ingress).
2. **Persisting events to a durable PostgreSQL outbox** with at-least-once delivery and replay deduplication.
3. **Streaming, slicing, and scrubbing raw logs** (capping extraction at tail 300 KB, stripping ANSI codes, and scrubbing sensitive credentials like AWS keys, GitHub tokens, and database URIs).
4. **Fingerprinting failures** by normalizing volatile tokens (UUIDs, memory addresses, timestamps, file line numbers) into canonical SHA-256 signatures to collapse repeated occurrences.
5. **Detecting and scoring flakiness** across commit SHAs, retries, and branches using Bayesian heuristics.
6. **Generating root-cause diagnoses** with actionable fixes via AI reasoning (supporting Groq API, NVIDIA NIM Catalog, Anthropic Claude, OpenAI, or deterministic local mock fallback).
7. **Posting sticky pull-request comments** with gated tier teasers, preventing PR noise by continuously updating a single diagnostic comment.

Hopper is **not** a generic CI/CD dashboard, **not** a generic chatbot, and **not** a task runner clone. It is a specialized, high-precision intelligence layer for CI failure diagnosis.

---

## 2. Single-Agent Development Governance

To prevent agent divergence, hallucinated progress, and fragmented code ownership, this repository operates under a strict **Single-Agent Development Model**:

1. **One Primary Coding Agent:** One single agent owns end-to-end repository analysis, design, implementation, testing, verification, and documentation.
2. **No Subagents or Swarms:** The primary agent **must not** spawn subagents, delegate tasks to parallel autonomous background agents, or set up multi-agent swarms.
3. **No Scattered Instructions:** There are no competing `CLAUDE.md`, `GEMINI.md`, or `.cursorrules` files. `AGENTS.md` is the only authoritative agent configuration.
4. **Evidence-Based Completion:** Never mark a task, feature, or milestone complete based merely on the existence of code files or schemas. Functionality is verified exclusively through passing tests (`npm test`, `npm run test:frontend`, `npm run doctor`), automated builds (`npm run build`), or live execution logs.
5. **Documentation Discipline:** Every architectural decision or state change must be recorded in authoritative docs (`docs/project/CURRENT_STATE.md`, `docs/decisions/ADR_INDEX.md`). Do not create transient daily logs or redundant progress reports.

### Explicit Prohibitions for Agents
- **DO NOT** reintroduce retired architecture: **Redis, BullMQ, Cloudflare Workers, Cloudflare Pages, Wrangler, and Cloudflare Workers AI have been permanently removed.** Do not re-add dependencies or configuration for them.
- **DO NOT** create redundant documentation or duplicate implementation plans. Update canonical docs in `docs/`.
- **DO NOT** invent or fabricate implementation status, test metrics, or deployment URLs.
- **DO NOT** commit real secrets, private keys, or actual credentials into repository files.
- **DO NOT** perform breaking database changes or destructive operations on git history.

---

## 3. Technology Stack & Actual Architecture

The repository is structured as an npm workspaces monorepo:

| Layer | Technology | Key Files & Location |
|---|---|---|
| **Frontend** | Next.js 14 (App Router), React 18, Tailwind CSS, TanStack Query v5, Zustand | `frontend/` (entry: `frontend/app/layout.tsx`, `frontend/app/page.tsx`) |
| **Backend API** | Node.js 20+, Express 4, TypeScript, Zod | `backend/` (entry: `backend/src/server/app.ts`, `backend/src/server/index.ts`) |
| **Database & Search** | PostgreSQL 16 with `pgvector` extension (Supabase in production, Docker in dev) | `backend/supabase/migrations/0001_initial_schema.sql` .. `0013_*.sql` |
| **Queue & Outbox** | PostgreSQL durable outbox (`hopper_job_queue`, `hopper_job_dead_letters`) + Vercel Queues push delivery | `backend/src/queue/` (`job-store.ts`, `consumer.ts`, `transport.ts`) |
| **AI Intelligence** | Multi-provider Agentic AI Gateway: Groq (Primary), NVIDIA NIM (Secondary), Anthropic, OpenAI, Deterministic Fallback | `backend/src/lib/ai/gateway/`, `backend/src/lib/ai/diagnose.ts` |
| **Agent Orchestrator** | 6-stage bounded diagnostic orchestrator with safe read-only tools and line-grounded validation | `backend/src/lib/ai/gateway/orchestration/` |
| **Authentication** | GitHub OAuth (session JWTs with HMAC-signed serverless state) + Supabase Auth | `backend/src/server/routes/auth.ts`, `backend/src/server/middleware/auth.ts` |
| **Billing** | Stripe subscription webhook & checkout integration ($0 Free, $9 Pro, $29 Team) | `backend/src/server/routes/billing.ts`, `backend/src/lib/billing/` |
| **Hosting & Ingress** | Vercel multi-service routing (`services: { backend, frontend }` in `vercel.json`) | `vercel.json` |

---

## 4. Authoritative Documentation Index

When making architectural, implementation, or operational changes, refer to and update the canonical documents:

```text
docs/
├── README.md                           # Documentation directory overview and navigation
├── product/
│   └── VISION.md                       # Product mission, core value prop, tiers, non-goals
├── architecture/
│   ├── SYSTEM_OVERVIEW.md              # System topology, event flows, and delivery guarantees
│   ├── ARCHITECTURE.md                 # Backend & frontend structural design and subsystems
│   ├── DATA_MODEL.md                   # Complete database schema, ERD, RLS policies, functions
│   ├── INTEGRATIONS.md                 # GitHub App, Stripe, Groq, NVIDIA NIM, Vercel, and AI providers
│   └── AI_GATEWAY.md                   # Multi-provider AI gateway, routing, resilience, and orchestrator
├── development/
│   ├── GETTING_STARTED.md              # Prerequisites, local environment setup, and CLI tools
│   ├── DEVELOPMENT_GUIDELINES.md       # Coding conventions, API standards, and migration policy
│   ├── TESTING.md                      # Testing framework, test suites, E2E, and simulation
│   └── CONTRIBUTING.md                 # Branching strategy, review criteria, and git workflow
├── project/
│   ├── CURRENT_STATE.md                # Authoritative implementation status and test ledger
│   ├── ROADMAP.md                      # Phased engineering roadmap and milestones
│   ├── TASKS_AND_GAPS.md               # Actionable tasks, gap matrix, and acceptance criteria
│   └── KNOWN_ISSUES.md                 # Active and resolved defect register and limitations
├── security/
│   └── SECURITY_OVERVIEW.md            # Threat model, tenant isolation, secret scrubbing, auth
└── decisions/
    └── ADR_INDEX.md                    # Architecture Decision Records (ADR-001 through ADR-007)
```

---

## 5. Development & Verification Workflow

### 5.1 Local Environment Setup
```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example backend/.env
# Update DATABASE_URL and GITHUB_APP_WEBHOOK_SECRET for local testing

# 3. Start PostgreSQL 16 + pgvector container
npm run infra:up

# 4. Verify environment preflight
npm run doctor

# 5. Run full-stack development environment (API, worker, and frontend)
npm run dev
```

### 5.2 Verification Commands
Every agent change must pass the following verification ladder before being considered complete:

```bash
# 1. Typecheck & static validation (backend + frontend)
npm run lint

# 2. Backend test suite (33 test files / 226 tests)
npm test

# 3. Frontend test suite (4 test files / 34 tests)
npm run test:frontend

# 4. Production build check
npm run build

# 5. Full 8-stage SDLC lifecycle run
npm run lifecycle
```

---

## 6. Coding & Implementation Conventions

1. **TypeScript Strictness:** Strict typing is enforced. No `any` types without explicit justification. Use Zod schemas (`backend/src/engine/types.ts` and `frontend/src/api/schema.ts`) for data validation at all boundaries.
2. **Error Handling:** Use `ApiError` (`backend/src/server/middleware/error-handler.ts`) for API route exceptions. Never return ad-hoc error structures. All errors must follow `{ success: false, error: { code, message, details }, requestId }`.
3. **Database Changes:** All schema changes must be forward-only, idempotent migrations located in `backend/supabase/migrations/` using timestamp/sequence naming (e.g. `0014_*.sql`). Never modify already-applied migrations. Every new table must declare explicit Row-Level Security (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY;`).
4. **Tenant Isolation:** All data access must be scoped to the authenticated user's active workspace and organization. Never execute unfiltered queries against multi-tenant tables.
5. **Secret Redaction:** Any log processing or diagnostic extraction must pass through `SecretScrubber` (`backend/src/lib/parser/secret-scrubber.ts`) before database persistence or transmission to an AI provider.
6. **Single Canonical Location:** If you fix a defect or update an architecture component, immediately update its entry in `docs/project/CURRENT_STATE.md` and `docs/project/KNOWN_ISSUES.md`.
