import { Request, Response, NextFunction } from 'express';

/**
 * Cloudflare Turnstile Bot Challenge Verification Middleware
 * 
 * Verifies the client token against Cloudflare's siteverify API.
 * Fails open in test or when CLOUDFLARE_TURNSTILE_SECRET_KEY is not configured,
 * ensuring local development and CI tests are never blocked by missing keys.
 */
export async function requireTurnstile(req: Request, res: Response, next: NextFunction): Promise<void> {
  const secretKey = process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY;

  // In test or local development without secret configured, pass through
  if (process.env.NODE_ENV === 'test' || !secretKey) {
    return next();
  }

  const token =
    (req.headers['cf-turnstile-response'] as string) ||
    req.body?.turnstileToken ||
    (req.query?.turnstileToken as string);

  if (!token) {
    res.status(403).json({
      error: 'CAPTCHA_REQUIRED',
      message: 'Cloudflare Turnstile verification token missing.',
    });
    return;
  }

  try {
    const formData = new URLSearchParams();
    formData.append('secret', secretKey);
    formData.append('response', token);
    const ip = req.headers['cf-connecting-ip'] || req.socket.remoteAddress;
    if (ip && typeof ip === 'string') {
      formData.append('remoteip', ip);
    }

    const verifyRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData.toString(),
    });

    const outcome = (await verifyRes.json()) as any;
    if (!outcome.success) {
      res.status(403).json({
        error: 'BOT_CHALLENGE_FAILED',
        message: 'Cloudflare Turnstile token validation failed.',
        details: outcome['error-codes'] || [],
      });
      return;
    }

    return next();
  } catch (err: any) {
    // Fail closed on verification network failure in production
    res.status(502).json({
      error: 'TURNSTILE_VERIFY_ERROR',
      message: 'Could not contact Cloudflare Turnstile verification service.',
      details: err.message,
    });
  }
}

