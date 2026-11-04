import { describe, it, expect } from 'vitest';
import { checkQuota, PLAN_LIMITS } from '../src/lib/billing/quota-guard.js';

describe('Quota Guard & Paywall Gate', () => {
  it('should allow runs within free quota limit (<= 30)', () => {
    const res = checkQuota('free', 10);
    expect(res.allowed).toBe(true);
    expect(res.remainingRuns).toBe(20);
    expect(res.exhaustionNotice).toBeUndefined();
  });

  it('should block and produce exhaustion notice when free quota is exceeded', () => {
    const res = checkQuota('free', 30);
    expect(res.allowed).toBe(false);
    expect(res.remainingRuns).toBe(0);
    expect(res.exhaustionNotice).toContain('Hopper Monthly Free Quota Reached');
    expect(res.exhaustionNotice).toContain('Upgrade to Pro ($9/mo)');
  });

  it('should enforce pro tier limit of 250 runs and team tier limit of 1000 runs', () => {
    expect(PLAN_LIMITS.pro_dev.monthlyRuns).toBe(250);
    expect(PLAN_LIMITS.team.monthlyRuns).toBe(1000);

    const proRes = checkQuota('pro_dev', 250);
    expect(proRes.allowed).toBe(false);

    const teamRes = checkQuota('team', 999);
    expect(teamRes.allowed).toBe(true);
  });
});
