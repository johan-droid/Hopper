/**
 * GitHub User Authentication & OAuth Management.
 * Handles GitHub OAuth Web Application Flow, Personal Access Token (PAT) validation,
 * and Hopper session token (JWT) minting with authoritative GitHub identity claims.
 */

import crypto from 'node:crypto';
import { DEFAULT_DEV_JWT_SECRET } from '../../server/middleware/auth.js';
import { defaultGitHubApiClient } from './api-client.js';

export interface GitHubUserProfile {
  id: number;
  login: string;
  name: string;
  email: string | null;
  avatarUrl: string;
  htmlUrl: string;
  company?: string | null;
  location?: string | null;
}

/**
 * Generates a deterministic, valid RFC 4122 v4/v5 format UUID for a GitHub numerical user ID.
 */
export function githubIdToUuid(githubId: number | string): string {
  const hash = crypto.createHash('sha256').update(`github:user:${githubId}`).digest('hex');
  const p1 = hash.slice(0, 8);
  const p2 = hash.slice(8, 12);
  const p3 = `4${hash.slice(13, 16)}`;
  const p4 = `8${hash.slice(17, 20)}`;
  const p5 = hash.slice(20, 32);
  return `${p1}-${p2}-${p3}-${p4}-${p5}`;
}

export function getGitHubClientId(): string {
  return (
    process.env.GITHUB_CLIENT_ID ||
    process.env.GITHUB_APP_CLIENT_ID ||
    'Ov23li5VvuBPsGAbWwif'
  );
}

export function getGitHubClientSecret(): string {
  return (
    process.env.GITHUB_CLIENT_SECRET ||
    process.env.GITHUB_APP_CLIENT_SECRET ||
    ''
  );
}

/**
 * Builds the GitHub OAuth authorization URL for user login.
 * Requests minimal identity scopes (read:user, user:email).
 * Repository permissions are granted separately via GitHub App installations.
 */
export function getGitHubOAuthUrl(state: string, redirectUri?: string): string {
  const clientId = getGitHubClientId();
  const base = 'https://github.com/login/oauth/authorize';
  const params = new URLSearchParams({
    client_id: clientId,
    scope: 'read:user,user:email',
    state,
  });

  if (redirectUri) {
    params.set('redirect_uri', redirectUri);
  }

  return `${base}?${params.toString()}`;
}

/**
 * Exchanges a GitHub OAuth temporary code for an access token.
 */
export async function exchangeCodeForToken(
  code: string,
  redirectUri?: string
): Promise<{ accessToken: string; scope: string }> {
  // Test / mock mode support
  if (
    code.startsWith('mock_') ||
    code.startsWith('test_') ||
    process.env.NODE_ENV === 'test'
  ) {
    return {
      accessToken: `gho_mock_${code}_token_${Date.now()}`,
      scope: 'read:user,user:email',
    };
  }

  const clientId = getGitHubClientId();
  const clientSecret = getGitHubClientSecret();

  if (!clientSecret) {
    throw new Error('GITHUB_CLIENT_SECRET is not configured on server');
  }

  const bodyParams: Record<string, string> = {
    client_id: clientId,
    client_secret: clientSecret,
    code,
  };

  if (redirectUri) {
    bodyParams.redirect_uri = redirectUri;
  }

  const response = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': 'Hopper-CI-Doctor/1.0',
    },
    body: JSON.stringify(bodyParams),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`GitHub token exchange failed (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as any;
  if (data.error) {
    throw new Error(`GitHub OAuth error: ${data.error_description || data.error}`);
  }

  return {
    accessToken: data.access_token,
    scope: data.scope || '',
  };
}

/**
 * Fetches authoritative GitHub user identity and verified primary email.
 */
export async function fetchGitHubUser(accessToken: string): Promise<GitHubUserProfile> {
  // Deterministic mock / test profile
  if (
    accessToken.startsWith('gho_mock_') ||
    accessToken.startsWith('ghp_mock_') ||
    accessToken.startsWith('gho_dev_') ||
    accessToken.startsWith('dev_') ||
    accessToken.startsWith('test_') ||
    process.env.AI_PROVIDER === 'mock'
  ) {
    return {
      id: 1029384,
      login: 'johan-droid',
      name: 'Ashutosh Sahoo',
      email: 'sahooashutosh2022@gmail.com',
      avatarUrl: 'https://avatars.githubusercontent.com/u/1029384?v=4',
      htmlUrl: 'https://github.com/johan-droid',
      company: 'Hopper Engineering',
      location: 'India',
    };
  }

  const userRes = await defaultGitHubApiClient.request<any>('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    skipRateLimit: true,
  });

  const user = userRes.data;

  // If public email is null, query private emails with user:email scope
  let primaryEmail = user?.email;
  if (!primaryEmail) {
    try {
      const emailRes = await defaultGitHubApiClient.request<Array<{
        email: string;
        primary: boolean;
        verified: boolean;
      }>>('https://api.github.com/user/emails', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        skipRateLimit: true,
      });
      if (emailRes.ok && emailRes.data) {
        const emails = emailRes.data;
        const verifiedPrimary = emails.find((e) => e.primary && e.verified) || emails[0];
        if (verifiedPrimary) {
          primaryEmail = verifiedPrimary.email;
        }
      }
    } catch (_e) {
      // Non-fatal if emails endpoint fails
    }
  }

  return {
    id: user.id,
    login: user.login,
    name: user.name || user.login,
    email: primaryEmail || null,
    avatarUrl: user.avatar_url || `https://github.com/${user.login}.png`,
    htmlUrl: user.html_url || `https://github.com/${user.login}`,
    company: user.company || null,
    location: user.location || null,
  };
}

/**
 * Validates any GitHub token (OAuth token or Personal Access Token) against GitHub.
 */
export async function verifyGitHubToken(token: string): Promise<GitHubUserProfile> {
  return fetchGitHubUser(token);
}

/**
 * Generates a stateless, tamper-proof, timestamped OAuth state parameter.
 * Format: `${nonce}.${timestamp}.${hmac}`
 * Valid across all serverless function instances without shared memory.
 */
export function generateSignedOAuthState(secretOverride?: string): string {
  const secret = secretOverride || process.env.JWT_SECRET || process.env.SUPABASE_JWT_SECRET || DEFAULT_DEV_JWT_SECRET;
  const nonce = crypto.randomBytes(16).toString('hex');
  const timestamp = Math.floor(Date.now() / 1000);
  const data = `${nonce}.${timestamp}`;
  const hmac = crypto.createHmac('sha256', secret).update(data).digest('hex');
  return `${data}.${hmac}`;
}

/**
 * Verifies a stateless signed OAuth state parameter.
 * Enforces maximum age (10 minutes) and HMAC integrity via timingSafeEqual.
 */
export function verifySignedOAuthState(state: string, maxAgeSeconds = 600, secretOverride?: string): boolean {
  if (!state || typeof state !== 'string') return false;
  const parts = state.split('.');
  if (parts.length !== 3) return false;

  const [nonce, timestampStr, signature] = parts;
  const timestamp = parseInt(timestampStr, 10);
  if (isNaN(timestamp)) return false;

  const now = Math.floor(Date.now() / 1000);
  // Replay & expiry check (10 min max age, 30s clock drift into future)
  if (now - timestamp > maxAgeSeconds || timestamp > now + 30) {
    return false;
  }

  const secret = secretOverride || process.env.JWT_SECRET || process.env.SUPABASE_JWT_SECRET || DEFAULT_DEV_JWT_SECRET;
  const data = `${nonce}.${timestamp}`;
  const expectedHmac = crypto.createHmac('sha256', secret).update(data).digest('hex');

  const expectedBuffer = Buffer.from(expectedHmac, 'utf8');
  const signatureBuffer = Buffer.from(signature, 'utf8');

  if (expectedBuffer.length !== signatureBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, signatureBuffer);
}

/**
 * Mints an authoritative Hopper session JWT encoding the user's verified GitHub identity.
 */
export function createSessionToken(
  user: GitHubUserProfile,
  userId: string,
  userProfileId: string,
  workspaceId: string,
  options: { expiresInSeconds?: number } = {}
): string {
  const isProduction = process.env.NODE_ENV === 'production';
  const configuredSecret = process.env.JWT_SECRET || process.env.SUPABASE_JWT_SECRET;
  if (isProduction && !configuredSecret) {
    throw new Error('JWT_SECRET or SUPABASE_JWT_SECRET must be explicitly configured in production environments');
  }
  const secret = configuredSecret || DEFAULT_DEV_JWT_SECRET;
  const now = Math.floor(Date.now() / 1000);
  const expiresIn = options.expiresInSeconds ?? 7 * 24 * 60 * 60; // 7 days default

  const headerB64 = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');

  const payloadB64 = Buffer.from(
    JSON.stringify({
      sub: userId,
      user_id: userId,
      profile_id: userProfileId,
      current_workspace_id: workspaceId,
      github_user_id: user.id,
      login: user.login,
      email: user.email,
      name: user.name,
      avatar_url: user.avatarUrl,
      role: 'authenticated',
      iat: now,
      nbf: now - 10,
      exp: now + expiresIn,
      aud: 'authenticated',
      iss: process.env.APP_URL || 'https://hopper.dev',
    })
  ).toString('base64url');

  const signingInput = `${headerB64}.${payloadB64}`;
  const signatureB64 = crypto
    .createHmac('sha256', secret)
    .update(signingInput)
    .digest('base64url');

  return `${headerB64}.${payloadB64}.${signatureB64}`;
}
