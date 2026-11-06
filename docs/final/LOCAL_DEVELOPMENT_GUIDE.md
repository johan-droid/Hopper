# HOPPER — LOCAL DEVELOPMENT & ONBOARDING GUIDE

## 1. System Requirements

Ensure the following tools are installed on your workstation:
- **Node.js:** v20.x or v22.x LTS (`node --version`)
- **Docker & Docker Compose:** Docker v24+ (`docker compose version`)
- **npm:** v10+ (`npm --version`)
- **Git:** v2.30+

---

## 2. Quickstart: 3-Minute Setup

### Step 1: Clone and Install Dependencies
```bash
git clone https://github.com/hopper-ci/hopper.git
cd Hopper

# Install root, backend, and frontend dependencies
npm install
npm --prefix backend install
npm --prefix frontend install
```

### Step 2: Start Local Infrastructure (PostgreSQL & Redis)
```bash
docker compose up -d postgres redis
```

Verify containers are healthy:
```bash
docker compose ps
# Expected: hopper-postgres (port 5432) and hopper-redis (port 6379)
```

### Step 3: Apply Database Migrations
Apply the migrations in sequential order:

```bash
docker exec -i hopper-postgres psql -U postgres -d hopper_db < backend/supabase/migrations/0008_dedicated_runtime_role_and_rls_hardening.sql
docker exec -i hopper-postgres psql -U postgres -d hopper_db < backend/supabase/migrations/0009_ai_budget_controller_ledger.sql
```

### Step 4: Configure Local Environment Variables
Create `backend/.env`:

```env
PORT=3000
NODE_ENV=development

# Database (Unprivileged hopper_app role)
DATABASE_URL=postgresql://hopper_app:secure_hopper_runtime_pass_2026@localhost:5432/hopper_db

# Redis
REDIS_URL=redis://localhost:6379

# Security
JWT_SECRET=local-development-jwt-secret-minimum-32-characters-long
GITHUB_WEBHOOK_SECRET=local-development-github-webhook-secret

# AI Configuration (Use 'deterministic' for offline testing, or 'anthropic' with valid key)
AI_PROVIDER=deterministic
# ANTHROPIC_API_KEY=sk-ant-api03-...
AI_MODEL=claude-3-5-haiku-20241022

# Commercial Quotas Deactivated in Validation Mode
ENABLE_COMMERCIAL_QUOTA=false
```

---

## 3. Running Hopper Locally

Open three terminal tabs:

### Terminal 1: Backend API Server
```bash
npm --prefix backend run dev
# Server listening on http://localhost:3000
```

### Terminal 2: BullMQ Queue Worker
```bash
npm --prefix backend run worker
# Worker listening for CI failure jobs on Redis queue 'ci-failures'
```

### Terminal 3: Frontend Application
```bash
npm --prefix frontend run dev
# Vite dev server running at http://localhost:5173
```

---

## 4. Running the Complete Verification Ladder

Execute all automated verification suites:

```bash
# 1. Backend Lint & Typecheck
npm --prefix backend run lint

# 2. Complete Backend Test Suite (29 test files, 178 tests)
npm run test:backend

# 3. Complete Frontend Test Suite (9 tests)
npm run test:frontend

# 4. Frontend Production Build & Bundle Check
npm --prefix frontend run build

# 5. AI Baseline Diagnostic Evaluation (50 Real CI Cases)
npx tsx backend/src/lib/ai/evaluation/run-baseline.ts
```

