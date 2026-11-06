# Cloudflare Removal Audit

Record of every Cloudflare artefact removed from Hopper, what replaced it, and how
reintroduction is prevented.

**Verification method:** repository-wide search for `cloudflare`, `Cloudflare`,
`wrangler`, `CLOUDFLARE_`, `workers.dev`, `pages.dev`, `cloudflared`, `@cf/`,
`workers-ai`, plus build/test/lint runs after removal.

---

## 1. Files deleted

| Path | What it was |
|---|---|
| `wrangler.toml` | Root Worker config (`[ai]`, `[assets]`, route bindings) |
| `deploy/cloudflare/wrangler.toml` | Edge worker config |
| `deploy/cloudflare/worker.ts` | Edge gateway: routing, Turnstile, edge cache, AI binding |
| `scripts/deploy/deploy-cloudflare-worker.sh` | Wrangler deploy script |
| `scripts/deploy/deploy-cloudflare-pages.sh` | Pages deploy script |
| `scripts/recovery/rollback-worker.sh` | Worker rollback |
| `scripts/local/tunnel-manager.mjs` | Cloudflare Tunnel lifecycle for local webhooks |
| `backend/src/queue/redis.ts` | Redis/BullMQ connection (retired with Redis) |
| `backend/src/server/middleware/turnstile.ts` | Cloudflare Turnstile verification middleware |
| `backend/tests/cloudflare-ai.test.ts` | Workers AI provider tests |
| `frontend/public/_redirects` | Pages SPA rewrites |
| `frontend/public/_headers` | Pages headers |
| `frontend/public/_routes.json` | Pages functions routing |
| `docs/architecture/CLOUDFLARE_FREE_TIER_ARCHITECTURE.md` | Superseded architecture |
| `docs/deployment/CLOUDFLARE_ARCHITECTURE.md` | Superseded |
| `docs/deployment/CLOUDFLARE_FREE_TIER_REGISTER.md` | Superseded |
| `docs/deployment/CLOUDFLARE_OPERATIONS.md` | Superseded |
| `docs/engineering/CLOUDFLARE_FREE_COMPATIBILITY.md` | Superseded |

## 2. GitHub Actions removed

`deploy-staging.yml`, `deploy-production.yml`, `build-artifacts.yml`, `release.yml`,
`post-deployment-verification.yml`, `dependency-updates.yml`, `backend-ci.yml`,
`frontend-ci.yml`, `integration-tests.yml`, `pull-request.yml`, `dependabot.yml`.

Replaced by three Vercel-native workflows: `ci.yml` (quality gate + migration
safety + Vercel config validation + Cloudflare-artifact guard), `security.yml`
(gitleaks, audit, tracked-env guard), `database-migrations.yml`.

## 3. Code replaced

| Removed | Replacement |
|---|---|
| `callCloudflareLlm()` | `callOpenAi()` / `callAnthropic()` / deterministic fallback |
| `provider: 'cloudflare'` branch | strict `AI_PROVIDER` selection (`openai`/`anthropic`/`mock`) |
| `@cf/baai/bge-base-en-v1.5` embeddings (768-dim, zero-padded) | `text-embedding-3-small` (native 1536-dim) |
| Cloudflare pricing/settlement branches in `budget-controller.ts` | provider-agnostic cost table |
| Edge gateway routing/CORS/headers | Express middleware + `vercel.json` headers |
| Edge Turnstile middleware | retained Express rate limiting + body limits |
| `bullmq` / `ioredis` producers and worker | PostgreSQL durable outbox + `@vercel/queue` |
| Redis rate limit / dedup / diagnosis locks | atomic PostgreSQL functions (migration `0010`) |
| Permanent worker process | push consumer function + optional local polling adapter |

Telemetry provider enum is now `['anthropic', 'openai', 'deterministic']`.

## 4. Dependencies removed

`bullmq`, `ioredis`, Cloudflare Workers types, and any Cloudflare SDK package.
Added: `@vercel/queue` (runtime), `@vercel/node` (types, devDependency).

## 5. Environment variables retired

`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_WORKER_AI_URL`,
`CLOUDFLARE_TURNSTILE_SECRET_KEY`, `REDIS_URL`, `BULLMQ_*`, `ORIGIN_API_URL`,
`ENABLE_EDGE_CACHE`.

None of these is read anywhere in the codebase; they are listed as retired in
`docs/deployment/VERCEL_ENVIRONMENT_VARIABLES.md` §9.

## 6. Residual references (intentional)

| Location | Why it remains |
|---|---|
| `.github/workflows/ci.yml` — "Verify no Cloudflare deployment artifacts" | Fails the build if `wrangler.toml`, `deploy/cloudflare`, `_redirects` or `_headers` reappears |
| `scripts/local/doctor.mjs` — retired-artifact check | Warns if `wrangler.toml`, `deploy/cloudflare` or `.env.backup` exists |
| `scripts/local/start.mjs`, `status.mjs`, `docker-compose.yml` | Document that no Cloudflare/Wrangler/cloudflared component is part of the stack |
| `docs/*` historical phase reports and audit files | Retained as an audit trail; banner-marked as historical, superseded by `docs/architecture/VERCEL_TARGET_ARCHITECTURE.md` |

## 7. Acceptance checks

| Check | Result |
|---|---|
| No active Cloudflare deployment path | PASS — no deploy script, workflow or config remains |
| No Wrangler requirement | PASS — no `wrangler` dependency, config or command |
| No Cloudflare tunnel requirement for local dev | PASS — webhooks are received by the local Express server |
| No Cloudflare AI dependency or model identifier | PASS — no `@cf/` string in source |
| No Cloudflare secret required | PASS — no `CLOUDFLARE_*` read |
| No broken references in scripts/docs | PASS — remaining references are guards, historical notices or the deploy-runbook history |
| Application still builds and tests green | PASS — see `VERCEL_MIGRATION_FINAL_REPORT.md` |
