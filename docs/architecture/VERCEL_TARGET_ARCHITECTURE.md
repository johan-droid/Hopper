# Hopper — Vercel-Native Target Architecture

**Status:** implemented in the working tree; runtime verification on Vercel is
blocked on account authentication (see §9).
**Supersedes:** the Cloudflare Workers/Pages + Workers AI architecture.

---

## 1. Original architecture (as found)

```
GitHub webhook ──▶ Cloudflare Edge Worker (wrangler, [ai] binding, [assets])
                        │  Turnstile, edge cache, India PoP telemetry
                        ▼
                   Express API (Node, long-running container / VM)
                        │
        ┌───────────────┼───────────────────────────┐
        ▼               ▼                           ▼
   BullMQ producer   Redis (ioredis)        Cloudflare Workers AI
        │            rate limit, dedup,     (@cf/meta/llama-3.2-3b,
        ▼            diagnosis locks        @cf/baai/bge-base-en-v1.5)
   persistent worker ──▶ diagnosis pipeline ──▶ Supabase PostgreSQL + pgvector
```

Problems this architecture carried:

- **Two hosting platforms** with two deploy pipelines (Wrangler + Vercel).
- **Long-running worker** could not run on serverless; it required a VM or
  container and a Redis instance to be always available.
- **Redis is a fourth stateful dependency** for three small primitives
  (rate limit, dedup, short lock) that PostgreSQL can host atomically.
- **Cloudflare Workers AI** tied diagnosis to a platform-specific binding and a
  second credential set, with a 768-dim embedding model projected (zero-padded)
  into a 1536-dim pgvector column.
- **Edge gateway duplicated** security headers, CORS and routing that the API
  already owned, creating two sources of truth.

## 2. Target architecture (implemented)

```
                 ┌──────────────────────── Vercel project (one deployment) ───────────────────────┐
GitHub webhook ─▶│  /api/*  ──▶ api/index.ts (Node.js Function, region bom1)  ──▶ Express app      │
Stripe webhook ─▶│                 │ signature verify · rate limit · dedup (PostgreSQL)            │
                 │                 ▼                                                              │
                 │          hopper_job_queue  (PostgreSQL durable outbox, SKIP LOCKED)            │
                 │                 │                                                              │
                 │                 ├── publish ──▶ Vercel Queues topic `hopper-ci-events`           │
                 │                 │                        │                                     │
                 │                 │                        ▼                                     │
                 │                 │            api/queue/consume.ts (push consumer)              │
                 │                 │                        │                                     │
                 │                 └── backstop ──▶ api/cron/queue-drain.ts (daily cron)          │
                 │                                          │                                     │
                 │                                          ▼                                     │
                 │                       HopperEngine: slice ─▶ scrub ─▶ fingerprint ─▶ flakiness  │
                 │                                    ─▶ AI diagnosis ─▶ persist ─▶ PR comment     │
                 │                                          │                                     │
                 │                                          ▼                                     │
                 │                       Supabase PostgreSQL 16 + pgvector (RLS)                  │
                 │                       Auth (Supabase JWT) · Stripe · OpenAI/Anthropic            │
                 └────────────────────────────────────────────────────────────────────────────────┘
      Frontend: Vite/React static bundle served by the same Vercel project (same origin → no CORS)
```

### Component mapping

| Concern | Implementation | Notes |
|---|---|---|
| Frontend | Vite + React 18, static `frontend/dist` | Same origin as API; no cross-origin CORS needed |
| API | Express 4 inside a Vercel Node.js Function (`api/index.ts`) | `createApp({serverless:true})` normalises the rewrite path |
| Queue producer | `enqueueWorkflowJob` → PostgreSQL row → `@vercel/queue` `send()` | DB row is the durability guarantee |
| Queue consumer | `api/queue/consume.ts` via `handleCallback` | Push delivery; retry/backoff via SDK `retry` callback |
| Backstop | `api/cron/queue-drain.ts` + `hopper_reap_expired_job_locks` | Daily on Hobby; reaps crashed consumers |
| Queue state | `hopper_job_queue`, `hopper_job_dead_letters` | At-least-once with explicit DLQ ledger |
| Coordination | `hopper_rate_limits`, `hopper_webhook_deliveries`, `hopper_diagnosis_locks`, `hopper_processed_events` | Replaces Redis atomically in SQL |
| Database | Supabase PostgreSQL 16 + pgvector | Pooled URL at runtime, direct URL for DDL |
| Authn | Supabase JWT (HS256/RS256/ES256, strict alg allowlist) | Verified in `middleware/auth.ts` |
| Authz | Existing tenant middleware + PostgreSQL RLS (`hopper_app`, FORCE RLS) | Unchanged guarantees |
| AI | OpenAI, Anthropic, or deterministic fallback | Strict single-provider selection |
| Payments | Stripe (checkout + signed webhooks) | Idempotent event handling |
| CI/CD | GitHub Actions (verification) + Vercel Git integration (deploy) | No duplicate deployers |
| Local dev | Docker PostgreSQL + `npm run dev` | No Redis, no tunnel |

## 3. Why Vercel Queues *and* a PostgreSQL outbox

Vercel Queues is a durable append-only log with at-least-once delivery and
automatic push invocation, **in public beta on all plans including Hobby**
(1,000,000 API operations/month included on Hobby, 24h default retention, 7d max).

Two properties matter for a webhook ingress:

1. **Acknowledge only what is durable.** GitHub retries non-2xx, so the API must
   not return 202 until the event is persisted. The outbox insert is
   transactional and idempotent; the queue publish is an accelerator.
2. **Bounded delivery guarantees.** Vercel Queues has no dead-letter queue. The
   consumer therefore records terminal failures in `hopper_job_dead_letters`,
   and the outbox retains the authoritative attempt count.

Consequences, stated plainly:

- If the queue publish fails, the request still returns 202 **only if** transport
  is deliberately disabled (local dev). Otherwise the API attempts a bounded
  inline drain and returns **503** if it cannot hand the event to a consumer, so
  GitHub retries. No path acknowledges an unpersisted event.
- On Hobby, cron runs once per day. Push is the primary delivery path; cron is a
  backstop for crashed consumers, not a polling loop. This is a real limitation,
  documented in `VERCEL_COST_AND_LIMITS.md`.

## 4. Idempotency chain

Four independent layers, each enforced in the database:

1. `hopper_webhook_deliveries` — GitHub `X-GitHub-Delivery` claim (24h).
2. `hopper_job_queue (queue_name, idempotency_key)` — `gh:job:<jobId>:run:<attempt>`.
3. Vercel Queues `idempotencyKey` — provider-side dedup window.
4. `hopper_processed_events` — business-level claim; released on failure so a
   retry can proceed, retained on success so a redelivery is a no-op.

Duplicate PR comments, duplicate diagnoses and duplicate quota consumption are
therefore prevented at the business level, not merely at the transport level.

## 5. Database connection strategy

- One `pg.Pool` per function instance, created lazily and reused across
  invocations (`getDatabasePool`).
- Runtime uses the **pooled** Supabase connection (pgbouncer, port 6543) to avoid
  connection exhaustion across concurrent lambda instances.
- Migrations use `DIRECT_URL` (port 5432) because DDL and `CREATE INDEX
  CONCURRENTLY` are incompatible with transaction-mode pooling.
- `DB_POOL_MAX` defaults to 10 per instance; with N concurrent instances the
  pooler is the global limiter.
- Tenant-scoped queries use `withTenantContext` which sets
  `request.jwt.claim.sub` **locally to the transaction** so the setting cannot
  leak to another tenant through a recycled connection.

## 6. Region decision

`bom1` (Mumbai) is configured because the product targets Indian engineering
teams and the operator is in India. **This must be validated against the actual
Supabase database region**, not assumed:

- function region and database region should match to avoid 150–250 ms per query;
- Supabase free/pro projects are typically created in `ap-south-1` (Mumbai) for
  this audience;
- if the database lives elsewhere, change `regions` in `vercel.json` to the
  database's region — a wrong region multiplies every query's latency.

The health endpoint exposes `VERCEL_REGION` so the deployed region is observable.

## 7. Single project vs two projects

Decision: **one Vercel project** for frontend + API.

- Removes cross-origin CORS and cookie/credential complexity.
- One preview URL per PR to test end to end.
- Static assets come from Vercel's CDN; functions handle `/api/*` only.
- Express is path-normalised (`/api/index` → `/api`) in `createApp` for the
  rewrite.

Two projects remain a documented fallback if the monorepo build becomes
unwieldy; it requires setting `VITE_API_BASE_URL` and `CORS_ALLOWED_ORIGINS`.

## 8. Explicit trade-offs

| Decision | Benefit | Cost |
|---|---|---|
| PostgreSQL outbox + Vercel Queues | No Redis; durability independent of the queue; replayable | One extra table write per webhook |
| Push consumer over polling | Inexpensive, low latency, no idle compute | Depends on Vercel Queues beta |
| Daily cron backstop (Hobby) | Free | A crashed consumer can wait up to 24h without a redelivery; mitigated by Vercel Queues retry |
| Express on serverless | Preserves every existing route and middleware | Cold starts (~200–500 ms) |
| Same-origin single project | No CORS surface | Frontend and API deploy together |
| Deterministic AI fallback | Never blocks diagnosis | Must never be reported as a live model result |

## 9. Verification status

| Subsystem | Status | Evidence |
|---|---|---|
| Backend typecheck | PASS | `tsc --noEmit` exit 0 |
| Frontend typecheck | PASS | `tsc --noEmit` exit 0 |
| Backend tests | PASS | 183/183 across 29 files |
| Frontend tests | PASS | 9/9 |
| Backend build | PASS | `backend/dist` incl. worker entry |
| Frontend build | PASS | `frontend/dist` |
| Serverless entry bundling | PASS | esbuild resolves `api/index.ts`, `api/queue/consume.ts`, `api/cron/queue-drain.ts` |
| Vercel preview deployment | **BLOCKED** | Vercel CLI not authenticated in this environment |
| Live queue consumption | **BLOCKED** | Requires a linked Vercel project (OIDC) |
