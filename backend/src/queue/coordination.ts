/**
 * Coordination primitives (replaces Redis).
 *
 * Redis previously provided rate limiting, GitHub delivery deduplication and
 * diagnosis locks. All three are now atomic PostgreSQL operations so the
 * production architecture needs no Redis-compatible service:
 *
 *   rate limit      -> hopper_consume_rate_limit()      (fixed window, atomic)
 *   delivery claim  -> hopper_claim_webhook_delivery()  (INSERT ... ON CONFLICT)
 *   diagnosis lock  -> hopper_acquire_diagnosis_lock()  (time-bounded upsert)
 *   event idempotency -> hopper_claim_processed_event()
 *
 * An in-memory backend is available for local development and tests, and is
 * never used in production.
 */

import crypto from 'node:crypto';
import { DatabaseExecutor, getDatabaseExecutor } from '../db/client.js';

export interface DiagnosisLock {
  acquired: boolean;
  key: string;
  token: string;
}

export interface CoordinationHealth {
  isHealthy: boolean;
  latencyMs: number;
  backend: 'postgres' | 'memory';
  error?: string;
}

export interface CoordinationBackend {
  readonly kind: 'postgres' | 'memory';
  checkTenantRateLimit(
    tenantKey: string,
    maxRequests?: number,
    windowSeconds?: number
  ): Promise<{ allowed: boolean; remaining: number }>;
  claimWebhookDelivery(deliveryId: string, ttlSeconds?: number): Promise<boolean>;
  acquireDiagnosisLock(
    repoId: string,
    fingerprintHash: string,
    ttlSeconds?: number
  ): Promise<DiagnosisLock>;
  completeDiagnosisLock(key: string, token: string, reportId: string): Promise<boolean>;
  getCoalescedDiagnosis(key: string): Promise<string | null>;
  releaseDiagnosisLock(key: string, token: string): Promise<void>;
  claimProcessedEvent(eventKey: string): Promise<boolean>;
  releaseProcessedEvent(eventKey: string): Promise<void>;
  checkHealth(): Promise<CoordinationHealth>;
  prune(retentionHours?: number): Promise<number>;
}

const DEFAULT_RATE_LIMIT = 120;
const DEFAULT_RATE_WINDOW_SECONDS = 60;
const DEFAULT_LOCK_TTL_SECONDS = 45;

function buildLockKey(repoId: string, fingerprintHash: string): string {
  return `diagnose:${repoId}:${fingerprintHash}`;
}

function buildToken(): string {
  return `${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
}

export class PostgresCoordination implements CoordinationBackend {
  readonly kind = 'postgres' as const;

  constructor(private readonly executor?: DatabaseExecutor) {}

  private get db(): DatabaseExecutor {
    return this.executor || getDatabaseExecutor();
  }

  async checkTenantRateLimit(
    tenantKey: string,
    maxRequests = DEFAULT_RATE_LIMIT,
    windowSeconds = DEFAULT_RATE_WINDOW_SECONDS
  ): Promise<{ allowed: boolean; remaining: number }> {
    try {
      const res = await this.db.query<{ allowed: boolean; remaining: number }>(
        `SELECT allowed, remaining FROM hopper_consume_rate_limit($1, $2, $3)`,
        [tenantKey, maxRequests, windowSeconds]
      );
      const row = res.rows[0];
      return {
        allowed: row ? Boolean(row.allowed) : true,
        remaining: row ? Number(row.remaining) : maxRequests,
      };
    } catch (err: any) {
      // Fail open: a coordination outage must not drop authenticated CI webhooks.
      // The durable queue insert (the real guarantee) still applies.
      console.error(`[Coordination] rate limit unavailable: ${err.message}`);
      return { allowed: true, remaining: maxRequests };
    }
  }

  async claimWebhookDelivery(deliveryId: string): Promise<boolean> {
    // Fail closed: if we cannot prove a delivery is new, the caller returns 5xx
    // so GitHub retries instead of us double-processing the event.
    const res = await this.db.query<{ claimed: boolean }>(
      `SELECT hopper_claim_webhook_delivery($1, 'github') AS claimed`,
      [deliveryId]
    );
    return Boolean(res.rows[0]?.claimed);
  }

  async acquireDiagnosisLock(
    repoId: string,
    fingerprintHash: string,
    ttlSeconds = DEFAULT_LOCK_TTL_SECONDS
  ): Promise<DiagnosisLock> {
    const key = buildLockKey(repoId, fingerprintHash);
    const token = buildToken();

    try {
      const res = await this.db.query<{ acquired: boolean }>(
        `SELECT hopper_acquire_diagnosis_lock($1, $2, $3) AS acquired`,
        [key, token, ttlSeconds]
      );
      return { acquired: Boolean(res.rows[0]?.acquired), key, token };
    } catch (err: any) {
      // Fail open: a lock outage must not block diagnosis entirely.
      console.error(`[Coordination] diagnosis lock unavailable: ${err.message}`);
      return { acquired: true, key, token };
    }
  }

  async completeDiagnosisLock(key: string, token: string, reportId: string): Promise<boolean> {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(reportId);
    if (!isUuid) return false;
    try {
      const res = await this.db.query<{ completed: boolean }>(
        `SELECT hopper_complete_diagnosis_lock($1, $2, $3::uuid) AS completed`,
        [key, token, reportId]
      );
      return Boolean(res.rows[0]?.completed);
    } catch (err: any) {
      console.warn(`[Coordination] failed to complete diagnosis lock: ${err.message}`);
      return false;
    }
  }

  async getCoalescedDiagnosis(key: string): Promise<string | null> {
    try {
      const res = await this.db.query<{ report_id: string }>(
        `SELECT hopper_get_coalesced_diagnosis($1) AS report_id`,
        [key]
      );
      return res.rows[0]?.report_id || null;
    } catch (err: any) {
      console.warn(`[Coordination] failed to get coalesced diagnosis: ${err.message}`);
      return null;
    }
  }

  async releaseDiagnosisLock(key: string, token: string): Promise<void> {
    try {
      await this.db.query(`SELECT hopper_release_diagnosis_lock($1, $2)`, [key, token]);
    } catch (err: any) {
      // Locks self-expire; a failed release must not fail the diagnosis.
      console.warn(`[Coordination] lock release failed: ${err.message}`);
    }
  }

  async claimProcessedEvent(eventKey: string): Promise<boolean> {
    const res = await this.db.query<{ claimed: boolean }>(
      `SELECT hopper_claim_processed_event($1) AS claimed`,
      [eventKey]
    );
    return Boolean(res.rows[0]?.claimed);
  }

  async releaseProcessedEvent(eventKey: string): Promise<void> {
    await this.db.query(`SELECT hopper_release_processed_event($1)`, [eventKey]);
  }

  async checkHealth(): Promise<CoordinationHealth> {
    const start = Date.now();
    try {
      await this.db.query('SELECT 1');
      return { isHealthy: true, latencyMs: Date.now() - start, backend: 'postgres' };
    } catch (err: any) {
      return {
        isHealthy: false,
        latencyMs: Date.now() - start,
        backend: 'postgres',
        error: err.message || 'PostgreSQL coordination check failed',
      };
    }
  }

  async prune(retentionHours = 24): Promise<number> {
    const res = await this.db.query<{ pruned: number }>(
      `SELECT hopper_prune_queue_coordination($1) AS pruned`,
      [retentionHours]
    );
    return Number(res.rows[0]?.pruned ?? 0);
  }
}

/**
 * Volatile backend for unit tests and local development only.
 */
export class InMemoryCoordination implements CoordinationBackend {
  readonly kind = 'memory' as const;

  private deliveries = new Map<string, number>();
  private rateWindows = new Map<string, { windowStart: number; count: number }>();
  private locks = new Map<string, { token: string; expiresAt: number; reportId?: string }>();
  private processed = new Set<string>();

  async checkTenantRateLimit(
    tenantKey: string,
    maxRequests = DEFAULT_RATE_LIMIT,
    windowSeconds = DEFAULT_RATE_WINDOW_SECONDS
  ): Promise<{ allowed: boolean; remaining: number }> {
    const windowMs = Math.max(1, windowSeconds) * 1000;
    const windowStart = Math.floor(Date.now() / windowMs) * windowMs;
    const current = this.rateWindows.get(tenantKey);

    const entry =
      current && current.windowStart === windowStart
        ? current
        : { windowStart, count: 0 };
    entry.count += 1;
    this.rateWindows.set(tenantKey, entry);

    return {
      allowed: entry.count <= maxRequests,
      remaining: Math.max(0, maxRequests - entry.count),
    };
  }

  async claimWebhookDelivery(deliveryId: string, ttlSeconds = 86400): Promise<boolean> {
    const now = Date.now();
    const existing = this.deliveries.get(deliveryId);
    if (existing && existing > now) {
      return false;
    }
    this.deliveries.set(deliveryId, now + ttlSeconds * 1000);
    return true;
  }

  async acquireDiagnosisLock(
    repoId: string,
    fingerprintHash: string,
    ttlSeconds = DEFAULT_LOCK_TTL_SECONDS
  ): Promise<DiagnosisLock> {
    const key = buildLockKey(repoId, fingerprintHash);
    const token = buildToken();
    const now = Date.now();
    const existing = this.locks.get(key);

    if (existing && existing.expiresAt > now) {
      return { acquired: false, key, token };
    }

    this.locks.set(key, { token, expiresAt: now + ttlSeconds * 1000 });
    return { acquired: true, key, token };
  }

  async completeDiagnosisLock(key: string, token: string, reportId: string): Promise<boolean> {
    const existing = this.locks.get(key);
    if (existing && existing.token === token) {
      existing.reportId = reportId;
      existing.expiresAt = Date.now() + 5 * 60 * 1000;
      return true;
    }
    return false;
  }

  async getCoalescedDiagnosis(key: string): Promise<string | null> {
    const existing = this.locks.get(key);
    if (existing && existing.reportId && existing.expiresAt > Date.now()) {
      return existing.reportId;
    }
    return null;
  }

  async releaseDiagnosisLock(key: string, token: string): Promise<void> {
    const existing = this.locks.get(key);
    if (existing && existing.token === token) {
      this.locks.delete(key);
    }
  }

  async claimProcessedEvent(eventKey: string): Promise<boolean> {
    if (this.processed.has(eventKey)) return false;
    this.processed.add(eventKey);
    return true;
  }

  async releaseProcessedEvent(eventKey: string): Promise<void> {
    this.processed.delete(eventKey);
  }

  async checkHealth(): Promise<CoordinationHealth> {
    return { isHealthy: true, latencyMs: 0, backend: 'memory' };
  }

  async prune(): Promise<number> {
    const now = Date.now();
    let pruned = 0;
    for (const [key, expiresAt] of this.deliveries) {
      if (expiresAt <= now) {
        this.deliveries.delete(key);
        pruned++;
      }
    }
    for (const [key, lock] of this.locks) {
      if (lock.expiresAt <= now) {
        this.locks.delete(key);
        pruned++;
      }
    }
    return pruned;
  }

  reset(): void {
    this.deliveries.clear();
    this.rateWindows.clear();
    this.locks.clear();
    this.processed.clear();
  }
}

let customBackend: CoordinationBackend | null = null;

export function setCoordinationBackend(backend: CoordinationBackend | null): void {
  customBackend = backend;
}

export function getCoordination(): CoordinationBackend {
  if (customBackend) return customBackend;

  const requested = (process.env.COORDINATION_BACKEND || '').toLowerCase();
  const isProduction = process.env.NODE_ENV === 'production';

  if (requested === 'memory') {
    if (isProduction) {
      throw new Error(
        'COORDINATION_BACKEND=memory is forbidden in production: rate limits and locks require PostgreSQL'
      );
    }
    customBackend = new InMemoryCoordination();
    return customBackend;
  }

  customBackend = new PostgresCoordination();
  return customBackend;
}

/* -------------------------------------------------------------------------- */
/* Backwards-compatible function surface used across engines and routes.      */
/* -------------------------------------------------------------------------- */

export function checkTenantRateLimit(
  tenantKey: string,
  maxRequests = DEFAULT_RATE_LIMIT,
  windowSeconds = DEFAULT_RATE_WINDOW_SECONDS
): Promise<{ allowed: boolean; remaining: number }> {
  return getCoordination().checkTenantRateLimit(tenantKey, maxRequests, windowSeconds);
}

export function claimWebhookDelivery(deliveryId: string, ttlSeconds?: number): Promise<boolean> {
  return getCoordination().claimWebhookDelivery(deliveryId, ttlSeconds);
}

export function acquireDiagnosisLock(
  repoId: string,
  fingerprintHash: string,
  ttlSeconds?: number
): Promise<DiagnosisLock> {
  return getCoordination().acquireDiagnosisLock(repoId, fingerprintHash, ttlSeconds);
}

export function completeDiagnosisLock(
  key: string,
  token: string,
  reportId: string
): Promise<boolean> {
  const backend = getCoordination();
  if (typeof backend?.completeDiagnosisLock === 'function') {
    return backend.completeDiagnosisLock(key, token, reportId);
  }
  return Promise.resolve(false);
}

export function getCoalescedDiagnosis(key: string): Promise<string | null> {
  const backend = getCoordination();
  if (typeof backend?.getCoalescedDiagnosis === 'function') {
    return backend.getCoalescedDiagnosis(key);
  }
  return Promise.resolve(null);
}

export function releaseDiagnosisLock(key: string, token: string): Promise<void> {
  return getCoordination().releaseDiagnosisLock(key, token);
}

export function claimProcessedEvent(eventKey: string): Promise<boolean> {
  return getCoordination().claimProcessedEvent(eventKey);
}

export function releaseProcessedEvent(eventKey: string): Promise<void> {
  return getCoordination().releaseProcessedEvent(eventKey);
}

export function checkCoordinationHealth(): Promise<CoordinationHealth> {
  return getCoordination().checkHealth();
}

export function pruneCoordination(retentionHours?: number): Promise<number> {
  return getCoordination().prune(retentionHours);
}
