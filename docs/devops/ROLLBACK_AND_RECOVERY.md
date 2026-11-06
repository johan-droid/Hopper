# Hopper Rollback & Disaster Recovery Specification

## 1. Multi-Tier Rollback Matrix

Hopper's deployment architecture decouples frontend assets, edge workers, backend application code, and database schemas, allowing fine-grained rollbacks of individual tiers without full system disruption.

| Failure Scenario | Affected Tier | Rollback Mechanism | Target RTO (Recovery Time Objective) | Data Loss Risk (RPO) |
|---|---|---|---|---|
| Broken frontend UI or JS bundle error | Cloudflare Pages CDN | Instant deployment rollback via Wrangler CLI or Cloudflare Dashboard | **< 30 seconds** | Zero (stateless assets) |
| Edge worker proxy or routing defect | Cloudflare Workers | Instant worker version rollback (`wrangler rollback`) | **< 30 seconds** | Zero (stateless edge proxy) |
| Backend API crash or regression | Node.js Express Origin | PM2 reload previous release bundle (`pm2 reload hopper-api`) | **< 60 seconds** | Zero |
| BullMQ job processing failure | Redis / BullMQ | Pause queue, drain stuck jobs, re-run with fixed worker code | **< 5 minutes** | Zero (jobs persisted in Redis) |
| Defective database migration | PostgreSQL 16 | Forward recovery: Deploy application hotfix; schema remains backward-compatible | **< 15 minutes** | Zero (no column drops) |

---

## 2. Tier-by-Tier Rollback Procedures

### 2.1 Frontend Rollback (Cloudflare Pages)
Cloudflare Pages immutably retains every historical deployment:

```bash
# 1. List historical deployments to locate the last known healthy deployment ID
./scripts/recovery/rollback-frontend.sh production

# 2. Apply rollback
./scripts/recovery/rollback-frontend.sh production <healthy-deployment-id>
```

Propagation completes across all 300+ global Cloudflare edge PoPs in **< 5 seconds**.

### 2.2 Edge Worker Gateway Rollback
```bash
# 1. Inspect recent worker version releases
./scripts/recovery/rollback-worker.sh production

# 2. Rollback to target version
./scripts/recovery/rollback-worker.sh production <target-version-id>
```

### 2.3 Origin Backend Rollback
On the origin host:
```bash
# 1. Restore previous release-dist/backend
cp -r /opt/hopper/releases/previous/backend/dist/* /opt/hopper/current/backend/dist/

# 2. Graceful reload without dropping active HTTP connections
pm2 reload hopper-api --update-env
pm2 reload hopper-worker --update-env
```

---

## 3. Disaster Recovery & Data Backup Strategy

### 3.1 PostgreSQL Backup & Retention Policy
- **Automated Daily Backups:** Executed via `pg_dump` targeting encrypted object storage.
- **Retention Schedule:**
  - Daily snapshots retained for **30 days**.
  - Weekly snapshots retained for **12 weeks**.
  - Monthly snapshots retained for **1 year**.
- **Backup Verification:** Bi-weekly automated restoration drill into an isolated ephemeral container to verify dump integrity and RLS policy retention.

### 3.2 Point-in-Time Recovery (PITR) Objective
- **RTO (Recovery Time Objective):** Platform restored and traffic re-admitted within **15 minutes**.
- **RPO (Recovery Point Objective):** Maximum tolerable data loss is **< 1 hour** (WAL archiving).
