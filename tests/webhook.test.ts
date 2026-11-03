import { describe, it, expect, afterEach } from 'vitest';
import { verifyGitHubWebhookSignature, generateWebhookSignature } from '../src/lib/github/app-auth.js';
import { createServer } from '../src/server/index.js';
import { setCustomRedis } from '../src/queue/redis.js';

describe('GitHub Webhook Gateway & Auth', () => {
  const secret = 'test_webhook_secret_key_123';
  const payload = JSON.stringify({ action: 'completed', workflow_job: { conclusion: 'failure' } });

  afterEach(() => {
    setCustomRedis(null);
  });

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

  it('acknowledges a replayed GitHub delivery without processing it again', async () => {
    process.env.GITHUB_APP_WEBHOOK_SECRET = secret;
    const replayedPayload = JSON.stringify({ zen: 'Design for failure.' });
    const signature = generateWebhookSignature(replayedPayload, secret);

    let deliveries = 0;
    setCustomRedis({
      set: async () => {
        deliveries++;
        return deliveries === 1 ? 'OK' : null;
      },
    });

    const server = createServer().listen(0);
    await new Promise<void>((resolve) => server.once('listening', () => resolve()));
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;

    try {
      const send = () =>
        fetch(`http://127.0.0.1:${port}/api/webhooks/github`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-GitHub-Event': 'ping',
            'X-GitHub-Delivery': 'delivery-uuid-replay',
            'X-Hub-Signature-256': signature,
          },
          body: replayedPayload,
        });

      const first = await send();
      expect(first.status).toBe(200);
      expect(((await first.json()) as { status?: string }).status).toBe('ignored');

      const second = await send();
      expect(second.status).toBe(200);
      expect(await second.json()).toEqual({ status: 'duplicate_ignored' });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
