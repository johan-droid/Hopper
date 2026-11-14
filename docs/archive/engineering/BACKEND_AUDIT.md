# Hopper — Backend Subsystem & API Audit

## 1. REST Endpoint Inventory & Contract Analysis

| Endpoint | Method | Purpose | Auth & Validation | Status | Identified Gaps |
|---|---|---|---|---|---|
| `/api/health` | GET | Probes API gateway, PostgreSQL pool, and Redis connection health | Public, returns status 200/503 | COMPLETE | Add version metadata and uptime counters. |
| `/api/webhooks/github` | POST | Ingests completed workflow events; enqueues on BullMQ | HMAC-SHA256 signature via `X-Hub-Signature-256`, Redis rate limit (120/min) | COMPLETE | Fully verified with sub-50ms response. |
| `/api/webhooks/stripe` | POST | Handles subscription lifecycle (`checkout.session.completed`, `invoice.payment_failed`) | Stripe HMAC signature via `stripe-signature` header | COMPLETE | Verify live webhook event dispatching. |
| `/api/billing/checkout` | POST | Initiates Stripe Checkout sessions for Pro ($9) and Team ($29) plans | Body validation (`orgId`, `orgLogin`, `plan`) | COMPLETE | Add authenticated user verification. |
| `/api/diagnose/adhoc` | POST | Ad-hoc log diagnosis for CLI, developer testing, and landing page sandbox | Body validation (`rawLog`, `jobName`, `stepName`, `modifiedFiles`) | COMPLETE | Add rate-limiting for public unauthenticated access. |
| `/api/dashboard/:orgSlug` | GET | Returns tenant monthly run quota, consumption, and top 10 flaky test leaderboard | Route param `orgSlug`; tenant scoped | COMPLETE | Resilient fallback for unseeded local dev; add workspace authorization. |
| `/api/signatures/:id` | GET | Fetches signature details, root-cause clues, and cross-run failure timeline | Route param `id`; tenant scoped | COMPLETE | Resilient fallback for unseeded local dev. |
| `/api/repositories/:repoId/failures` | GET | Paginated failure history feed for a specific repository | Route param `repoId` | COMPLETE | Add cursor-based pagination. |
| `/api/workspaces` | GET/POST | Workspace management (personal & organization workspaces) | Supabase Auth required | MISSING | Tables exist in migration 0004; endpoints need implementation. |
| `/api/workspaces/:id/members` | GET/POST | Workspace membership and role assignment | Supabase Auth required | MISSING | Endpoints need implementation. |
| `/api/user/profile` | GET/PUT | User profile linked to Supabase Auth user identity | Supabase Auth required | MISSING | Endpoints need implementation. |

---

## 2. Business Logic & Core Libraries

### `lib/parser/log-slicer.ts`
- **Responsibility:** Extract high-signal failure windows from raw CI logs.
- **Implementation:** Scans bottom-up for error anchors (`FAIL`, `Error:`, `AssertionError`, `timed out`, `Process completed with exit code`). Captures sliding 40-line context window. Detects testing framework (`jest`, `vitest`, `playwright`, `pytest`, `cargo`, `go_test`, `docker`). Caps snippet size at 4000 characters to prevent prompt bloat.
- **Verification:** Unit tested in `tests/parser.test.ts` and `tests/backend-smoke.test.ts`.

### `lib/parser/secret-scrubber.ts`
- **Responsibility:** Redact sensitive credentials before storage or LLM ingestion.
- **Implementation:** Applies regex patterns for:
  - AWS Access Keys (`AKIA...`)
  - Anthropic & OpenAI API Keys (`sk-ant-...`, `sk-proj-...`)
  - GitHub Personal Access Tokens (`ghp_...`, `gho_...`)
  - Database Connection Strings (`postgres://...`, `mysql://...`, `mongodb://...`)
  - Bearer & JWT tokens (`eyJ...`)
  - Private RSA/PEM blocks (`-----BEGIN RSA PRIVATE KEY-----`)
- **Verification:** Unit tested in `tests/scrubber.test.ts`.

### `lib/parser/fingerprinter.ts`
- **Responsibility:** Generate stable SHA-256 failure signatures from noisy stack traces.
- **Implementation:** Strips volatile variables: UUIDs (`[0-9a-fA-F-]{36}`), commit SHAs (`[0-9a-fA-F]{40}`), memory hex addresses (`0x[0-9a-fA-F]+`), line and column numbers (`:42:18` -> `:<line>:<col>`), durations (`1200ms` -> `<duration>ms`), and port numbers. Hashes normalized template with SHA-256.
- **Verification:** Determinism verified in `tests/fingerprint.test.ts`.

### `lib/moat/flakiness-engine.ts`
- **Responsibility:** Calculate Bayesian probability that a failure is intermittent rather than a regression.
- **Key Formula:**
  - Same-commit retry passes provide the strongest evidence (+35% per pass, up to +70%).
  - Multi-PR spread (+15% for 3+ PRs, +30% for 5+ PRs).
  - Main-branch occurrences (+10% for 3+ occurrences).
  - Transient error patterns (network timeouts, socket hang up, rate limits add +25%).
- **Verification:** Heuristics verified in `tests/flakiness.test.ts`.

### `lib/ai/diagnose.ts`
- **Responsibility:** Synthesize structured root-cause diagnosis conforming strictly to Zod schema.
- **Implementation:** Formulates system and user prompts with passive-data encapsulation to prevent prompt injection. Validates response with `DiagnosisOutputSchema`. If Anthropic or OpenAI API keys are absent, expired, or rate-limited, cleanly falls back to deterministic rule-based analysis.
- **Verification:** Tested in `tests/ai.test.ts`.

### `workers/processors/workflow-job.processor.ts`
- **Responsibility:** End-to-end event execution pipeline consumed from BullMQ queue.
- **Implementation:**
  1. Checks organization quota (`checkQuota`).
  2. Fetches failed step log via GitHub API.
  3. If conclusion is success on a previously failed SHA, tracks retry pass.
  4. Slices log and computes SHA-256 fingerprint.
  5. Acquires distributed Redis lock per fingerprint to deduplicate concurrent matrix jobs.
  6. Reuses cached diagnosis if recent and modified files do not overlap stack trace.
  7. Synthesizes diagnosis and upserts sticky PR comment.
  8. Dispatches Slack alert if configured.
- **Verification:** Tested in `tests/workflow-processor.test.ts`.

---

## 3. Worker & Queue Architecture

- **BullMQ Queue:** `"ci-events"` configured with exponential backoff retries (3 attempts).
- **Concurrency:** Bounded worker concurrency (default 5, configurable via `WORKER_CONCURRENCY`).
- **Distributed Locks:** Redis key `hopper:lock:diagnosis:{signatureHash}` with a 60-second TTL prevents concurrent matrix workers from duplicating LLM calls.
- **Graceful Teardown:** Drains in-flight jobs on `SIGINT`/`SIGTERM` before closing Redis and database pools.

