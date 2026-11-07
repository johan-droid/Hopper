/**
 * GitHub App Authentication & Installation Token Management.
 * Handles HMAC-SHA256 webhook verification, RS256 JWT generation for GitHub App authentication,
 * and scoped installation access token minting with caching.
 */

import crypto from 'node:crypto';

// Token cache: maps installationId -> { token: string, expiresAt: number }
const installationTokenCache = new Map<number, { token: string; expiresAt: number }>();
let mockInstallationToken: string | null = null;

export function setMockInstallationToken(token: string | null): void {
  mockInstallationToken = token;
}

export function clearTokenCache(): void {
  installationTokenCache.clear();
  mockInstallationToken = null;
}

/**
 * Validates HMAC-SHA256 signature using timingSafeEqual to prevent timing attacks.
 */
export function verifyGitHubWebhookSignature(
  payloadRaw: string | Buffer,
  signatureHeader: string | undefined,
  secret: string
): boolean {
  if (!signatureHeader || !secret) {
    return false;
  }

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

/**
 * Generates an RS256 signed JWT for GitHub App authentication.
 * Max validity is 10 minutes as mandated by GitHub.
 */
export function generateAppJwt(
  appId?: string,
  privateKeyPem?: string
): string {
  const id = appId || process.env.GITHUB_APP_ID || '1029384';
  const privateKey = privateKeyPem || process.env.GITHUB_APP_PRIVATE_KEY;

  if (!privateKey) {
    throw new Error('GITHUB_APP_PRIVATE_KEY is required to generate GitHub App JWT');
  }

  // Handle escaped newlines in environment variable
  const normalizedKey = privateKey.includes('\\n')
    ? privateKey.replace(/\\n/g, '\n')
    : privateKey;

  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      iat: now - 60, // 60s in the past for clock drift
      exp: now + 10 * 60, // 10 minutes max
      iss: id,
    })
  ).toString('base64url');

  const signer = crypto.createSign('RSA-SHA256');
  signer.update(`${header}.${payload}`);
  const signature = signer.sign(normalizedKey, 'base64url');

  return `${header}.${payload}.${signature}`;
}

/**
 * Mints or retrieves a cached GitHub App Installation Access Token.
 * Tokens are cached in-memory and renewed 5 minutes prior to expiration.
 */
export async function getInstallationToken(
  installationId: number,
  options: { forceRefresh?: boolean; mockToken?: string } = {}
): Promise<string> {
  const isProduction = process.env.NODE_ENV === 'production';
  const now = Date.now();
  const explicitMock = options.mockToken || mockInstallationToken;

  if (explicitMock) {
    if (isProduction) {
      throw new Error('FATAL: Mock installation tokens are strictly prohibited in production');
    }
    installationTokenCache.set(installationId, {
      token: explicitMock,
      expiresAt: now + 50 * 60 * 1000,
    });
    return explicitMock;
  }

  const cached = installationTokenCache.get(installationId);

  // Use cached token if valid for at least 5 more minutes
  if (!options.forceRefresh && cached && cached.expiresAt > now + 5 * 60 * 1000) {
    return cached.token;
  }

  // If in mock AI provider mode without real keys in development, return deterministic synthetic token
  if (process.env.AI_PROVIDER === 'mock' || !process.env.GITHUB_APP_PRIVATE_KEY) {
    if (isProduction) {
      throw new Error('FATAL: GITHUB_APP_PRIVATE_KEY is required in production to mint GitHub App installation tokens');
    }
    const syntheticToken = `ghs_mock_installation_token_${installationId}_${now}`;
    installationTokenCache.set(installationId, {
      token: syntheticToken,
      expiresAt: now + 50 * 60 * 1000,
    });
    return syntheticToken;
  }

  try {
    const appJwt = generateAppJwt();
    const response = await fetch(
      `https://api.github.com/app/installations/${installationId}/access_tokens`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${appJwt}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'Hopper-CI-Doctor/1.0',
        },
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`GitHub token minting failed (${response.status}): ${errText}`);
    }

    const data = (await response.json()) as { token: string; expires_at: string };
    const expiresAt = new Date(data.expires_at).getTime();

    installationTokenCache.set(installationId, {
      token: data.token,
      expiresAt,
    });

    return data.token;
  } catch (err: any) {
    if (isProduction) {
      throw err;
    }
    // If request fails in development, fallback to synthetic token
    const fallbackToken = `ghs_fallback_token_${installationId}`;
    installationTokenCache.set(installationId, {
      token: fallbackToken,
      expiresAt: now + 15 * 60 * 1000,
    });
    return fallbackToken;
  }
}
