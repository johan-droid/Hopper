import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from './client';
import { AdhocDiagnoseRequest, BillingCheckoutRequest } from './schema';

export const QUERY_KEYS = {
  health: ['health'] as const,
  dashboard: (orgSlug: string) => ['dashboard', orgSlug] as const,
  signature: (sigId: string) => ['signature', sigId] as const,
  workspaces: ['workspaces'] as const,
  userProfile: ['userProfile'] as const,
  repositories: (workspaceId?: string) => ['repositories', workspaceId] as const,
  repoFailures: (repoId: string) => ['repoFailures', repoId] as const,
};

export function useRepositoriesQuery(workspaceId?: string) {
  return useQuery({
    queryKey: QUERY_KEYS.repositories(workspaceId),
    queryFn: () => api.listRepositories(workspaceId),
    staleTime: 30000,
  });
}

export function useRepoFailuresQuery(repoId?: string) {
  return useQuery({
    queryKey: QUERY_KEYS.repoFailures(repoId || ''),
    queryFn: () => api.getRepositoryFailures(repoId!),
    enabled: Boolean(repoId),
    staleTime: 30000,
  });
}

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

export function useWorkspacesQuery(enabled = true) {
  return useQuery({
    queryKey: QUERY_KEYS.workspaces,
    queryFn: () => api.listWorkspaces(),
    enabled,
    staleTime: 30000,
  });
}

export function useWorkspaceMembersQuery(workspaceId?: string) {
  return useQuery({
    queryKey: ['workspaceMembers', workspaceId],
    queryFn: () => api.getWorkspaceMembers(workspaceId!),
    enabled: Boolean(workspaceId),
    staleTime: 30000,
  });
}

export function useUserProfileQuery(enabled = true) {
  return useQuery({
    queryKey: QUERY_KEYS.userProfile,
    queryFn: () => api.getUserProfile(),
    enabled,
    staleTime: 60000,
  });
}

export function useDiagnosisHistoryQuery(workspaceId?: string) {
  return useQuery({
    queryKey: ['diagnosisHistory', workspaceId],
    queryFn: () => api.listDiagnosisHistory(workspaceId),
    enabled: Boolean(workspaceId),
    staleTime: 15000,
  });
}
