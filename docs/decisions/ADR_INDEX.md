# Hopper — Architecture Decision Records Index (ADR_INDEX.md)

---

## Architecture Decision Records (ADRs)

This index records all authoritative architectural decisions made in the Hopper codebase. Every record outlines context, decision drivers, considered options, decision outcomes, and trade-offs.

---

### ADR-001: Single-Origin Deployment on Vercel (Express Gateway + Vite SPA)
- **Status:** **APPROVED & IMPLEMENTED**
- **Date:** November 2026
- **Context:** Previous prototypes used separate deploy pipelines (Cloudflare Pages for frontend, long-running VM for Express backend). This introduced CORS latency, duplicate routing configurations, and cross-origin security overhead.
- **Decision:** Host both the React Vite SPA and the Express API Gateway on a single Vercel deployment using multi-service routing (`vercel.json`).
- **Consequences:**
  - Same-origin architecture eliminates cross-origin CORS complexity in production.
  - One unified deployment pipeline; preview environments test both frontend and backend atomically.
  - Serverless cold starts must be kept low; `createApp()` avoids expensive synchronous boot operations.

---

### ADR-002: PostgreSQL Durable Outbox (Retiring Redis & BullMQ)
- **Status:** **APPROVED & IMPLEMENTED**
- **Date:** November 2026
- **Context:** BullMQ and Redis introduced a mandatory long-running daemon and a separate stateful infrastructure dependency for three primitives (rate limiting, replay dedup, queue leases) that PostgreSQL can handle atomically.
- **Decision:** Retire Redis and BullMQ completely. Implement a durable outbox queue directly in PostgreSQL (`hopper_job_queue`, `hopper_job_dead_letters`) utilizing `SELECT ... FOR UPDATE SKIP LOCKED` (`0010_durable_queue_and_coordination.sql`).
- **Consequences:**
  - Reduces local infrastructure dependencies from two containers to one (PostgreSQL 16 + pgvector).
  - Webhook acknowledgements are durably backed by transactional database commits.
  - Queue throughput is bounded by PostgreSQL connection pool capacity (more than adequate for Hopper's scale).

---

### ADR-003: Retirement of Cloudflare Edge Gateway
- **Status:** **APPROVED & IMPLEMENTED**
- **Date:** November 2026
- **Context:** Cloudflare Workers and Wrangler introduced dual-cloud maintenance, platform-specific bindings, and duplicate middleware logic (security headers, CORS, rate limiting).
- **Decision:** Purge all Cloudflare configurations (`wrangler.toml`, Workers AI SDK, Turnstile middleware) and consolidate all ingress handling into the Express API Gateway.
- **Consequences:**
  - Single codebase and single runtime environment.
  - Automated CI guards prevent accidental reintroduction of Cloudflare artifacts.
  - Zero Wrangler tooling overhead.

---

### ADR-004: Multi-Provider Agentic AI Gateway (Groq & NVIDIA NIM; Rejection of Puter.js)
- **Status:** **APPROVED & IMPLEMENTED** (Supersedes prior browser Puter.js architecture)
- **Date:** November 2026
- **Context:** Hard-coding a single commercial AI provider (e.g. Anthropic or OpenAI) prevents zero-cost local testing and blocks users without funded developer accounts. A previous prototype evaluated Puter.js for browser-based AI, but Puter.js proved unsuitable for production backend CI/CD failure diagnosis: background webhook jobs could not access client sessions, rate limits were non-deterministic, structured JSON output was unverified, and dangling dependencies fragmented the codebase.
- **Decision:** Permanently purge Puter.js and build a resilient server-side **Multi-Provider AI Gateway** (`backend/src/lib/ai/gateway/`):
  1. `groq` (Primary high-speed free provider via OpenAI-compatible endpoint).
  2. `nvidia-nim` (Secondary evaluation-tier catalog failover via OpenAI-compatible endpoint).
  3. `anthropic` and `openai` (strictly opt-in paid providers; never auto-selected when `AI_ENABLE_PAID_FALLBACK=false`).
  4. `deterministic` / `mock` (zero-failure 10-category heuristic engine when offline or if all providers fail).
  5. 6-stage bounded diagnostic orchestrator with safe read-only tools and log line grounding.
- **Consequences:**
  - Local developers and CI pipelines run without mandatory paid credentials.
  - Zero client-side script dependencies, zero dangling Puter artifacts.
  - Automatic provider failover, circuit breaker protection, and token usage telemetry persisted in PostgreSQL (`ai_gateway_requests`).

---

### ADR-005: Multi-Tenant Isolation via Row-Level Security (RLS)
- **Status:** **APPROVED & IMPLEMENTED**
- **Date:** November 2026
- **Context:** Multi-tenant SaaS platforms risk cross-tenant data leakage if developers forget manual `WHERE org_id = ...` clauses in API queries.
- **Decision:** Enforce Row-Level Security (`FORCE ROW LEVEL SECURITY`) at the PostgreSQL engine level under the unprivileged `hopper_app` runtime role. Denormalize `workspace_id` onto leaf tables (`0011`) for low-latency policy evaluation.
- **Consequences:**
  - Zero possibility of cross-tenant data leakage even with buggy query construction.
  - Connections must set transaction-local context (`SET LOCAL app.current_workspace_id`) on every pooled query.

---

### ADR-006: Deterministic SHA-256 Failure Fingerprinting & Moat
- **Status:** **APPROVED & IMPLEMENTED**
- **Date:** November 2026
- **Context:** Test failures and stack traces contain volatile dynamic tokens (timestamps, hex addresses, line numbers) that cause identical root causes to appear as distinct errors.
- **Decision:** Build a deterministic regex normalizer (`fingerprinter.ts`) that masks dynamic tokens before hashing: `SHA256(job_name + step_name + normalized_template)`. Store signatures in `failure_signatures` with vector embeddings for semantic clustering.
- **Consequences:**
  - Repeated failures collapse into a single historical signature.
  - Historical occurrence counters and flakiness probabilities accumulate accurately over time.
  - Cached diagnoses save LLM token costs on repeated failures.

---

### ADR-007: Single Primary AI Development Agent Governance
- **Status:** **APPROVED & ENFORCED**
- **Date:** November 2026
- **Context:** Uncontrolled multi-agent spawning, competing instruction files (`CLAUDE.md`, `GEMINI.md`), and autonomous background agents cause code fragmentation, hallucinated milestones, and repository divergence.
- **Decision:** Establish a strict **Single-Agent Development Model** documented exclusively in `AGENTS.md`. One primary agent owns analysis, code changes, testing, and documentation. Subagent spawning is prohibited. Every change must be verified by concrete test evidence.
- **Consequences:**
  - Unified repository ownership and consistent architectural style.
  - Zero contradictory agent instructions.
  - Clear traceability and accountability for all codebase changes.

---

### ADR-008: Migration of Frontend to Next.js 14 App Router on Vercel
- **Status:** **APPROVED & IMPLEMENTED**
- **Date:** November 2026
- **Context:** The original Vite SPA architecture required custom SPA rewrite transforms in `vercel.json` (`path: /index.html`), lacked native Vercel Edge/SSR optimizations, and generated Rollup comment warnings during bundling. Vercel build runners also triggered npm `cache-dir` and `install-scripts` warnings.
- **Decision:** Migrate `frontend/` from Vite to Next.js 14 (App Router). Maintain isomorphic routing via `router-compat.tsx` with native `next/link` and `next/navigation`. Configure `.npmrc` (`loglevel=error`) and `package.json` (`allowScripts`) to silence build noise. Update `vercel.json` to declare `"framework": "nextjs"`.
- **Consequences:**
  - First-class Next.js compilation, prerendering, and static optimization (20/20 routes prerendered).
  - Clean separation of server/client components via `'use client'` boundaries.
  - Eliminated Vercel deployment warnings (`cache-dir`, `install-scripts`, Rollup comment annotations).
  - Preserved 100% of existing frontend unit tests (34/34 passing) and UI feature functionality.
