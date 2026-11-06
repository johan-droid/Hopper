import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from './client';
import { AdhocDiagnoseRequest, BillingCheckoutRequest } from './schema';

/**
 * Query keys always carry the tenant/user scope. Signing out clears the whole
 * cache (see `useSignOut`), so a second account on the same browser cannot read
 * the first account's cached pages.
 */
export const queryKeys = {
  health: ['health'] as const,
  dashboard: (orgSlug: string) => ['dashboard', orgSlug] as const,
  signature: (signatureId: string) => ['signature', signatureId] as const,
  workspaces: (userId: string | null) => ['workspaces', userId] as const,
  profile: (userId: string | null) => ['profile', userId] as const,
  repositories: (workspaceId: string | null) => ['repositories', workspaceId] as const,
  repoFailures: (repoId: string) => ['repo-failures', repoId] as const,
  diagnoses: (workspaceId: string | null) => ['diagnoses', workspaceId] as const,
  members: (workspaceId: string | null) => ['members', workspaceId] as const,
};

export function useHealthQuery() {
  return useQuery({
    queryKey: queryKeys.health,
    queryFn: () => api.getHealth(),
    // Health is cheap and drives the global status indicator.
    refetchInterval: 30_000,
    retry: 1,
    staleTime: 15_000,
  });
}

export function useWorkspacesQuery(userId: string | null, enabled = true) {
  return useQuery({
    queryKey: queryKeys.workspaces(userId),
    queryFn: () => api.listWorkspaces(),
    enabled: enabled && Boolean(userId),
    staleTime: 60_000,
  });
}

export function useUserProfileQuery(userId: string | null, enabled = true) {
  return useQuery({
    queryKey: queryKeys.profile(userId),
    queryFn: () => api.getUserProfile(),
    enabled: enabled && Boolean(userId),
    staleTime: 60_000,
    retry: false,
  });
}

export function useDashboardQuery(orgSlug: string | null) {
  return useQuery({
    queryKey: queryKeys.dashboard(orgSlug ?? ''),
    queryFn: () => api.getDashboard(orgSlug!),
    enabled: Boolean(orgSlug),
    staleTime: 30_000,
    retry: 1,
  });
}

export function useRepositoriesQuery(workspaceId: string | null) {
  return useQuery({
    queryKey: queryKeys.repositories(workspaceId),
    queryFn: () => api.listRepositories(workspaceId ?? undefined),
    enabled: Boolean(workspaceId),
    staleTime: 30_000,
  });
}

export function useRepoFailuresQuery(repoId: string | null) {
  return useQuery({
    queryKey: queryKeys.repoFailures(repoId ?? ''),
    queryFn: () => api.getRepositoryFailures(repoId!),
    enabled: Boolean(repoId),
    staleTime: 20_000,
  });
}

export function useSignatureQuery(signatureId: string | null) {
  return useQuery({
    queryKey: queryKeys.signature(signatureId ?? ''),
    queryFn: () => api.getSignature(signatureId!),
    enabled: Boolean(signatureId),
    staleTime: 60_000,
  });
}

export function useDiagnosisHistoryQuery(workspaceId: string | null) {
  return useQuery({
    queryKey: queryKeys.diagnoses(workspaceId),
    queryFn: () => api.listDiagnosisHistory(workspaceId ?? undefined),
    enabled: Boolean(workspaceId),
    staleTime: 30_000,
  });
}

export function useWorkspaceMembersQuery(workspaceId: string | null) {
  return useQuery({
    queryKey: queryKeys.members(workspaceId),
    queryFn: () => api.getWorkspaceMembers(workspaceId!),
    enabled: Boolean(workspaceId),
    staleTime: 60_000,
  });
}

export function useAdhocDiagnoseMutation() {
  return useMutation({
    mutationFn: (input: AdhocDiagnoseRequest) => api.diagnoseAdhoc(input),
  });
}

export function useCheckoutMutation() {
  return useMutation({
    mutationFn: (input: BillingCheckoutRequest) => api.createCheckoutSession(input),
  });
}
