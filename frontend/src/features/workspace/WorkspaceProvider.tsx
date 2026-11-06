import React, { createContext, useContext, useEffect, useMemo } from 'react';
import { useSession } from '../auth/useSession';
import {
  useUserProfileQuery,
  useWorkspacesQuery,
} from '../../api/hooks';
import { useUiStore } from '../../store/useAppStore';
import type { UserProfile, Workspace } from '../../api/schema';

interface WorkspaceContextValue {
  workspaces: Workspace[];
  workspace: Workspace | null;
  workspaceId: string | null;
  setWorkspaceId: (id: string) => void;
  profile: UserProfile | null;
  userId: string | null;
  loading: boolean;
  errorMessage: string | null;
  refetch: () => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

/**
 * Resolves the active tenant. The selected workspace is a UI preference, but it
 * is always validated against the server's workspace list before use — a stale
 * or tampered id from local storage can never address another tenant.
 */
export const WorkspaceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { userId } = useSession();
  const selectedWorkspaceId = useUiStore((state) => state.selectedWorkspaceId);
  const setSelectedWorkspaceId = useUiStore((state) => state.setSelectedWorkspaceId);

  const workspacesQuery = useWorkspacesQuery(userId);
  const profileQuery = useUserProfileQuery(userId);

  const workspaces = useMemo(
    () => workspacesQuery.data?.workspaces ?? [],
    [workspacesQuery.data]
  );

  useEffect(() => {
    if (workspaces.length === 0) return;
    const current = workspaces.some((workspace) => workspace.id === selectedWorkspaceId);
    if (current) return;

    const preferred = profileQuery.data?.profile.current_workspace_id ?? null;
    const fallback = workspaces.find((workspace) => workspace.id === preferred) ?? workspaces[0];
    setSelectedWorkspaceId(fallback.id);
  }, [workspaces, selectedWorkspaceId, profileQuery.data, setSelectedWorkspaceId]);

  const workspace = useMemo(
    () => workspaces.find((item) => item.id === selectedWorkspaceId) ?? null,
    [workspaces, selectedWorkspaceId]
  );

  const value: WorkspaceContextValue = {
    workspaces,
    workspace,
    workspaceId: workspace?.id ?? null,
    setWorkspaceId: setSelectedWorkspaceId,
    profile: profileQuery.data?.profile ?? null,
    userId,
    loading: workspacesQuery.isLoading || profileQuery.isLoading,
    errorMessage:
      workspacesQuery.isError
        ? 'Could not load workspaces. Check that your account has a workspace and that the API is reachable.'
        : null,
    refetch: () => {
      void workspacesQuery.refetch();
      void profileQuery.refetch();
    },
  };

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
};

export function useWorkspace(): WorkspaceContextValue {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error('useWorkspace must be used inside WorkspaceProvider');
  }
  return context;
}
