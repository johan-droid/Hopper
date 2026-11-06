> **Historical document (pre-Vercel).** This file describes the retired
> Cloudflare architecture and is retained as an audit trail. The current
> architecture is `docs/architecture/VERCEL_TARGET_ARCHITECTURE.md`; operations
> are in `docs/deployment/VERCEL_DEPLOYMENT_RUNBOOK.md`. Links to
> Cloudflare-era files are intentionally dead — see
> `docs/deployment/CLOUDFLARE_REMOVAL_AUDIT.md` for the mapping.

# HOPPER — GIT STATE PRESERVATION REPORT (PHASE 0.1)

**Date:** 2026-11-07  
**Auditor:** Principal DevOps Engineer & Release Engineering Lead  
**Working Branch:** `engineering/cloudflare-remediation`  
**Base Commit:** `1e14a052e2e02010290913f2a2b937bb235400f9`  
**Execution Mode:** Read-Only Audit & Baseline Correction (Strict Gate: Phase 1 Not Started)

---

## 1. REPOSITORY AND RECONCILIATION AUDIT

### 1.1 Current Branch & HEAD
- **Current Branch:** `engineering/cloudflare-remediation`
- **Upstream Tracking:** `origin/engineering/cloudflare-remediation` (Up to date)
- **Current HEAD Commit:** `1e14a052e2e02010290913f2a2b937bb235400f9`
- **HEAD Commit Message:** `feat(edge): bind and serve frontend web application directly via cloudflare worker assets`
- **Working Tree State:** Clean (`nothing to commit, working tree clean`)

### 1.2 Git History & Origin Parity
```bash
$ git log -n 4 --oneline --decorate
1e14a05 (HEAD -> engineering/cloudflare-remediation, origin/remediation/security-cloudflare-2026, origin/main, origin/engineering/cloudflare-remediation, remediation/security-cloudflare-2026, main) feat(edge): bind and serve frontend web application directly via cloudflare worker assets
1e862fe fix(ai): update default workers-ai model to @cf/meta/llama-3.2-3b-instruct
aed759a feat(ai): integrate cloudflare workers ai provider and free tier architecture
471f03e fix(edge): serve root gateway info and intercept origin dns 530 errors with json
```
All branches (`main`, `remediation/security-cloudflare-2026`, and `engineering/cloudflare-remediation`) point to the identical base commit `1e14a05`.

---

## 2. STASH RECONCILIATION AND INVENTORY

### 2.1 Stash Entry
- **Stash Identifier:** `stash@{0}`
- **Stash Reference:** `On remediation/security-cloudflare-2026: wip-remediation-changes`
- **Creation Context:** Uncommitted work created during early drafting on branch `remediation/security-cloudflare-2026` was safely preserved via `git stash` to guarantee that no in-flight progress was discarded or corrupted.

### 2.2 Stash Diffstat (35 Files, 1183 Insertions, 537 Deletions)
```text
 .github/workflows/build-artifacts.yml              |   8 +-
 .gitignore                                         |  10 +
 backend/package.json                               |   2 +-
 .../repositories/diagnostic-report.repository.ts   |  21 +-
 .../repositories/failure-signature.repository.ts   |   9 +
 .../db/repositories/workflow-failure.repository.ts |   9 +
 backend/src/db/types.ts                            |  10 +
 backend/src/engine/index.ts                        |  18 +-
 backend/src/lib/ai/diagnose.ts                     |   8 +-
 backend/src/server/routes/billing.ts               |  99 ++++---
 backend/src/server/routes/dashboard.ts             |  24 +-
 backend/src/server/routes/diagnose.ts              | 133 ++++-----
 backend/src/server/routes/repositories.ts          |  85 ++----
 backend/src/server/routes/signatures.ts            |  33 +--
 backend/src/server/routes/webhooks.ts              |  78 ++++--
 backend/src/server/routes/workspaces.ts            |  94 +++++--
 ...08_dedicated_runtime_role_and_rls_hardening.sql |  11 +-
 backend/tests/migrations.test.ts                   |   4 +-
 backend/tests/phase14-adversarial.test.ts          |  12 +-
 backend/tests/phase15-journeys-h-to-j.test.ts      |  35 ++-
 backend/tests/security-tenant-isolation.test.ts    |   6 +-
 backend/tests/user-journeys-e2e.test.ts            |   1 +
 backend/tests/workspace-org-bridge.test.ts         |  30 +-
 backend/tsup.config.json                           |  11 +-
 deploy/cloudflare/worker.ts                        | 242 ++++++++++------
 docker-compose.yml                                 |  21 ++
 frontend/src/App.tsx                               |  35 ++-
 frontend/src/api/client.ts                         | 100 ++++++-
 frontend/src/api/hooks.ts                          |   9 +
 frontend/src/api/schema.ts                         |  49 +++-
 frontend/src/components/layout/NavTabs.tsx         |   9 +-
 frontend/src/components/views/OverviewView.tsx     | 147 ++++++----
 frontend/src/store/useAppStore.ts                  |   2 +-
 frontend/vite.config.ts                            |  50 ++--
 scripts/ci/verify-no-committed-secrets.py          | 305 ++++++++++++++++-----
 35 files changed, 1183 insertions(+), 537 deletions(-)
```

### 2.3 Stash Content Characterization
- **User-Created Work:** The stash contains experimental remediation draft code produced during Phase 0 exploratory passes. None of it represents external customer production data.
- **Preservation Policy:** `stash@{0}` is locked and frozen. It will **NEVER** be dropped, deleted, popped, or overwritten. When Phase 1 implementation begins, specific verified diffs can be cherry-picked or re-implemented cleanly against approved specifications.

---

## 3. AUDIT ENVIRONMENT STATE

- **Local Infrastructure Containers:**
  - `hopper-postgres`: Running on `localhost:5432` (healthy).
  - `hopper-redis`: Running on `localhost:6379` (healthy).
- **Test Suite Baselines:**
  - `npm run test:backend`: 30 test files passed (192 total tests).
  - `npm run test:frontend`: 1 test file passed (9 total tests).
  - `npm run lint`: 0 TypeScript compiler errors.
- **Integrity Guarantee:**
  No application code, database migrations, CI workflows, or credentials have been altered. The Git tree is 100% clean and ready for formal phase-gated execution.

