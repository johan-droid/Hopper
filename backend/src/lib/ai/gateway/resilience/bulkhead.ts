import { OverloadError } from '../contracts.js';

/**
 * Bulkhead — a per-provider concurrency limiter. When full, requests fail fast
 * with an `overload` error instead of queueing unboundedly (bounded memory).
 */
export class Bulkhead {
  private active = 0;

  constructor(
    readonly providerId: string,
    private readonly maxConcurrent: number,
  ) {}

  get activeCount(): number {
    return this.active;
  }

  get available(): number {
    return Math.max(0, this.maxConcurrent - this.active);
  }

  /**
   * Run `fn` if a slot is free, else throw OverloadError.
   * Slot is always released, including on throw.
   */
  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.maxConcurrent) {
      throw new OverloadError(`${this.providerId}: bulkhead full (${this.active}/${this.maxConcurrent})`);
    }
    this.active += 1;
    try {
      return await fn();
    } finally {
      this.active -= 1;
    }
  }
}