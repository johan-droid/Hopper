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

### ADR-004: Multi-Provider AI Architecture with Browser Puter.js & Mock Default
- **Status:** **APPROVED & IMPLEMENTED**
- **Date:** November 2026
- **Context:** Hard-coding a single commercial AI provider (e.g. Anthropic or OpenAI) prevents zero-cost local testing and blocks users without funded developer accounts.
- **Decision:** Build a multi-provider router supporting:
  1. `mock` (default for fast, deterministic local offline testing).
  2. `anthropic` (Claude 3.5 Haiku) and `openai` (GPT-4o-mini).
  3. `puter` (in-browser zero-API-key execution via Puter.js allowance across DeepSeek V3 and Qwen 2.5 Coder).
- **Consequences:**
  - Local developers can clone and run tests without external API keys.
  - Users can experience live AI diagnosis in the browser via Puter.js without entering credit cards.
  - The backend fails closed if a selected provider lacks credentials in production.

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
