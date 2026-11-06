> **Historical document (pre-Vercel).** This file describes the retired
> Cloudflare architecture and is retained as an audit trail. The current
> architecture is `docs/architecture/VERCEL_TARGET_ARCHITECTURE.md`; operations
> are in `docs/deployment/VERCEL_DEPLOYMENT_RUNBOOK.md`. Links to
> Cloudflare-era files are intentionally dead — see
> `docs/deployment/CLOUDFLARE_REMOVAL_AUDIT.md` for the mapping.

# Hopper Cloudflare Production Deployment Runbook

## 1. Prerequisites & Credential Checklist

Before initiating deployment, verify access to the following accounts and credentials:

- [ ] **Cloudflare Account ID** (visible on Cloudflare Dashboard sidebar).
- [ ] **Cloudflare API Token** created with permissions:
  - `Account > Cloudflare Pages > Edit`
  - `Account > Workers Scripts > Edit`
  - `Zone > Workers Routes > Edit`
  - `Zone > DNS > Edit`
- [ ] **Target Domain** active on Cloudflare (e.g. `hopper.dev`).
- [ ] **Origin Server / VM** with public IP or Cloudflare Tunnel installed.
- [ ] **PostgreSQL 16** with `pgvector` and **Redis 7** running on origin.
- [ ] **AI Provider Credentials:** Anthropic API key (`sk-ant-...`) or OpenAI API key.

---

## 2. Origin Database & Backend Preparation

### Step 2.1: Apply Hardened Database Migrations
Log into the origin host and apply the database migrations in exact sequential order:

```bash
# Verify PostgreSQL container is running
docker compose ps

# Apply kernel RLS hardening (creates hopper_app unprivileged runtime role)
docker exec -i hopper-postgres psql -U postgres -d hopper_db < backend/supabase/migrations/0008_dedicated_runtime_role_and_rls_hardening.sql

# Apply AI budget controller ledger
docker exec -i hopper-postgres psql -U postgres -d hopper_db < backend/supabase/migrations/0009_ai_budget_controller_ledger.sql

# Verify RLS is forced across all tables
docker exec -i hopper-postgres psql -U postgres -d hopper_db -c \
  "SELECT tablename, rowsecurity, forcerowsecurity FROM pg_tables WHERE schemaname = 'public';"
```

### Step 2.2: Configure Origin Environment Variables
Create `/etc/hopper/.env.production` (or `./backend/.env.production`):

```bash
NODE_ENV=production
PORT=3000

# PostgreSQL Connection (Use dedicated unprivileged runtime role hopper_app)
DATABASE_URL=postgresql://hopper_app:secure_hopper_runtime_pass_2026@localhost:5432/hopper_db

# Redis Connection
REDIS_URL=redis://localhost:6379

# JWT and Encryption Secrets (Minimum 32 random bytes)
JWT_SECRET=production-secret-jwt-key-replace-with-64-character-hex-string
GITHUB_WEBHOOK_SECRET=replace-with-github-webhook-secret-string

# AI Provider Configuration (Single explicitly configured provider)
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-api03-...
AI_MODEL=claude-3-5-haiku-20241022

# Operational Modes
ENABLE_COMMERCIAL_QUOTA=false
MAX_CONCURRENT_AI_REQUESTS=25
```

### Step 2.3: Build & Start Origin Backend Processes
```bash
# Install dependencies
npm ci

# Build backend TypeScript
npm --prefix backend run build

# Start API server using PM2 or systemd
pm2 start dist/server/index.js --name "hopper-api" -i 2
pm2 start dist/workers/workflow.worker.js --name "hopper-worker" -i 1
pm2 save
```

---

## 3. Cloudflare Pages Deployment (Frontend)

### Step 3.1: Build Production Assets
Execute the optimized frontend build:

```bash
npm --prefix frontend run build
```

Confirm that `frontend/dist` contains:
- `index.html`
- `_routes.json`
- `_headers`
- Split JavaScript bundles (`dist/assets/vendor-*.js`, `dist/assets/index-*.js`)

### Step 3.2: Deploy via Wrangler
```bash
# Authenticate Wrangler CLI
export CLOUDFLARE_API_TOKEN="<your-cloudflare-api-token>"
export CLOUDFLARE_ACCOUNT_ID="<your-cloudflare-account-id>"

# Deploy to Cloudflare Pages
npx wrangler pages deploy frontend/dist \
  --project-name="hopper-frontend" \
  --branch="main" \
  --commit-dirty=true
```

### Step 3.3: Bind Custom Domain
In the Cloudflare Dashboard under **Pages > hopper-frontend > Custom Domains**, add:
- `app.hopper.dev` (or root `hopper.dev`)

---

## 4. Cloudflare Worker Deployment (Edge Gateway)

### Step 4.1: Deploy Edge Worker
```bash
# Deploy the edge gateway
npx wrangler deploy deploy/cloudflare/worker.ts --name hopper-edge
```

### Step 4.2: Configure Worker Secrets
Securely provision origin URL and Turnstile keys without committing secrets:

```bash
# Set origin backend URL
echo "https://origin.hopper.dev" | npx wrangler secret put ORIGIN_API_URL --name hopper-edge

# Set Cloudflare Turnstile secret key (for bot verification)
echo "0x4AAAAAA..." | npx wrangler secret put CLOUDFLARE_TURNSTILE_SECRET_KEY --name hopper-edge
```

### Step 4.3: Bind Worker Route
In the Cloudflare Dashboard under **Workers & Pages > hopper-edge > Triggers > Custom Domains**:
- Route: `api.hopper.dev/*`
- Zone: `hopper.dev`

---

## 5. Verification & Health Check

Run the following sanity checks:

```bash
# 1. Test Edge Gateway Health endpoint
curl -i https://api.hopper.dev/api/health

# Verify expected headers:
# HTTP/2 200
# X-Edge-Colo: BOM (or local PoP)
# X-Edge-Cache: MISS (first hit), HIT (subsequent hits)
# Strict-Transport-Security: max-age=31536000; includeSubDomains; preload

# 2. Test Frontend Delivery
curl -i https://app.hopper.dev/

# Verify expected headers:
# Content-Type: text/html; charset=utf-8
# X-Frame-Options: DENY
# Content-Security-Policy: ...
```

---

## 6. Rollback Procedures

### Frontend Instant Rollback
Cloudflare Pages preserves all historical deployment artifacts indefinitely:
1. Open Cloudflare Dashboard > **Pages** > **hopper-frontend** > **Deployments**.
2. Locate the previous stable deployment SHA.
3. Click the three dots `...` > **Rollback to this deployment**. Rollback propagates globally across all edge PoPs within 5 seconds.
4. CLI Alternative: `npx wrangler pages deployment rollback <deployment-id>`

### Edge Worker Instant Rollback
```bash
# View deployment history
npx wrangler deployments list --name hopper-edge

# Rollback to specific deployment version
npx wrangler rollback <deployment-id> --name hopper-edge
```

