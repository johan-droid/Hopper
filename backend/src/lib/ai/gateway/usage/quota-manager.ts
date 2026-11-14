import { AiBudgetController } from '../../budget-controller.js';

/**
 * Quota manager — the gateway's admission-control layer in front of the
 * existing AiBudgetController ledger.
 *
 * Responsibilities:
 *  - pre-flight budget reservation (fail-closed: no reservation → no call)
 *  - settlement on success with actual token usage
 *  - failure accounting (confirmed-zero vs usage-unknown) so spend is never lost
 *
 * The ledger itself (PostgreSQL row-locked ACID) stays in AiBudgetController;
 * this class only translates gateway outcomes into ledger transitions.
 */

export interface QuotaDecision {
  readonly allowed: boolean;
  readonly reservationId?: string;
  readonly reason?: string;
}

export interface QuotaContext {
  readonly organizationId?: string;
  readonly idempotencyKey?: string;
  readonly jobId?: string;
  readonly failureId?: string;
  readonly repoId?: string;
}

export interface QuotaSettleInput {
  readonly reservationId: string;
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly latencyMs?: number;
}

/** HTTP errors where the provider definitively did not charge (auth/client errors). */
const CONFIRMED_ZERO_KINDS = new Set(['auth', 'invalid_request', 'not_found', 'permission_denied']);

export class QuotaManager {
  constructor(private readonly budget: AiBudgetController = new AiBudgetController()) {}

  async reserve(provider: string, model: string, context: QuotaContext = {}): Promise<QuotaDecision> {
    try {
      const result = await this.budget.reserveBudget({
        organizationId: context.organizationId,
        idempotencyKey: context.idempotencyKey,
        jobId: context.jobId,
        failureId: context.failureId,
        repoId: context.repoId,
        provider,
        model,
      });
      if (!result.allowed) {
        return { allowed: false, reason: result.rejectionReason ?? 'BUDGET_REJECTED' };
      }
      return { allowed: true, reservationId: result.reservationId };
    } catch (error) {
      // Fail closed: if the ledger is unreachable we do not spend.
      return {
        allowed: false,
        reason: `LEDGER_UNAVAILABLE: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  async markSubmitted(reservationId: string): Promise<void> {
    try {
      await this.budget.markSubmitted(reservationId);
    } catch {
      // Telemetry-only transition; never blocks the request.
    }
  }

  async settle(input: QuotaSettleInput): Promise<number | null> {
    try {
      return await this.budget.settleReservation({
        reservationId: input.reservationId,
        promptTokens: input.promptTokens,
        completionTokens: input.completionTokens,
        latencyMs: input.latencyMs,
      });
    } catch {
      return null;
    }
  }

  /**
   * Account a failed attempt:
   *  - confirmed-zero error kinds → release reservation (no spend occurred)
   *  - anything else (timeout, 5xx, network) → move to usage-unknown (conservative)
   */
  async accountFailure(reservationId: string | undefined, kind: string, message: string): Promise<void> {
    if (!reservationId) return;
    try {
      if (CONFIRMED_ZERO_KINDS.has(kind)) {
        await this.budget.markFailedZero(reservationId, message.slice(0, 500));
      } else {
        await this.budget.markUsageUnknown(reservationId, message.slice(0, 500));
      }
    } catch {
      // Accounting failures must never mask the original provider error.
    }
  }
}