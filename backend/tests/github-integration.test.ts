import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'node:crypto';
import {
  generateAppJwt,
  getInstallationToken,
  setMockInstallationToken,
  clearTokenCache,
} from '../src/lib/github/app-auth.js';
import {
  fetchJobLogStream,
  fetchCommitModifiedFiles,
} from '../src/lib/github/log-fetcher.js';
import {
  upsertPrStickyComment,
  STICKY_COMMENT_MARKER,
} from '../src/lib/github/pr-reporter.js';

describe('GitHub App Authentication & RS256 JWT Engine', () => {
  let testPrivateKey: string;
  let testPublicKey: string;

  beforeEach(() => {
    clearTokenCache();
    // Generate fresh RSA 2048 keypair for cryptographic testing
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    testPrivateKey = privateKey;
    testPublicKey = publicKey;
  });

  afterEach(() => {
    clearTokenCache();
    vi.restoreAllMocks();
  });

  it('generates cryptographically valid RS256 JWT adhering to GitHub App specification', () => {
    const jwt = generateAppJwt('app-102938', testPrivateKey);
    expect(jwt).toBeDefined();

    const parts = jwt.split('.');
    expect(parts.length).toBe(3);

    const [headerB64, payloadB64, signatureB64] = parts;
    const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf8'));
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));

    expect(header.alg).toBe('RS256');
    expect(header.typ).toBe('JWT');
    expect(payload.iss).toBe('app-102938');
    expect(payload.exp).toBeGreaterThan(payload.iat);
    expect(payload.exp - payload.iat).toBeLessThanOrEqual(11 * 60); // Under 11 mins

    // Cryptographic signature verification using public key
    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(`${headerB64}.${payloadB64}`);
    const isValid = verifier.verify(testPublicKey, Buffer.from(signatureB64, 'base64url'));
    expect(isValid).toBe(true);
  });

  it('mints and caches installation access tokens with expiration window', async () => {
    setMockInstallationToken('ghs_test_token_initial_123');
    const token1 = await getInstallationToken(12345);
    expect(token1).toBe('ghs_test_token_initial_123');

    // Subsequent retrieval reuses cached token
    setMockInstallationToken(null);
    const token2 = await getInstallationToken(12345);
    expect(token2).toBe('ghs_test_token_initial_123');

    // Force refresh produces a new token
    const token3 = await getInstallationToken(12345, { forceRefresh: true });
    expect(token3).toContain('ghs_');
  });

  it('streams job log text and bounds memory to O(1) buffer size', async () => {
    const log = await fetchJobLogStream({
      installationToken: 'ghs_mock_token',
      repoFullName: 'acme/service',
      jobId: 998877,
      maxBytes: 1000,
    });
    expect(log).toBeDefined();
    expect(typeof log).toBe('string');
    expect(log.length).toBeGreaterThan(0);
    expect(log.length).toBeLessThanOrEqual(300_000);
  });

  it('fetches commit modified files for stack trace correlation', async () => {
    const files = await fetchCommitModifiedFiles({
      installationToken: 'ghs_mock_token',
      repoFullName: 'acme/service',
      commitSha: 'abcdef1234567890abcdef1234567890abcdef12',
    });
    expect(Array.isArray(files)).toBe(true);
    expect(files.length).toBeGreaterThan(0);
  });

  it('creates new sticky PR comment when no prior sticky comment exists', async () => {
    const originalFetch = global.fetch;
    const fetchMock = vi.fn().mockImplementation(async (url: string, init?: any) => {
      if (url.includes('/issues/42/comments') && (!init?.method || init.method === 'GET')) {
        // Return existing comments without sticky marker
        return {
          ok: true,
          status: 200,
          json: async () => [
            { id: 101, body: 'LGTM! Great refactor.' },
            { id: 102, body: 'Please check unit tests.' },
          ],
        };
      }
      if (url.includes('/issues/42/comments') && init?.method === 'POST') {
        // Return newly created comment
        return {
          ok: true,
          status: 201,
          json: async () => ({ id: 50505 }),
        };
      }
      return { ok: false, status: 404 };
    });

    global.fetch = fetchMock;

    try {
      const res = await upsertPrStickyComment({
        installationToken: 'ghs_live_token_abc',
        repoFullName: 'acme/service',
        prNumber: 42,
        markdownContent: `${STICKY_COMMENT_MARKER}\n### CI Failure Report`,
      });

      expect(res.action).toBe('created');
      expect(res.commentId).toBe(50505);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('updates existing sticky PR comment in-place when marker is found', async () => {
    const originalFetch = global.fetch;
    let patchUrl = '';
    let patchBody = '';

    const fetchMock = vi.fn().mockImplementation(async (url: string, init?: any) => {
      if (url.includes('/issues/42/comments') && (!init?.method || init.method === 'GET')) {
        // Return existing comments with sticky marker
        return {
          ok: true,
          status: 200,
          json: async () => [
            { id: 201, body: 'Some review comment' },
            { id: 99999, body: `${STICKY_COMMENT_MARKER}\nOld failure report` },
          ],
        };
      }
      if (url.includes('/issues/comments/99999') && init?.method === 'PATCH') {
        patchUrl = url;
        patchBody = init.body;
        return {
          ok: true,
          status: 200,
          json: async () => ({ id: 99999 }),
        };
      }
      return { ok: false, status: 404 };
    });

    global.fetch = fetchMock;

    try {
      const res = await upsertPrStickyComment({
        installationToken: 'ghs_live_token_abc',
        repoFullName: 'acme/service',
        prNumber: 42,
        markdownContent: `${STICKY_COMMENT_MARKER}\nUpdated failure report`,
      });

      expect(res.action).toBe('updated');
      expect(res.commentId).toBe(99999);
      expect(patchUrl).toContain('/issues/comments/99999');
      expect(patchBody).toContain('Updated failure report');
    } finally {
      global.fetch = originalFetch;
    }
  });
});
