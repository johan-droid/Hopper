import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { AiBudgetController, BUDGET_LIMIT_USD, NOMINAL_ADMISSION_CAP_USD } from '../src/lib/ai/budget-controller.js';
import { getDatabaseExecutor } from '../src/db/client.js';

describe('Hopper Phase 16R.2: Authoritative AI Budget Controller', () => {
  const controller = new AiBudgetController();
  const db = getDatabaseExecutor();

  beforeAll(async () => {
    // Ensure active ledger is clean for this test run
    await db.query(
      `UPDATE ai_budget_ledgers 
       SET settled_spend_usd = 0.0000, reserved_spend_usd = 0.0000, uncertain_spend_usd = 0.0000
       WHERE is_active = TRUE`
    );
  });

  afterAll(async () => {
    // Cleanup reservations created by tests
    await db.query(`DELETE FROM ai_cost_reservations WHERE idempotency_key LIKE 'test_%'`);
  });

  it('1. Pre-flight reservation admits requests under nominal cap and locks budget', async () => {
    const res = await controller.reserveBudget({
      idempotencyKey: `test_res_${Date.now()}_1`,
      provider: 'anthropic',
      model: 'claude-3-5-haiku-20241022',
    });

    expect(res.allowed).toBe(true);
    expect(res.reservationId).toBeDefined();
    expect(res.reservedAmountUsd).toBe(0.015);

    const ledger = await controller.getActiveLedger();
    expect(ledger).not.toBeNull();
    expect(ledger!.reservedSpendUsd).toBeGreaterThanOrEqual(0.015);
  });

  it('2. Settlements record actual token costs and decrement active reservation', async () => {
    const res = await controller.reserveBudget({
      idempotencyKey: `test_res_${Date.now()}_2`,
      provider: 'anthropic',
      model: 'claude-3-5-haiku-20241022',
    });

    expect(res.allowed).toBe(true);
    const reservationId = res.reservationId!;

    await controller.markSubmitted(reservationId);

    // Settle with 2000 prompt tokens and 400 completion tokens
    const actualCost = await controller.settleReservation({
      reservationId,
      promptTokens: 2000,
      completionTokens: 400,
      cacheWriteTokens: 0,
      cacheReadTokens: 0,
      latencyMs: 750,
    });

    // 2000 * $0.80/1M = $0.001600; 400 * $4.00/1M = $0.001600. Total = $0.003200
    expect(actualCost).toBeCloseTo(0.0032, 5);

    const checkRes = await db.query<any>(
      `SELECT status, actual_cost_usd, prompt_tokens FROM ai_cost_reservations WHERE id = $1`,
      [reservationId]
    );
    expect(checkRes.rows[0].status).toBe('settled');
    expect(parseFloat(checkRes.rows[0].actual_cost_usd)).toBeCloseTo(0.0032, 5);
  });

  it('3. Confirmed zero failures safely release reservation back to ledger', async () => {
    const res = await controller.reserveBudget({
      idempotencyKey: `test_res_${Date.now()}_3`,
      provider: 'anthropic',
      model: 'claude-3-5-haiku-20241022',
    });

    const reservationId = res.reservationId!;
    const beforeLedger = await controller.getActiveLedger();
    const beforeReserved = beforeLedger!.reservedSpendUsd;

    await controller.markFailedZero(reservationId, 'Provider returned 401 Unauthorized');

    const afterLedger = await controller.getActiveLedger();
    expect(afterLedger!.reservedSpendUsd).toBeLessThanOrEqual(beforeReserved);

    const checkRes = await db.query<any>(
      `SELECT status, actual_cost_usd FROM ai_cost_reservations WHERE id = $1`,
      [reservationId]
    );
    expect(checkRes.rows[0].status).toBe('failed_confirmed_zero');
    expect(parseFloat(checkRes.rows[0].actual_cost_usd)).toBe(0);
  });

  it('4. Timeouts transition to usage_unknown and remain locked in uncertain spend', async () => {
    const res = await controller.reserveBudget({
      idempotencyKey: `test_res_${Date.now()}_4`,
      provider: 'anthropic',
      model: 'claude-3-5-haiku-20241022',
    });

    const reservationId = res.reservationId!;
    await controller.markSubmitted(reservationId);
    await controller.markUsageUnknown(reservationId, 'Client socket timed out after 15000ms');

    const ledger = await controller.getActiveLedger();
    expect(ledger!.uncertainSpendUsd).toBeGreaterThanOrEqual(0.015);

    const checkRes = await db.query<any>(
      `SELECT status, error_details FROM ai_cost_reservations WHERE id = $1`,
      [reservationId]
    );
    expect(checkRes.rows[0].status).toBe('usage_unknown');
    expect(checkRes.rows[0].error_details).toContain('Client socket timed out');
  });

  it('5. Denies requests when nominal admission cap ($475.00) is exceeded', async () => {
    // Isolated executor test preventing parallel test thread collision on shared DB row
    const testExecutor = {
      query: async (sql: string, params?: any[]) => {
        if (sql.includes('SELECT') && sql.includes('ai_budget_ledgers')) {
          return {
            rows: [
              {
                id: 'test-saturated-ledger',
                period_start: new Date(),
                period_end: new Date(Date.now() + 86400000),
                budget_limit_usd: '500.0000',
                nominal_cap_usd: '475.0000',
                settled_spend_usd: '474.9900',
                reserved_spend_usd: '0.0000',
                uncertain_spend_usd: '0.0000',
              },
            ],
            rowCount: 1,
          };
        }
        return db.query(sql, params);
      },
    };

    const saturatedController = new AiBudgetController(testExecutor as any);
    const res = await saturatedController.reserveBudget({
      idempotencyKey: `test_res_${Date.now()}_5`,
      provider: 'anthropic',
      model: 'claude-3-5-haiku-20241022',
    });

    expect(res.allowed).toBe(false);
    expect(res.rejectionReason).toContain('NOMINAL_BUDGET_CAP_EXCEEDED');
  });

  it('6. Fails closed with PRICING_CONFIG_MISSING for unknown model strings', async () => {
    const res = await controller.reserveBudget({
      idempotencyKey: `test_res_${Date.now()}_6`,
      provider: 'anthropic',
      model: 'unregistered-experimental-model-v99',
    });

    expect(res.allowed).toBe(false);
    expect(res.rejectionReason).toContain('PRICING_CONFIG_MISSING');
  });
});
