import { describe, it, expect, afterEach } from 'vitest';
import { createApp } from '../src/server/app.js';
import {
  InMemoryCoordination,
  setCoordinationBackend,
} from '../src/queue/coordination.js';

describe('GitHub Webhook Gateway & Auth', () => {
  afterEach(() => {
    setCoordinationBackend(null);
  });

  it('accepts a valid HMAC-SHA256 signature', async () => {
    const secret = 'test_webhook_secret_key_123';
    const payload = JSON.stringify({ action: 'completed' });
    const { generateWebhookSignature, verifyGitHubWebhookSignature } = await import(
      '../src/lib/github/app-auth.js'
    );

    expect(verifyGitHubWebhookSignature(payload, generateWebhookSignature(payload, secret), secret)).toBe(
      true
    );
  });

  it('rejects a tampered signature', async () => {
    const secret = 'test_webhook_secret_key_123';
    const { generateWebhookSignature, verifyGitHubWebhookSignature } = await import(
      '../src/lib/github/app-auth.js'
    );
    const signature = generateWebhookSignature(JSON.stringify({ a: 1 }), secret);

    expect(verifyGitHubWebhookSignature(JSON.stringify({ a: 2 }), signature, secret)).toBe(false);
    expect(verifyGitHubWebhookSignature('{}', 'missing-prefix', secret)).toBe(false);
  });

  it('builds the express application without process-level side effects', () => {
    expect(createApp()).toBeDefined();
  });

  it('acknowledges a replayed GitHub delivery without processing it again', async () => {
    const secret = 'test_webhook_secret_key_replay';
    process.env.GITHUB_APP_WEBHOOK_SECRET = secret;
    setCoordinationBackend(new InMemoryCoordination());

    const { generateWebhookSignature } = await import('../src/lib/github/app-auth.js');
    const payload = JSON.stringify({ zen: 'Design for failure.' });
    const signature = generateWebhookSignature(payload, secret);

    const server = createApp().listen(0);
    await new Promise<void>((resolve) => server.once('listening', () => resolve()));
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;

    const send = () =>
      fetch(`http://127.0.0.1:${port}/api/webhooks/github`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-GitHub-Event': 'ping',
          'X-GitHub-Delivery': 'delivery-uuid-replay',
          'X-Hub-Signature-256': signature,
        },
        body: payload,
      });

    try {
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

  it('rejects unsigned webhook traffic', async () => {
    process.env.GITHUB_APP_WEBHOOK_SECRET = 'test_webhook_secret_key_unsigned';

    const server = createApp().listen(0);
    await new Promise<void>((resolve) => server.once('listening', () => resolve()));
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/webhooks/github`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-GitHub-Event': 'workflow_job' },
        body: JSON.stringify({ action: 'completed' }),
      });
      expect(res.status).toBe(401);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('handles CORS preflight for an allowed local origin', async () => {
    const server = createApp().listen(0);
    await new Promise<void>((resolve) => server.once('listening', () => resolve()));
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;

    try {
      const preflight = await fetch(`http://127.0.0.1:${port}/api/health`, {
        method: 'OPTIONS',
        headers: {
          Origin: 'http://localhost:5173',
          'Access-Control-Request-Method': 'GET',
        },
      });
      expect(preflight.status).toBe(204);
      expect(preflight.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');

      const res = await fetch(`http://127.0.0.1:${port}/api/health`, {
        headers: { Origin: 'http://localhost:5173' },
      });
      expect(res.status).toBe(200);
      expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
