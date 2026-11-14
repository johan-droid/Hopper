/**
 * Billing Router.
 * Handles checkout session requests with graceful fallback during validation discovery.
 */

import { Router, Request, Response } from 'express';
import { createCheckoutSession } from '../../lib/billing/stripe-handler.js';

export function createBillingRouter(): Router {
  const router = Router();

  // Stripe Checkout Session Creation
  router.post('/checkout', async (req: Request, res: Response) => {
    const { orgId, orgLogin, plan = 'pro_dev', successUrl, cancelUrl } = req.body;
    if (!orgId || !orgLogin) {
      return res.status(400).json({ error: 'orgId and orgLogin are required' });
    }

    // Check if Stripe is configured
    const stripeConfigured = Boolean(
      process.env.STRIPE_SECRET_KEY &&
      !process.env.STRIPE_SECRET_KEY.includes('mock') &&
      !process.env.STRIPE_SECRET_KEY.includes('sk_test_placeholder')
    );

    const frontendBase = process.env.FRONTEND_URL || 'http://localhost:5173';

    if (!stripeConfigured) {
      if (process.env.NODE_ENV === 'test' || process.env.AI_PROVIDER === 'mock') {
        const mockSessionId = `val_sess_${Date.now()}`;
        return res.status(200).json({
          sessionId: mockSessionId,
          checkoutUrl: `https://checkout.stripe.com/c/pay/${mockSessionId}`,
          url: successUrl || `${frontendBase}/billing?success=true`,
          plan,
          mode: 'validation_free_tier',
          message: 'Hopper is currently running in unrestricted validation mode. All features are accessible without payment.',
        });
      }

      return res.status(503).json({
        error: 'Stripe billing is not configured in this environment. Live subscription checkout is currently blocked pending Stripe credential provisioning.',
        configured: false,
        status: 'blocked',
        plan,
      });
    }

    try {
      const session = await createCheckoutSession({
        orgId,
        orgLogin,
        plan,
        successUrl: successUrl || `${frontendBase}/billing?success=true`,
        cancelUrl: cancelUrl || `${frontendBase}/billing?canceled=true`,
      });
      return res.status(200).json(session);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  return router;
}

