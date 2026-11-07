import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import { verifyJwtToken, DEFAULT_DEV_JWT_SECRET } from '../src/server/middleware/auth.js';
import {
  generateSignedOAuthState,
  verifySignedOAuthState,
  createSessionToken,
} from '../src/lib/github/user-auth.js';
import { getInstallationToken } from '../src/lib/github/app-auth.js';

describe('Phase 12: Independent Authentication Verification (10-Point Suite)', () => {
  const secret = 'super-secret-jwt-token-with-at-least-32-chars-length';

  function createHs256Token(
    payload: any,
    header: any = { alg: 'HS256', typ: 'JWT' },
    signKey = secret
  ) {
    const h = Buffer.from(JSON.stringify(header)).toString('base64url');
    const p = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const sig = crypto.createHmac('sha256', signKey).update(`${h}.${p}`).digest('base64url');
    return `${h}.${p}.${sig}`;
  }

  // 1. Valid Supabase access token
  it('1. Valid Supabase access token (HS256) with valid sub, aud, and exp', () => {
    const token = createHs256Token({
      sub: '11111111-1111-1111-1111-111111111111',
      email: 'alex@hopper.io',
      aud: 'authenticated',
      iss: 'https://hopper-prod.supabase.co/auth/v1',
      role: 'authenticated',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });

    const decoded = verifyJwtToken(token, {
      secret,
      expectedAudience: 'authenticated',
      expectedIssuer: 'https://hopper-prod.supabase.co/auth/v1',
    });

    expect(decoded.sub).toBe('11111111-1111-1111-1111-111111111111');
    expect(decoded.email).toBe('alex@hopper.io');
    expect(decoded.role).toBe('authenticated');
  });

  // 2. Asymmetric signing support (RS256)
  it('2. Asymmetric token verification (RS256) using RSA public/private keypair', () => {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    const h = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
    const p = Buffer.from(
      JSON.stringify({
        sub: '22222222-2222-2222-2222-222222222222',
        aud: 'authenticated',
        exp: Math.floor(Date.now() / 1000) + 3600,
      })
    ).toString('base64url');

    const signer = crypto.createSign('RSA-SHA256');
    signer.update(`${h}.${p}`);
    const sig = signer.sign(privateKey).toString('base64url');
    const rsaToken = `${h}.${p}.${sig}`;

    const decoded = verifyJwtToken(rsaToken, {
      publicKey,
      expectedAudience: 'authenticated',
    });

    expect(decoded.sub).toBe('22222222-2222-2222-2222-222222222222');
  });

  // 3. Invalid signature
  it('3. Rejects token with invalid signature', () => {
    const token = createHs256Token(
      { sub: 'victim-user-id', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 },
      { alg: 'HS256', typ: 'JWT' },
      'attacker-forged-secret-key-123456789'
    );

    expect(() => verifyJwtToken(token, { secret })).toThrow(/Invalid JWT token signature/);
  });

  // 4. Expired token
  it('4. Rejects expired token beyond clock tolerance', () => {
    const token = createHs256Token({
      sub: 'user-id',
      aud: 'authenticated',
      exp: Math.floor(Date.now() / 1000) - 120, // 2 minutes ago
    });

    expect(() => verifyJwtToken(token, { secret, clockToleranceSeconds: 30 })).toThrow(/expired/i);
  });

  // 5. Incorrect issuer
  it('5. Rejects token with incorrect issuer (iss)', () => {
    const token = createHs256Token({
      sub: 'user-id',
      aud: 'authenticated',
      iss: 'https://evil-hacker-auth.com/auth/v1',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });

    expect(() =>
      verifyJwtToken(token, {
        secret,
        expectedIssuer: 'https://hopper-prod.supabase.co/auth/v1',
      })
    ).toThrow(/Invalid token issuer/);
  });

  // 6. Incorrect audience
  it('6. Rejects token with incorrect audience (aud)', () => {
    const token = createHs256Token({
      sub: 'user-id',
      aud: 'wrong_audience_service',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });

    expect(() =>
      verifyJwtToken(token, {
        secret,
        expectedAudience: 'authenticated',
      })
    ).toThrow(/Invalid token audience/);
  });

  // 7. Missing authorization header / empty token
  it('7. Rejects missing or empty token', () => {
    expect(() => verifyJwtToken('')).toThrow(/Missing or malformed JWT token/);
    expect(() => verifyJwtToken(null as any)).toThrow();
  });

  // 8. Malformed token structure
  it('8. Rejects malformed token (invalid dots, invalid base64)', () => {
    expect(() => verifyJwtToken('header.payload', { secret })).toThrow(/Malformed JWT token structure/);
    expect(() => verifyJwtToken('a.b.c.d', { secret })).toThrow(/Malformed JWT token structure/);
    expect(() => verifyJwtToken('not-json.not-json.not-json', { secret })).toThrow(/Malformed JWT header/);
  });

  // 9. Algorithm confusion: alg=none and unsupported algorithms
  it('9. Rejects alg=none and unsupported algorithms', () => {
    const hNone = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const p = Buffer.from(
      JSON.stringify({ sub: 'admin', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })
    ).toString('base64url');
    const noneToken = `${hNone}.${p}.`;

    expect(() => verifyJwtToken(noneToken, { secret })).toThrow(/Insecure JWT algorithm "none"/);

    const hBadAlg = Buffer.from(JSON.stringify({ alg: 'HS512', typ: 'JWT' })).toString('base64url');
    const badAlgToken = `${hBadAlg}.${p}.fake`;
    expect(() => verifyJwtToken(badAlgToken, { secret })).toThrow(/Unsupported JWT algorithm "HS512"/);
  });

  // 10. Identity propagation: sub claim is strictly required
  it('10. Rejects token missing sub claim and verifies identity propagation', () => {
    const tokenMissingSub = createHs256Token({
      aud: 'authenticated',
      email: 'attacker@hopper.local',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });

    expect(() => verifyJwtToken(tokenMissingSub, { secret })).toThrow(/does not contain a valid user identity/);
  });

  // 11. Production mode strictly rejects default development secret
  it('11. Strictly blocks default dev secret fallback when NODE_ENV is production', () => {
    const prevNodeEnv = process.env.NODE_ENV;
    const prevSupabaseSecret = process.env.SUPABASE_JWT_SECRET;
    const prevJwtSecret = process.env.JWT_SECRET;
    try {
      process.env.NODE_ENV = 'production';
      delete process.env.SUPABASE_JWT_SECRET;
      delete process.env.JWT_SECRET;

      const token = createHs256Token({
        sub: 'prod-user',
        aud: 'authenticated',
        exp: Math.floor(Date.now() / 1000) + 3600,
      });

      // Calling without an explicit secret option in production MUST fail fast
      expect(() => verifyJwtToken(token)).toThrow(/SUPABASE_JWT_SECRET must be explicitly configured in production/);
    } finally {
      process.env.NODE_ENV = prevNodeEnv;
      if (prevSupabaseSecret) process.env.SUPABASE_JWT_SECRET = prevSupabaseSecret;
      if (prevJwtSecret) process.env.JWT_SECRET = prevJwtSecret;
    }
  });

  // 12. Stateless Signed OAuth State Verification
  it('12. Validates signed, tamper-proof, timestamped serverless OAuth state parameter', () => {
    const testSecret = 'serverless-oauth-state-signing-secret-key-32';
    const state = generateSignedOAuthState(testSecret);

    expect(state).toContain('.');
    expect(state.split('.').length).toBe(3);

    // Valid state verification
    expect(verifySignedOAuthState(state, 600, testSecret)).toBe(true);

    // Tampered state verification
    const [nonce, ts, sig] = state.split('.');
    const tampered = `${nonce}.${ts}.badsignature1234567890abcdef`;
    expect(verifySignedOAuthState(tampered, 600, testSecret)).toBe(false);

    // Expired state verification
    const expiredTs = Math.floor(Date.now() / 1000) - 700; // 700s ago (> 600s maxAge)
    const expiredHmac = crypto.createHmac('sha256', testSecret).update(`${nonce}.${expiredTs}`).digest('hex');
    const expiredState = `${nonce}.${expiredTs}.${expiredHmac}`;
    expect(verifySignedOAuthState(expiredState, 600, testSecret)).toBe(false);
  });

  // 13. App installation token fail-closed behavior in production
  it('13. Strictly throws in production if GITHUB_APP_PRIVATE_KEY is missing or mock is attempted', async () => {
    const prevNodeEnv = process.env.NODE_ENV;
    const prevKey = process.env.GITHUB_APP_PRIVATE_KEY;
    try {
      process.env.NODE_ENV = 'production';
      delete process.env.GITHUB_APP_PRIVATE_KEY;

      await expect(getInstallationToken(12345, { mockToken: 'fake' })).rejects.toThrow(
        /Mock installation tokens are strictly prohibited in production/
      );

      await expect(getInstallationToken(12345)).rejects.toThrow(
        /GITHUB_APP_PRIVATE_KEY is required in production/
      );
    } finally {
      process.env.NODE_ENV = prevNodeEnv;
      if (prevKey) process.env.GITHUB_APP_PRIVATE_KEY = prevKey;
    }
  });

  // 14. Session token minting fails closed in production without secret
  it('14. createSessionToken strictly fails closed in production when JWT_SECRET is unset', () => {
    const prevNodeEnv = process.env.NODE_ENV;
    const prevSecret = process.env.JWT_SECRET;
    const prevSbSecret = process.env.SUPABASE_JWT_SECRET;
    try {
      process.env.NODE_ENV = 'production';
      delete process.env.JWT_SECRET;
      delete process.env.SUPABASE_JWT_SECRET;

      const dummyUser = {
        id: 12345,
        login: 'octocat',
        name: 'Mona Lisa Octocat',
        email: 'octo@github.com',
        avatarUrl: 'https://github.com/octocat.png',
        htmlUrl: 'https://github.com/octocat',
      };

      expect(() =>
        createSessionToken(dummyUser, 'u1', 'p1', 'ws1')
      ).toThrow(/JWT_SECRET or SUPABASE_JWT_SECRET must be explicitly configured in production/);
    } finally {
      process.env.NODE_ENV = prevNodeEnv;
      if (prevSecret) process.env.JWT_SECRET = prevSecret;
      if (prevSbSecret) process.env.SUPABASE_JWT_SECRET = prevSbSecret;
    }
  });
});
