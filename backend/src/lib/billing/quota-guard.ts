/**
 * Paywall & Quota Guard: Enforces monthly run limits and tier-based feature gates.
 *
 * Tier Matrix:
 * - Free: 30 runs/mo, 24h retention, basic sticky comment
 * - Pro ($9/mo): 250 runs/mo, 30d retention, cross-run pattern history, flaky test matrix
 * - Team ($29/mo): 1,000 runs/mo, 90d retention, Slack/Discord alerts, auto-retry policies
 */

export type PlanTier = 'free' | 'pro_dev' | 'team';

export interface PlanLimits {
  monthlyRuns: number;
  retentionDays: number;
  slackAlerts: boolean;
  crossRunMoatUnlocked: boolean;
  autoRetryFlaky: boolean;
}

export const PLAN_LIMITS: Record<PlanTier, PlanLimits> = {
  free: {
    monthlyRuns: 30,
    retentionDays: 1,
    slackAlerts: false,
    crossRunMoatUnlocked: false,
    autoRetryFlaky: false,
  },
  pro_dev: {
    monthlyRuns: 250,
    retentionDays: 30,
    slackAlerts: false,
    crossRunMoatUnlocked: true,
    autoRetryFlaky: false,
  },
  team: {
    monthlyRuns: 1000,
    retentionDays: 90,
    slackAlerts: true,
    crossRunMoatUnlocked: true,
    autoRetryFlaky: true,
  },
};

export interface QuotaCheckResult {
  allowed: boolean;
  plan: PlanTier;
  runsUsed: number;
  limit: number;
  remainingRuns: number;
  exhaustionNotice?: string;
}

export function checkQuota(
  plan: PlanTier,
  runsUsed: number,
  billingUrl = 'https://hopper.dev/billing',
  options?: { enforce?: boolean }
): QuotaCheckResult {
  const isEnforced =
    options?.enforce ??
    (process.env.ENABLE_COMMERCIAL_QUOTA === 'true' || process.env.NODE_ENV === 'test');

  const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.free;

  if (!isEnforced) {
    // Traction Validation Discovery: Commercial quota enforcement is dormant & non-blocking.
    return {
      allowed: true,
      plan,
      runsUsed,
      limit: limits.monthlyRuns,
      remainingRuns: 999999,
    };
  }

  const allowed = runsUsed < limits.monthlyRuns;
  const remaining = Math.max(0, limits.monthlyRuns - runsUsed);

  let exhaustionNotice: string | undefined;
  if (!allowed) {
    if (plan === 'free') {
      exhaustionNotice = `⚠️ **Hopper Monthly Free Quota Reached (${limits.monthlyRuns}/${limits.monthlyRuns} builds diagnosed).** [Upgrade to Pro ($9/mo) for 250 runs + full flaky test history →](${billingUrl})`;
    } else {
      exhaustionNotice = `⚠️ **Hopper Plan Quota Reached (${limits.monthlyRuns}/${limits.monthlyRuns} runs).** [Upgrade plan to maintain automated CI diagnosis →](${billingUrl})`;
    }
  }

  return {
    allowed,
    plan,
    runsUsed,
    limit: limits.monthlyRuns,
    remainingRuns: remaining,
    exhaustionNotice,
  };
}

/**
 * Reservation-based Quota Guard: Prevents TOCTOU race conditions under parallel
 * matrix bursts by atomically asserting and incrementing usage inside PostgreSQL.
 */
export async function reserveQuota(
  orgRepo: {
    tryReserveRunQuota?: (orgId: string, limit: number) => Promise<{ allowed: boolean; runsUsed: number }>;
  },
  orgId: string,
  plan: PlanTier,
  currentRunsUsed = 0,
  billingUrl = 'https://hopper.dev/billing',
  options?: { enforce?: boolean }
): Promise<QuotaCheckResult> {
  const isEnforced =
    options?.enforce ??
    (process.env.ENABLE_COMMERCIAL_QUOTA === 'true' || process.env.NODE_ENV === 'test');

  const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.free;

  if (!isEnforced) {
    return {
      allowed: true,
      plan,
      runsUsed: currentRunsUsed,
      limit: limits.monthlyRuns,
      remainingRuns: 999999,
    };
  }

  if (typeof orgRepo?.tryReserveRunQuota === 'function') {
    const result = await orgRepo.tryReserveRunQuota(orgId, limits.monthlyRuns);
    const remaining = Math.max(0, limits.monthlyRuns - result.runsUsed);
    let exhaustionNotice: string | undefined;
    if (!result.allowed) {
      if (plan === 'free') {
        exhaustionNotice = `⚠️ **Hopper Monthly Free Quota Reached (${limits.monthlyRuns}/${limits.monthlyRuns} builds diagnosed).** [Upgrade to Pro ($9/mo) for 250 runs + full flaky test history →](${billingUrl})`;
      } else {
        exhaustionNotice = `⚠️ **Hopper Plan Quota Reached (${limits.monthlyRuns}/${limits.monthlyRuns} runs).** [Upgrade plan to maintain automated CI diagnosis →](${billingUrl})`;
      }
    }
    return {
      allowed: result.allowed,
      plan,
      runsUsed: result.runsUsed,
      limit: limits.monthlyRuns,
      remainingRuns: remaining,
      exhaustionNotice,
    };
  }

  // Fallback to in-memory check
  const check = checkQuota(plan, currentRunsUsed, billingUrl, options);
  if (check.allowed && typeof (orgRepo as any)?.incrementRunsUsed === 'function') {
    await (orgRepo as any).incrementRunsUsed(orgId);
  }
  return check;
}
