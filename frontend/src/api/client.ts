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
};
