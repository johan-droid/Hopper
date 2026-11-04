import { create } from 'zustand';

export type AppTab = 'overview' | 'signatures' | 'diagnose' | 'billing' | 'gateway';
export type PlanTier = 'free' | 'pro_dev' | 'team';

interface AppState {
  activeTab: AppTab;
  selectedOrg: string;
  simulatedPlan: PlanTier;
  selectedSignatureId: string | null;
  setTab: (tab: AppTab) => void;
  setSelectedOrg: (org: string) => void;
  setSimulatedPlan: (plan: PlanTier) => void;
  inspectSignature: (sigId: string) => void;
}

export const useAppStore = create<AppState>((set) => ({
  activeTab: 'overview',
  selectedOrg: 'acme-corp',
  simulatedPlan: 'free',
  selectedSignatureId: 'sig_7f8a91c20e14',
  setTab: (tab) => set({ activeTab: tab }),
  setSelectedOrg: (org) => set({ selectedOrg: org }),
  setSimulatedPlan: (plan) => set({ simulatedPlan: plan }),
  inspectSignature: (sigId) => set({ selectedSignatureId: sigId, activeTab: 'signatures' }),
}));
