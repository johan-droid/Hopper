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
      // Commercial monetization deferred: Return free tier validation response
      return res.status(200).json({
        sessionId: `val_sess_${Date.now()}`,
        url: successUrl || `${frontendBase}/billing?success=true`,
        plan,
        mode: 'validation_free_tier',
        message: 'Hopper is currently running in unrestricted validation mode. All features are accessible without payment.',
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

