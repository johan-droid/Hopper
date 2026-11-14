# Hopper — Existing Billing Code & Infrastructure Audit

**Document Status:** Independent Engineering Audit  
**Author:** Principal Product Strategist & SaaS Financial Analyst  
**Date:** November 6, 2026  
**Repository Reference:** [`/home/ashutoshsahoo/Downloads/Hopper`](file:///home/ashutoshsahoo/Downloads/Hopper)  
**Execution Directive:** *Inspection only. Do NOT modify, activate, remove, or extend any existing billing components.*

---

## 1. Executive Summary & Component Classification Ledger

The Hopper repository contains pre-existing billing stubs, legacy prototype views, and partially implemented webhook handlers created during earlier local development phases. None of these components are connected to live payment infrastructure.

Every billing-related artifact in the codebase has been audited and classified according to the mandatory 5-tier classification taxonomy:

```
+--------------------------------------------------------------------------------------------------+
|                                  BILLING COMPONENT AUDIT LEDGER                                  |
+------------------------------------+--------------------------+----------------------------------+
| Component / File Path              | Architectural Role       | Audit Classification             |
+------------------------------------+--------------------------+----------------------------------+
| frontend/.../BillingPlansView.tsx  | Legacy Pricing View      | **Mock / Demo-Only**             |
| backend/src/lib/billing/           | Stripe Webhook Handler & | **Partially Implemented /        |
|   stripe-handler.ts                | Session Generator        |   Mock-Mode Active**             |
| backend/src/server/index.ts        | Checkout Endpoint &      | **Partially Implemented /        |
|   (/api/billing/checkout, stripe)  | Webhook Ingress          |   Inactive in Production**       |
| backend/src/lib/billing/           | Paywall Quota Counter &  | **Existing but Unused in Main    |
|   quota-guard.ts                   | Feature Gate Guard       |   Pipeline Execution**           |
| backend/src/db/repositories/       | Organization DB Access & | **Existing and Active in Schema  |
|   organization.repository.ts       | Plan Quota Tracking      |   (Populated with Mock Data)**   |
| backend/src/db/types.ts            | Organization Interface & | **Existing and Active in Schema  |
|   (Organization columns)           | PlanTier Types           |   (Populated with Defaults)**    |
| backend/tests/                     | Unit & Mock Lifecycle    | **Existing and Active in Test    |
|   stripe-billing.test.ts           | Verification             |   Harness Only**                 |
| Real Payment Gateway Connection    | Live Billing Credentials | **NONE (Zero live connection)**  |
+------------------------------------+--------------------------+----------------------------------+
```

---

## 2. Detailed Component-by-Component Audit

### 2.1 Frontend: `BillingPlansView.tsx`
- **File Location:** [`frontend/src/components/views/BillingPlansView.tsx`](file:///home/ashutoshsahoo/Downloads/Hopper/frontend/src/components/views/BillingPlansView.tsx)
- **Classification:** **Mock / Demo-Only**
- **Inspection Findings:**
  1. **Legacy Hardcoded Currency & Tiers:** Renders 3 tier cards displaying USD prices:
     - Free Developer: `$0 / month`
     - Solo / Pro Dev: `$9 / month`
     - Small Team: `$29 / month`
  2. **Mock Interaction Handler:** The button click executes `handleCheckout()`:
     ```typescript
     const res = await checkoutMutation.mutateAsync({
       orgId: '00000000-0000-0000-0000-000000000001',
       orgLogin: selectedOrg,
       plan,
     });
     if (res.checkoutUrl) {
       window.location.href = res.checkoutUrl;
     } else {
       setPlanTier(plan);
       alert(`Activated ${plan} plan in local mode!`);
     }
     ```
  3. **Local Simulation Binding:** If `checkoutUrl` is synthetic or fails, it updates local Zustand store state via `setSimulatedPlan(plan)` and `setPlanTier(plan)` without executing any real payment transaction.
  4. **Connection to Real Provider:** **None**.

---

### 2.2 Backend Library: `stripe-handler.ts`
- **File Location:** [`backend/src/lib/billing/stripe-handler.ts`](file:///home/ashutoshsahoo/Downloads/Hopper/backend/src/lib/billing/stripe-handler.ts)
- **Classification:** **Partially Implemented / Mock-Mode Active**
- **Inspection Findings:**
  1. **Mock Checkout Bypass:** In `createCheckoutSession()` (lines 100–116):
     ```typescript
     const secretKey = process.env.STRIPE_SECRET_KEY;
     // Offline or mock mode
     if (!secretKey || secretKey.startsWith('sk_test_mock') || process.env.AI_PROVIDER === 'mock') {
       const mockSessionId = `cs_mock_${params.orgId}_${Date.now()}`;
       return {
         checkoutUrl: `https://checkout.stripe.com/c/pay/${mockSessionId}`,
         sessionId: mockSessionId,
       };
     }
     ```
     Because `STRIPE_SECRET_KEY` is not provisioned in the production environment (or contains mock strings), it returns a fake URL that redirects nowhere.
  2. **Stripe API Call Stub:** Lines 118–145 contain a basic fetch to `https://api.stripe.com/v1/checkout/sessions` with legacy environment variables `STRIPE_PRICE_ID_TEAM_29` and `STRIPE_PRICE_ID_PRO_DEV_9`.
  3. **Webhook Verification Logic:** `verifyStripeWebhookSignature()` (lines 28–71) implements valid HMAC-SHA256 signature checking against the Stripe `t=...,v1=...` format with timestamp replay protection.
  4. **Event Lifecycle Handlers:** `handleStripeWebhookEvent()` handles 4 Stripe event types: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, and `invoice.payment_failed`. It updates the `OrganizationRepository`.
  5. **Connection to Real Provider:** **None**. No real Stripe webhooks are routed to this server.

---

### 2.3 Backend Server Routes: `server/index.ts`
- **File Location:** [`backend/src/server/index.ts#L265-L325`](file:///home/ashutoshsahoo/Downloads/Hopper/backend/src/server/index.ts#L265-L325)
- **Classification:** **Partially Implemented / Inactive in Production**
- **Inspection Findings:**
  1. **Stripe Webhook Ingress (`POST /api/webhooks/stripe`):**
     - Checks `process.env.STRIPE_WEBHOOK_SECRET`. If missing, immediately returns `503 Service Unavailable: Stripe webhook is not configured`.
     - In live staging/production, this route is completely dormant because no webhook secret is set.
     - Implements Redis replay protection via `claimWebhookDelivery('stripe:${eventId}')` with 24-hour TTL.
  2. **Checkout Route (`POST /api/billing/checkout`):**
     - Validates `orgId` and `orgLogin`.
     - Invokes `createCheckoutSession()` from `stripe-handler.ts`.
     - In the absence of real credentials, returns the mock session URL.

---

### 2.4 Quota & Paywall Logic: `quota-guard.ts`
- **File Location:** [`backend/src/lib/billing/quota-guard.ts`](file:///home/ashutoshsahoo/Downloads/Hopper/backend/src/lib/billing/quota-guard.ts)
- **Classification:** **Existing but Unused in Main Execution Pipeline**
- **Inspection Findings:**
  1. **Legacy Plan Limits Object:** Defines:
     ```typescript
     export const PLAN_LIMITS: Record<PlanTier, PlanLimits> = {
       free: { monthlyRuns: 30, retentionDays: 1, slackAlerts: false, ... },
       pro_dev: { monthlyRuns: 250, retentionDays: 30, slackAlerts: false, ... },
       team: { monthlyRuns: 1000, retentionDays: 90, slackAlerts: true, ... },
     };
     ```
  2. **Pipeline Disconnection:** While `checkOrgQuota()` and `recordOrgRun()` are fully functional functions that query PostgreSQL, **they are not currently invoked by the main BullMQ job processor** ([`backend/src/workers/processors/workflow-job.processor.ts`](file:///home/ashutoshsahoo/Downloads/Hopper/backend/src/workers/processors/workflow-job.processor.ts)) or the GitHub webhook handler.
  3. The core diagnosis engine runs without blocking on `quota-guard.ts` during current engineering runs.
  4. Quota enforcement is verified only in unit test isolation ([`backend/tests/quota-guard.test.ts`](file:///home/ashutoshsahoo/Downloads/Hopper/backend/tests/quota-guard.test.ts)).

---

### 2.5 Database Schema & Repository Layer
- **File Locations:**
  - Types: [`backend/src/db/types.ts#L18-L34`](file:///home/ashutoshsahoo/Downloads/Hopper/backend/src/db/types.ts#L18-L34)
  - Repository: [`backend/src/db/repositories/organization.repository.ts`](file:///home/ashutoshsahoo/Downloads/Hopper/backend/src/db/repositories/organization.repository.ts)
  - Schema Migration: [`backend/supabase/migrations/0001_initial_schema.sql`](file:///home/ashutoshsahoo/Downloads/Hopper/backend/supabase/migrations/0001_initial_schema.sql)
- **Classification:** **Existing and Active in Schema (Populated with Defaults / Mock Data)**
- **Inspection Findings:**
  1. The `organizations` table contains columns designed for billing metadata:
     - `plan TEXT NOT NULL DEFAULT 'free'`
     - `stripe_customer_id TEXT`
     - `stripe_subscription_id TEXT`
     - `monthly_run_limit INTEGER NOT NULL DEFAULT 30`
     - `runs_used_this_period INTEGER NOT NULL DEFAULT 0`
     - `billing_period_reset_at TIMESTAMPTZ`
  2. Database queries to `findById()`, `updateSubscription()`, and `incrementRunCount()` execute cleanly against PostgreSQL.
  3. However, the data stored in local and test environments consists entirely of seeded mock organizations (e.g., `00000000-0000-0000-0000-000000000001`). No real customer subscriptions exist.

---

### 2.6 Test Harness: `stripe-billing.test.ts`
- **File Location:** [`backend/tests/stripe-billing.test.ts`](file:///home/ashutoshsahoo/Downloads/Hopper/backend/tests/stripe-billing.test.ts)
- **Classification:** **Existing and Active in Test Harness Only**
- **Inspection Findings:**
  - Contains 10 automated unit tests verifying HMAC signature verification, checkout session mock generation, and webhook lifecycle event handling.
  - Passes 10/10 tests in `npm run test:backend` using mocked secret keys (`whsec_test_secret_1234567890abcdef`) and mock database repositories.

---

## 3. Strict Architectural Boundary & Next Steps

```
+--------------------------------------------------------------------------------------------------+
|                                    CURRENT OPERATIONAL POLICY                                    |
+--------------------------------------------------------------------------------------------------+
| 1. All existing billing code is treated as FROZEN PROTOTYPE ARTIFACTS.                          |
| 2. Zero modifications will be made to BillingPlansView.tsx or stripe-handler.ts at this time.    |
| 3. Zero live payment keys or webhooks will be configured.                                        |
| 4. When the commercial validation phase completes and the owner authorizes billing development,  |
|    these prototype components will be evaluated for refactoring to support the chosen gateway    |
|    (Razorpay / Paddle) and Indian pricing tiers.                                                 |
+--------------------------------------------------------------------------------------------------+
```

