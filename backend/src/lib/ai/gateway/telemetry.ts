import { getDatabaseExecutor } from '../../../db/index.js';
import type { GatewayResult, ProviderErrorClass } from './contracts.js';

/**
 * AI telemetry — persists one row per gateway request.
 *
 * Design: telemetry is best-effort and must never fail a request. Writes are
 * fire-and-forget (swallow-on-error); the in-memory ring buffer always holds
 * the record even when PostgreSQL is unavailable.
 */

export type TelemetryStatus = 'success' | 'failed' | 'exhausted' | 'budget_rejected';

export interface TelemetryRecord {
  readonly requestId: string;
  readonly taskId: string;
  readonly taskType: string;
  readonly providerId: string;
  readonly model: string;
  readonly status: TelemetryStatus;
  readonly errorClass?: ProviderErrorClass;
  readonly errorKind?: string;
  readonly latencyMs: number;
  readonly promptTokens: number | null;
  readonly completionTokens: number | null;
  readonly estimatedUsage: boolean;
  readonly attempts: number;
  readonly failoverPath: string[];
  readonly createdAt: number;
}

export interface TelemetrySink {
  record(entry: TelemetryRecord): void;
  recent(limit?: number): TelemetryRecord[];
}

const RING_SIZE = 500;

export class InMemoryTelemetrySink implements TelemetrySink {
  private readonly ring: TelemetryRecord[] = [];

  record(entry: TelemetryRecord): void {
    this.ring.push(entry);
    if (this.ring.length > RING_SIZE) this.ring.shift();
  }

  recent(limit = 50): TelemetryRecord[] {
    return this.ring.slice(-limit);
  }
}

/**
 * PostgreSQL sink — INSERTs into ai_gateway_requests (migration 0014).
 * Falls back silently to memory-only when the table/DB is unavailable.
 */
export class PostgresTelemetrySink implements TelemetrySink {
  private readonly memory = new InMemoryTelemetrySink();

  constructor(private readonly executor = getDatabaseExecutor()) {}

  record(entry: TelemetryRecord): void {
    this.memory.record(entry);
    void this.persist(entry).catch(() => {
      // Best-effort only — telemetry never breaks a request.
    });
  }

  recent(limit = 50): TelemetryRecord[] {
    return this.memory.recent(limit);
  }

  private async persist(entry: TelemetryRecord): Promise<void> {
    await this.executor.query(
      `INSERT INTO ai_gateway_requests (
         request_id, task_id, task_type, provider_id, model, status,
         error_class, error_kind, latency_ms, prompt_tokens, completion_tokens,
         estimated_usage, attempts, failover_path, created_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,to_timestamp($15/1000.0))
       ON CONFLICT (request_id) DO NOTHING`,
      [
        entry.requestId,
        entry.taskId,
        entry.taskType,
        entry.providerId,
        entry.model,
        entry.status,
        entry.errorClass ?? null,
        entry.errorKind ?? null,
        Math.round(entry.latencyMs),
        entry.promptTokens,
        entry.completionTokens,
        entry.estimatedUsage,
        entry.attempts,
        JSON.stringify(entry.failoverPath),
        entry.createdAt,
      ],
    );
  }
}

/** Build the telemetry record from a gateway result (or failure summary). */
export function toTelemetryRecord(
  params: {
    requestId: string;
    taskId: string;
    taskType: string;
    status: TelemetryStatus;
    providerId: string;
    model: string;
    latencyMs: number;
    attempts: number;
    failoverPath: string[];
    createdAt: number;
    errorClass?: ProviderErrorClass;
    errorKind?: string;
    usage?: { promptTokens: number | null; completionTokens: number | null; estimated: boolean };
  },
): TelemetryRecord {
  return {
    requestId: params.requestId,
    taskId: params.taskId,
    taskType: params.taskType,
    providerId: params.providerId,
    model: params.model,
    status: params.status,
    errorClass: params.errorClass,
    errorKind: params.errorKind,
    latencyMs: params.latencyMs,
    promptTokens: params.usage?.promptTokens ?? null,
    completionTokens: params.usage?.completionTokens ?? null,
    estimatedUsage: params.usage?.estimated ?? true,
    attempts: params.attempts,
    failoverPath: params.failoverPath,
    createdAt: params.createdAt,
  };
}

/** Convenience overload for a successful GatewayResult. */
export function recordFromResult(
  sink: TelemetrySink,
  result: GatewayResult<unknown>,
  meta: { requestId: string; taskId: string; taskType: string; createdAt: number },
): void {
  sink.record(
    toTelemetryRecord({
      ...meta,
      status: 'success',
      providerId: result.provider,
      model: result.model,
      latencyMs: result.latencyMs,
      attempts: result.attempts,
      failoverPath: result.failoverPath,
      usage: result.usage,
    }),
  );
}