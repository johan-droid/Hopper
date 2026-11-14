import { Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';
import { ApiError } from './error-handler.js';
import { UserProfileRepository } from '../../db/repositories/user-profile.repository.js';

export interface AuthenticatedUser {
  id: string;
  email?: string;
  role?: string;
  login?: string;
  github_user_id?: number;
  avatar_url?: string;
  app_metadata?: Record<string, any>;
  user_metadata?: Record<string, any>;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      userProfileId?: string;
    }
  }
}

export interface JwtVerificationOptions {
  secret?: string;
  publicKey?: string;
  expectedIssuer?: string;
  expectedAudience?: string;
  clockToleranceSeconds?: number;
}

export const DEFAULT_DEV_JWT_SECRET = 'hopper-dev-secret-key-at-least-32-bytes-long-for-hmac-sha256';

/**
 * Validates and decodes a Supabase JWT token according to RFC 7519 / RFC 7515 standards.
 * Supports HS256, RS256, and ES256 with strict claim enforcement.
 */
export function verifyJwtToken(token: string, options: JwtVerificationOptions = {}): any {
  if (!token || typeof token !== 'string') {
    throw ApiError.unauthorized('Missing or malformed JWT token');
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    throw ApiError.unauthorized('Malformed JWT token structure: expected 3 dot-separated segments');
  }

  const [headerB64, payloadB64, signatureB64] = parts;

  // 1. Parse header
  let header: { alg?: string; typ?: string };
  try {
    header = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf8'));
  } catch (_e) {
    throw ApiError.unauthorized('Malformed JWT header: invalid Base64URL JSON');
  }

  if (!header.alg || typeof header.alg !== 'string') {
    throw ApiError.unauthorized('JWT header missing required "alg" parameter');
  }

  // 2. Reject insecure or unsupported algorithms
  const alg = header.alg.toUpperCase();
  if (alg === 'NONE') {
    throw ApiError.unauthorized('Insecure JWT algorithm "none" is strictly forbidden');
  }

  const allowedAlgs = ['HS256', 'RS256', 'ES256'];
  if (!allowedAlgs.includes(alg)) {
    throw ApiError.unauthorized(`Unsupported JWT algorithm "${header.alg}". Expected one of: ${allowedAlgs.join(', ')}`);
  }

  // 3. Cryptographic signature verification
  const signingInput = `${headerB64}.${payloadB64}`;
  const signatureBuffer = Buffer.from(signatureB64, 'base64url');

  if (alg === 'HS256') {
    const isProduction = process.env.NODE_ENV === 'production';
    const configuredSecret = options.secret || process.env.JWT_SECRET || process.env.SUPABASE_JWT_SECRET;

    if (isProduction && (!configuredSecret || configuredSecret === DEFAULT_DEV_JWT_SECRET)) {
      throw ApiError.internal('JWT verification failed: JWT_SECRET or SUPABASE_JWT_SECRET must be explicitly configured in production environments');
    }

    const secret = configuredSecret || DEFAULT_DEV_JWT_SECRET;
    if (!secret) {
      throw ApiError.internal('JWT verification failed: JWT_SECRET is not configured');
    }

    const calculatedSig = crypto.createHmac('sha256', secret).update(signingInput).digest();

    if (
      signatureBuffer.length !== calculatedSig.length ||
      !crypto.timingSafeEqual(signatureBuffer, calculatedSig)
    ) {
      throw ApiError.unauthorized('Invalid JWT token signature');
    }
  } else if (alg === 'RS256' || alg === 'ES256') {
    const publicKey = options.publicKey || process.env.SUPABASE_JWT_PUBLIC_KEY;
    if (!publicKey) {
      throw ApiError.internal(`JWT verification failed: Public key for ${alg} is not configured`);
    }

    const verifier = crypto.createVerify(alg === 'RS256' ? 'RSA-SHA256' : 'SHA256');
    verifier.update(signingInput);
    const isValid = verifier.verify(publicKey, signatureBuffer);

    if (!isValid) {
      throw ApiError.unauthorized(`Invalid ${alg} signature`);
    }
  }

  // 4. Parse payload
  let payload: any;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch (_e) {
    throw ApiError.unauthorized('Malformed JWT payload: invalid Base64URL JSON');
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const tolerance = options.clockToleranceSeconds ?? 60;

  // 5. Expiration check (exp)
  if (payload.exp !== undefined) {
    if (typeof payload.exp !== 'number' || payload.exp + tolerance < nowSec) {
      throw ApiError.unauthorized('JWT token has expired');
    }
  }

  // 6. Not Before check (nbf)
  if (payload.nbf !== undefined) {
    if (typeof payload.nbf !== 'number' || payload.nbf - tolerance > nowSec) {
      throw ApiError.unauthorized('JWT token is not active yet (nbf)');
    }
  }

  // 7. Audience check (aud)
  const expectedAud = options.expectedAudience ?? 'authenticated';
  if (expectedAud) {
    const tokenAud = payload.aud;
    const audMatches = Array.isArray(tokenAud)
      ? tokenAud.includes(expectedAud)
      : tokenAud === expectedAud;

    if (!audMatches) {
      throw ApiError.unauthorized(`Invalid token audience: expected "${expectedAud}", got "${tokenAud}"`);
    }
  }

  // 8. Issuer check (iss)
  if (options.expectedIssuer) {
    if (payload.iss && payload.iss !== options.expectedIssuer) {
      throw ApiError.unauthorized(`Invalid token issuer: expected "${options.expectedIssuer}", got "${payload.iss}"`);
    }
  } else if (payload.iss) {
    const allowedIssuers = new Set<string>([
      'https://hopper.dev',
      'http://localhost:3000',
    ]);
    if (process.env.APP_URL) allowedIssuers.add(process.env.APP_URL);
    if (process.env.SUPABASE_URL) allowedIssuers.add(`${process.env.SUPABASE_URL}/auth/v1`);
    if (process.env.NEXT_PUBLIC_SUPABASE_URL) allowedIssuers.add(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1`);

    if (!allowedIssuers.has(payload.iss)) {
      throw ApiError.unauthorized(`Invalid token issuer: got "${payload.iss}"`);
    }
  }

  // 9. Subject identity check (sub)
  if (!payload.sub || typeof payload.sub !== 'string' || payload.sub.trim().length === 0) {
    throw ApiError.unauthorized('JWT token does not contain a valid user identity (sub claim)');
  }

  return payload;
}

export function extractAuthToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }

  // Check parsed cookies if cookie-parser is installed
  if ((req as any).cookies?.hopper_session) {
    return (req as any).cookies.hopper_session;
  }

  // Parse Cookie header directly (zero-dependency serverless compatibility)
  if (req.headers.cookie) {
    const match = req.headers.cookie.match(/(?:^|;\s*)hopper_session=([^;]+)/);
    if (match) {
      return decodeURIComponent(match[1]);
    }
  }

  return null;
}

/**
 * Authentication Middleware.
 * Enforces valid Hopper / Supabase JWT token via Authorization Bearer header
 * or secure same-origin HttpOnly `hopper_session` cookie.
 * Never accepts unverified payloads or spoofed headers.
 */
export function requireAuth(userProfileRepo?: UserProfileRepository) {
  const profileRepo = userProfileRepo || new UserProfileRepository();

  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const token = extractAuthToken(req);

      if (!token) {
        throw ApiError.unauthorized('Missing or malformed Authorization header');
      }

      const payload = verifyJwtToken(token);

      req.user = {
        id: payload.sub,
        email: payload.email,
        role: payload.role || 'authenticated',
        login: payload.login || payload.user_metadata?.user_name || (payload.email ? payload.email.split('@')[0] : 'user'),
        github_user_id: payload.github_user_id,
        avatar_url: payload.avatar_url || payload.user_metadata?.avatar_url,
        app_metadata: payload.app_metadata,
        user_metadata: payload.user_metadata,
      };

      // Resolve linked UserProfile ID if available, or auto-upsert
      try {
        let profile = payload.profile_id ? await profileRepo.findById(payload.profile_id) : null;
        if (!profile) {
          profile = await profileRepo.findByUserId(payload.sub);
        }
        if (!profile && req.user.login) {
          profile = await profileRepo.findByUsername(req.user.login);
        }
        if (!profile) {
          profile = await profileRepo.upsert({
            userId: payload.sub,
            username: req.user.login,
            fullName: payload.name || req.user.login,
            avatarUrl: req.user.avatar_url,
          });
        }
        if (profile) {
          req.userProfileId = profile.id;
        }
      } catch (_dbErr) {
        // Tolerant to offline/unseeded database
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Optional Authentication Middleware.
 * Decodes user token if provided, but does not block if unauthenticated.
 */
export function optionalAuth() {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const token = extractAuthToken(req);
    if (token) {
      try {
        const payload = verifyJwtToken(token);
        if (payload.sub) {
          req.user = {
            id: payload.sub,
            email: payload.email,
            role: payload.role || 'authenticated',
            login: payload.login || (payload.email ? payload.email.split('@')[0] : 'user'),
            github_user_id: payload.github_user_id,
            avatar_url: payload.avatar_url,
          };
        }
      } catch (_err) {
        // Discard invalid token in optional mode
      }
    }
    next();
  };
}
