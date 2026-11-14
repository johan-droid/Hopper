/**
 * Per-provider circuit breaker.
 *
 * States: closed (normal) → open (failing, reject fast) → half-open (probe allowed).
 * Thresholds are intentionally simple and in-memory; persisted snapshots come from
 * the ai_provider_health table via the gateway's telemetry writer.
 */

export type CircuitState = 'closed' | 'open' | 'half_open';

export interface CircuitBreakerOptions {
  /** Consecutive failures before opening. */
  readonly failureThreshold: number;
  /** How long to stay open before allowing a probe (ms). */
  readonly openMs: number;
  /** Successful probes in half-open before closing. */
  readonly halfOpenSuccesses?: number;
  /** Clock injection for tests. */
  readonly now?: () => number;
}

export interface CircuitSnapshot {
  readonly providerId: string;
  readonly state: CircuitState;
  readonly consecutiveFailures: number;
  readonly openedAt: number | null;
  readonly nextProbeAt: number | null;
}

export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private consecutiveFailures = 0;
  private openedAt: number | null = null;
  private halfOpenSuccesses = 0;
  private readonly now: () => number;

  constructor(
    readonly providerId: string,
    private readonly options: CircuitBreakerOptions,
  ) {
    this.now = options.now ?? Date.now;
  }

  /** Returns true when a request may proceed; false when the circuit is open. */
  canExecute(): boolean {
    return this.tryAcquire();
  }

  /** Returns true when a request may proceed; false when the circuit is open. */
  tryAcquire(): boolean {
    if (this.state === 'closed') return true;
    if (this.state === 'open') {
      const nextProbe = (this.openedAt ?? 0) + this.options.openMs;
      if (this.now() >= nextProbe) {
        this.state = 'half_open';
        this.halfOpenSuccesses = 0;
        return true;
      }
      return false;
    }
    return true; // half-open: allow the probe
  }

  onSuccess(): void {
    if (this.state === 'half_open') {
      this.halfOpenSuccesses += 1;
      if (this.halfOpenSuccesses >= (this.options.halfOpenSuccesses ?? 1)) {
        this.state = 'closed';
        this.consecutiveFailures = 0;
        this.openedAt = null;
        this.halfOpenSuccesses = 0;
      }
      return;
    }
    this.consecutiveFailures = 0;
  }

  onFailure(): void {
    if (this.state === 'half_open') {
      // Probe failed — reopen immediately.
      this.state = 'open';
      this.openedAt = this.now();
      this.halfOpenSuccesses = 0;
      return;
    }
    this.consecutiveFailures += 1;
    if (this.consecutiveFailures >= this.options.failureThreshold) {
      this.state = 'open';
      this.openedAt = this.now();
    }
  }

  snapshot(): CircuitSnapshot {
    return {
      providerId: this.providerId,
      state: this.state,
      consecutiveFailures: this.consecutiveFailures,
      openedAt: this.openedAt,
      nextProbeAt:
        this.state === 'open' && this.openedAt !== null ? this.openedAt + this.options.openMs : null,
    };
  }

  /** Test/diagnostic helper to force a state. */
  forceState(state: CircuitState): void {
    this.state = state;
    if (state === 'open') this.openedAt = this.now();
    if (state === 'closed') {
      this.consecutiveFailures = 0;
      this.openedAt = null;
      this.halfOpenSuccesses = 0;
    }
  }
}