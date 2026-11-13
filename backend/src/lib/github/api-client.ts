/**
 * Centralized GitHub API Client.
 *
 * All outgoing GitHub HTTP requests must route through this client.
 * Features:
 *   - Pre-flight admission coordination with GitHubRateLimiter.
 *   - Post-response header synchronization (X-RateLimit-*).
 *   - Secondary throttling detection (HTTP 403 abuse/secondary rate limit & HTTP 429).
 *   - Bounded exponential backoff + jitter for transient 5xx & network errors.
 *   - Redirect security: strips Authorization headers when following redirects to external hosts (e.g., S3).
 *   - SSRF protection: validates allowable hostnames.
 *   - Bounded streaming and size limits for log content.
 */

import { GitHubRateLimiter, RequestPriority } from './rate-limiter.js';

export interface GitHubRequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  body?: string | Record<string, any>;
  installationId?: number;
  resource?: 'core' | 'search' | 'graphql' | 'actions';
  priority?: RequestPriority;
  timeoutMs?: number;
  maxRetries?: number;
  maxBytes?: number;
  skipRateLimit?: boolean;
}

export interface GitHubResponse<T = any> {
  status: number;
  ok: boolean;
  headers: Headers;
  data: T;
  rawText?: string;
}

export class GitHubApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly statusText: string,
    public readonly responseBody: string,
    public readonly headers: Headers,
    public readonly isRetryable: boolean = false,
    public readonly isThrottled: boolean = false
  ) {
    super(`GitHub API Error (${status} ${statusText}): ${responseBody.slice(0, 300)}`);
    this.name = 'GitHubApiError';
  }
}

export class GitHubApiClient {
  private static defaultLimiter: GitHubRateLimiter = new GitHubRateLimiter();

  constructor(private rateLimiter: GitHubRateLimiter = GitHubApiClient.defaultLimiter) {}

  /**
   * Dispatches an HTTP request to the GitHub REST API with rate-limit admission,
   * retry management, and redirect protection.
   */
  async request<T = any>(url: string, options: GitHubRequestOptions = {}): Promise<GitHubResponse<T>> {
    const method = options.method || 'GET';
    const resource = options.resource || 'core';
    const priority = options.priority ?? RequestPriority.TIER_1_CRITICAL;
    const timeoutMs = options.timeoutMs ?? 20_000;
    const maxRetries = options.maxRetries ?? 3;
    const installationId = options.installationId;

    // Validate hostname to prevent SSRF
    this.validateTargetHost(url);

    // 1. Coordinate rate-limit admission if installationId is provided
    if (installationId && !options.skipRateLimit) {
      const admission = await this.rateLimiter.checkAdmission(installationId, resource, priority);
      if (!admission.allowed) {
        throw new GitHubApiError(
          429,
          'Rate Limit Throttled',
          `Request rejected by rate-limit coordinator: ${admission.reason}. Must wait ${admission.waitMs}ms.`,
          new Headers(),
          true,
          true
        );
      }
    }

    const defaultHeaders: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'Hopper-CI-Doctor/1.0',
    };

    if (options.body && typeof options.body === 'object' && !(options.body instanceof String)) {
      defaultHeaders['Content-Type'] = 'application/json';
    }

    const requestHeaders = { ...defaultHeaders, ...(options.headers || {}) };
    const requestBody =
      typeof options.body === 'object' ? JSON.stringify(options.body) : options.body;

    let attempt = 0;
    let lastError: any = null;

    while (attempt <= maxRetries) {
      try {
        const response = await this.executeWithRedirectHandling(
          url,
          method,
          requestHeaders,
          requestBody,
          timeoutMs
        );

        // Record rate-limit headers
        if (installationId) {
          await this.rateLimiter.recordResponse(
            installationId,
            resource,
            response.status,
            response.headers
          );
        }

        // Check for secondary throttling or rate-limit exhaustion
        if (response.status === 429 || (response.status === 403 && (await this.isSecondaryThrottle(response)))) {
          const retryAfterSec = this.parseRetryAfter(response.headers);
          if (installationId) {
            await this.rateLimiter.recordSecondaryThrottle(installationId, resource, retryAfterSec);
          }
          const text = await response.text();
          throw new GitHubApiError(
            response.status,
            response.statusText,
            text,
            response.headers,
            true,
            true
          );
        }

        // Retryable server errors (500, 502, 503, 504)
        if ([500, 502, 503, 504].includes(response.status)) {
          const text = await response.text();
          throw new GitHubApiError(
            response.status,
            response.statusText,
            text,
            response.headers,
            true,
            false
          );
        }

        // Non-retryable client errors (4xx)
        if (!response.ok) {
          const text = await response.text();
          throw new GitHubApiError(
            response.status,
            response.statusText,
            text,
            response.headers,
            false,
            false
          );
        }

        // Handle success response
        let data: T;
        const respHeaders =
          response.headers instanceof Headers
            ? response.headers
            : new Headers((response.headers as any) || {});
        const contentType = respHeaders.get('content-type') || 'application/json';
        if (contentType.includes('application/json')) {
          data = (await response.json()) as T;
          return {
            status: response.status,
            ok: response.ok,
            headers: respHeaders,
            data,
          };
        } else {
          let text = await response.text();
          if (options.maxBytes && text.length > options.maxBytes) {
            text = text.slice(0, options.maxBytes) + '\n\n... [TRUNCATED]';
          }
          return {
            status: response.status,
            ok: response.ok,
            headers: respHeaders,
            data: text as unknown as T,
            rawText: text,
          };
        }
      } catch (err: any) {
        lastError = err;

        const isRetryable =
          err.isRetryable ||
          err.code === 'ECONNRESET' ||
          err.code === 'ETIMEDOUT' ||
          err.name === 'TimeoutError' ||
          err.name === 'AbortError';

        // Do not retry non-retryable errors
        if (!isRetryable || attempt >= maxRetries) {
          throw err;
        }

        attempt += 1;
        const delayMs = this.calculateBackoff(attempt);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    throw lastError;
  }

  /**
   * Follows HTTP redirects safely. If the redirect target is on a different origin,
   * strips sensitive Authorization headers to prevent credential leakage.
   */
  private async executeWithRedirectHandling(
    url: string,
    method: string,
    headers: Record<string, string>,
    body: any,
    timeoutMs: number,
    redirectCount: number = 0
  ): Promise<Response> {
    if (redirectCount > 5) {
      throw new Error('Too many redirects followed');
    }

    const initialHost = new URL(url).hostname;

    const response = await fetch(url, {
      method,
      headers,
      body,
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    });

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (location) {
        const nextUrl = new URL(location, url).toString();
        const nextHost = new URL(nextUrl).hostname;

        // Clone headers and remove Authorization if redirected to a different host
        const safeHeaders = { ...headers };
        if (nextHost !== initialHost) {
          delete safeHeaders['Authorization'];
          delete safeHeaders['authorization'];
        }

        // 303 or 301/302 for POST traditionally transforms into GET
        const nextMethod = [301, 302, 303].includes(response.status) && method === 'POST' ? 'GET' : method;
        const nextBody = nextMethod === 'GET' ? undefined : body;

        return this.executeWithRedirectHandling(
          nextUrl,
          nextMethod,
          safeHeaders,
          nextBody,
          timeoutMs,
          redirectCount + 1
        );
      }
    }

    return response;
  }

  private validateTargetHost(url: string): void {
    try {
      const parsed = new URL(url);
      const host = parsed.hostname.toLowerCase();
      const isAllowed =
        host === 'api.github.com' ||
        host === 'github.com' ||
        host === 'localhost' ||
        host === '127.0.0.1' ||
        process.env.NODE_ENV === 'test';

      if (!isAllowed) {
        throw new Error(`SSRF Prevention: Disallowed target host "${host}"`);
      }
    } catch (e: any) {
      if (e.message.startsWith('SSRF Prevention')) throw e;
      throw new Error(`Invalid URL: ${url}`);
    }
  }

  private async isSecondaryThrottle(response: Response): Promise<boolean> {
    const clone = response.clone();
    try {
      const text = await clone.text();
      const lower = text.toLowerCase();
      return (
        lower.includes('secondary rate limit') ||
        lower.includes('abuse detection') ||
        lower.includes('please wait a few minutes')
      );
    } catch {
      return false;
    }
  }

  private parseRetryAfter(headers: Headers): number | null {
    const val = headers.get('retry-after');
    if (!val) return null;
    const parsed = parseInt(val, 10);
    return isNaN(parsed) ? null : parsed;
  }

  private calculateBackoff(attempt: number): number {
    const baseMs = 500;
    const factor = Math.pow(2, attempt);
    const jitter = Math.floor(Math.random() * 200);
    return Math.min(5000, baseMs * factor + jitter);
  }
}

export const defaultGitHubApiClient = new GitHubApiClient();
