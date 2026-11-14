# Phase 0 — Dependency Map

## Frontend Dependencies

| Dependency | Type | Consumed By | Version |
|---|---|---|---|
| React | Library | `src/main.tsx`, `src/App.tsx` | 18.2.0 |
| ReactDOM | Library | `src/main.tsx` | 18.2.0 |
| Vite | Build Tool | Frontend build pipeline | 5.2.0 |
| TypeScript | Language | Frontend type checking | 5.4.5 |
| Tailwind CSS | Styling | All components | 3.4.1 |
| Zod | Validation | `store/schema.ts`, `api/schema.ts` | 3.22.4 |
| Zustand | State management | `src/store/useAppStore.ts` | 4.5.0 |
| Axios or Fetch | API client | `src/api/client.ts` | Native fetch |
| React Router | Routing | Not fully implemented | 6.22.1 |
| Lucide React | Icons | Not fully implemented | 0.360.0 |

## Backend Dependencies

| Dependency | Type | Consumed By | Version |
|---|---|---|---|
| Express | Web Framework | `src/server/index.ts` | 4.18.2 |
| BullMQ | Queue System | `src/queue/ci-queue.ts`, `src/workers/` | 5.1.0 |
| ioredis | Redis Client | `src/queue/redis.ts` | 5.4.0 |
| pg | PostgreSQL Client | `src/db/client.ts` | 8.10.0 |
| pg-vector | PostgreSQL Extension | Database schema | 8.10.0 |
| Zod | Schema Validation | `src/lib/ai/diagnose.ts`, `src/store/schema.ts` | 3.22.4 |
| OpenAI SDK | AI Provider | `src/lib/ai/embeddings.ts` (optional) | 4.28.0 |
| Anthropic SDK | AI Provider | `src/lib/ai/diagnose.ts` (optional) | 0.31.0 |
| Stripe SDK | Billing | `src/lib/billing/stripe-handler.ts` (optional) | 14.16.0 |
| Crypto (node:) | HMAC/SHA256 | Webhook verification, signature generation | Built-in |
| Node Scheduler | Not used | — | — |

## Database Dependencies

| Dependency | Table/Feature | Direction |
|---|---|---|
| organizations → repositories | FK: `repositories.org_id → organizations.id` | One-to-Many |
| repositories → failure_signatures | FK: `failure_signatures.repo_id → repositories.id` | One-to-Many |
| repositories → workflow_failures | FK: `workflow_failures.repo_id → repositories.id` | One-to-Many |
| failure_signatures → workflow_failures | FK: `workflow_failures.signature_id → failure_signatures.id` | One-to-Many (optional) |
| workflow_failures → diagnostic_reports | FK: `diagnostic_reports.failure_id → workflow_failures.id` | One-to-One |
| pgvector extension | Embedding similarity search | Required for fingerprint clustering |

## Queue/Worker Dependencies

| Dependency | Consumer | Purpose |
|---|---|---|
| BullMQ `ci-events` queue | `src/queue/ci-queue.ts` (producer), `src/workers/index.ts` (consumer) | CI failure event pipeline |
| Redis | `src/queue/redis.ts` | Rate limiting, delivery deduplication, diagnosis locks |
| PostgreSQL | `src/workers/processors/workflow-job.processor.ts` | Persistent storage for all data |
| GitHub App | `src/workers/processors/workflow-job.processor.ts` | Installation token for PR comment updates |
| Stripe API | `src/lib/billing/stripe-handler.ts` (optional) | Billing webhook processing, subscription management |
| Anthropic/AI API | `src/lib/ai/diagnose.ts` (optional) | LLM-powered diagnosis generation |

## Integration Dependencies

| Integration | Provider | Direction | Contract |
|---|---|---|---|
| GitHub Cloud | GitHub API | Incoming webhooks → API; API → PR comments | `X-Hub-Signature-256` HMAC, installation tokens |
| Stripe | Stripe.com | API → Checkout sessions; Webhook → Subscription updates | `Stripe-Signature` HMAC, price IDs, customer IDs |
| AI Providers | Anthropic/OpenAI | API → Diagnosis generation; Tokens → API keys | Structured JSON output, Zod schema |
| PostgreSQL | Local/Cloud DB | API/worker → Persistent storage; Read queries | SQL queries, pgvector for similarity |
| Redis | Local/Cloud Cache | API/worker → Rate limiting, locks, delivery claims | INCR/EXPIRE, SET NX |

## Development Dependencies

| Dependency | Purpose | Script |
|---|---|---|
| vitest | Unit and integration testing | `npm test` |
| tsup | Production bundling | `npm run build` |
| tsc | Type checking | `npm run lint` |
| docker | Containerization | `docker compose up` |
| supabase | Auth and database | `supabase` CLI |
| gh | GitHub CLI (optional) | App management |

## External Service Dependencies

| Service | Purpose | Credentials | Status |
|---|---|---|---|
| Supabase Auth | User authentication, session management | Supabase project URL + anon key | NOT INTEGRATED |
| PostgreSQL + pgvector | Failure signature storage, embedding similarity | DATABASE_URL | CONFIGURED (local dev) |
| Redis | Rate limiting, delivery deduplication | REDIS_URL | CONFIGURED (local dev) |
| GitHub App | Webhook verification, installation tokens | GITHUB_APP_ID, CLIENT_SECRET, PRIVATE_KEY | CONFIGURED (placeholder values) |
| Stripe | Billing, subscription management | STRIPE_SECRET_KEY, WEBHOOK_SECRET | PLACEHOLDER VALUES |
| Anthropic API | LLM diagnosis (optional) | ANTHROPIC_API_KEY | MOCK by default |
| OpenAI API | Embeddings (optional) | OPENAI_API_KEY | MOCK by default |

## CircleCI Dependency

| Pipeline Stage | Tool | Output |
|---|---|---|
| CI Pipeline | `.github/workflows/ci.yml` | `npm ci`, lifecycle (typecheck + tests + build + simulation), Docker build |
| Test Suites | vitest | Unit test results |
| Code Quality | npm lint | Type check results |
| Docker Build | Docker | Container image for deployment |