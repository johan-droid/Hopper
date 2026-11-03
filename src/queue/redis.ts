/**
 * Redis Connection & Rate Limiting Management.
 * Manages ioredis instances with health checks and atomic rate limiting.
 */

import { Redis } from 'ioredis';

let defaultRedisClient: Redis | null = null;
let customRedisClient: any = null;

export function getRedisUrl(): string {
  return process.env.REDIS_URL || 'redis://localhost:6379';
}

export function createRedisConnection(): Redis {
  const url = getRedisUrl();
  return new Redis(url, {
    maxRetriesPerRequest: null, // Required for BullMQ
    enableReadyCheck: false,
    retryStrategy: (times) => {
      if (times > 3) return null; // stop retrying quickly in test/offline environments
      return Math.min(times * 100, 1000);
    },
    lazyConnect: true,
  });
}

export function setCustomRedis(client: any): void {
  customRedisClient = client;
}

export function getRedisClient(): Redis {
  if (customRedisClient) {
    return customRedisClient;
  }
  if (!defaultRedisClient) {
    defaultRedisClient = createRedisConnection();
  }
  return defaultRedisClient;
}

export interface RedisHealthStatus {
  isHealthy: boolean;
  latencyMs: number;
  error?: string;
}

/**
 * Check if Redis instance is reachable and responding to PING.
 */
export async function checkRedisHealth(): Promise<RedisHealthStatus> {
  const start = Date.now();
  try {
    const client = getRedisClient();
    if (typeof client.connect === 'function' && client.status === 'wait') {
      await client.connect();
    }
    const pong = await client.ping();
    return {
      isHealthy: pong === 'PONG',
      latencyMs: Date.now() - start,
    };
  } catch (err: any) {
    return {
      isHealthy: false,
      latencyMs: Date.now() - start,
      error: err.message || 'Redis connection failed',
    };
  }
}

/**
 * Sliding window rate-limiter using atomic Redis INCR & EXPIRE.
 */
export async function checkTenantRateLimit(
  tenantKey: string,
  maxRequests: number = 60,
  windowSeconds: number = 60
): Promise<{ allowed: boolean; remaining: number }> {
  try {
    const client = getRedisClient();
    const key = `ratelimit:${tenantKey}`;

    const currentCount = await client.incr(key);
    if (currentCount === 1) {
      await client.expire(key, windowSeconds);
    }

    const remaining = Math.max(0, maxRequests - currentCount);
    return {
      allowed: currentCount <= maxRequests,
      remaining,
    };
  } catch (_err) {
    // If Redis is unreachable, fail open to avoid dropping CI webhooks
    return { allowed: true, remaining: maxRequests };
  }
}

/**
 * Marks a GitHub webhook delivery as seen.
 * Returns true when this is the first time the delivery ID is processed,
 * false when it is a replay. Fails open if Redis is unavailable.
 */
export async function claimWebhookDelivery(
  deliveryId: string,
  ttlSeconds: number = 86400
): Promise<boolean> {
  try {
    const client = getRedisClient();
    const result = await client.set(`gh:delivery:${deliveryId}`, '1', 'EX', ttlSeconds, 'NX');
    return result === 'OK';
  } catch (_err) {
    // If Redis is unreachable, do not drop webhooks that have not actually been deduplicated
    return true;
  }
}

export interface DiagnosisLock {
  acquired: boolean;
  key: string;
  token: string;
}

/**
 * Acquires a short-lived lock so parallel matrix jobs with the same failure
 * fingerprint do not call the LLM simultaneously.
 */
export async function acquireDiagnosisLock(
  repoId: string,
  fingerprintHash: string,
  ttlSeconds: number = 45
): Promise<DiagnosisLock> {
  const key = `lock:diagnose:${repoId}:${fingerprintHash}`;
  const token = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  try {
    const client = getRedisClient();
    const result = await client.set(key, token, 'EX', ttlSeconds, 'NX');
    return { acquired: result === 'OK', key, token };
  } catch (_err) {
    // Fail open: a Redis outage must not block diagnosis
    return { acquired: true, key, token };
  }
}

/**
 * Releases a diagnosis lock only if this caller still owns it.
 */
export async function releaseDiagnosisLock(key: string, token: string): Promise<void> {
  try {
    const client = getRedisClient();
    await client.eval(
      "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
      1,
      key,
      token
    );
  } catch (_err) {
    // Lock expires on its own; a failed release must not fail the diagnosis
  }
}

export async function closeRedis(): Promise<void> {  if (defaultRedisClient) {
    try {
      await defaultRedisClient.quit();
    } catch {
      defaultRedisClient.disconnect();
    }
    defaultRedisClient = null;
  }
  customRedisClient = null;
}
