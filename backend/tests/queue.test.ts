import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  InMemoryJobStore,
  setJobStore,
  computeBackoffSeconds,
} from '../src/queue/job-store.js';
import {
  InMemoryCoordination,
  setCoordinationBackend,
} from '../src/queue/coordination.js';
import { enqueueWorkflowJob } from '../src/queue/ci-queue.js';
import { WorkflowJobEventData } from '../src/queue/types.js';

const baseEvent: WorkflowJobEventData = {
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

describe('Durable queue (PostgreSQL outbox)', () => {
  let store: InMemoryJobStore;

  beforeEach(() => {
    store = new InMemoryJobStore();
    setJobStore(store);
    process.env.QUEUE_TRANSPORT = 'off';
  });

  afterEach(() => {
    setJobStore(null);
  });

  it('derives a deterministic idempotency key from GitHub job identity', async () => {
    const first = await enqueueWorkflowJob(baseEvent);
    expect(first.idempotencyKey).toBe('gh:job:889900:run:2');
    expect(first.duplicate).toBe(false);
    expect(first.transport.published).toBe(false);
    expect(first.transport.reason).toBe('transport_disabled');
  });

  it('never creates a second durable job for a redelivered webhook', async () => {
    const first = await enqueueWorkflowJob(baseEvent);
    const second = await enqueueWorkflowJob(baseEvent);

    expect(second.duplicate).toBe(true);
    expect(second.jobId).toBe(first.jobId);

    const metrics = await store.metrics();
    expect(metrics.pending).toBe(1);
  });

  it('claims a job exactly once even for concurrent consumers', async () => {
    await enqueueWorkflowJob(baseEvent);

    const [a, b] = await Promise.all([
      store.claim({ workerId: 'worker-a', limit: 1 }),
      store.claim({ workerId: 'worker-b', limit: 1 }),
    ]);

    const claimed = [...a, ...b];
    expect(claimed).toHaveLength(1);
    expect(claimed[0].attempts).toBe(1);
  });

  it('applies bounded exponential backoff', () => {
    expect(computeBackoffSeconds(1)).toBe(5);
    expect(computeBackoffSeconds(2)).toBe(10);
    expect(computeBackoffSeconds(3)).toBe(20);
    expect(computeBackoffSeconds(50)).toBe(900);
  });

  it('moves a poison message to the dead-letter ledger after max attempts', async () => {
    await store.enqueue({ payload: baseEvent, maxAttempts: 2 });

    for (let attempt = 1; attempt <= 2; attempt++) {
      const [job] = await store.claim({ workerId: `w-${attempt}`, limit: 1 });
      expect(job).toBeDefined();
      const outcome = await store.fail(job.id, { error: `boom-${attempt}`, delaySeconds: 0 });
      expect(outcome.dead).toBe(attempt === 2);
    }

    expect(await store.deadLetterCount()).toBe(1);
    const metrics = await store.metrics();
    expect(metrics.dead).toBe(1);
  });

  it('reaps expired consumer locks so a crashed function cannot lose the job', async () => {
    await enqueueWorkflowJob(baseEvent);

    const [job] = await store.claim({ workerId: 'crashed-worker', limit: 1, lockSeconds: 30 });
    expect(job).toBeDefined();

    // Force the lock into the past.
    const internal = (store as any).jobs.get(job.id);
    internal.lockExpiresAt = Date.now() - 1000;

    expect(await store.reapExpired()).toBe(1);

    const [reclaimed] = await store.claim({ workerId: 'recovery-worker', limit: 1 });
    expect(reclaimed).toBeDefined();
    expect(reclaimed.id).toBe(job.id);
    expect(reclaimed.attempts).toBe(2);
  });

  it('reschedules deferred work without consuming an attempt', async () => {
    await enqueueWorkflowJob(baseEvent);
    const [job] = await store.claim({ workerId: 'w1', limit: 1 });

    await store.retry(job.id, 0, 'deferred: lock held');

    const [retried] = await store.claim({ workerId: 'w2', limit: 1 });
    expect(retried.id).toBe(job.id);
    expect(retried.attempts).toBe(1);
  });
});

describe('Coordination primitives (replacing Redis)', () => {
  let coordination: InMemoryCoordination;

  beforeEach(() => {
    coordination = new InMemoryCoordination();
    setCoordinationBackend(coordination);
  });

  afterEach(() => {
    setCoordinationBackend(null);
  });

  it('enforces a fixed-window tenant rate limit', async () => {
    expect((await coordination.checkTenantRateLimit('test-org', 2, 60)).allowed).toBe(true);
    expect((await coordination.checkTenantRateLimit('test-org', 2, 60)).allowed).toBe(true);

    const third = await coordination.checkTenantRateLimit('test-org', 2, 60);
    expect(third.allowed).toBe(false);
    expect(third.remaining).toBe(0);
  });

  it('isolates rate limit windows per tenant', async () => {
    await coordination.checkTenantRateLimit('org-a', 1, 60);
    const blocked = await coordination.checkTenantRateLimit('org-a', 1, 60);
    const otherTenant = await coordination.checkTenantRateLimit('org-b', 1, 60);

    expect(blocked.allowed).toBe(false);
    expect(otherTenant.allowed).toBe(true);
  });

  it('deduplicates webhook deliveries', async () => {
    expect(await coordination.claimWebhookDelivery('delivery-uuid-1')).toBe(true);
    expect(await coordination.claimWebhookDelivery('delivery-uuid-1')).toBe(false);
  });

  it('acquires and releases a fingerprint-scoped diagnosis lock', async () => {
    const fingerprint = 'a'.repeat(64);

    const lock = await coordination.acquireDiagnosisLock('repo-1', fingerprint);
    expect(lock.acquired).toBe(true);

    const second = await coordination.acquireDiagnosisLock('repo-1', fingerprint);
    expect(second.acquired).toBe(false);

    await coordination.releaseDiagnosisLock(lock.key, lock.token);
    const third = await coordination.acquireDiagnosisLock('repo-1', fingerprint);
    expect(third.acquired).toBe(true);
  });

  it('does not release a lock owned by another token', async () => {
    const lock = await coordination.acquireDiagnosisLock('repo-2', 'b'.repeat(64));
    await coordination.releaseDiagnosisLock(lock.key, 'wrong-token');

    const stillHeld = await coordination.acquireDiagnosisLock('repo-2', 'b'.repeat(64));
    expect(stillHeld.acquired).toBe(false);
  });

  it('claims a processed event exactly once and can release it for retry', async () => {
    expect(await coordination.claimProcessedEvent('gh:job:1:run:1')).toBe(true);
    expect(await coordination.claimProcessedEvent('gh:job:1:run:1')).toBe(false);

    await coordination.releaseProcessedEvent('gh:job:1:run:1');
    expect(await coordination.claimProcessedEvent('gh:job:1:run:1')).toBe(true);
  });
});
