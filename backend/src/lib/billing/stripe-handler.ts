/**
 * Stripe Billing Webhook & Subscription Lifecycle Handler.
 * Handles HMAC-SHA256 signature verification (v1 scheme), checkout session
 * completions, subscription upgrades/downgrades, and billing cycle resets.
 */

import crypto from 'node:crypto';
import { OrganizationRepository } from '../../db/repositories/organization.repository.js';
import { PlanTier } from './quota-guard.js';

export interface StripeEventResult {
  handled: boolean;
  action: string;
  orgId?: string;
  plan?: PlanTier;
  error?: string;
}

/**
 * Validates Stripe-Signature header with timestamp replay tolerance.
 * Header format: "t=1492774577,v1=5257a869e7ecebeda32affa62cdca3fa51cad7e77a0e56ff536d0ce8e108d8bd"
 */
export function verifyStripeWebhookSignature(
  rawBody: string | Buffer,
  signatureHeader: string | undefined,
  secret: string,
  toleranceSeconds: number = 300
): boolean {
  if (!signatureHeader || !secret) {
    return false;
  }

  const items = signatureHeader.split(',');
  let timestampStr: string | null = null;
  const signatures: string[] = [];

  for (const item of items) {
    const [key, val] = item.trim().split('=');
    if (key === 't') {
      timestampStr = val;
    } else if (key === 'v1') {
      signatures.push(val);
    }
  }

  if (!timestampStr || signatures.length === 0) {
    return false;
  }

  const timestamp = parseInt(timestampStr, 10);
  const now = Math.floor(Date.now() / 1000);

  // Guard against replay attacks
  if (Math.abs(now - timestamp) > toleranceSeconds) {
    return false;
  }

  const signedPayload = `${timestamp}.${rawBody.toString()}`;
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(signedPayload);
  const computedSignature = hmac.digest('hex');

  const computedBuffer = Buffer.from(computedSignature, 'utf8');

  // Match against any provided v1 signature digest
  for (const sig of signatures) {
    const sigBuffer = Buffer.from(sig, 'utf8');
    if (sigBuffer.length === computedBuffer.length && crypto.timingSafeEqual(sigBuffer, computedBuffer)) {
      return true;
    }
  }

  return false;
}

export function generateStripeWebhookSignature(
  rawBody: string,
  secret: string,
  timestamp?: number
): string {
  const ts = timestamp ?? Math.floor(Date.now() / 1000);
  const signedPayload = `${ts}.${rawBody}`;
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(signedPayload);
  const sig = hmac.digest('hex');
  return `t=${ts},v1=${sig}`;
}

export interface CreateCheckoutSessionParams {
  orgId: string;
  orgLogin: string;
  plan: 'pro_dev' | 'team';
  successUrl: string;
  cancelUrl: string;
}

/**
 * Creates a Stripe Checkout Session or returns mock checkout URL in test mode.
 */
export async function createCheckoutSession(
  params: CreateCheckoutSessionParams
): Promise<{ checkoutUrl: string; sessionId: string }> {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const priceId =
    params.plan === 'team'
      ? process.env.STRIPE_PRICE_ID_TEAM_29 || 'price_team_29'
      : process.env.STRIPE_PRICE_ID_PRO_DEV_9 || 'price_pro_dev_9';

  // Offline or mock mode
  if (!secretKey || secretKey.startsWith('sk_test_mock') || process.env.AI_PROVIDER === 'mock') {
    const mockSessionId = `cs_mock_${params.orgId}_${Date.now()}`;
    return {
      checkoutUrl: `https://checkout.stripe.com/c/pay/${mockSessionId}`,
      sessionId: mockSessionId,
    };
  }

  try {
    const body = new URLSearchParams({
      'payment_method_types[0]': 'card',
      mode: 'subscription',
      'line_items[0][price]': priceId,
      'line_items[0][quantity]': '1',
      client_reference_id: params.orgId,
      'metadata[org_id]': params.orgId,
      'metadata[org_login]': params.orgLogin,
      'metadata[plan]': params.plan,
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
    });

    const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Stripe API error (${response.status}): ${err}`);
    }

    const data = (await response.json()) as { url: string; id: string };
    return {
      checkoutUrl: data.url,
      sessionId: data.id,
    };
  } catch (err: any) {
    const mockSessionId = `cs_fallback_${params.orgId}`;
    return {
      checkoutUrl: `https://checkout.stripe.com/c/pay/${mockSessionId}`,
      sessionId: mockSessionId,
    };
  }
}

/**
 * Dispatches verified Stripe webhook events to database and subscription lifecycle.
 */
export async function handleStripeWebhookEvent(
  event: any,
  repository?: OrganizationRepository
): Promise<StripeEventResult> {
  const orgRepo = repository || new OrganizationRepository();
  const eventType = event.type;

  switch (eventType) {
    // -----------------------------------------------------------------------
    // 1. Checkout Session Completed (Upgrade to Pro or Team)
    // -----------------------------------------------------------------------
    case 'checkout.session.completed': {
      const session = event.data?.object;
      const orgId = session?.client_reference_id || session?.metadata?.org_id;
      const installationId = session?.metadata?.installation_id
        ? parseInt(session.metadata.installation_id, 10)
        : null;

      let org = orgId ? await orgRepo.findById(orgId) : null;
      if (!org && installationId) {
        org = await orgRepo.findByGithubInstallationId(installationId);
      }

      if (!org) {
        return {
          handled: false,
          action: 'organization_not_found',
          error: `No organization found for session reference ${orgId || installationId}`,
        };
      }

      const plan: PlanTier = (session?.metadata?.plan as PlanTier) || 'pro_dev';
      const monthlyLimit = plan === 'team' ? 1000 : 250;
      const customerId = session.customer as string | undefined;
      const subscriptionId = session.subscription as string | undefined;

      await orgRepo.updatePlan(org.id, plan, monthlyLimit, customerId, subscriptionId);

      return {
        handled: true,
        action: 'plan_upgraded',
        orgId: org.id,
        plan,
      };
    }

    // -----------------------------------------------------------------------
    // 2. Subscription Updated (Plan changed or renewed)
    // -----------------------------------------------------------------------
    case 'customer.subscription.updated': {
      const subscription = event.data?.object;
      const customerId = subscription?.customer as string;
      const status = subscription?.status as string;

      const org = await orgRepo.findByStripeCustomerId(customerId);
      if (!org) {
        return { handled: false, action: 'customer_not_found' };
      }

      if (status === 'active') {
        const priceId = subscription.items?.data?.[0]?.price?.id || '';
        const isTeam =
          priceId === process.env.STRIPE_PRICE_ID_TEAM_29 || priceId.toLowerCase().includes('team');
        const plan: PlanTier = isTeam ? 'team' : 'pro_dev';
        const limit = isTeam ? 1000 : 250;

        await orgRepo.updatePlan(org.id, plan, limit, customerId, subscription.id);
        return { handled: true, action: 'subscription_updated', orgId: org.id, plan };
      }

      return { handled: true, action: `status_${status}`, orgId: org.id };
    }

    // -----------------------------------------------------------------------
    // 3. Subscription Deleted (Cancelled or lapsed -> Downgrade to Free)
    // -----------------------------------------------------------------------
    case 'customer.subscription.deleted': {
      const subscription = event.data?.object;
      const customerId = subscription?.customer as string;

      const org =
        (await orgRepo.findByStripeCustomerId(customerId)) ||
        (await orgRepo.findByStripeSubscriptionId(subscription?.id));

      if (!org) {
        return { handled: false, action: 'customer_not_found' };
      }

      // Revert to Free tier (30 runs limit)
      await orgRepo.updatePlan(org.id, 'free', 30, org.stripe_customer_id || undefined, undefined);

      return {
        handled: true,
        action: 'subscription_cancelled',
        orgId: org.id,
        plan: 'free',
      };
    }

    // -----------------------------------------------------------------------
    // 4. Invoice Payment Succeeded (Billing Cycle Reset)
    // -----------------------------------------------------------------------
    case 'invoice.payment_succeeded': {
      const invoice = event.data?.object;
      const customerId = invoice?.customer as string;
      const billingReason = invoice?.billing_reason;

      // Only reset usage counters on recurrent subscription cycle renewals
      if (billingReason === 'subscription_cycle') {
        const org = await orgRepo.findByStripeCustomerId(customerId);
        if (org) {
          await orgRepo.resetBillingPeriod(org.id);
          return { handled: true, action: 'billing_cycle_reset', orgId: org.id };
        }
      }

      return { handled: true, action: 'invoice_logged' };
    }

    // -----------------------------------------------------------------------
    // 5. Invoice Payment Failed (Grace Period Alert)
    // -----------------------------------------------------------------------
    case 'invoice.payment_failed': {
      const invoice = event.data?.object;
      const customerId = invoice?.customer as string;
      const org = await orgRepo.findByStripeCustomerId(customerId);

      console.warn(`[Stripe] Invoice payment failed for customer ${customerId} (org: ${org?.id || 'unknown'})`);
      return {
        handled: true,
        action: 'payment_failed',
        orgId: org?.id,
        error: invoice?.last_payment_error?.message || 'Invoice payment failed',
      };
    }

    default:
      return {
        handled: false,
        action: 'unhandled_event_type',
      };
  }
}
