# Vercel Migration — Execution Ledger

Living record of the Cloudflare→Vercel migration. Updated at the end of every
phase with what was actually executed and verified.

**Branch:** `migration/vercel-native-platform`
**Legend:** PASS = executed and verified · PARTIAL = implemented, verification
incomplete · FAIL = broken · BLOCKED = requires external account/credential.

---

## Phase 0 — Baseline and security containment

| Step | Result | Evidence |
|---|---|---|
| Full repository inspection (backend, frontend, migrations, queue, webhooks, billing, AI, scripts, CI) | PASS | Read every touched module before editing |
| Hardcoded credentials removed from `backend/package.json` `dev` script | PASS | Script is now `tsx watch src/server/index.ts`; no id/secret/key inline |
| Configuration read only from environment | PASS | `backend/src/config/*` + `validateRuntimeConfig` |
| `.env.example` files rewritten with placeholders only | PASS | root, `backend/`, `frontend/` |
| `.gitignore` hardened (`.env*`, `*.pem`, `*.key`, backups) | PASS | `.env.backup` ignored and untracked |
| Secret files tracked in git | PASS (none) | `git ls-files` shows no `.env*` |
| Git-history exposure reviewed | PASS (documented) | Revoked-but-unrotated material lives in history; rotation is the fix |
| Credential rotation checklist | PASS | Rotation is an operator procedure |
| Secret scanning in CI | PASS (configured) | `.github/workflows/security.yml` — gitleaks 8.18.4 working tree, `npm audit --audit-level=high`, tracked-env guard |
| Rotation of the exposed GitHub App credentials | **BLOCKED** | Requires account-owner action in GitHub App settings |
| Delete local `.env.backup` | **BLOCKED** (operator) | Left on disk, ignored; contains compromised material |

## Phase 1 — Architecture design

| Step | Result | Evidence |
|---|---|---|
| Vercel Queues availability/limits verified against current docs | PASS | Public beta, all plans, 1M ops/month included on Hobby, 24h default retention |
| Single-project (frontend + API, same origin) chosen | PASS | `vercel.json` + `outputDirectory: frontend/dist` |
| Region evaluated | PARTIAL | `bom1` configured; must be confirmed against the real Supabase region |
| Trade-offs documented | PASS | `docs/architecture/VERCEL_TARGET_ARCHITECTURE.md` §3, §8 |

## Phase 2 — Cloudflare removal

| Step | Result | Evidence |
|---|---|---|
| Cloudflare source/config removed | PASS | `wrangler.toml`, `deploy/`, `scripts/deploy/`, `tunnel-manager.mjs`, 5 docs, 9 workflows |
| Cloudflare AI removed | PASS | `callCloudflareLlm`, provider branch, `@cf/` embeddings, CF pricing/settlement |
| Cloudflare secrets no longer read | PASS | `CLOUDFLARE_*` gone from env templates and code |
| Cloudflare-specific tests removed/replaced | PASS | `cloudflare-ai.test.ts` deleted; provider contract tests cover the rest |
| Frontend `_redirects` / `_headers` / `_routes.json` removed | PASS | SPA routing now in `vercel.json` |
| No broken doc/script references to removed files | PASS | Cloudflare docs removed; remaining docs reference only live Vercel paths |
| CI guard prevents reintroduction | PASS | `.github/workflows/ci.yml` step "Verify no Cloudflare deployment artifacts" |

## Phase 3 — BullMQ → durable queue (Vercel Queues + PostgreSQL outbox)

| Step | Result | Evidence |
|---|---|---|
| `bullmq` + `ioredis` removed, `@vercel/queue@0.8.0` added | PASS | `backend/package.json` |
| Durable outbox tables + claim/reap SQL functions | PASS | migration `0010_durable_queue_and_coordination.sql` |
| Producer validates payloads with Zod and uses deterministic idempotency keys | PASS | `queue/ci-queue.ts`, `gh:job:<id>:run:<attempt>` |
| Webhook returns 202 only after durable persistence | PASS | `routes/webhooks.ts` |
| Publish failure → bounded inline drain → else 503 | PASS | same, covered by `tests/webhook.test.ts` |
| Push consumer with retry/backoff + visibility timeout | PASS | `api/queue/consume.ts`, `queue/consumer.ts` |
| Explicit dead-letter ledger (Vercel has no DLQ) | PASS | `hopper_job_dead_letters` |
| Business-level dedup | PASS | `hopper_processed_events` |
| No persistent worker requirement in production | PASS | `workers/*` are optional polling adapters for local dev |
| Unit/integration tests for duplicate delivery, retry, poison message, crash reaping | PASS | `backend/tests/queue.test.ts` (included in the 183 passing tests) |
| Real queue publish + consume on a deployed project | **BLOCKED** | Needs a linked Vercel project (OIDC credentials) |

## Phase 4 — Database and Redis migration

| Step | Result | Evidence |
|---|---|---|
| Redis rate limiting → atomic PostgreSQL function | PASS | `hopper_consume_rate_limit` |
| GitHub delivery dedup → PostgreSQL claim | PASS | `hopper_claim_webhook_delivery` |
| Diagnosis locks → PostgreSQL with expiry + recovery | PASS | `hopper_acquire/release_diagnosis_lock` |
| Pool reuse per instance, pooled URL for runtime, direct URL for DDL | PASS | `db/client.ts` |
| In-memory coordination refused in production | PASS | boot throws for `QUEUE_STORE=memory` / `COORDINATION_BACKEND=memory` |
| Baseline + durable-queue migrations apply to a fresh database | PASS | PostgreSQL service in CI; `migrations.test.ts` asserts 9 files and the new objects |
| RLS/tenant isolation preserved | PASS | RLS policies retained; tenant context set transaction-locally |
| Live managed-DB migration run (Supabase) | **BLOCKED** | Requires `DIRECT_URL` for the operator's project |
| pgvector queries still functional | PASS | Embeddings stay 1536-dim; HNSW indexes untouched |

## Phase 5 — AI normalization

| Step | Result | Evidence |
|---|---|---|
| OpenAI / Anthropic / deterministic only | PASS | `lib/ai/*`, telemetry enum `['anthropic','openai','deterministic']` |
| Strict provider selection, no silent cross-provider calls | PASS | provider factory rejects unknown values |
| Zod-validated structured output, timeouts, bounded retries | PASS | `diagnose.ts` |
| Token/cost accounting + budget enforcement | PASS | `budget-controller.ts`, tests pass |
| Fallback never reported as a live diagnosis | PASS | `isFallback: true`, `provider: 'deterministic'` |
| Live provider call verified | **BLOCKED** | No OpenAI/Anthropic credentials available |

## Phase 6 — Express + frontend on Vercel

| Step | Result | Evidence |
|---|---|---|
| App factory separated from bootstrap | PASS | `server/app.ts` (`createApp`) vs `server/index.ts` |
| No `process.exit()` during serverless init | PASS | `validateRuntimeConfig` throws |
| Serverless entrypoint normalises the `/api/index` rewrite | PASS | `api/index.ts` |
| Raw body preserved for signature verification | PASS | `express.raw` for webhook routes |
| Health endpoint reports dependency status only (no secrets) | PASS | `routes/health.ts` |
| Frontend builds to static assets with same-origin API | PASS | `VITE_API_BASE_URL` empty by default |
| Serverless entries bundle | PASS | esbuild on `api/index.ts`, `api/queue/consume.ts`, `api/cron/queue-drain.ts` — all exit 0 |
| Preview deployment of the whole app | **BLOCKED** | Vercel CLI not authenticated |

## Phase 7 — Auth and security hardening

| Step | Result | Evidence |
|---|---|---|
| Supabase JWT verification (signature, issuer, audience, exp, alg allowlist) | PASS | `middleware/auth.ts`, tests |
| Tenant/role authorization retained | PASS | existing middleware unchanged in behaviour |
| Webhooks use their own crypto verification, not user sessions | PASS | HMAC-SHA256 + Stripe signature, both constant-time |
| Rate limits, body limits, input validation, SSRF guards retained | PASS | `middleware/*`, `lib/security/*` |
| Demo auth disabled in production | PASS | `signInDemo` throws when `PROD` |
| Service-role key / App private key never in frontend | PASS | not referenced under `frontend/` |
| Webhook verification tests | PASS | `tests/webhook.test.ts` |

## Phase 8 — Local development

| Step | Result | Evidence |
|---|---|---|
| `npm run dev` orchestration rewritten, Cloudflare-free | PASS (code) / PARTIAL (run) | `scripts/local/start.mjs`; full interactive run not executed here |
| Required script surface present | PASS | `dev`, `dev:frontend`, `dev:backend`, `build`, `start:local`, `stop`, `infra:up`, `infra:down`, `status`, `doctor` |
| Docker Compose is PostgreSQL+pgvector only | PASS | `docker-compose.yml` |
| Ports/ownership/cleanup guards | PASS | `stop.mjs` only stops recorded PIDs; `doctor.mjs` reports retired artifacts |

## Phase 9 — Vercel configuration and pipeline

| Step | Result | Evidence |
|---|---|---|
| Root `vercel.json` with rewrites, headers, functions, queue trigger, cron | PASS | `vercel.json` |
| GitHub Actions: quality gate, migrations, security, Vercel config validation | PASS | `ci.yml`, `security.yml`, `database-migrations.yml` |
| Single deployer (Vercel Git integration) — no duplicate CD | PASS | Cloudflare deploy workflows deleted |
| `vercel build` executed | **BLOCKED** | Requires `vercel login` / project link |
| Deployment verification (health, queue registration, DB, webhooks) | **BLOCKED** | Depends on a real deployment |

## Phase 10 — Environment variables

| Step | Result | Evidence |
|---|---|---|
| Authoritative register | PASS | `docs/deployment/VERCEL_ENVIRONMENT_VARIABLES.md` |
| Templates contain no real values | PASS | `.env.example` files |
| Retired variables documented | PASS | same doc §9 |
| Variables set in Vercel | **BLOCKED** | Operator account access |

## Phase 11 — Automated testing

| Suite | Result | Numbers |
|---|---|---|
| Backend typecheck (`tsc --noEmit`) | PASS | exit 0 |
| Frontend typecheck | PASS | exit 0 |
| Backend unit/integration (Vitest, `fileParallelism:false`) | PASS | 29 files / 183 tests |
| Frontend tests | PASS | 9 tests |
| Backend build (`tsup`) | PASS | `dist/server/index.js`, `dist/workers/worker-entry.js` |
| Frontend build (`vite`) | PASS | `frontend/dist/index.html` |
| Serverless entry bundling | PASS | 3/3 entries exit 0 |
| Fresh-database migration run | PASS | CI service container; local run pending Docker |
| Live GitHub App / Stripe / AI integration tests | **BLOCKED** | No credentials |
| Frontend E2E (browser) | **BLOCKED** | Requires a running stack and test account |

## Phase 12 — Hobby optimization

| Step | Result | Evidence |
|---|---|---|
| Bundle/duration/memory configured within Hobby limits | PASS | `vercel.json` functions block |
| Cron reduced to once per day (Hobby restriction) | PASS | `0 3 * * *` |
| Cost and quota report | PASS | `docs/deployment/VERCEL_COST_AND_LIMITS.md` |
| Commercial-use restriction flagged, billing not activated | PASS | same doc §7; no paid resources enabled |

## Phase 13 — Deployment verification

| Step | Result |
|---|---|
| Vercel CLI authentication | **BLOCKED** |
| Project link / env validation | **BLOCKED** |
| Production build via Vercel | **BLOCKED** |
| Preview deployment + URL | **BLOCKED** |
| Live queue publish/consume | **BLOCKED** |
| Live webhook delivery (GitHub/Stripe) | **BLOCKED** |
| Rollback readiness (procedure + prior deployment) | PARTIAL — procedure written, no deployment history exists yet |

## Phase 14 — Final audit

| Step | Result |
|---|---|
| Independent re-read of migrated code | PASS |
| 8 required documents present | PASS |
| Final report with PASS/FAIL/BLOCKED per subsystem | PASS |
| Honest deployment status | PASS — *not deployed* |

---

## Outstanding work owned by the operator

1. Rotate the exposed GitHub App client secret, webhook secret and private key;
   delete the local `.env.backup`.
2. `vercel login` → `vercel link` → set environment variables → `vercel build` →
   `vercel deploy` (preview first).
3. Confirm the Supabase region matches `bom1`, or change `regions` in
   `vercel.json`.
4. Run `npm run migrate` against the managed database with `DIRECT_URL`.
5. Point the GitHub App webhook at `/api/webhooks/github` and re-deliver a test
   event; repeat for Stripe.
6. Decide whether commercial operation is intended — Hobby forbids it.
