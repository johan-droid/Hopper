import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  setCustomRedis,
  checkTenantRateLimit,
  checkRedisHealth,
  getRedisUrl,
  claimWebhookDelivery,
  acquireDiagnosisLock,
  releaseDiagnosisLock,
} from '../src/queue/redis.js';
import {
  enqueueWorkflowJob,
  setCustomQueue,
  CI_EVENTS_QUEUE_NAME,
} from '../src/queue/ci-queue.js';
import { WorkflowJobEventData } from '../src/queue/types.js';

describe('Redis & Queue Infrastructure', () => {
  beforeEach(() => {
    setCustomRedis(null);
    setCustomQueue(null);
  });

  afterEach(() => {
    setCustomRedis(null);
    setCustomQueue(null);
  });

  it('resolves Redis URL properly with localhost fallback', () => {
    const url = getRedisUrl();
    expect(url).toBeDefined();
    expect(typeof url).toBe('string');
  });

  it('performs sliding window rate limiting via Redis INCR and EXPIRE', async () => {
    let callCount = 0;
    const mockRedis = {
      incr: async (key: string) => {
        expect(key).toContain('ratelimit:test-org');
        callCount++;
        return callCount;
      },
      expire: async (key: string, seconds: number) => {
        expect(key).toContain('ratelimit:test-org');
        expect(seconds).toBe(60);
        return 1;
      },
    };

    setCustomRedis(mockRedis);

    // Call 1
    const res1 = await checkTenantRateLimit('test-org', 2, 60);
    expect(res1.allowed).toBe(true);
    expect(res1.remaining).toBe(1);

    // Call 2
    const res2 = await checkTenantRateLimit('test-org', 2, 60);
    expect(res2.allowed).toBe(true);
    expect(res2.remaining).toBe(0);

    // Call 3 (exceeds limit)
    const res3 = await checkTenantRateLimit('test-org', 2, 60);
    expect(res3.allowed).toBe(false);
    expect(res3.remaining).toBe(0);
  });

  it('fails open on Redis rate limit error to avoid dropping critical webhooks', async () => {
    const brokenRedis = {
      incr: async () => {
        throw new Error('Redis connection down');
      },
    };

    setCustomRedis(brokenRedis);
    const res = await checkTenantRateLimit('test-org', 10, 60);
    expect(res.allowed).toBe(true);
    expect(res.remaining).toBe(10);
  });

  it('deduplicates webhook deliveries with a 24h NX marker', async () => {
    let stored = false;
    const mockRedis = {
      set: async (key: string, value: string, ...args: any[]) => {
        expect(key).toBe('gh:delivery:delivery-uuid-1');
        expect(value).toBe('1');
        expect(args).toEqual(['EX', 86400, 'NX']);
        if (stored) return null;
        stored = true;
        return 'OK';
      },
    };

    setCustomRedis(mockRedis);
    expect(await claimWebhookDelivery('delivery-uuid-1')).toBe(true);
    expect(await claimWebhookDelivery('delivery-uuid-1')).toBe(false);
  });

  it('fails open on Redis errors during webhook deduplication', async () => {
    setCustomRedis({
      set: async () => {
        throw new Error('Redis connection down');
      },
    });

    expect(await claimWebhookDelivery('delivery-uuid-2')).toBe(true);
  });

  it('acquires and releases a fingerprint-scoped diagnosis lock', async () => {
    const fingerprint = 'a'.repeat(64);
    let acquiredOnce = false;
    const mockRedis = {
      set: async (key: string, value: string, ...args: any[]) => {
        expect(key).toBe(`lock:diagnose:repo-1:${fingerprint}`);
        expect(args).toEqual(['EX', 45, 'NX']);
        if (acquiredOnce) return null;
        acquiredOnce = true;
        return 'OK';
      },
      eval: async (_script: string, _numKeys: number, key: string, token: string) => {
        expect(key).toBe(`lock:diagnose:repo-1:${fingerprint}`);
        expect(token).toBeDefined();
        return 1;
      },
    };

    setCustomRedis(mockRedis);
    const lock = await acquireDiagnosisLock('repo-1', fingerprint);
    expect(lock.acquired).toBe(true);

    const second = await acquireDiagnosisLock('repo-1', fingerprint);
    expect(second.acquired).toBe(false);

    await releaseDiagnosisLock(lock.key, lock.token);
  });

  it('checks Redis health status correctly', async () => {    const mockHealthyRedis = {
      ping: async () => 'PONG',
    };
    setCustomRedis(mockHealthyRedis);

    const health = await checkRedisHealth();
    expect(health.isHealthy).toBe(true);
    expect(health.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('enqueues workflow job with deterministic job ID to prevent duplicate processing', async () => {
    let capturedName = '';
    let capturedData: any = null;
    let capturedOpts: any = null;

    const mockQueue = {
      add: async (name: string, data: any, opts: any) => {
        capturedName = name;
        capturedData = data;
        capturedOpts = opts;
        return { id: opts.jobId };
      },
    };

    setCustomQueue(mockQueue);

    const event: WorkflowJobEventData = {
      installationId: 10101,
      orgLogin: 'acme-corp',
      accountType: 'Organization',
      repoFullName: 'acme-corp/billing-service',
      githubRepoId: 98765,
      workflowName: 'Test Suite',
      jobName: 'unit-tests',
      stepName: 'vitest run',
      githubRunId: 1234567,
      githubJobId: 889900,
      githubRunAttempt: 2,
      commitSha: 'a'.repeat(40),
      branch: 'main',
      conclusion: 'failure',
    };

    const res = await enqueueWorkflowJob(event);
    expect(capturedName).toBe('process-workflow-job');
    expect(capturedData.githubJobId).toBe(889900);
    expect(capturedOpts.jobId).toBe('job:889900:2');
    expect(res.jobId).toBe('job:889900:2');
  });
});
