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

export async function closeRedis(): Promise<void> {
  if (defaultRedisClient) {
    try {
      await defaultRedisClient.quit();
    } catch {
      defaultRedisClient.disconnect();
    }
    defaultRedisClient = null;
  }
  customRedisClient = null;
}
