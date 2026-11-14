import type { CircuitSnapshot } from './circuit-breaker.js';

/**
 * In-memory provider health registry: owns one CircuitBreaker + Bulkhead per
 * provider and records last-success / last-error for telemetry persistence.
 */

export interface ProviderHealthRecord {
  readonly providerId: string;
  readonly consecutiveFailures: number;
  readonly lastSuccessAt: number | null;
  readonly lastErrorAt: number | null;
  readonly lastError: string | null;
  readonly totalSuccesses: number;
  readonly totalFailures: number;
  readonly circuit: CircuitSnapshot;
}

export interface HealthEntry {
  readonly lastSuccessAt: number | null;
  readonly lastErrorAt: number | null;
  readonly lastError: string | null;
  readonly totalSuccesses: number;
  readonly totalFailures: number;
}

const EMPTY: HealthEntry = {
  lastSuccessAt: null,
  lastErrorAt: null,
  lastError: null,
  totalSuccesses: 0,
  totalFailures: 0,
};

export class ProviderHealth {
  private readonly entries = new Map<string, HealthEntry>();

  recordSuccess(providerId: string, at = Date.now()): void {
    const current = this.entries.get(providerId) ?? EMPTY;
    this.entries.set(providerId, {
      ...current,
      lastSuccessAt: at,
      totalSuccesses: current.totalSuccesses + 1,
    });
  }

  recordFailure(providerId: string, message: string, at = Date.now()): void {
    const current = this.entries.get(providerId) ?? EMPTY;
    this.entries.set(providerId, {
      ...current,
      lastErrorAt: at,
      lastError: message.slice(0, 500),
      totalFailures: current.totalFailures + 1,
    });
  }

  get(providerId: string): HealthEntry {
    return this.entries.get(providerId) ?? EMPTY;
  }

  snapshot(providerId: string, circuit: CircuitSnapshot): ProviderHealthRecord {
    const entry = this.get(providerId);
    return {
      providerId,
      consecutiveFailures: circuit.consecutiveFailures,
      lastSuccessAt: entry.lastSuccessAt,
      lastErrorAt: entry.lastErrorAt,
      lastError: entry.lastError,
      totalSuccesses: entry.totalSuccesses,
      totalFailures: entry.totalFailures,
      circuit,
    };
  }
}