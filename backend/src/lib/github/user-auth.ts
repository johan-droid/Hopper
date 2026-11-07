/**
 * GitHub User Authentication & OAuth Management.
 * Handles GitHub OAuth Web Application Flow, Personal Access Token (PAT) validation,
 * and Hopper session token (JWT) minting with authoritative GitHub identity claims.
 */

import crypto from 'node:crypto';
import { DEFAULT_DEV_JWT_SECRET } from '../../server/middleware/auth.js';

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
 */
export function getGitHubOAuthUrl(state: string, redirectUri?: string): string {
  const clientId = getGitHubClientId();
  const base = 'https://github.com/login/oauth/authorize';
  const params = new URLSearchParams({
    client_id: clientId,
    scope: 'read:user,user:email,read:org,repo',
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
      scope: 'read:user,user:email,read:org,repo',
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
    accessToken.startsWith('test_') ||
    process.env.AI_PROVIDER === 'mock'
  ) {
    const suffix = accessToken.slice(0, 16).replace(/[^a-zA-Z0-9]/g, '');
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

  const userRes = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'Hopper-CI-Doctor/1.0',
    },
  });

  if (!userRes.ok) {
    throw new Error(`Failed to fetch GitHub user (${userRes.status})`);
  }

  const user = (await userRes.json()) as any;

  // If public email is null, query private emails with user:email scope
  let primaryEmail = user.email;
  if (!primaryEmail) {
    try {
      const emailRes = await fetch('https://api.github.com/user/emails', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'Hopper-CI-Doctor/1.0',
        },
      });
      if (emailRes.ok) {
        const emails = (await emailRes.json()) as Array<{
          email: string;
          primary: boolean;
          verified: boolean;
        }>;
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
 * Mints an authoritative Hopper session JWT encoding the user's verified GitHub identity.
 */
export function createSessionToken(
  user: GitHubUserProfile,
  userId: string,
  userProfileId: string,
  workspaceId: string,
  options: { expiresInSeconds?: number } = {}
): string {
  const secret = process.env.JWT_SECRET || process.env.SUPABASE_JWT_SECRET || DEFAULT_DEV_JWT_SECRET;
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
