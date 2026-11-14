# Hopper — Actionable Tasks & Engineering Gap Register (TASKS_AND_GAPS.md)

---

## 1. Task Prioritization Matrix

This document tracks all actionable remaining engineering tasks and operational gaps. Never mark a task complete without concrete test or deployment evidence.

| Task ID | Priority | Subsystem | Title | Status | Dependencies |
|---|:---:|---|---|:---:|---|
| **TASK-001** | **P0** | Legal / Repo | Commit Apache-2.0 `LICENSE` File Text | **READY** | None |
| **TASK-002** | **P0** | Database | Provision Production Supabase Cloud & Run Migrations | **BLOCKED** | SaaS Account |
| **TASK-003** | **P0** | Ingress | Register Official GitHub App & Store Private Key | **BLOCKED** | GitHub Org |
| **TASK-004** | **P0** | Billing | Configure Production Stripe Products & Webhooks | **BLOCKED** | Stripe Account |
| **TASK-005** | **P0** | Hosting | Authenticate Vercel & Deploy Production Preview | **BLOCKED** | Vercel Auth |
| **TASK-101** | **P1** | Verification | Live End-to-End Diagnostic Run on Real GitHub PR | **BLOCKED** | TASK-003 |
| **TASK-102** | **P1** | Workers | Wire Worker Slack/Discord Dispatcher to Webhooks | **READY** | None |
| **TASK-103** | **P1** | Operations | Validate Automated Daily Queue-Drain Cron on Vercel | **BLOCKED** | TASK-005 |
| **TASK-201** | **P2** | GitHub App | Automated Branching & Code Fix PR Creation | **PLANNED** | TASK-101 |
| **TASK-202** | **P2** | QA / CI | Incorporate Playwright E2E Suite into GitHub Actions CI | **READY** | None |
| **TASK-203** | **P2** | Database | Automated Signature Archival & Partitioning Policy | **PLANNED** | High Volume |

---

## 2. Priority 0 Tasks (Production Launch Blockers)

### TASK-001: Commit Apache-2.0 `LICENSE` File Text
- **Context:** `package.json` declares `"license": "Apache-2.0"`, but the standard Apache 2.0 license text file is missing from the repository root.
- **Dependencies:** None.
- **Acceptance Criteria:**
  - A standard `LICENSE` file containing the official Apache 2.0 terms is added to `/`.
  - `npm run doctor` acknowledges license presence.
- **Verification:** `cat LICENSE | grep "Apache License"` returns 0 exit code.

### TASK-002: Provision Production Supabase Cloud & Run Migrations
- **Context:** Production requires a dedicated Supabase PostgreSQL 16 project with the `pgvector` extension enabled.
- **Dependencies:** Supabase cloud account creation.
- **Acceptance Criteria:**
  - Supabase project created in appropriate region (e.g. AWS `us-east-1` or `ap-south-1`).
  - Pooled database URL (`DATABASE_URL`) and direct DDL URL (`DIRECT_URL`) configured in Vercel.
  - Migrations `0001` through `0013` applied cleanly via `npm run migrate`.
  - Row-Level Security policies active under non-superuser role `hopper_app`.
- **Verification:** Run `backend/tests/database.test.ts` against the live connection string.

### TASK-003: Register Official GitHub App & Store Private Key
- **Context:** Live webhook ingress and sticky PR comments require a registered GitHub App.
- **Dependencies:** GitHub organization administrative access.
- **Acceptance Criteria:**
  - GitHub App created with permissions:
    - Repository permissions: `Actions: Read-only`, `Pull requests: Read & write`, `Issues: Read & write`, `Metadata: Read-only`.
    - Event subscriptions: `Workflow job`, `Workflow run`.
  - Webhook URL configured to `https://app.hopper.dev/api/webhooks/github`.
  - `GITHUB_APP_ID`, `GITHUB_APP_CLIENT_ID`, `GITHUB_APP_CLIENT_SECRET`, `GITHUB_APP_WEBHOOK_SECRET`, and `GITHUB_APP_PRIVATE_KEY` stored securely in Vercel environment variables.
- **Verification:** Successful verification of HMAC signature via `curl` test to live webhook endpoint.

### TASK-004: Configure Production Stripe Products & Webhooks
- **Context:** Monetization requires active price IDs for the $9/mo Pro Developer and $29/mo Small Team tiers.
- **Dependencies:** Stripe account verification.
- **Acceptance Criteria:**
  - Products created in Stripe Dashboard:
    - Pro Developer Plan: $9.00/month recurring -> `STRIPE_PRICE_ID_PRO_DEV_9`.
    - Small Team Plan: $29.00/month recurring -> `STRIPE_PRICE_ID_TEAM_29`.
  - Webhook endpoint registered: `https://app.hopper.dev/api/webhooks/stripe` listening for `checkout.session.completed`, `customer.subscription.updated`, and `customer.subscription.deleted`.
  - `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` configured in Vercel.
- **Verification:** Trigger test webhook via Stripe CLI and confirm plan update in `organizations` table.

### TASK-005: Authenticate Vercel & Deploy Production Preview
- **Context:** Vercel deployment is staged in `vercel.json` but blocked on CLI authentication.
- **Dependencies:** Vercel team account access.
- **Acceptance Criteria:**
  - Execute `npx vercel login` and `npx vercel link`.
  - Build succeeds via `npx vercel build`.
  - Preview deployment deployed via `npx vercel deploy --prebuilt`.
  - Health check endpoint `https://<preview-domain>/api/health` returns `200 OK` with `status: "healthy"`.
- **Verification:** Curl `GET /api/health` and verify HTTP 200 response.

---

## 3. Priority 1 Tasks (Operational Hardening)

### TASK-101: Live End-to-End Diagnostic Run on Real GitHub PR
- **Context:** Validate the complete diagnostic lifecycle against a real GitHub Actions failure in an external repository.
- **Dependencies:** TASK-003, TASK-005.
- **Acceptance Criteria:**
  - Install Hopper GitHub App on a canary repository.
  - Trigger a failing Actions job (e.g. failing Jest assertion).
  - Verify webhook reception (<50ms), outbox enqueue, log streaming, secret scrubbing, and AI diagnosis.
  - Verify that a single sticky comment containing the diagnosis and fix appears on the pull request within 15 seconds.
- **Verification:** Visual confirmation on the GitHub PR page.

### TASK-102: Wire Worker Slack/Discord Dispatcher to Webhooks
- **Context:** `backend/src/workers/processors/slack-alert.processor.ts` exists, but needs end-to-end integration with the queue worker for Team tier organizations.
- **Dependencies:** None.
- **Acceptance Criteria:**
  - When a diagnosis completes for an organization with `slack_webhook_url` or `discord_webhook_url` set, enqueue a `slack_alert` job.
  - Processor dispatches formatted message with failure summary and PR link.
- **Verification:** Unit test asserting webhook payload dispatch when URLs are configured.

### TASK-103: Validate Automated Daily Queue-Drain Cron on Vercel
- **Context:** On Vercel Hobby, cron jobs run once daily.
- **Dependencies:** TASK-005.
- **Acceptance Criteria:**
  - Verify that Vercel Cron triggers `GET /api/cron/queue-drain` daily.
  - Endpoint validates `Authorization: Bearer <CRON_SECRET>`.
  - Invokes `hopper_reap_expired_job_locks` and drains stale outbox items.
- **Verification:** Inspect Vercel Cron invocation logs.
