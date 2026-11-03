# Hopper ⚡

**CI/CD failure diagnosis and SDLC lifecycle engine.** Hopper ingests failed GitHub Actions runs, slices and scrubs the logs, fingerprints the failure, scores its flakiness across runs, and produces a structured diagnosis as a sticky pull-request comment.

> Named after Rear Admiral Grace Hopper — compiler pioneer and finder of the first literal computer bug.

---

## Contents

- [What it does](#what-it-does)
- [Architecture](#architecture)
- [Requirements](#requirements)
- [Quick start (Docker)](#quick-start-docker)
- [Local development](#local-development)
- [CLI reference](#cli-reference)
- [Environment variables](#environment-variables)
- [API endpoints](#api-endpoints)
- [GitHub webhook setup](#github-webhook-setup)
- [Project structure](#project-structure)
- [Testing and quality checks](#testing-and-quality-checks)
- [Security model](#security-model)
- [Pricing tiers](#pricing-tiers)
- [Known limitations](#known-limitations)
- [License](#license)

---

## What it does

1. **Webhook ingress** — verifies `X-Hub-Signature-256` with a constant-time HMAC comparison, rate-limits each tenant in Redis (120 requests/min), and enqueues the event on BullMQ.
2. **Log processing** — fetches the failed job log, caps extraction at 300 KB, strips ANSI codes and runner noise, and redacts secrets.
3. **Fingerprinting** — normalizes volatile tokens (UUIDs, SHAs, line/column numbers, durations, ports) and hashes the result with SHA-256 so repeat failures collapse into one signature.
4. **Flakiness scoring** — scores signatures from same-SHA retry passes, cross-PR spread, default-branch frequency, and transient timeout patterns.
5. **LLM diagnosis** — asks Anthropic or OpenAI for a Zod-validated JSON diagnosis (runs in a deterministic `mock` provider by default).
6. **PR reporting** — posts or updates a single sticky comment on the pull request, including a gated historical/flakiness teaser.

---

## Architecture

```mermaid
graph TD
  GH[GitHub Actions] -->|workflow_run / workflow_job webhook| GW[Express Webhook Gateway]
  GW -->|HMAC verify + rate limit| Q[BullMQ Queue]
  Q --> W[Workflow Job Worker]
  W --> P[Log fetch + slice + scrub]
  P --> F[SHA-256 Fingerprinter]
  F --> DB[(PostgreSQL 16 + pgvector)]
  F --> FL[Bayesian Flakiness Engine]
  W --> AI[Anthropic / OpenAI / mock]
  AI --> DB
  W --> PR[Sticky PR Comment]
  W --> SL[Slack/Discord Alert]
  DB --> API[REST API / Dashboard]
```

---

## Requirements

| Requirement | Version / notes |
|-------------|-----------------|
| Node.js | 20+ (Docker image uses `node:20-alpine`) |
| PostgreSQL | 16 with the `pgvector` extension |
| Redis | 7 (BullMQ queue + webhook rate limits) |
| GitHub App | Webhook secret + private key; `workflow_run` and `workflow_job` events |
| Stripe | Optional — only needed for Pro/Team checkout and billing webhooks |
| AI provider | Optional — defaults to `AI_PROVIDER=mock`; set `anthropic` or `openai` for live diagnoses |

---

## Quick start (Docker)

```bash
git clone https://github.com/johan-droid/Hopper.git
cd Hopper

cp .env.example .env      # fill in GitHub App + optional Stripe/AI values
docker compose up -d --build
```

This starts:

- `hopper-api` on <http://localhost:3000>
- `hopper-postgres` on `localhost:5432` (pgvector image; schema and seed SQL mounted as init scripts)
- `hopper-redis` on `localhost:6379`

Check it:

```bash
curl http://localhost:3000/api/health
```

> The init scripts run only when the Postgres volume is first created. For an existing volume, run `npm run migrate` against it.

---

## Local development

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env

# 3. Start Postgres + Redis (or provide your own via DATABASE_URL / REDIS_URL)
docker compose up -d hopper-postgres hopper-redis

# 4. Apply the schema (add --seed for demo data)
npm run migrate -- --seed

# 5. Start the API with hot reload
npm run dev
```

Production build:

```bash
npm run build     # tsup bundles to dist/
npm start         # node dist/server/index.js
```

The CLI is available through the npm scripts below, directly with `npx tsx src/cli/hopper.ts …`, or through the built binary `node bin/hopper.js` (run `npm run build` first).

---

## CLI reference

```bash
npm run doctor      # environment preflight (Node, .env, migration files)
npm run migrate     # apply supabase/migrations/*.sql  (-- --seed for demo data)
npm run simulate -- -s timeout   # offline diagnosis demo (scenario: jest|timeout|oom)
npm run lifecycle   # run all 8 SDLC stages and write LIFECYCLE_REPORT.md
npx tsx src/cli/hopper.ts serve --port 3000   # start the gateway manually
```

`npm run lifecycle` runs, in order:

1. Environment preflight
2. Spec ledger check
3. Migration/pgvector schema check
4. `tsc --noEmit` type check
5. `vitest run` test suite
6. `tsup` production build
7. Synthetic failure diagnosis (parser → fingerprint → flakiness → diagnosis → PR comment)
8. Dockerfile / compose verification

---

## Environment variables

| Variable | Default / example | Purpose |
|----------|-------------------|---------|
| `NODE_ENV` | `development` | Runtime mode |
| `PORT` | `3000` | API port |
| `APP_NAME` / `APP_URL` | `Hopper` / `http://localhost:3000` | Display name and public base URL |
| `GITHUB_APP_ID` | — | GitHub App ID |
| `GITHUB_APP_CLIENT_ID` | — | GitHub App client ID |
| `GITHUB_APP_CLIENT_SECRET` | — | GitHub App client secret |
| `GITHUB_APP_WEBHOOK_SECRET` | — | HMAC secret for webhook verification |
| `GITHUB_APP_PRIVATE_KEY` | PEM | GitHub App private key (quote the multiline value) |
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/hopper_db` | Postgres connection string |
| `DIRECT_URL` | same as `DATABASE_URL` | Direct (non-pooled) Postgres URL |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection string |
| `AI_PROVIDER` | `mock` | `mock`, `anthropic`, or `openai` |
| `AI_MODEL` | `claude-3-5-haiku-20241022` | Model used when provider is live |
| `ANTHROPIC_API_KEY` | — | Required for `AI_PROVIDER=anthropic` |
| `OPENAI_API_KEY` | — | Required for `AI_PROVIDER=openai` (also used for embeddings) |
| `STRIPE_SECRET_KEY` | — | Stripe API key |
| `STRIPE_WEBHOOK_SECRET` | — | Stripe webhook signing secret |
| `STRIPE_PRICE_ID_PRO_DEV_9` | `price_pro_dev_9` | Stripe price for the Pro tier |
| `STRIPE_PRICE_ID_TEAM_29` | `price_team_29` | Stripe price for the Team tier |
| `AUTO_RETRY_POLICY_ENABLED` | `false` | Default auto-retry policy for new orgs |
| `DISCORD_WEBHOOK_URL` | — | Optional Discord alert target |

See `.env.example` for the full commented template.

---

## API endpoints

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/health` | `GET` | none | Service status plus Postgres and Redis health |
| `/api/webhooks/github` | `POST` | HMAC-SHA256 | GitHub webhook ingress (`workflow_run` / `workflow_job`) |
| `/api/webhooks/stripe` | `POST` | Stripe signature | Subscription lifecycle events |
| `/api/billing/checkout` | `POST` | none* | Create a Stripe Checkout session |
| `/api/diagnose/adhoc` | `POST` | none | Diagnose a raw log without a GitHub run |
| `/api/dashboard/:orgSlug` | `GET` | none* | Org dashboard: usage, leaderboard, flaky tests |
| `/api/signatures/:id` | `GET` | none* | Signature timeline and historical occurrences |
| `/api/repositories/:repoId/failures` | `GET` | none* | Recent failure feed for a repository |

\* Endpoints marked none currently rely on org/repo IDs rather than an authenticated session; put them behind your own auth layer before exposing them publicly.

Ad-hoc diagnosis request:

```bash
curl -X POST http://localhost:3000/api/diagnose/adhoc \
  -H 'Content-Type: application/json' \
  -d '{"rawLog":"...failed CI log...","jobName":"test","stepName":"execute-tests","modifiedFiles":["src/auth/jwt.ts"]}'
```

---

## GitHub webhook setup

1. Create a GitHub App and install it on the repositories Hopper should watch.
2. Set the webhook URL to `https://<your-host>/api/webhooks/github`.
3. Subscribe to **Workflow run** and **Workflow job** events.
4. Put the same secret in `GITHUB_APP_WEBHOOK_SECRET`.
5. Provide the App ID and private key so Hopper can mint installation tokens and post PR comments.

Only `completed` `workflow_run` / `workflow_job` events with a `failure` or `success` conclusion are accepted; everything else is acknowledged and ignored. Add `?sync=true` to process an event synchronously instead of enqueuing it.

---

## Project structure

```
Hopper/
├── src/
│   ├── index.ts                     # Public library exports
│   ├── cli/
│   │   ├── hopper.ts                # doctor | migrate | simulate | serve | lifecycle
│   │   └── lifecycle.ts             # 8-stage SDLC runner
│   ├── server/index.ts              # Express gateway + REST API
│   ├── lib/
│   │   ├── parser/                  # ansi-stripper, secret-scrubber, log-slicer, fingerprinter
│   │   ├── moat/flakiness-engine.ts # Bayesian flakiness scoring
│   │   ├── ai/                      # diagnose.ts, embeddings.ts
│   │   ├── billing/                 # quota-guard.ts, stripe-handler.ts
│   │   ├── github/                  # app-auth.ts, log-fetcher.ts, pr-reporter.ts
│   │   └── db/queries/organizations.ts
│   ├── db/                          # client, migrator, repositories/, types
│   ├── queue/                       # BullMQ queue, Redis client, job types
│   └── workers/
│       ├── index.ts
│       └── processors/              # workflow-job, slack-alert
├── supabase/
│   ├── migrations/0001_initial_schema.sql
│   └── seed.sql
├── tests/                           # 16 Vitest suites (parser → API → DB → billing)
├── bin/hopper.js                    # CLI entrypoint (loads dist/)
├── Dockerfile                       # multi-stage node:20-alpine build
├── docker-compose.yml               # API + Postgres/pgvector + Redis
├── .github/workflows/ci.yml         # install → lifecycle → docker build
├── SPEC.md                          # product/technical specification
├── LIFECYCLE_REPORT.md              # generated by `npm run lifecycle`
└── README.md
```

---

## Testing and quality checks

```bash
npm test           # vitest run, all suites
npm run test:watch # watch mode
npm run test:smoke # backend smoke test only
npm run lint       # tsc --noEmit
npm run build      # tsup production bundle
npm run lifecycle  # full pipeline: typecheck + tests + build + simulation
```

CI (`.github/workflows/ci.yml`) runs `npm ci`, the full lifecycle, and a Docker build on pushes and pull requests to `main`.

---

## Security model

- **Webhook authenticity** — HMAC-SHA256 with `crypto.timingSafeEqual`; per-tenant Redis rate limiting (120 req/min).
- **Secret redaction** — regex scrubbing of AWS keys, GitHub tokens, database URIs, bearer tokens, PEM blocks, and API keys before any log is stored or sent to a model.
- **Prompt injection** — log content is wrapped in `<UNTRUSTED_CI_LOG>` markers and the model response is schema-validated with Zod.
- **Fetch hardening** — log extraction is capped at the tail 300 KB to bound memory and CPU.
- **Tenant isolation** — every record links through `organizations` → `repositories`; repository queries are scoped by `org_id`. Row Level Security is not enabled in the initial migration, so restrict direct database access or add RLS before exposing Postgres.
- **Billing** — Stripe webhooks are signature-verified with `crypto.timingSafeEqual` before mutating plan state.

---

## Pricing tiers

| Tier | Price | Runs/mo | History | Flaky matrix | Slack/Discord | Auto-retry |
|------|-------|---------|---------|--------------|---------------|------------|
| Free | $0 | 30 | 24 hours | Blurred teaser | No | No |
| Pro Developer | $9/mo | 250 | 30 days | Full | No | No |
| Small Team | $29/mo | 1,000 | 90 days | Full | Yes | >80% confidence |

Tier limits live in `src/lib/billing/quota-guard.ts` and `organizations.monthly_run_limit` in the initial migration.

---

## Known limitations

- **No standalone worker entrypoint.** `startWorkers()` is exported from `src/workers/index.ts`, but neither the npm scripts nor `docker-compose.yml` start it. With Redis reachable, webhook events are enqueued and wait until a worker process is running. Until an entrypoint is added, either run a worker from the library API or post webhooks with `?sync=true`.
- **No hosted frontend.** The dashboard and report data are served as JSON by the REST API; there is no bundled UI.
- **Mock AI by default.** `AI_PROVIDER=mock` returns deterministic diagnoses so the pipeline works without API keys. Set `anthropic` or `openai` for live model output.
- **No Row Level Security.** Restrict direct Postgres access at the network layer or add RLS policies before exposing the database.
- **No `LICENSE` file.** The package declares Apache-2.0 but the license text is not yet in the repository.

---

## License

Apache License 2.0 — declared in `package.json` (`"license": "Apache-2.0"`). Add the standard `LICENSE` text before distributing.

---

**⚡ Hopper — turn failing CI into an actionable diagnosis.**
