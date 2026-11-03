/**
 * GitHub App Authentication & Webhook Signature Verification.
 * Uses crypto.timingSafeEqual to prevent timing attacks on HMAC-SHA256 digests.
 */

import crypto from 'node:crypto';

export function verifyGitHubWebhookSignature(
  payloadRaw: string | Buffer,
  signatureHeader: string | undefined,
  secret: string
): boolean {
  if (!signatureHeader || !secret) {
    return false;
  }

  // GitHub signature format: "sha256=<hex_digest>"
  if (!signatureHeader.startsWith('sha256=')) {
    return false;
  }

  const expectedSignature = signatureHeader.slice(7);
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(payloadRaw);
  const computedSignature = hmac.digest('hex');

  const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
  const computedBuffer = Buffer.from(computedSignature, 'utf8');

  if (expectedBuffer.length !== computedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, computedBuffer);
}

export function generateWebhookSignature(payloadRaw: string, secret: string): string {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(payloadRaw);
  return `sha256=${hmac.digest('hex')}`;
}
