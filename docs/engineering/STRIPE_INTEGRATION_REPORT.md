# Stripe Integration & Subscription Lifecycle Report

**Product:** Hopper CI Failure Diagnosis Engine  
**Audit Phase:** Phase 13 Real-World Integration  
**Component:** Stripe Billing, Checkout Sessions, Webhook Synchronization & Payment Failures  
**Status:** **`ARCHITECTURE & LOGIC VERIFIED — LIVE TEST KEY BLOCKED`**

---

## 1. Stripe Billing Architecture

Hopper monetizes developer organizations through three tiered quotas:
1. **Free Developer ($0/mo):** 30 diagnosed runs/month, 24h failure history, single flaky signature view.
2. **Solo / Pro Developer ($9/mo):** 250 runs/month, full 30-day failure history, unblurred cross-run matrix.
3. **Small Team ($29/mo):** 1,000 runs/month, team member collaboration, priority BullMQ processing.

---

## 2. Webhook Signature & Replay Protection

### Verification Scheme (`stripe-handler.ts`)
- Stripe signatures arrive in header: `Stripe-Signature: t=1492774577,v1=5257a869e7...`.
- Verified using HMAC-SHA256 with timestamp replay guard (300-second tolerance).
- Constant-time `crypto.timingSafeEqual` prevents side-channel digest attacks.

### Replay Deduplication in Redis
- In `backend/src/server/index.ts`, incoming Stripe events are claimed via `claimWebhookDelivery("stripe:" + event.id)`.
- If a webhook event with the same ID arrives again, the server immediately returns `200 OK` with `{ status: "duplicate_ignored" }`.

---

## 3. Subscription Lifecycle State Machine

Tested in `tests/stripe-billing.test.ts` (10/10 tests passing):

```
                        ┌──────────────────────────────┐
                        │        Free Tier             │
                        │    (30 runs / month)         │
                        └──────────────┬───────────────┘
                                       │
                                       │ checkout.session.completed
                                       │ (plan: 'pro_dev' or 'team')
                                       ▼
                        ┌──────────────────────────────┐
                        │      Paid Subscription       │
                        │  Pro: 250 runs / Team: 1000  │
                        └───────┬───────────────▲──────┘
                                │               │
    customer.subscription.deleted│               │ customer.subscription.updated
    (cancellation / churn)      │               │ (tier upgrade / downgrade)
                                ▼               │
                        ┌───────────────────────┴──────┐
                        │     Downgraded / Free        │
                        │    (Reverts to 30 runs)      │
                        └──────────────────────────────┘
```

### Event Handling Verification
1. `checkout.session.completed`:
   - Extracts `client_reference_id` or `metadata.org_id`.
   - Sets `organizations.plan` to `'pro_dev'` (250 runs) or `'team'` (1000 runs).
   - Records `stripe_customer_id` and `stripe_subscription_id`.
   - Verified directly in PostgreSQL database in `Workflow F` of `tests/user-journeys-e2e.test.ts`.
2. `customer.subscription.updated`:
   - Seamlessly updates plan tier when user switches between Pro Dev ($9) and Team ($29).
3. `customer.subscription.deleted`:
   - Downgrades tenant back to Free plan with 30 runs limit.
4. `invoice.payment_succeeded`:
   - On `billing_reason === 'subscription_cycle'`, resets `runs_used_this_period` to 0.
5. `invoice.payment_failed` (Added in Phase 13):
   - Emits tenant warning alert without crashing.

---

## 4. Live Stripe API Test & Credential Status

- Current `backend/.env`:
  ```ini
  STRIPE_SECRET_KEY=sk_test_placeholder
  STRIPE_WEBHOOK_SECRET=whsec_test_placeholder
  ```
- Calling `https://api.stripe.com/v1/checkout/sessions` with placeholder `sk_test_placeholder` returns:
  ```json
  { "error": { "message": "Invalid API Key provided: sk_test_***" } }
  ```
- **Status:** **BLOCKED ON LIVE STRIPE TEST API KEY (`sk_test_...`)**.

---

## 5. Production Setup Requirements

1. **Create Stripe Account & Products:**
   - Create Product 1: "Hopper Pro Developer" $\to$ Price: $9.00 USD/month recurring.
   - Create Product 2: "Hopper Team" $\to$ Price: $29.00 USD/month recurring.
2. **Configure Environment Variables:**
   - `STRIPE_SECRET_KEY=sk_live_...` (or `sk_test_...` in staging).
   - `STRIPE_WEBHOOK_SECRET=whsec_...`.
   - `STRIPE_PRICE_ID_PRO_DEV_9=price_...`.
   - `STRIPE_PRICE_ID_TEAM_29=price_...`.
3. **Register Webhook in Stripe Dashboard:**
   - Endpoint: `https://<hopper-domain>/api/webhooks/stripe`.
   - Events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_succeeded`, `invoice.payment_failed`.

