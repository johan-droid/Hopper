## 3. Environment files

### Root `.env.example`
- Exists at root: `.env.example`
- Contains all required variables documented
- Variables: NODE_ENV, PORT, APP_NAME, APP_URL, GITHUB_APP_ID, GITHUB_APP_CLIENT_ID, GITHUB_APP_CLIENT_SECRET, GITHUB_APP_WEBHOOK_SECRET, GITHUB_APP_PRIVATE_KEY, DATABASE_URL, DIRECT_URL, REDIS_URL, AI_PROVIDER, ANTHROPIC_API_KEY, OPENAI_API_KEY, AI_MODEL, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_ID_PRO_DEV_9, STRIPE_PRICE_ID_TEAM_29, AUTO_RETRY_POLICY_ENABLED, DISCORD_WEBHOOK_URL

### Frontend `.env.example`
- Does not exist at `frontend/.env.example`
- Vite requires `VITE_` prefix for public environment variables
- Missing: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- Missing: `VITE_API_URL` (API base URL for frontend)

### Backend `.env.example`
- Root `.env.example` serves as backend configuration
- All backend env vars documented in root file
- No separate backend `.env.example` needed

### Local `.env` (development)
- Exists at root: `.env` (local dev configuration)
- Overrides `.env.example` with local values
- Uses local PostgreSQL (`hopper-postgres`), Redis (`hopper-redis`)
- Mock AI keys (`sk-ant-api03-mock`, `sk-proj-mock`)
- Test Stripe keys (`sk_test_mock`, `whsec_mock`)

### Missing / Needs Update
- Frontend `.env.example` needs creation with Vite public variables
- Frontend API base URL centralization needed
- CORS development proxy configuration needed
# Phase 0 — Local Environment Audit

## 1. Current Startup Architecture

### Root-Level Scripts (from `/package.json`)
| Script | Description | Executes |
|---|---|---|
| `npm run dev` | `npm --prefix backend run dev` | `tsx watch src/server/index.ts` (backend only) |
| `npm run dev:backend` | `tsx watch src/server/index.ts` | Backend dev server |
| `npm run dev:frontend` | `vite` | Frontend dev server |
| `npm run build` | `npm --prefix backend run build && npm --prefix frontend run build` | Backend tsup + Frontend vite/tsc |
| `npm run lint` | `tsc --noEmit` (both) | Type check both |
| `npm test` | `npm --prefix backend run test` | Backend vitest only |
| `npm run start` | `npm --prefix backend start` | `node dist/server/index.js` |
| `npm run test:smoke` | `vitest run tests/backend-smoke.test.ts` | Backend smoke tests |

## 2. Target Local Architecture

| Component | Local endpoint |
|---|---|
| Frontend | `http://localhost:5173` |
| Backend API | `http://localhost:3000` |
| Backend health | `http://localhost:3000/health` |
| PostgreSQL | `localhost:5432` |
| Redis | `localhost:6379` |
| Worker | Independent background process |

### Intended Architecture Diagram

```text
Browser
   |
   v
React + Vite
localhost:5173
   |
   v
Express API
localhost:3000
   |
   +------ PostgreSQL
   |
   +------ Redis
   |
   +------ GitHub API
   |
   +------ Stripe API
   |
   +------ Supabase Auth

Redis
   |
   v
BullMQ Queues
   |
   v
Independent Hopper Worker
   |
   +------ Failure Processing
   +------ Fingerprinting
   +------ Diagnosis
   +------ Persistence
   +------ Reporting
```
# Phase 0 — Local Environment Audit

## 1. Current Startup Architecture

### Root-Level Scripts (from `/package.json`)
| Script | Description | Executes |
|---|---|---|
| `npm run dev` | `npm --prefix backend run dev` | `tsx watch src/server/index.ts` (backend only) |
| `npm run dev:backend` | `tsx watch src/server/index.ts` | Backend dev server |
| `npm run dev:frontend` | `vite` | Frontend dev server |
| `npm run build` | `npm --prefix backend run build && npm --prefix frontend run build` | Backend tsup + Frontend vite/tsc |
| `npm run lint` | `tsc --noEmit` (both) | Type check both |
| `npm test` | `npm --prefix backend run test` | Backend vitest only |
| `npm run start` | `npm --prefix backend start` | `node dist/server/index.js` |
| `npm run test:smoke` | `vitest run tests/backend-smoke.test.ts` | Backend smoke tests |