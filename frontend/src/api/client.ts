import { z } from 'zod';
import {
  HealthSchema,
  HealthData,
  DashboardSchema,
  DashboardData,
  SignatureDetailSchema,
  SignatureDetail,
  AdhocDiagnoseRequest,
  AdhocDiagnoseResponseSchema,
  AdhocDiagnoseResponse,
  BillingCheckoutRequest,
  BillingCheckoutResponseSchema,
  BillingCheckoutResponse,
  Workspace,
  WorkspaceSchema,
  WorkspaceMember,
  WorkspaceMemberSchema,
  UserProfile,
  UserProfileSchema,
  Repository,
  RepositorySchema,
  WorkflowFailure,
  WorkflowFailureSchema,
  DiagnosisHistoryItem,
  DiagnosisHistoryItemSchema,
} from './schema';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

class ApiClientError extends Error {
  public status: number;
  public details?: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.details = details;
  }
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {},
  schema: { parse: (data: unknown) => T }
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  const headers = new Headers(options.headers);

  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }
  headers.set('Accept', 'application/json');

  // Propagate authenticated JWT Bearer token if present
  if (!headers.has('Authorization')) {
    const token = typeof window !== 'undefined' ? localStorage.getItem('hopper_auth_token') : null;
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(url, {
      ...options,
      headers,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      let errorBody: unknown;
      try {
        errorBody = await res.json();
      } catch {
        errorBody = await res.text();
      }
      throw new ApiClientError(
        `API request failed with status ${res.status}`,
        res.status,
        errorBody
      );
    }

    const rawData = await res.json();
    return schema.parse(rawData);
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    if (err instanceof ApiClientError) {
      throw err;
    }
    if ((err as Error)?.name === 'AbortError') {
      throw new ApiClientError('Request timed out after 15s', 408);
    }
    throw new ApiClientError((err as Error)?.message || 'Network request failed', 0, err);
  }
}

export const api = {
  getHealth: (): Promise<HealthData> => {
    return request('/api/health', { method: 'GET' }, HealthSchema);
  },

  getDashboard: (orgSlug: string): Promise<DashboardData> => {
    return request(`/api/dashboard/${encodeURIComponent(orgSlug)}`, { method: 'GET' }, DashboardSchema);
  },

  getSignature: (signatureId: string): Promise<SignatureDetail> => {
    return request(`/api/signatures/${encodeURIComponent(signatureId)}`, { method: 'GET' }, SignatureDetailSchema);
  },

  diagnoseAdhoc: (payload: AdhocDiagnoseRequest): Promise<AdhocDiagnoseResponse> => {
    return request(
      '/api/diagnose/adhoc',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      AdhocDiagnoseResponseSchema
    );
  },

  createCheckoutSession: (payload: BillingCheckoutRequest): Promise<BillingCheckoutResponse> => {
    return request(
      '/api/billing/checkout',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      BillingCheckoutResponseSchema
    );
  },

  listWorkspaces: (): Promise<{ success: boolean; count: number; workspaces: Workspace[] }> => {
    return request(
      '/api/workspaces',
      { method: 'GET' },
      z.object({
        success: z.boolean(),
        count: z.number(),
        workspaces: z.array(WorkspaceSchema),
      })
    );
  },

  createWorkspace: (payload: { name: string; type?: string; description?: string; isPublic?: boolean }): Promise<{ success: boolean; workspace: Workspace }> => {
    return request(
      '/api/workspaces',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      z.object({
        success: z.boolean(),
        workspace: WorkspaceSchema,
      })
    );
  },

  getWorkspaceMembers: (workspaceId: string): Promise<{ success: boolean; count: number; members: WorkspaceMember[] }> => {
    return request(
      `/api/workspaces/${encodeURIComponent(workspaceId)}/members`,
      { method: 'GET' },
      z.object({
        success: z.boolean(),
        count: z.number(),
        members: z.array(WorkspaceMemberSchema),
      })
    );
  },

  getUserProfile: (): Promise<{ success: boolean; profile: UserProfile }> => {
    return request(
      '/api/user/profile',
      { method: 'GET' },
      z.object({
        success: z.boolean(),
        profile: UserProfileSchema,
      })
    );
  },

  listRepositories: (workspaceId?: string): Promise<{ success: boolean; count: number; repositories: Repository[] }> => {
    const q = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : '';
    return request(
      `/api/repositories${q}`,
      { method: 'GET' },
      z.object({
        success: z.boolean(),
        count: z.number(),
        repositories: z.array(RepositorySchema),
      })
    );
  },

  getRepositoryFailures: (repoId: string): Promise<{ repoId: string; failureCount: number; failures: WorkflowFailure[] }> => {
    return request(
      `/api/repositories/${encodeURIComponent(repoId)}/failures`,
      { method: 'GET' },
      z.object({
        repoId: z.string(),
        failureCount: z.number(),
        failures: z.array(WorkflowFailureSchema),
      })
    );
  },

  linkRepositoryToWorkspace: (repoId: string, workspaceId: string): Promise<{ success: boolean; repository: Repository }> => {
    return request(
      `/api/repositories/${encodeURIComponent(repoId)}/link-workspace`,
      {
        method: 'POST',
        body: JSON.stringify({ workspaceId }),
      },
      z.object({
        success: z.boolean(),
        repository: RepositorySchema,
      })
    );
  },

  listDiagnosisHistory: (workspaceId?: string): Promise<{ success: boolean; count: number; diagnoses: DiagnosisHistoryItem[] }> => {
    const q = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : '';
    return request(
      `/api/diagnose/history${q}`,
      { method: 'GET' },
      z.object({
        success: z.boolean(),
        count: z.number(),
        diagnoses: z.array(DiagnosisHistoryItemSchema),
      })
    );
  },
};
