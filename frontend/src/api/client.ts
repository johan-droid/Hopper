import { z } from 'zod';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
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
const REQUEST_TIMEOUT_MS = 20_000;

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly details?: unknown;

  constructor(message: string, status: number, code?: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  get isUnauthorized(): boolean {
    return this.status === 401 || this.status === 403;
  }
}

/**
 * Access tokens come from the Hopper GitHub session in localStorage,
 * falling back to Supabase if configured.
 */
async function getAccessToken(): Promise<string | null> {
  if (typeof window !== 'undefined') {
    const localToken = localStorage.getItem('hopper_auth_token');
    if (localToken) return localToken;
  }

  if (!isSupabaseConfigured) return null;
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

const SERVER_MESSAGE = 'Request failed';
const SAFE_STATUS_MESSAGES: Record<number, string> = {
  400: 'The request was rejected as invalid.',
  401: 'Your session has expired. Sign in again.',
  403: 'You do not have access to this resource.',
  404: 'That resource could not be found.',
  409: 'The resource changed while you were working. Reload and retry.',
  413: 'The request body is too large.',
  429: 'Rate limit reached. Wait a moment and retry.',
  503: 'The service is temporarily unavailable.',
};

export async function request<S extends z.ZodTypeAny>(
  endpoint: string,
  options: RequestInit = {},
  schema: S
): Promise<z.infer<S>> {
  const headers = new Headers(options.headers);
  headers.set('Accept', 'application/json');
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  if (!headers.has('Authorization')) {
    const token = await getAccessToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers,
      signal: controller.signal,
      credentials: 'omit',
    });
  } catch (error) {
    clearTimeout(timeout);
    if ((error as Error)?.name === 'AbortError') {
      throw new ApiError('The request timed out. Check your connection and retry.', 408);
    }
    throw new ApiError('Could not reach the Hopper API.', 0, 'network_error', error);
  }
  clearTimeout(timeout);

  if (!response.ok) {
    let payload: any = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    const code: string | undefined = payload?.error?.code ?? payload?.code;
    // Server text is only surfaced when it is a short, non-identifying message.
    const rawMessage: unknown = payload?.error?.message ?? payload?.message;
    const message =
      typeof rawMessage === 'string' && rawMessage.length <= 200
        ? rawMessage
        : (SAFE_STATUS_MESSAGES[response.status] ?? SERVER_MESSAGE);

    throw new ApiError(message, response.status, code, payload);
  }

  if (response.status === 204) {
    return schema.parse(undefined);
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new ApiError('The API returned a non-JSON response.', response.status, 'invalid_response');
  }

  try {
    return schema.parse(json);
  } catch (error) {
    throw new ApiError(
      'The API response did not match the expected contract.',
      response.status,
      'contract_mismatch',
      error
    );
  }
}

export interface RepositoryListResponse {
  success: boolean;
  count: number;
  repositories: Repository[];
}

export const api = {
  getHealth: (): Promise<HealthData> => request('/api/health', { method: 'GET' }, HealthSchema),

  getDashboard: (orgSlug: string): Promise<DashboardData> =>
    request(`/api/dashboard/${encodeURIComponent(orgSlug)}`, { method: 'GET' }, DashboardSchema),

  getSignature: (signatureId: string): Promise<SignatureDetail> =>
    request(
      `/api/signatures/${encodeURIComponent(signatureId)}`,
      { method: 'GET' },
      SignatureDetailSchema
    ),

  diagnoseAdhoc: (payload: AdhocDiagnoseRequest): Promise<AdhocDiagnoseResponse> =>
    request(
      '/api/diagnose/adhoc',
      { method: 'POST', body: JSON.stringify(payload) },
      AdhocDiagnoseResponseSchema
    ),

  createCheckoutSession: (payload: BillingCheckoutRequest): Promise<BillingCheckoutResponse> =>
    request(
      '/api/billing/checkout',
      { method: 'POST', body: JSON.stringify(payload) },
      BillingCheckoutResponseSchema
    ),

  listWorkspaces: (): Promise<{ success: boolean; count: number; workspaces: Workspace[] }> =>
    request(
      '/api/workspaces',
      { method: 'GET' },
      z.object({
        success: z.boolean(),
        count: z.number(),
        workspaces: z.array(WorkspaceSchema),
      })
    ),

  createWorkspace: (payload: {
    name: string;
    type?: string;
    description?: string;
    isPublic?: boolean;
  }): Promise<{ success: boolean; workspace: Workspace }> =>
    request(
      '/api/workspaces',
      { method: 'POST', body: JSON.stringify(payload) },
      z.object({ success: z.boolean(), workspace: WorkspaceSchema })
    ),

  getWorkspaceMembers: (
    workspaceId: string
  ): Promise<{ success: boolean; count: number; members: WorkspaceMember[] }> =>
    request(
      `/api/workspaces/${encodeURIComponent(workspaceId)}/members`,
      { method: 'GET' },
      z.object({
        success: z.boolean(),
        count: z.number(),
        members: z.array(WorkspaceMemberSchema),
      })
    ),

  getUserProfile: (): Promise<{ success: boolean; profile: UserProfile }> =>
    request(
      '/api/user/profile',
      { method: 'GET' },
      z.object({ success: z.boolean(), profile: UserProfileSchema })
    ),

  listRepositories: (workspaceId?: string): Promise<RepositoryListResponse> => {
    const query = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : '';
    return request(
      `/api/repositories${query}`,
      { method: 'GET' },
      z.object({
        success: z.boolean(),
        count: z.number(),
        repositories: z.array(RepositorySchema),
      })
    );
  },

  getRepositoryFailures: (
    repoId: string
  ): Promise<{ repoId: string; failureCount: number; failures: WorkflowFailure[] }> =>
    request(
      `/api/repositories/${encodeURIComponent(repoId)}/failures`,
      { method: 'GET' },
      z.object({
        repoId: z.string(),
        failureCount: z.number(),
        failures: z.array(WorkflowFailureSchema),
      })
    ),

  linkRepositoryToWorkspace: (
    repoId: string,
    workspaceId: string
  ): Promise<{ success: boolean; repository: Repository }> =>
    request(
      `/api/repositories/${encodeURIComponent(repoId)}/link-workspace`,
      { method: 'POST', body: JSON.stringify({ workspaceId }) },
      z.object({ success: z.boolean(), repository: RepositorySchema })
    ),

  listDiagnosisHistory: (
    workspaceId?: string
  ): Promise<{ success: boolean; count: number; diagnoses: DiagnosisHistoryItem[] }> => {
    const query = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : '';
    return request(
      `/api/diagnose/history${query}`,
      { method: 'GET' },
      z.object({
        success: z.boolean(),
        count: z.number(),
        diagnoses: z.array(DiagnosisHistoryItemSchema),
      })
    );
  },

  getAuthMe: (): Promise<{
    success: boolean;
    user: Record<string, any>;
    profile: UserProfile | null;
    currentWorkspaceId?: string | null;
    workspaces: Workspace[];
  }> =>
    request(
      '/api/auth/me',
      { method: 'GET' },
      z.object({
        success: z.boolean(),
        user: z.record(z.any()),
        profile: UserProfileSchema.nullable(),
        currentWorkspaceId: z.string().nullable().optional(),
        workspaces: z.array(WorkspaceSchema).optional().default([]),
      })
    ),

  loginWithGitHubToken: (token: string): Promise<{
    success: boolean;
    token: string;
    user: Record<string, any>;
    profile: UserProfile;
    workspaceId: string;
    sync?: {
      organizationsSynced: number;
      repositoriesSynced: number;
    };
  }> =>
    request(
      '/api/auth/github/token',
      {
        method: 'POST',
        body: JSON.stringify({ token }),
      },
      z.object({
        success: z.boolean(),
        token: z.string(),
        user: z.record(z.any()),
        profile: UserProfileSchema,
        workspaceId: z.string(),
        sync: z
          .object({
            organizationsSynced: z.number(),
            repositoriesSynced: z.number(),
          })
          .optional(),
      })
    ),

  syncGitHub: (payload?: {
    githubToken?: string;
    workspaceId?: string;
  }): Promise<{
    success: boolean;
    syncedAt: string;
    user: Record<string, any>;
    workspaceId: string;
    stats: {
      organizationsSynced: number;
      repositoriesSynced: number;
    };
    organizations: any[];
    repositories: any[];
  }> =>
    request(
      '/api/auth/sync',
      {
        method: 'POST',
        body: JSON.stringify(payload || {}),
      },
      z.object({
        success: z.boolean(),
        syncedAt: z.string(),
        user: z.record(z.any()),
        workspaceId: z.string(),
        stats: z.object({
          organizationsSynced: z.number(),
          repositoriesSynced: z.number(),
        }),
        organizations: z.array(z.record(z.any())),
        repositories: z.array(z.record(z.any())),
      })
    ),

  logout: (): Promise<{ success: boolean; message?: string }> =>
    request(
      '/api/auth/logout',
      { method: 'POST' },
      z.object({ success: z.boolean(), message: z.string().optional() })
    ),
};
