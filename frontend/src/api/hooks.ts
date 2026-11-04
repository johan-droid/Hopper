import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from './client';
import { AdhocDiagnoseRequest, BillingCheckoutRequest } from './schema';

export const QUERY_KEYS = {
  health: ['health'] as const,
  dashboard: (orgSlug: string) => ['dashboard', orgSlug] as const,
  signature: (sigId: string) => ['signature', sigId] as const,
};

export function useHealthQuery() {
  return useQuery({
    queryKey: QUERY_KEYS.health,
    queryFn: () => api.getHealth(),
    refetchInterval: 15000,
    retry: 2,
  });
}

export function useDashboardQuery(orgSlug: string) {
  return useQuery({
    queryKey: QUERY_KEYS.dashboard(orgSlug),
    queryFn: () => api.getDashboard(orgSlug),
    staleTime: 30000,
    retry: 2,
  });
}

export function useSignatureQuery(sigId: string | null) {
  return useQuery({
    queryKey: QUERY_KEYS.signature(sigId || ''),
    queryFn: () => api.getSignature(sigId!),
    enabled: Boolean(sigId),
    staleTime: 60000,
  });
}

export function useAdhocDiagnoseMutation() {
  return useMutation({
    mutationFn: (data: AdhocDiagnoseRequest) => api.diagnoseAdhoc(data),
  });
}

export function useCheckoutMutation() {
  return useMutation({
    mutationFn: (data: BillingCheckoutRequest) => api.createCheckoutSession(data),
  });
}
