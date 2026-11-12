# Hopper — Operational & Production Reliability Runbook

**Service:** Hopper CI/CD Failure Diagnosis & Intelligence Platform  
**Target Environment:** Production / Multi-Tenant Cloud & On-Premises  
**Primary Architect:** Principal Systems & Infrastructure Architect  
**Version:** 1.0.0-production-ready  
**Last Updated:** November 2026  

---

## 1. System Topology & Architectural Invariants

Hopper operates as a high-throughput, asynchronous failure intelligence platform consisting of four decoupled tiers:

```
[ GitHub Actions / Webhooks ]
             │ (Sub-50ms HMAC-SHA256 Ingress)
             ▼
[ Express API Gateway Tier ] ────► [ Redis 7 / Token-Bucket Rate Limiter ]
             │
             │ (Job Dispatch)
             ▼
   [ BullMQ Job Queue ]
             │
             │ (Concurrent Worker Pool)
             ▼
   [ Hopper Engine Worker ] ─────► [ Claude 3.5 Haiku / AI Diagnosis Engine ]
             │                            │
             │                            │ ($500 Budget Cap & Moat Cache)
             ▼                            ▼
[ PostgreSQL 16 + pgvector ] ◄──── [ Cloud Moat Fingerprint Ledger ]
             │
             ▼
[ GitHub PR Sticky Comments / Developer Workspace ]
```

### Critical Operational Invariants
1. **Webhook Ingress Latency:** Must acknowledge GitHub webhooks in $< 50\text{ms}$ (measured baseline: $4.14\text{ms}$).
2. **Strict Passive-Data Principle:** Logs inside `<UNTRUSTED_CI_LOG>` are strictly data; workers never execute shell commands, mutate repositories, or auto-apply fixes.
3. **Secret Scrubbing Before Egress:** High-entropy tokens, passwords, and private keys are scrubbed before logs reach AI models or database storage.
4. **Deterministic Fallback:** If the external AI provider is unavailable, times out, or fails authentication, the engine falls back immediately ($0.2\text{ms}$) to deterministic pattern synthesis without failing CI pipelines.
5. **Commercial Safeguard:** Paid monetization is strictly deferred; no live checkout sessions or credit card processing are permitted during the validation discovery phase.

---

## 2. Infrastructure Pre-Flight & Health Checks

### Required Dependencies
- **PostgreSQL:** Version 16+ with extensions `uuid-ossp` and `vector` (pgvector).
- **Redis:** Version 7+ (used for webhook deduplication, token-bucket rate limiting, BullMQ queue, and matrix burst locks).
- **Node.js:** Version 20.x or 22.x LTS.

### Quick Health Verification Commands
```bash
# 1. Probe API Gateway, DB pool, and Redis connectivity
curl -s http://localhost:3000/api/health | jq .

# 2. Check Redis ping and memory consumption
docker exec -i hopper-redis redis-cli ping
docker exec -i hopper-redis redis-cli info memory

# 3. Check PostgreSQL connection pool and pgvector extension
docker exec -i hopper-postgres psql -U postgres -d hopper_db -c "SELECT extname, extversion FROM pg_extension WHERE extname IN ('uuid-ossp', 'vector');"
```

---

## 3. Database Migration & Schema Maintenance

Hopper uses sequential idempotent migrations managed by `backend/src/db/migrator.ts`.

### Migration Execution
```bash
# Apply all pending migrations in order
npm --prefix backend run migrate

# Run database tests to verify DDL integrity
npm --prefix backend test tests/migrations.test.ts
```

### Migration History
1. `0001_initial_schema.sql`: Core tables (`organizations`, `repositories`, `failure_signatures`, `workflow_failures`, `diagnostic_reports`).
2. `0002_hnsw_index.sql`: Approximate Nearest Neighbor vector search on failure embeddings.
3. `0004_workspace_tables.sql`: Multi-tenant workspace entities (`user_profiles`, `workspaces`, `workspace_members`).
4. `0005_rls_policies.sql`: Row-Level Security isolation across tenants and workspaces.
5. `0006_fix_rls_security_definer.sql`: Non-recursive workspace resolution helpers.
6. `0007_link_workspace_organizations.sql`: Unified bridge linking GitHub organizations to workspace tenancies with automatic repository inheritance.

---

## 4. Incident Response & Troubleshooting Playbooks

### Playbook 1: GitHub Webhook Rejection (401 / 429 / 503)

**Symptoms:**
- GitHub Actions webhook delivery logs report HTTP 401 Unauthorized or HTTP 429 Too Many Requests.
- PR sticky comments are not appearing on failing builds.

**Triage Steps:**
1. Check webhook signature secret:
   ```bash
   # Ensure GITHUB_APP_WEBHOOK_SECRET matches GitHub App settings
   docker exec -i hopper-api printenv GITHUB_APP_WEBHOOK_SECRET | wc -c
   ```
2. Verify Redis tenant rate limiter:
   - Hopper restricts each tenant to 120 requests/minute.
   - Inspect active rate keys in Redis:
     ```bash
     docker exec -i hopper-redis redis-cli keys "rate:*"
     ```
   - If a misconfigured CI matrix is flooding webhooks, temporarily raise the limit or clear the specific key:
     ```bash
     docker exec -i hopper-redis redis-cli del "rate:acme-corp"
     ```
3. Check delivery replay deduplication:
   - Replay protection deduplicates `x-github-delivery` for 24 hours. Duplicate webhook deliveries will receive `{ "status": "duplicate_ignored" }` with HTTP 200, which is normal.

---

### Playbook 2: AI Provider Downtime / Anthropic Outage

**Symptoms:**
- Worker logs report `[AI] Anthropic provider failed... Falling back to deterministic analysis`.
- Telemetry shows `provider: 'deterministic'` with `isFallback: true`.

**Resolution & Invariant:**
- **Zero CI Interruption:** The diagnostic engine automatically switches to deterministic rule-based analysis. Diagnoses continue to be produced and posted in $<1\text{ms}$.
- Verify provider credentials:
  ```bash
  # Check if ANTHROPIC_API_KEY is configured and valid
  docker exec -i hopper-api printenv ANTHROPIC_API_KEY | cut -c 1-10
  ```
- If Anthropic rate limits (429) persist:
  - The monthly \$500 budget cap controller rejects outbound paid calls once the application-side ceiling is reached, automatically preserving deterministic triage.

---

### Playbook 3: BullMQ Worker Stalls or Parallel Matrix Deadlock

**Symptoms:**
- Jobs accumulate in `waiting` state in BullMQ.
- Worker logs show `DelayedError` loops.

**Root Cause:**
- Parallel matrix builds with identical failure signatures compete for the matrix burst lock (`lock:diagnose:<repoId>:<signatureHash>`) so only one LLM call is paid for while others read the cached result.

**Triage Steps:**
1. Inspect Redis queue lengths:
   ```bash
   docker exec -i hopper-redis redis-cli llen "bull:ci-workflow-jobs:wait"
   docker exec -i hopper-redis redis-cli zcard "bull:ci-workflow-jobs:delayed"
   ```
2. Inspect active diagnosis locks:
   ```bash
   docker exec -i hopper-redis redis-cli keys "lock:diagnose:*"
   ```
3. If an orphaned lock exists after an abrupt worker crash:
   - Locks have an automatic 30-second TTL.
   - If manual eviction is required:
     ```bash
     docker exec -i hopper-redis redis-cli del "lock:diagnose:<repoId>:<signatureHash>"
     ```

---

### Playbook 4: PostgreSQL Connection Pool Saturation

**Symptoms:**
- `/api/health` reports status `degraded`.
- Error logs report `remaining connection slots are reserved for non-replication superuser connections`.

**Triage Steps:**
1. Check active database connections:
   ```bash
   docker exec -i hopper-postgres psql -U postgres -d hopper_db -c "SELECT count(*), state FROM pg_stat_activity GROUP BY state;"
   ```
2. Inspect long-running or stalled queries:
   ```bash
   docker exec -i hopper-postgres psql -U postgres -d hopper_db -c "SELECT pid, now() - query_start AS duration, query FROM pg_stat_activity WHERE state != 'idle' ORDER BY duration DESC LIMIT 5;"
   ```
3. Ensure pool limits in `backend/src/db/client.ts` do not exceed PostgreSQL `max_connections` (default: 100).

---

## 5. Routine Verification & Operational Commands

| Task | Command | Expected Output |
|---|---|---|
| Complete Backend Test Suite | `npm run test:backend` | 27 passed files, 150 passed tests |
| Complete Frontend Test Suite | `npm run test:frontend` | 1 passed file, 9 passed tests |
| Frontend Production Build | `npm --prefix frontend run build` | Built in ~3.16s (0 errors) |
| Backend TypeScript Lint | `npm --prefix backend run lint` | 0 errors (Exit code 0) |
| 50-Case AI Evaluation | `npx tsx backend/src/lib/ai/evaluation/run-baseline.ts` | 100% Category, 100% Schema |
| Performance Microbenchmarks | `npm --prefix backend test tests/performance-benchmark.test.ts` | All benchmarks green |

