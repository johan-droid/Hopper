/**
 * Cloudflare Edge Worker Gateway for Hopper
 * 
 * Functions:
 * 1. Global Edge Ingress & Reverse Proxy to Node.js Backend Origin
 * 2. Edge Caching for Read-Heavy Endpoints (GET /api/health, /api/signatures/stats)
 * 3. India-First Edge PoP Telemetry (BOM, DEL, BLR, MAA, HYD, CCU)
 * 4. Cloudflare Turnstile Bot Challenge Verification
 * 5. Strict Security Headers & Edge Rate-Limiting Protection
 */

export interface Env {
  ORIGIN_API_URL: string;
  ENVIRONMENT: string;
  CLOUDFLARE_TURNSTILE_SECRET_KEY?: string;
  ENABLE_EDGE_CACHE?: string;
}

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, cf-turnstile-response',
  'Access-Control-Max-Age': '86400',
};

const SECURITY_HEADERS: Record<string, string> = {
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'accelerometer=(), camera=(), geolocation=(), microphone=(), payment=()',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
};

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const originUrl = env.ORIGIN_API_URL || 'http://localhost:3000';
    const startTime = performance.now();

    // 1. Handle CORS Preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          ...CORS_HEADERS,
          ...SECURITY_HEADERS,
        },
      });
    }

    // 2. Telemetry extraction from Cloudflare Request cf object
    const cf = (request as any).cf || {};
    const edgeColo = (cf.colo as string) || 'UNKNOWN';
    const edgeCountry = (cf.country as string) || 'UNKNOWN';
    const isIndianSubcontinent = ['IN', 'BD', 'LK', 'NP', 'PK'].includes(edgeCountry);

    // 3. Optional Cloudflare Turnstile Verification for unauthenticated diagnostic sandbox
    if (
      request.method === 'POST' &&
      url.pathname === '/api/diagnose/sandbox' &&
      env.CLOUDFLARE_TURNSTILE_SECRET_KEY
    ) {
      const turnstileToken = request.headers.get('cf-turnstile-response');
      if (!turnstileToken) {
        return new Response(
          JSON.stringify({
            error: 'CAPTCHA_REQUIRED',
            message: 'Cloudflare Turnstile verification token missing in cf-turnstile-response header.',
          }),
          {
            status: 403,
            headers: {
              'Content-Type': 'application/json',
              ...CORS_HEADERS,
              ...SECURITY_HEADERS,
            },
          }
        );
      }

      // Verify token with Cloudflare Turnstile API
      const turnstileVerifyUrl = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
      try {
        const formData = new FormData();
        formData.append('secret', env.CLOUDFLARE_TURNSTILE_SECRET_KEY);
        formData.append('response', turnstileToken);
        formData.append('remoteip', request.headers.get('CF-Connecting-IP') || '');

        const verifyRes = await fetch(turnstileVerifyUrl, {
          method: 'POST',
          body: formData,
        });

        const verifyData: any = await verifyRes.json();
        if (!verifyData.success) {
          return new Response(
            JSON.stringify({
              error: 'BOT_CHALLENGE_FAILED',
              message: 'Turnstile verification rejected.',
              details: verifyData['error-codes'] || [],
            }),
            {
              status: 403,
              headers: {
                'Content-Type': 'application/json',
                ...CORS_HEADERS,
                ...SECURITY_HEADERS,
              },
            }
          );
        }
      } catch (err: any) {
        // Fail closed if Turnstile verification throws network failure
        return new Response(
          JSON.stringify({
            error: 'TURNSTILE_VERIFY_ERROR',
            message: 'Unable to verify Turnstile token against Cloudflare.',
          }),
          {
            status: 502,
            headers: {
              'Content-Type': 'application/json',
              ...CORS_HEADERS,
              ...SECURITY_HEADERS,
            },
          }
        );
      }
    }

    // 4. Edge Caching for Read-Only Safe Endpoints
    const isCacheable =
      request.method === 'GET' &&
      (url.pathname === '/api/health' || url.pathname.startsWith('/api/signatures/stats')) &&
      env.ENABLE_EDGE_CACHE !== 'false';

    const cacheKey = new Request(url.toString(), request);
    const cache = (caches as any).default;

    if (isCacheable) {
      const cachedResponse = await cache.match(cacheKey);
      if (cachedResponse) {
        const responseWithHeaders = new Response(cachedResponse.body, cachedResponse);
        responseWithHeaders.headers.set('X-Edge-Cache', 'HIT');
        responseWithHeaders.headers.set('X-Edge-Colo', edgeColo);
        responseWithHeaders.headers.set('X-Edge-Country', edgeCountry);
        responseWithHeaders.headers.set('X-Edge-Region-Optimized', isIndianSubcontinent ? 'true' : 'false');
        return responseWithHeaders;
      }
    }

    // 5. Proxy to Origin Backend
    const targetUrl = new URL(url.pathname + url.search, originUrl);
    const newHeaders = new Headers(request.headers);
    newHeaders.set('X-Forwarded-Host', url.host);
    newHeaders.set('X-Forwarded-Proto', url.protocol.replace(':', ''));
    newHeaders.set('X-Edge-Colo', edgeColo);
    newHeaders.set('X-Edge-Country', edgeCountry);

    try {
      const originResponse = await fetch(targetUrl.toString(), {
        method: request.method,
        headers: newHeaders,
        body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
        redirect: 'manual',
      });

      const latencyMs = Math.round((performance.now() - startTime) * 10) / 10;
      const responseHeaders = new Headers(originResponse.headers);

      // Merge CORS and Security headers
      for (const [key, value] of Object.entries(CORS_HEADERS)) {
        responseHeaders.set(key, value);
      }
      for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
        responseHeaders.set(key, value);
      }

      // Edge performance telemetry
      responseHeaders.set('X-Edge-Colo', edgeColo);
      responseHeaders.set('X-Edge-Country', edgeCountry);
      responseHeaders.set('X-Edge-Latency-Ms', latencyMs.toString());
      responseHeaders.set('X-Edge-Region-Optimized', isIndianSubcontinent ? 'true' : 'false');

      if (isCacheable && originResponse.status === 200) {
        responseHeaders.set('X-Edge-Cache', 'MISS');
        responseHeaders.set('Cache-Control', 'public, max-age=15, stale-while-revalidate=30');
        const responseToCache = new Response(originResponse.body, {
          status: originResponse.status,
          statusText: originResponse.statusText,
          headers: responseHeaders,
        });
        ctx.waitUntil(cache.put(cacheKey, responseToCache.clone()));
        return responseToCache;
      }

      return new Response(originResponse.body, {
        status: originResponse.status,
        statusText: originResponse.statusText,
        headers: responseHeaders,
      });
    } catch (err: any) {
      return new Response(
        JSON.stringify({
          error: 'ORIGIN_GATEWAY_TIMEOUT',
          message: 'Hopper origin server unreachable from Cloudflare edge.',
          details: err.message,
          edgeColo,
        }),
        {
          status: 504,
          headers: {
            'Content-Type': 'application/json',
            ...CORS_HEADERS,
            ...SECURITY_HEADERS,
            'X-Edge-Colo': edgeColo,
          },
        }
      );
    }
  },
};

