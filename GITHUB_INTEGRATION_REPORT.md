# GitHub Integration & App Verification Report

**Product:** Hopper CI Failure Diagnosis Engine  
**Audit Phase:** Phase 13 Real-World Integration  
**Component:** GitHub App Webhook Ingress, Installation Token Management & PR Reporter  
**Status:** **`ARCHITECTURE VERIFIED — LIVE REGISTRATION BLOCKED`**

---

## 1. GitHub Integration Architecture

Hopper integrates with GitHub as a native GitHub App to achieve:
1. **Zero-YAML Ingestion:** Consumes `workflow_job` and `workflow_run` completed events without modifying repository configuration.
2. **Sub-50ms HMAC-SHA256 Verification:** Verifies webhook payloads using timing-safe comparisons before job queueing.
3. **Replay Deduplication:** Deduplicates events by caching `x-github-delivery` in Redis with a 24-hour TTL.
4. **Sticky PR Feedback:** Inserts or updates a single markdown comment on pull requests using marker tag `<!-- ci-failure-diagnosis-sticky-marker -->`.

---

## 2. Ingress & Verification Test Results

### 1. Webhook HMAC-SHA256 Ingress
Tested in `tests/webhook.test.ts` and `tests/user-journeys-e2e.test.ts`:
- **Valid Signature:** Evaluated in <5ms, queued to BullMQ or executed synchronously.
- **Invalid Signature:** Immediate `401 Unauthorized` (`Invalid HMAC-SHA256 signature`).
- **Missing Secret:** Immediate `503 Service Unavailable`.
- **Timing-Safe Protection:** Buffer comparison via `crypto.timingSafeEqual` prevents side-channel timing attacks.

### 2. Delivery Replay Deduplication
Tested via Redis `claimWebhookDelivery(deliveryId)`:
- First delivery of `x-github-delivery: 7a9e1b2c`: Returns `status: 'queued'`.
- Duplicate delivery within 24 hours: Returns `200 OK` with `status: 'duplicate_ignored'`.

### 3. Tenant Rate Limiting
Redis sliding-window rate limiting (`checkTenantRateLimit(orgLogin, 120, 60)`):
- Permits up to 120 requests/minute per GitHub organization.
- Exceeding limit returns `429 Too Many Requests`.

---

## 3. GitHub App Authentication & Installation Tokens

### Token Minting Implementation (`app-auth.ts`)
- **RS256 JWT Generation:** Mints 10-minute validity App JWT signed with RSA-SHA256.
- **In-Memory Cache:** Caches installation access tokens for up to 50 minutes, auto-renewing 5 minutes prior to expiration.
- **Fallback in Dev:** Generates deterministic synthetic tokens when running in local development mode with placeholder keys.

### Live GitHub App Audit
- Current `backend/.env`:
  ```ini
  GITHUB_APP_ID=1029384
  GITHUB_APP_CLIENT_ID=Ov23li5VvuBPsGAbWwif
  GITHUB_APP_WEBHOOK_SECRET=1134874a3a80...
  GITHUB_APP_PRIVATE_KEY=placeholder-private-key-for-development
  ```
- Because `GITHUB_APP_PRIVATE_KEY` is a development placeholder and App ID `1029384` is uninstalled on live GitHub.com organizations, calling `https://api.github.com/app/installations/.../access_tokens` returns `401 Bad credentials` from GitHub.
- **Status:** **BLOCKED ON LIVE GITHUB APP REGISTRATION**.

---

## 4. Sticky PR Reporter Verification

Tested in `tests/pr-reporter.test.ts`:
- Generates structured markdown tables containing commit SHA, Bayesian flakiness badge, root-cause clues, relevant log lines, and suggested next checks.
- **Paywall Hook:**
  - Free plan: Displays cross-run pattern teaser with upgrade CTA ($9/mo).
  - Paid plan: Displays full cross-run failure history and link to full 30-day timeline.
- **Idempotency:** When a PR comment containing `<!-- ci-failure-diagnosis-sticky-marker -->` already exists, issues `PATCH /repos/.../issues/comments/:id` to update in-place without creating duplicate comments.

---

## 5. Production Setup Requirements

1. **Register GitHub App on GitHub.com:**
   - Permissions: Repository permissions: Checks (Read), Pull Requests (Read & Write), Actions (Read).
   - Subscribe to events: `Workflow job`, `Workflow run`.
2. **Configure Webhook Endpoint:**
   - URL: `https://<hopper-domain>/api/webhooks/github`
   - Secret: Generate 64-character hex secret $\to$ set `GITHUB_APP_WEBHOOK_SECRET`.
3. **Download Private Key:**
   - Download `.pem` file $\to$ set `GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY...-----"`.
