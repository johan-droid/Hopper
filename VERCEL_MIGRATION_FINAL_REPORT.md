# Hopper — Vercel-Native Migration: Final Report

**Repository:** `johan-droid/Hopper`
**Branch:** `migration/vercel-native-platform`
**Scope:** retire Cloudflare completely, run Hopper on Vercel-native services with
Supabase for auth/data, one-command local development, durable queue instead of
BullMQ/Redis.
**Deployment status:** **NOT DEPLOYED — BLOCKED** on Vercel account
authentication. No preview or production URL exists yet.

---

## 1. Executive summary

| Area | Status |
|---|---|
| Cloudflare dependency | **PASS** — fully removed, guarded against reintroduction |
| BullMQ/Redis replacement | **PASS** (code + tests); live queue delivery **BLOCKED** |
| Database/coordination redesign | **PASS** (schema, functions, tests) |
| Cloudflare AI removal | **PASS** (live provider call **BLOCKED** — no keys) |
| Express on Vercel Functions | **PASS** (bundles), runtime **BLOCKED** |
| Local one-command dev | **PASS** (implemented), interactive `npm run dev` not exercised here |
| Automated tests | **PASS** — 183 backend + 9 frontend |
| Builds | **PASS** — backend, frontend, 3 serverless entries |
| Vercel configuration | **PASS** (static validation) |
| Deployment (preview/production) | **BLOCKED** |
| Credential rotation | **BLOCKED** (account-owner action) |
| Commercial operation on Hobby | **PROHIBITED** by plan terms |

Nothing in this report claims a deployment, a live queue delivery, a live webhook
delivery, or a live AI call.

---

## 2. Original architecture

```
GitHub webhook ─▶ Cloudflare Edge Worker (wrangler, [ai], [assets], Turnstile)
                       ▼
                  Express API on a long-running host
                       │
        ┌──────────────┼───────────────────────┐
        ▼              ▼                       ▼
   BullMQ producer   Redis (ioredis)     Cloudflare Workers AI
        │            rate limit, dedup,  (@cf/meta/llama-3.2-3b,
        ▼            diagnosis locks     @cf/baai/bge-base-en-v1.5)
  persistent worker ─▶ diagnosis ─▶ Supabase PostgreSQL + pgvector
```

Two hosting platforms, a mandatory Redis, a permanently running worker process,
and a platform-specific AI binding with 768-dim embeddings projected into a
1536-dim column.

## 3. New architecture

```
GitHub / Stripe webhook
        ▼
 /api/*  ──▶ api/index.ts (Vercel Node Function, bom1) ──▶ Express app
                        │ HMAC / Stripe signature verify
                        │ PostgreSQL rate limit + delivery dedup
                        ▼
        hopper_job_queue (durable outbox, SKIP LOCKED claim)
                        │
        ┌───────────────┴────────────────┐
        ▼ publish                        ▼ backstop (daily cron)
 Vercel Queues `hopper-ci-events`   /api/cron/queue-drain
        ▼
 api/queue/consume.ts ──▶ slice → scrub → fingerprint → flakiness →
                          AI diagnosis → persist → PR comment
                        ▼
 Supabase PostgreSQL 16 + pgvector (RLS), Supabase Auth, Stripe, OpenAI/Anthropic
```

One Vercel project serves the static SPA and the API on the same origin, so there
is no cross-origin surface in the default configuration.

## 4. Cloudflare files removed

`wrangler.toml`; `deploy/cloudflare/{worker.ts,wrangler.toml}`;
`scripts/deploy/{deploy-cloudflare-worker.sh,deploy-cloudflare-pages.sh}`;
`scripts/recovery/rollback-worker.sh`; `scripts/local/tunnel-manager.mjs`;
`backend/src/server/middleware/turnstile.ts`;
`backend/tests/cloudflare-ai.test.ts`;
`frontend/public/{_redirects,_headers,_routes.json}`;
5 Cloudflare docs; 11 workflow files (9 Cloudflare deploy/CI + dependabot +
pull-request).

Full mapping: `docs/deployment/CLOUDFLARE_REMOVAL_AUDIT.md`.

## 5. Cloudflare dependencies removed

- `bullmq`, `ioredis` (queue + Redis) — replaced by `@vercel/queue` and PostgreSQL.
- Workers AI SDK usage, `@cf/*` model identifiers, `[ai]` binding.
- Wrangler tooling and Cloudflare account/API token requirements.
- `CLOUDFLARE_*`, `REDIS_URL`, `BULLMQ_*`, `ORIGIN_API_URL`, `ENABLE_EDGE_CACHE`.

Guards keep them out: CI fails if `wrangler.toml`, `deploy/cloudflare`,
`_redirects` or `_headers` reappear; `npm run doctor` warns on retired artefacts.

## 6. Queue migration results

| Requirement | Implementation | Status |
|---|---|---|
| Durable enqueue before acknowledgement | Outbox row in `hopper_job_queue` before 202 | PASS |
| Deterministic idempotency | `gh:job:<jobId>:run:<attempt>` (DB unique + provider key) | PASS |
| Zod-validated payloads | `queue/types.ts` | PASS |
| At-least-once consumer | `handleCallback` with visibility timeout + retry callback | PASS |
| Retries/backoff | Attempt count + `next_attempt_at` in the outbox | PASS |
| Poison messages | Terminal failure → `hopper_job_dead_letters` | PASS |
| Duplicate delivery | Four-layer dedup, incl. `hopper_processed_events` | PASS |
| Interrupted processing | Expired locks reaped by `hopper_reap_expired_job_locks` | PASS |
| No silent event loss | 503 when neither publish nor inline drain succeeds | PASS |
| No permanent worker in production | `workers/*` are local-only polling adapters | PASS |
| **Live publish/consume on Vercel** | Requires a linked project (OIDC) | **BLOCKED** |

Known limitation, stated plainly: Vercel Queues has **no dead-letter queue**, and
on Hobby **cron runs once per day**, so a crashed consumer relies on Vercel Queues
retry rather than a fast sweep. The outbox remains the system of record and can be
drained manually at any time.

## 7. Database migration results

| Item | Status | Detail |
|---|---|---|
| Baseline schema preserved | PASS | Migrations untouched and append-only |
| New migration `0010` | PASS | 6 tables, 9 functions, idempotent DDL |
| Redis rate limit → SQL | PASS | `hopper_consume_rate_limit` (atomic upsert + window) |
| Redis dedup → SQL | PASS | `hopper_claim_webhook_delivery` |
| Redis locks → SQL | PASS | `hopper_acquire/release_diagnosis_lock` with expiry |
| Fresh-database migration | PASS | CI PostgreSQL 16 + pgvector service; `migrations.test.ts` asserts 9 files |
| Existing-database migration | PARTIAL | Additive-only and idempotent by construction; not applied to a live managed DB here |
| Connection strategy | PASS | Pooled URL at runtime, `DIRECT_URL` for DDL, one pool per instance |
| Tenant context isolation | PASS | `request.jwt.claim.sub` set transaction-locally |
| RLS/tenant isolation | PASS | Policies retained, `FORCE RLS` on tenant tables |
| pgvector compatibility | PASS | 1536-dim embeddings, HNSW indexes unchanged |
| Production data deleted | PASS (none) | No destructive statements authored |

## 8. Security improvements

1. Removed hardcoded GitHub App client secret, webhook secret, client id, app id
   and database/Redis/Stripe strings from `backend/package.json`.
2. `.env*`, private keys and backups untrackable via `.gitignore`; no env file is
   tracked.
3. Production config validation fails closed at boot (missing webhook secret,
   private key, DB URL, CORS allowlist, JWT key).
4. In-memory queue/coordination adapters throw when `NODE_ENV=production` — no
   silent degradation to in-process state.
5. Webhook acknowledgement cannot acknowledge an unpersisted event.
6. Cron endpoint fails closed (503) when `CRON_SECRET` is unset.
7. Secret scanning in CI (gitleaks, working tree), high-severity dependency audit,
   tracked-env guard, Cloudflare-artefact guard.
8. AI telemetry can no longer report a deterministic fallback as a live diagnosis.

Documented in `docs/security/SECRET_EXPOSURE_AUDIT.md` and
`docs/security/CREDENTIAL_ROTATION_RUNBOOK.md`.

## 9. Build results

| Command | Result |
|---|---|
| `npm --prefix backend run lint` (`tsc --noEmit`) | PASS (exit 0) |
| `npm --prefix frontend run lint` (`tsc --noEmit`) | PASS (exit 0) |
| `npm --prefix backend run build` (`tsup`) | PASS → `backend/dist` incl. `server/index.js`, `workers/worker-entry.js` |
| `npm --prefix frontend run build` (`vite`) | PASS → `frontend/dist/index.html` |
| esbuild `api/index.ts` | PASS (214.4 kb) |
| esbuild `api/queue/consume.ts` | PASS (144.4 kb) — fixed an incorrect relative import depth |
| esbuild `api/cron/queue-drain.ts` | PASS (145.1 kb) — same fix |

## 10. Test results

| Suite | Result |
|---|---|
| Backend Vitest | **PASS — 183 tests / 29 files** |
| Frontend Vitest | **PASS — 9 tests** |
| Migration assertions | PASS — 9 files, `hopper_job_queue` + `hopper_claim_jobs` present |
| Queue tests (dup delivery, retry, poison, reaping) | PASS |
| Webhook tests (HMAC, ack semantics, 503 path) | PASS |
| Live GitHub App / Stripe / AI integration | **BLOCKED** — no credentials |
| Browser E2E | **BLOCKED** — no deployment or test account |

`backend/vitest.config.ts` sets `fileParallelism: false` because the suites share a
real PostgreSQL instance; without it, cross-file interference produced flaky
budget assertions.

## 11. Vercel configuration

`vercel.json`:

- `framework: null`, `buildCommand: npm run build:vercel`,
  `outputDirectory: frontend/dist`, `installCommand: npm ci`.
- `regions: ["bom1"]`.
- Functions: `api/index.ts` (1024 MB, 60 s), `api/queue/consume.ts` (1024 MB, 60 s,
  trigger `queue/v2beta` topic `hopper-ci-events`, `retryAfterSeconds: 30`),
  `api/cron/queue-drain.ts` (512 MB, 60 s).
- Cron: `0 3 * * *` → `/api/cron/queue-drain` (Hobby allows a daily schedule).
- Rewrite `/api/(.*)` → `/api/index`.
- Headers: immutable caching for `/assets/*`; HSTS, CSP, `X-Frame-Options: DENY`,
  `nosniff`, Referrer-Policy, Permissions-Policy.
- SPA fallback handled by Vercel's static output (no Cloudflare `_redirects`).

CI: `.github/workflows/ci.yml` (quality gate with PostgreSQL+pgvector, migration
safety, Vercel-config validation, Cloudflare-artefact guard),
`.github/workflows/security.yml` (gitleaks, audit, tracked-env guard),
`.github/workflows/database-migrations.yml`. Deployment itself is owned solely by
the Vercel Git integration — no duplicate deployer.

## 12. Deployment status

| Item | Value |
|---|---|
| Preview deployment | **NOT CREATED — BLOCKED** |
| Preview URL | none |
| Production deployment | **NOT CREATED — BLOCKED** |
| Production URL | none |
| Deployment ID | none |
| `vercel build` executed | No — CLI not authenticated in this environment |
| Queue trigger verified live | No |
| Live webhook delivery verified | No |

Local verification is real; remote verification is not. They are reported
separately on purpose.

## 13. Remaining blockers

1. **Vercel authentication / project link** — required for `vercel build`,
   preview deploy, and any live queue or webhook verification.
2. **GitHub App credential rotation** — the client secret, webhook secret and
   private key must be regenerated in GitHub App settings by the account owner;
   the local `.env.backup` should be deleted.
3. **Managed database migration** — `npm run migrate` with a real `DIRECT_URL`.
4. **Provider credentials** — Stripe test keys and an AI provider key for live
   integration tests.
5. **Region confirmation** — verify the Supabase region matches `bom1` before
   trusting latency numbers.

## 14. External credentials required

`DATABASE_URL`, `DIRECT_URL`, `SUPABASE_URL`, `SUPABASE_JWT_SECRET` (or
`SUPABASE_JWT_PUBLIC_KEY`), `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
`GITHUB_APP_ID`, `GITHUB_APP_CLIENT_ID`, `GITHUB_APP_CLIENT_SECRET`,
`GITHUB_APP_WEBHOOK_SECRET`, `GITHUB_APP_PRIVATE_KEY`, `OPENAI_API_KEY` **or**
`ANTHROPIC_API_KEY`, `CRON_SECRET`, and optionally `STRIPE_SECRET_KEY`,
`STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID_PRO_DEV_9`,
`STRIPE_PRICE_ID_TEAM_29`.

Every name, scope and environment is catalogued in
`docs/deployment/VERCEL_ENVIRONMENT_VARIABLES.md`. No value appears anywhere in
this repository or this report.

## 15. Estimated monthly cost (Hobby target)

| Component | Estimate |
|---|---|
| Vercel Hobby | $0 |
| Vercel Queues (≤ 1M ops/month included) | $0 |
| Supabase free tier | $0 |
| AI (`AI_PROVIDER=mock` / light `gpt-4o-mini`) | $0–2 |
| Stripe | $0 unless charging |
| **Total** | **$0–2/month** |

At 100k failures/month the AI spend (~$200) dominates everything else. Commercial
operation requires Pro plus a paid Supabase plan; details and upgrade triggers in
`docs/deployment/VERCEL_COST_AND_LIMITS.md`.

## 16. Rollback procedure (summary)

1. Vercel → Deployments → **Promote/Rollback** to the previous good build
   (CLI: `npx vercel promote <url>` / `npx vercel rollback`).
2. If the queue is implicated, set `QUEUE_TRANSPORT=off` first — webhooks keep
   persisting to the outbox and return 202, so nothing is lost.
3. Re-enable transport and drain with
   `POST /api/cron/queue-drain` + `Authorization: Bearer $CRON_SECRET`.
4. Database changes are forward-only; ship a compensating migration instead of
   dropping objects an older release still reads.

Full procedure: `docs/deployment/VERCEL_ROLLBACK_RUNBOOK.md`.

## 17. Documents delivered

| Document | Path |
|---|---|
| Execution ledger | `docs/deployment/VERCEL_MIGRATION_EXECUTION.md` |
| Deployment runbook | `docs/deployment/VERCEL_DEPLOYMENT_RUNBOOK.md` |
| Environment register | `docs/deployment/VERCEL_ENVIRONMENT_VARIABLES.md` |
| Setup quickstart | `docs/deployment/VERCEL_SETUP.md` |
| Rollback runbook | `docs/deployment/VERCEL_ROLLBACK_RUNBOOK.md` |
| Target architecture | `docs/architecture/VERCEL_TARGET_ARCHITECTURE.md` |
| Cloudflare removal audit | `docs/deployment/CLOUDFLARE_REMOVAL_AUDIT.md` |
| Secret exposure audit | `docs/security/SECRET_EXPOSURE_AUDIT.md` |
| Credential rotation runbook | `docs/security/CREDENTIAL_ROTATION_RUNBOOK.md` |
| Cost and limits | `docs/deployment/VERCEL_COST_AND_LIMITS.md` |
| This report | `VERCEL_MIGRATION_FINAL_REPORT.md` |

## 18. Definition of done

> Hopper runs locally with one command, builds successfully, deploys through
> Vercel, processes GitHub events through durable queues, uses Supabase for
> authentication and data, and has zero Cloudflare development or deployment
> dependencies.

| Clause | State |
|---|---|
| Runs locally with one command | Implemented (`npm run dev`); interactive run not exercised in this session |
| Builds successfully | **Met** (backend, frontend, 3 serverless entries) |
| Deploys through Vercel | **Not met — BLOCKED** (no account authentication) |
| Durable queue processing | Implemented and unit/integration tested; live delivery **BLOCKED** |
| Supabase for auth and data | Preserved (auth, DB, pgvector, RLS) |
| Zero Cloudflare dependencies | **Met** |

The remaining gap is account access, not code. Everything that can be verified
without a Vercel account and provider keys passes; everything that cannot is
labelled BLOCKED rather than reported as complete.
