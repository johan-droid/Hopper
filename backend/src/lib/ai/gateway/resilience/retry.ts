import { ProviderError, type ProviderErrorClass } from '../contracts.js';

/**
 * Retry with exponential backoff + full jitter, honoring Retry-After when present.
 * Only transient error classes are retried; permanent classes (auth, invalid
 * request, model not found) fail over immediately instead.
 */

export interface RetryOptions {
  readonly maxRetries: number;
  readonly initialDelayMs: number;
  readonly maxDelayMs: number;
  /** Full jitter by default; set false for deterministic backoff (tests). */
  readonly jitter?: boolean;
  readonly sleep?: (ms: number) => Promise<void>;
}

const RETRYABLE_CLASSES: ReadonlySet<ProviderErrorClass> = new Set<ProviderErrorClass>([
  'rate_limit',
  'timeout',
  'server',
  'network',
  'overloaded',
]);

export function isRetryable(error: unknown): boolean {
  if (error instanceof ProviderError) return RETRYABLE_CLASSES.has(error.errorClass);
  return false;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

export function computeBackoffMs(
  attempt: number,
  options: RetryOptions,
  retryAfterMs?: number,
  random: () => number = Math.random,
): number {
  if (retryAfterMs !== undefined) {
    // Provider told us when to come back; cap so we never wait unboundedly.
    return Math.min(retryAfterMs, options.maxDelayMs);
  }
  const base = Math.min(options.initialDelayMs * 2 ** attempt, options.maxDelayMs);
  if (options.jitter === false) return base;
  // Full jitter: uniform in [0, base].
  return Math.floor(random() * base);
}

/**
 * Run `fn` with bounded retries. `fn` receives the 0-based attempt number so
 * callers can adjust the request (e.g. drop json mode after repeated failures).
 */
export async function withRetries<T>(
  fn: (attempt: number) => Promise<T>,
  options: RetryOptions,
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void,
): Promise<T> {
  const sleep = options.sleep ?? defaultSleep;
  let lastError: unknown;
  for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      if (attempt === options.maxRetries || !isRetryable(error)) break;
      const retryAfterMs = error instanceof ProviderError ? error.retryAfterMs : undefined;
      const delayMs = computeBackoffMs(attempt, options, retryAfterMs ?? undefined);
      onRetry?.(error, attempt, delayMs);
      await sleep(delayMs);
    }
  }
  throw lastError;
}