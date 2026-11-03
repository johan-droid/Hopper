import { describe, it, expect } from 'vitest';
import { verifyGitHubWebhookSignature, generateWebhookSignature } from '../src/lib/github/app-auth.js';
import { createServer } from '../src/server/index.js';

describe('GitHub Webhook Gateway & Auth', () => {
  const secret = 'test_webhook_secret_key_123';
  const payload = JSON.stringify({ action: 'completed', workflow_job: { conclusion: 'failure' } });

  it('should accept valid HMAC-SHA256 signature generated with matching secret', () => {
    const validSignature = generateWebhookSignature(payload, secret);
    const isValid = verifyGitHubWebhookSignature(payload, validSignature, secret);
    expect(isValid).toBe(true);
  });

  it('should reject invalid or tampered HMAC-SHA256 signature', () => {
    const validSignature = generateWebhookSignature(payload, secret);
    const tamperedPayload = JSON.stringify({ action: 'tampered' });
    const isValid = verifyGitHubWebhookSignature(tamperedPayload, validSignature, secret);
    expect(isValid).toBe(false);
  });

  it('should reject malformed signatures missing sha256= prefix', () => {
    const isValid = verifyGitHubWebhookSignature(payload, 'bad_signature_without_prefix', secret);
    expect(isValid).toBe(false);
  });

  it('should initialize express server with health endpoint', () => {
    const app = createServer();
    expect(app).toBeDefined();
  });
});
