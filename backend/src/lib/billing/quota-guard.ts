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
