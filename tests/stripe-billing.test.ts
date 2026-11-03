import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  verifyStripeWebhookSignature,
  generateStripeWebhookSignature,
  handleStripeWebhookEvent,
  createCheckoutSession,
} from '../src/lib/billing/stripe-handler.js';
import { Organization } from '../src/db/types.js';

describe('Stripe Billing & Quota Lifecycle', () => {
  const secret = 'whsec_test_stripe_webhook_signing_secret_123';
  const samplePayload = JSON.stringify({
    id: 'evt_123',
    type: 'checkout.session.completed',
    data: { object: { id: 'cs_123' } },
  });

  it('validates authentic Stripe webhook signature with timestamp matching', () => {
    const validSignature = generateStripeWebhookSignature(samplePayload, secret);
    const isValid = verifyStripeWebhookSignature(samplePayload, validSignature, secret);
    expect(isValid).toBe(true);
  });

  it('rejects tampered webhook payload digest', () => {
    const validSignature = generateStripeWebhookSignature(samplePayload, secret);
    const tamperedPayload = JSON.stringify({ id: 'evt_tampered' });
    const isValid = verifyStripeWebhookSignature(tamperedPayload, validSignature, secret);
    expect(isValid).toBe(false);
  });

  it('rejects expired timestamp to prevent replay attacks', () => {
    // Timestamp from 10 minutes ago (> 300 seconds tolerance)
    const oldTimestamp = Math.floor(Date.now() / 1000) - 600;
    const oldSignature = generateStripeWebhookSignature(samplePayload, secret, oldTimestamp);

    const isValid = verifyStripeWebhookSignature(samplePayload, oldSignature, secret, 300);
    expect(isValid).toBe(false);
  });

  it('handles checkout.session.completed and upgrades organization to pro_dev tier ($9/mo, 250 runs)', async () => {
    const mockOrg: Organization = {
      id: 'org-test-uuid',
      github_installation_id: 111222,
      github_account_login: 'fast-scaling-startup',
      github_account_type: 'Organization',
      plan: 'free',
      stripe_customer_id: null,
      stripe_subscription_id: null,
      monthly_run_limit: 30,
      runs_used_this_period: 28,
      billing_period_reset_at: new Date(),
      slack_webhook_url: null,
      auto_retry_policy: false,
      discord_webhook_url: null,
      created_at: new Date(),
      updated_at: new Date(),
    };

    let updatedPlan = '';
    let updatedLimit = 0;
    let customerSaved = '';

    const mockRepo = {
      findById: async (id: string) => (id === 'org-test-uuid' ? mockOrg : null),
      findByGithubInstallationId: async () => null,
      updatePlan: async (_id: string, plan: any, limit: number, customerId: any) => {
        updatedPlan = plan;
        updatedLimit = limit;
        customerSaved = customerId;
        return { ...mockOrg, plan, monthly_run_limit: limit };
      },
    } as any;

    const event = {
      type: 'checkout.session.completed',
      data: {
        object: {
          client_reference_id: 'org-test-uuid',
          customer: 'cus_stripe_customer_123',
          subscription: 'sub_stripe_sub_456',
          metadata: {
            plan: 'pro_dev',
          },
        },
      },
    };

    const res = await handleStripeWebhookEvent(event, mockRepo);
    expect(res.handled).toBe(true);
    expect(res.action).toBe('plan_upgraded');
    expect(updatedPlan).toBe('pro_dev');
    expect(updatedLimit).toBe(250);
    expect(customerSaved).toBe('cus_stripe_customer_123');
  });

  it('handles checkout.session.completed for team tier ($29/mo, 1000 runs)', async () => {
    const mockOrg: Organization = {
      id: 'org-team-uuid',
      github_installation_id: 333444,
      github_account_login: 'enterprise-team',
      github_account_type: 'Organization',
      plan: 'free',
      stripe_customer_id: null,
      stripe_subscription_id: null,
      monthly_run_limit: 30,
      runs_used_this_period: 0,
      billing_period_reset_at: new Date(),
      slack_webhook_url: null,
      auto_retry_policy: false,
      discord_webhook_url: null,
      created_at: new Date(),
      updated_at: new Date(),
    };

    let updatedPlan = '';
    let updatedLimit = 0;

    const mockRepo = {
      findById: async () => mockOrg,
      updatePlan: async (_id: string, plan: any, limit: number) => {
        updatedPlan = plan;
        updatedLimit = limit;
        return { ...mockOrg, plan, monthly_run_limit: limit };
      },
    } as any;

    const event = {
      type: 'checkout.session.completed',
      data: {
        object: {
          client_reference_id: 'org-team-uuid',
          customer: 'cus_team_789',
          subscription: 'sub_team_000',
          metadata: { plan: 'team' },
        },
      },
    };

    const res = await handleStripeWebhookEvent(event, mockRepo);
    expect(res.handled).toBe(true);
    expect(updatedPlan).toBe('team');
    expect(updatedLimit).toBe(1000);
  });

  it('handles customer.subscription.deleted and downgrades organization to free tier', async () => {
    const mockPaidOrg: Organization = {
      id: 'org-paid-uuid',
      github_installation_id: 555666,
      github_account_login: 'churned-account',
      github_account_type: 'Organization',
      plan: 'pro_dev',
      stripe_customer_id: 'cus_churned_123',
      stripe_subscription_id: 'sub_churned_456',
      monthly_run_limit: 250,
      runs_used_this_period: 50,
      billing_period_reset_at: new Date(),
      slack_webhook_url: null,
      auto_retry_policy: false,
      discord_webhook_url: null,
      created_at: new Date(),
      updated_at: new Date(),
    };

    let revertedPlan = '';
    let revertedLimit = 0;

    const mockRepo = {
      findByStripeCustomerId: async () => mockPaidOrg,
      findByStripeSubscriptionId: async () => mockPaidOrg,
      updatePlan: async (_id: string, plan: any, limit: number) => {
        revertedPlan = plan;
        revertedLimit = limit;
        return { ...mockPaidOrg, plan, monthly_run_limit: limit };
      },
    } as any;

    const event = {
      type: 'customer.subscription.deleted',
      data: {
        object: {
          customer: 'cus_churned_123',
          id: 'sub_churned_456',
        },
      },
    };

    const res = await handleStripeWebhookEvent(event, mockRepo);
    expect(res.handled).toBe(true);
    expect(res.action).toBe('subscription_cancelled');
    expect(revertedPlan).toBe('free');
    expect(revertedLimit).toBe(30);
  });

  it('handles invoice.payment_succeeded and resets billing period runs on renewal', async () => {
    let resetCalled = false;
    const mockRepo = {
      findByStripeCustomerId: async () => ({ id: 'org-renewed' }),
      resetBillingPeriod: async (id: string) => {
        expect(id).toBe('org-renewed');
        resetCalled = true;
      },
    } as any;

    const event = {
      type: 'invoice.payment_succeeded',
      data: {
        object: {
          customer: 'cus_renewed_123',
          billing_reason: 'subscription_cycle',
        },
      },
    };

    const res = await handleStripeWebhookEvent(event, mockRepo);
    expect(res.handled).toBe(true);
    expect(res.action).toBe('billing_cycle_reset');
    expect(resetCalled).toBe(true);
  });

  it('generates checkout session URL and session ID cleanly', async () => {
    const session = await createCheckoutSession({
      orgId: 'org-abc',
      orgLogin: 'test-org',
      plan: 'pro_dev',
      successUrl: 'https://hopper.dev/success',
      cancelUrl: 'https://hopper.dev/cancel',
    });

    expect(session.checkoutUrl).toContain('checkout.stripe.com');
    expect(session.sessionId).toContain('cs_');
  });
});
