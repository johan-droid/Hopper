/**
 * Hopper Phase 16R.2 — Authoritative AI Budget Controller & Financial Safety Engine.
 * 
 * Enforces:
 * 1. $500.0000 USD Monthly Hard Spending Ceiling (PostgreSQL Row-Locked ACID Ledger).
 * 2. $475.0000 USD Nominal Admission Cap (with $25.00 buffer for concurrent in-flight liability).
 * 3. Atomic pre-flight cost reservations ($0.0150 per request).
 * 4. State transitions: reserved -> submitted -> settled | failed_confirmed_zero | usage_unknown.
 * 5. Conservative fail-closed accounting (timeouts remain accounted as uncertain spend until audited).
 */

import crypto from 'node:crypto';
import { DatabaseExecutor, getDatabaseExecutor, withTransaction } from '../../db/index.js';

export const BUDGET_LIMIT_USD = 500.0;
export const NOMINAL_ADMISSION_CAP_USD = 475.0;
export const STANDARD_RESERVATION_USD = 0.015; // 4000 in, 1500 out cold cache + 30% margin
export const RESERVATION_TTL_SECONDS = 120;
export const CURRENT_PRICING_VERSION = '2024-10-pricing-v1';

export interface ModelPricing {
  inputPerMillion: number;
  outputPerMillion: number;
  cacheWritePerMillion: number;
  cacheReadPerMillion: number;
}

export const PRICING_REGISTRY: Record<string, ModelPricing> = {
  'claude-3-5-haiku-20241022': {
    inputPerMillion: 0.8,
    outputPerMillion: 4.0,
    cacheWritePerMillion: 1.0,
    cacheReadPerMillion: 0.08,
  },
  'claude-3-5-haiku-latest': {
    inputPerMillion: 0.8,
    outputPerMillion: 4.0,
    cacheWritePerMillion: 1.0,
    cacheReadPerMillion: 0.08,
  },
  'claude-3-5-sonnet-20241022': {
    inputPerMillion: 3.0,
    outputPerMillion: 15.0,
    cacheWritePerMillion: 3.75,
    cacheReadPerMillion: 0.30,
  },
  'gpt-4o-mini': {
    inputPerMillion: 0.15,
    outputPerMillion: 0.6,
    cacheWritePerMillion: 0.15,
    cacheReadPerMillion: 0.075,
  },
  'gpt-4o': {
    inputPerMillion: 2.5,
    outputPerMillion: 10.0,
    cacheWritePerMillion: 1.25,
    cacheReadPerMillion: 1.25,
  },
  'deepseek-chat': {
    inputPerMillion: 0.14,
    outputPerMillion: 0.28,
    cacheWritePerMillion: 0.14,
    cacheReadPerMillion: 0.014,
  },
  'qwen-2.5-coder-32b-instruct': {
    inputPerMillion: 0.20,
    outputPerMillion: 0.40,
    cacheWritePerMillion: 0.20,
    cacheReadPerMillion: 0.02,
  },
  'gemini-1.5-flash': {
    inputPerMillion: 0.075,
    outputPerMillion: 0.30,
    cacheWritePerMillion: 0.075,
    cacheReadPerMillion: 0.01875,
  },
};

export interface ReserveBudgetParams {
  organizationId?: string;
  idempotencyKey?: string;
  jobId?: string;
  failureId?: string;
  repoId?: string;
  provider: string;
  model: string;
}

export interface BudgetReservationResult {
  allowed: boolean;
  reservationId?: string;
  reservedAmountUsd: number;
  currentSpendUsd: number;
  effectiveAvailableUsd: number;
  rejectionReason?: string;
}

export interface SettleReservationParams {
  reservationId: string;
  promptTokens: number;
  completionTokens: number;
  cacheWriteTokens?: number;
  cacheReadTokens?: number;
  latencyMs?: number;
}

export interface BudgetLedgerSummary {
  id: string;
  periodStart: string;
  periodEnd: string;
  budgetLimitUsd: number;
  nominalCapUsd: number;
  settledSpendUsd: number;
  reservedSpendUsd: number;
  uncertainSpendUsd: number;
  totalCommittedUsd: number;
  effectiveAvailableUsd: number;
  isActive: boolean;
}

export class AiBudgetController {
  constructor(private executor?: DatabaseExecutor) {}

  private get db(): DatabaseExecutor {
    return this.executor || getDatabaseExecutor();
  }

  private async executeTx<T>(callback: (executor: DatabaseExecutor) => Promise<T>): Promise<T> {
    if (this.executor) {
      return callback(this.executor);
    }
    return withTransaction(callback);
  }

  /**
   * Pre-flight atomic budget reservation.
   * Uses pessimistic row-locking on active monthly ledger.
   */
  async reserveBudget(params: ReserveBudgetParams): Promise<BudgetReservationResult> {
    const pricing = PRICING_REGISTRY[params.model];
    const isFreeTierProvider = params.provider === 'mock' || params.provider === 'puter';
    if (!pricing && !isFreeTierProvider) {
      return {
        allowed: false,
        reservedAmountUsd: 0,
        currentSpendUsd: 0,
        effectiveAvailableUsd: 0,
        rejectionReason: `PRICING_CONFIG_MISSING: Model ${params.model} has no registered pricing schedule`,
      };
    }

    const idempotencyKey = params.idempotencyKey || `res_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
    const reservationAmount = isFreeTierProvider ? 0.0001 : STANDARD_RESERVATION_USD;
    const isOrgUuid = params.organizationId ? /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(params.organizationId) : false;
    const orgId = isOrgUuid ? params.organizationId : undefined;

    return this.executeTx(async (tx) => {
      // 0. Replay Protection: Check if this idempotency key was already reserved for this tenant
      if (params.idempotencyKey) {
        const idempSql = orgId
          ? `SELECT id, total_reserved_usd, actual_cost_usd, status
             FROM ai_cost_reservations
             WHERE organization_id = $1 AND idempotency_key = $2 LIMIT 1`
          : `SELECT id, total_reserved_usd, actual_cost_usd, status
             FROM ai_cost_reservations
             WHERE organization_id IS NULL AND idempotency_key = $1 LIMIT 1`;
        const idempParams = orgId
          ? [orgId, idempotencyKey]
          : [idempotencyKey];
        const existingRes = await tx.query<any>(idempSql, idempParams);
        if (existingRes.rows.length > 0) {
          const existing = existingRes.rows[0];
          return {
            allowed: true,
            reservationId: existing.id,
            reservedAmountUsd: parseFloat(existing.total_reserved_usd || 0),
            currentSpendUsd: 0,
            effectiveAvailableUsd: 0,
          };
        }
      }

      // 1. Lock active monthly ledger row exclusively (tenant-scoped or global)
      let ledgerRes: any;
      if (orgId) {
        ledgerRes = await tx.query<any>(
          `SELECT id, period_start, period_end, budget_limit_usd, nominal_cap_usd,
                  settled_spend_usd, reserved_spend_usd, uncertain_spend_usd
           FROM ai_budget_ledgers
           WHERE organization_id = $1 AND period_start <= NOW() AND period_end > NOW() AND is_active = TRUE
           FOR UPDATE`,
          [orgId]
        );
      } else {
        ledgerRes = await tx.query<any>(
          `SELECT id, period_start, period_end, budget_limit_usd, nominal_cap_usd,
                  settled_spend_usd, reserved_spend_usd, uncertain_spend_usd
           FROM ai_budget_ledgers
           WHERE organization_id IS NULL AND period_start <= NOW() AND period_end > NOW() AND is_active = TRUE
           FOR UPDATE`
        );
      }

      let ledger = ledgerRes.rows[0];

      // Auto-initialize current month if missing
      if (!ledger) {
        if (orgId) {
          const settingsRes = await tx.query<any>(
            `SELECT monthly_limit_usd, nominal_cap_usd, enabled
             FROM organization_ai_budget_settings
             WHERE organization_id = $1`,
            [orgId]
          );
          const settings = settingsRes.rows[0];
          if (settings && !settings.enabled) {
            return {
              allowed: false,
              reservedAmountUsd: 0,
              currentSpendUsd: 0,
              effectiveAvailableUsd: 0,
              rejectionReason: `ORGANIZATION_AI_BUDGET_DISABLED: AI budget is disabled for organization ${orgId}`,
            };
          }
          const limitUsd = settings ? parseFloat(settings.monthly_limit_usd) : 50.0;
          const nominalCapUsd = settings ? parseFloat(settings.nominal_cap_usd) : limitUsd * 0.95;

          const initRes = await tx.query<any>(
            `INSERT INTO ai_budget_ledgers (organization_id, period_start, period_end, budget_limit_usd, nominal_cap_usd)
             VALUES ($1, date_trunc('month', NOW()), date_trunc('month', NOW()) + INTERVAL '1 month', $2, $3)
             RETURNING *`,
            [orgId, limitUsd, nominalCapUsd]
          );
          ledger = initRes.rows[0];
        } else {
          const initRes = await tx.query<any>(
            `INSERT INTO ai_budget_ledgers (period_start, period_end, budget_limit_usd, nominal_cap_usd)
             VALUES (date_trunc('month', NOW()), date_trunc('month', NOW()) + INTERVAL '1 month', 500.0000, 475.0000)
             RETURNING *`
          );
          ledger = initRes.rows[0];
        }
      }

      const settled = parseFloat(ledger.settled_spend_usd || 0);
      const reserved = parseFloat(ledger.reserved_spend_usd || 0);
      const uncertain = parseFloat(ledger.uncertain_spend_usd || 0);
      const nominalCap = parseFloat(ledger.nominal_cap_usd || NOMINAL_ADMISSION_CAP_USD);
      const hardCeiling = parseFloat(ledger.budget_limit_usd || BUDGET_LIMIT_USD);

      const totalCommitted = settled + reserved + uncertain;
      const effectiveAvailable = Math.max(0, nominalCap - totalCommitted);

      // Check Hard Emergency Cutoff
      if (totalCommitted + reservationAmount > hardCeiling) {
        return {
          allowed: false,
          reservedAmountUsd: 0,
          currentSpendUsd: totalCommitted,
          effectiveAvailableUsd: 0,
          rejectionReason: `EMERGENCY_HARD_CEILING_REACHED: Committed $${totalCommitted.toFixed(4)} exceeds $${hardCeiling.toFixed(2)} limit`,
        };
      }

      // Check Nominal Admission Cap ($475 or 95% of org limit)
      if (totalCommitted + reservationAmount > nominalCap) {
        return {
          allowed: false,
          reservedAmountUsd: 0,
          currentSpendUsd: totalCommitted,
          effectiveAvailableUsd: effectiveAvailable,
          rejectionReason: `NOMINAL_BUDGET_CAP_EXCEEDED: Committed $${totalCommitted.toFixed(4)} + $${reservationAmount.toFixed(4)} exceeds $${nominalCap.toFixed(2)} cap`,
        };
      }

      // 2. Insert reservation record
      const insertRes = await tx.query<any>(
        `INSERT INTO ai_cost_reservations (
           organization_id, ledger_id, idempotency_key, job_id, failure_id, repo_id,
           provider, model, pricing_version, status,
           estimated_cost_usd, safety_margin_usd, total_reserved_usd, expires_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'reserved', $10, $11, $12, NOW() + INTERVAL '120 seconds')
         RETURNING id`,
        [
          orgId || null,
          ledger.id,
          idempotencyKey,
          params.jobId || null,
          params.failureId || null,
          params.repoId || null,
          params.provider,
          params.model,
          CURRENT_PRICING_VERSION,
          reservationAmount * 0.75,
          reservationAmount * 0.25,
          reservationAmount,
        ]
      );

      const reservationId = insertRes.rows[0].id;

      // 3. Atomically increment reserved_spend_usd on ledger
      await tx.query(
        `UPDATE ai_budget_ledgers
         SET reserved_spend_usd = reserved_spend_usd + $1, updated_at = NOW()
         WHERE id = $2`,
        [reservationAmount, ledger.id]
      );

      return {
        allowed: true,
        reservationId,
        reservedAmountUsd: reservationAmount,
        currentSpendUsd: totalCommitted + reservationAmount,
        effectiveAvailableUsd: effectiveAvailable - reservationAmount,
      };
    });
  }

  /**
   * Mark socket connected and request payload transmitted to provider.
   */
  async markSubmitted(reservationId: string): Promise<void> {
    await this.db.query(
      `UPDATE ai_cost_reservations
       SET status = 'submitted', updated_at = NOW()
       WHERE id = $1 AND status = 'reserved'`,
      [reservationId]
    );
  }

  /**
   * Settle reservation upon receiving successful HTTP 200 response with usage tokens.
   */
  async settleReservation(params: SettleReservationParams): Promise<number> {
    return this.executeTx(async (tx) => {
      const resQuery = await tx.query<any>(
        `SELECT id, ledger_id, provider, model, total_reserved_usd, actual_cost_usd, status
         FROM ai_cost_reservations
         WHERE id = $1
         FOR UPDATE`,
        [params.reservationId]
      );

      const reservation = resQuery.rows[0];
      if (!reservation) {
        throw new Error(`Reservation ${params.reservationId} not found`);
      }

      // Idempotency: if already settled, return previously recorded actual cost without double counting
      if (reservation.status === 'settled') {
        return parseFloat(reservation.actual_cost_usd || 0);
      }

      const pricing = PRICING_REGISTRY[reservation.model] || PRICING_REGISTRY['claude-3-5-haiku-20241022'];
      const reservedAmount = parseFloat(reservation.total_reserved_usd);

      // Calculate exact actual cost
      const inputTokens = Math.round(params.promptTokens);
      const outputTokens = Math.round(params.completionTokens);
      const cacheWriteTokens = Math.round(params.cacheWriteTokens || 0);
      const cacheReadTokens = Math.round(params.cacheReadTokens || 0);
      const roundedLatencyMs = params.latencyMs != null ? Math.round(params.latencyMs) : null;

      let actualCost = 0;
      if (reservation.provider === 'mock') {
        actualCost = 0.00001;
      } else {
        const inputCost = (inputTokens / 1_000_000) * pricing.inputPerMillion;
        const outputCost = (outputTokens / 1_000_000) * pricing.outputPerMillion;
        const cacheWriteCost = (cacheWriteTokens / 1_000_000) * pricing.cacheWritePerMillion;
        const cacheReadCost = (cacheReadTokens / 1_000_000) * pricing.cacheReadPerMillion;
        actualCost = inputCost + outputCost + cacheWriteCost + cacheReadCost;
      }

      // Update reservation row
      await tx.query(
        `UPDATE ai_cost_reservations
         SET status = 'settled',
             actual_cost_usd = $1,
             prompt_tokens = $2,
             completion_tokens = $3,
             cache_write_tokens = $4,
             cache_read_tokens = $5,
             latency_ms = $6,
             updated_at = NOW()
         WHERE id = $7`,
        [
          actualCost,
          inputTokens,
          outputTokens,
          cacheWriteTokens,
          cacheReadTokens,
          roundedLatencyMs,
          params.reservationId,
        ]
      );

      // Decrement reserved_spend_usd and increment settled_spend_usd on ledger
      await tx.query(
        `UPDATE ai_budget_ledgers
         SET reserved_spend_usd = GREATEST(0, reserved_spend_usd - $1),
             settled_spend_usd = settled_spend_usd + $2,
             updated_at = NOW()
         WHERE id = $3`,
        [reservedAmount, actualCost, reservation.ledger_id]
      );

      return actualCost;
    });
  }

  /**
   * Release reservation when provider returned an error with confirmed zero charge (e.g. 401, 400).
   */
  async markFailedZero(reservationId: string, reason: string): Promise<void> {
    await this.executeTx(async (tx) => {
      const resQuery = await tx.query<any>(
        `SELECT id, ledger_id, total_reserved_usd, status
         FROM ai_cost_reservations
         WHERE id = $1
         FOR UPDATE`,
        [reservationId]
      );

      const reservation = resQuery.rows[0];
      if (!reservation) return;
      if (reservation.status === 'failed_confirmed_zero') return;

      const reservedAmount = parseFloat(reservation.total_reserved_usd);

      await tx.query(
        `UPDATE ai_cost_reservations
         SET status = 'failed_confirmed_zero',
             actual_cost_usd = 0.000000,
             error_details = $1,
             updated_at = NOW()
         WHERE id = $2`,
        [reason, reservationId]
      );

      await tx.query(
        `UPDATE ai_budget_ledgers
         SET reserved_spend_usd = GREATEST(0, reserved_spend_usd - $1),
             updated_at = NOW()
         WHERE id = $2`,
        [reservedAmount, reservation.ledger_id]
      );
    });
  }

  /**
   * Transition post-submission timeout or dropped socket to uncertain spend.
   * Locked against the budget until verified.
   */
  async markUsageUnknown(reservationId: string, reason: string): Promise<void> {
    await this.executeTx(async (tx) => {
      const resQuery = await tx.query<any>(
        `SELECT id, ledger_id, total_reserved_usd, status
         FROM ai_cost_reservations
         WHERE id = $1
         FOR UPDATE`,
        [reservationId]
      );

      const reservation = resQuery.rows[0];
      if (!reservation) return;
      if (reservation.status === 'usage_unknown') return;

      const reservedAmount = parseFloat(reservation.total_reserved_usd);

      await tx.query(
        `UPDATE ai_cost_reservations
         SET status = 'usage_unknown',
             error_details = $1,
             updated_at = NOW()
         WHERE id = $2`,
        [reason, reservationId]
      );

      // Move from reserved to uncertain spend
      await tx.query(
        `UPDATE ai_budget_ledgers
         SET reserved_spend_usd = GREATEST(0, reserved_spend_usd - $1),
             uncertain_spend_usd = uncertain_spend_usd + $1,
             updated_at = NOW()
         WHERE id = $2`,
        [reservedAmount, reservation.ledger_id]
      );
    });
  }

  /**
   * Fetch current monthly ledger state (for a specific organization or global).
   */
  async getActiveLedger(organizationId?: string): Promise<BudgetLedgerSummary | null> {
    const isOrgUuid = organizationId ? /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(organizationId) : false;
    const orgId = isOrgUuid ? organizationId : undefined;
    const query = orgId
      ? `SELECT * FROM ai_budget_ledgers
         WHERE organization_id = $1 AND period_start <= NOW() AND period_end > NOW() AND is_active = TRUE
         LIMIT 1`
      : `SELECT * FROM ai_budget_ledgers
         WHERE organization_id IS NULL AND period_start <= NOW() AND period_end > NOW() AND is_active = TRUE
         LIMIT 1`;
    const params = orgId ? [orgId] : [];
    const res = await this.db.query<any>(query, params);

    const row = res.rows[0];
    if (!row) return null;

    const settled = parseFloat(row.settled_spend_usd || 0);
    const reserved = parseFloat(row.reserved_spend_usd || 0);
    const uncertain = parseFloat(row.uncertain_spend_usd || 0);
    const budgetLimit = parseFloat(row.budget_limit_usd || 500);
    const nominalCap = parseFloat(row.nominal_cap_usd || 475);
    const totalCommitted = settled + reserved + uncertain;

    return {
      id: row.id,
      periodStart: row.period_start,
      periodEnd: row.period_end,
      budgetLimitUsd: budgetLimit,
      nominalCapUsd: nominalCap,
      settledSpendUsd: settled,
      reservedSpendUsd: reserved,
      uncertainSpendUsd: uncertain,
      totalCommittedUsd: totalCommitted,
      effectiveAvailableUsd: Math.max(0, nominalCap - totalCommitted),
      isActive: row.is_active,
    };
  }

  /**
   * Background reaper: Clean up un-submitted expired reservations safely.
   */
  async reconcileExpiredReservations(): Promise<number> {
    return this.executeTx(async (tx) => {
      // Find expired unsubmitted reservations
      const expiredRes = await tx.query<any>(
        `SELECT id, ledger_id, total_reserved_usd
         FROM ai_cost_reservations
         WHERE status = 'reserved' AND expires_at < NOW()
         FOR UPDATE`
      );

      let totalCleaned = 0;
      for (const row of expiredRes.rows) {
        const amount = parseFloat(row.total_reserved_usd);
        await tx.query(
          `UPDATE ai_cost_reservations
           SET status = 'failed_confirmed_zero',
               error_details = 'Expired in pre-flight without submission',
               updated_at = NOW()
           WHERE id = $1`,
          [row.id]
        );

        await tx.query(
          `UPDATE ai_budget_ledgers
           SET reserved_spend_usd = GREATEST(0, reserved_spend_usd - $1),
               updated_at = NOW()
           WHERE id = $2`,
          [amount, row.ledger_id]
        );
        totalCleaned++;
      }

      return totalCleaned;
    });
  }
}
