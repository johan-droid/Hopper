import { Request, Response, NextFunction } from 'express';

/**
 * Enterprise HTTP Security Headers Middleware.
 * Enforces OWASP-recommended headers across all responses.
 */
export function securityHeadersMiddleware(_req: Request, res: Response, next: NextFunction): void {
  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Prevent clickjacking / framing
  res.setHeader('X-Frame-Options', 'DENY');

  // Modern browsers: disable buggy legacy XSS filter
  res.setHeader('X-XSS-Protection', '0');

  // Strict Referrer Policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Force HTTPS in production
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }

  // Remove fingerprinting headers
  res.removeHeader('X-Powered-By');

  next();
}

