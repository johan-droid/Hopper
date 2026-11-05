import React from 'react';
import { useAppStore } from '../../store/useAppStore';
import { useCheckoutMutation } from '../../api/hooks';
import { Check, ArrowRight, Sparkles } from 'lucide-react';

export const BillingPlansView: React.FC = () => {
  const { planTier, selectedOrg } = useAppStore();
  const checkoutMutation = useCheckoutMutation();

  const handleCheckout = async (plan: 'pro_dev' | 'team') => {
    try {
      const res = await checkoutMutation.mutateAsync({
        orgId: '00000000-0000-0000-0000-000000000001',
        orgLogin: selectedOrg,
        plan,
      });

      if (res.checkoutUrl) {
        window.location.href = res.checkoutUrl;
      } else {
        setPlanTier(plan);
        alert(`Activated ${plan === 'pro_dev' ? 'Solo / Pro Dev' : 'Small Team'} plan in local mode!`);
      }
    } catch {
      setPlanTier(plan);
      alert(`Switched active organization to ${plan} tier.`);
    }
  };

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-extrabold text-white tracking-tight">
          Simple, Predictable CI Intelligence Pricing
        </h2>
        <p className="text-xs text-slate-400 max-w-lg mx-auto">
          Stop burning engineering hours debugging flaky CI pipelines. Upgrade your plan to unlock 30-day cross-run matrices and Slack triage.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Tier 1: Free Developer */}
        <div className="bg-[#0f1523] border border-white/10 rounded-xl p-6 flex flex-col justify-between shadow-sm">
          <div>
            <div className="text-base font-bold text-white">Free Developer</div>
            <div className="text-xs text-slate-400 mt-1 min-h-[32px]">
              For open-source projects and solo builders getting started.
            </div>
            <div className="text-3xl font-extrabold text-white font-mono mt-4">
              $0 <span className="text-xs font-normal text-slate-400">/ month</span>
            </div>

            <ul className="mt-6 space-y-2.5 text-xs text-slate-300 font-mono">
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>30 diagnosed runs / mo</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>24-hour failure history</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Top 1 unblurred flaky test</span>
              </li>
              <li className="flex items-center gap-2 text-slate-600 line-through">
                <span>✕</span> 30-day historical timeline
              </li>
              <li className="flex items-center gap-2 text-slate-600 line-through">
                <span>✕</span> Slack & Discord alerts
              </li>
            </ul>
          </div>

          <button
            disabled={simulatedPlan === 'free'}
            onClick={() => setSimulatedPlan('free')}
            className={`w-full mt-6 py-2 rounded-lg text-xs font-mono font-semibold transition-colors ${
              simulatedPlan === 'free'
                ? 'bg-slate-800 text-slate-400 border border-white/5 cursor-default'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer'
            }`}
          >
            {simulatedPlan === 'free' ? 'Current Active Plan' : 'Downgrade to Free'}
          </button>
        </div>

        {/* Tier 2: Pro Dev (Featured) */}
        <div className="bg-gradient-to-b from-[#151e32] to-[#0f1523] border-2 border-cyan-500/50 rounded-xl p-6 flex flex-col justify-between shadow-xl shadow-cyan-500/10 relative">
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-gradient-to-r from-cyan-500 to-blue-600 text-[10px] font-mono font-bold tracking-wider text-white uppercase shadow-md">
            Most Popular
          </div>

          <div>
            <div className="text-base font-bold text-white flex items-center gap-1.5">
              <span>Solo / Pro Dev</span>
              <Sparkles className="w-4 h-4 text-cyan-400" />
            </div>
            <div className="text-xs text-slate-400 mt-1 min-h-[32px]">
              For full-stack developers shipping production software daily.
            </div>
            <div className="text-3xl font-extrabold text-white font-mono mt-4">
              $9 <span className="text-xs font-normal text-slate-400">/ month</span>
            </div>

            <ul className="mt-6 space-y-2.5 text-xs text-slate-300 font-mono">
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-cyan-400 shrink-0" />
                <span className="text-white font-semibold">250 diagnosed runs / mo</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-cyan-400 shrink-0" />
                <span>Full 30-day failure history</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-cyan-400 shrink-0" />
                <span>Unblurred Flaky Test Matrix</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-cyan-400 shrink-0" />
                <span>Cross-run signature timeline</span>
              </li>
              <li className="flex items-center gap-2 text-slate-600 line-through">
                <span>✕</span> Auto-retry policy
              </li>
            </ul>
          </div>

          <button
            onClick={() => handleCheckout('pro_dev')}
            disabled={checkoutMutation.isPending || simulatedPlan === 'pro_dev'}
            className={`w-full mt-6 py-2.5 rounded-lg text-xs font-mono font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              simulatedPlan === 'pro_dev'
                ? 'bg-cyan-950/60 text-cyan-400 border border-cyan-800/50 cursor-default'
                : 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white shadow-lg shadow-cyan-500/20'
            }`}
          >
            {simulatedPlan === 'pro_dev' ? (
              'Current Active Plan'
            ) : (
              <>
                Upgrade to Pro Dev ($9/mo) <ArrowRight className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </div>

        {/* Tier 3: Small Team */}
        <div className="bg-[#0f1523] border border-white/10 rounded-xl p-6 flex flex-col justify-between shadow-sm">
          <div>
            <div className="text-base font-bold text-white">Small Team</div>
            <div className="text-xs text-slate-400 mt-1 min-h-[32px]">
              For engineering organizations demanding zero CI downtime.
            </div>
            <div className="text-3xl font-extrabold text-white font-mono mt-4">
              $29 <span className="text-xs font-normal text-slate-400">/ month</span>
            </div>

            <ul className="mt-6 space-y-2.5 text-xs text-slate-300 font-mono">
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="text-white font-semibold">1,000 diagnosed runs / mo</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>90-day cross-run failure archive</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Slack & Discord channel alerts</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Auto-retry policy (&gt;80% flaky)</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Weekly CI Flakiness digest</span>
              </li>
            </ul>
          </div>

          <button
            onClick={() => handleCheckout('team')}
            disabled={checkoutMutation.isPending || simulatedPlan === 'team'}
            className={`w-full mt-6 py-2.5 rounded-lg text-xs font-mono font-semibold transition-colors cursor-pointer ${
              simulatedPlan === 'team'
                ? 'bg-slate-800 text-slate-400 border border-white/5 cursor-default'
                : 'bg-slate-800 hover:bg-slate-700 text-white border border-white/10'
            }`}
          >
            {simulatedPlan === 'team' ? 'Current Active Plan' : 'Upgrade to Team ($29/mo)'}
          </button>
        </div>
      </div>
    </div>
  );
};
