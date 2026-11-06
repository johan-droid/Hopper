/**
 * Queue Payload Types & Validation (Vercel Queues + PostgreSQL durable outbox).
 *
 * Every message crossing the queue boundary is validated with Zod so that a
 * malformed or tampered payload can never reach the diagnosis pipeline.
 */

import { z } from 'zod';

export const CI_EVENTS_TOPIC = 'hopper-ci-events';
export const CI_EVENTS_QUEUE_NAME = 'ci-events';

export const WorkflowJobEventSchema = z.object({
  installationId: z.number().int(),
  orgLogin: z.string().min(1).max(255),
  accountType: z.enum(['Organization', 'User']),
  repoFullName: z.string().min(1).max(255),
  githubRepoId: z.number().int(),
  workflowName: z.string().min(1).max(255),
  jobName: z.string().min(1).max(255),
  stepName: z.string().min(1).max(255),
  githubRunId: z.number().int(),
  githubJobId: z.number().int(),
  githubRunAttempt: z.number().int().min(1),
  commitSha: z.string().min(1).max(64),
  branch: z.string().min(1).max(255),
  prNumber: z.number().int().nullable().optional(),
  actorLogin: z.string().max(255).nullable().optional(),
  conclusion: z.enum(['failure', 'success']),
  // Raw CI logs are untrusted input: bound them so a single message cannot
  // exceed queue payload limits or exhaust consumer memory.
  rawLog: z.string().max(1_000_000).optional(),
  modifiedFiles: z.array(z.string().max(1024)).max(200).optional(),
  runUrl: z.string().max(2048).optional(),
});

export type WorkflowJobEventData = z.infer<typeof WorkflowJobEventSchema>;

/**
 * Canonical queue message envelope. `idempotencyKey` is derived from GitHub
 * delivery/job identity so a redelivered webhook can never create a second job.
 */
export interface QueueMessage<T = WorkflowJobEventData> {
  jobType: 'process-workflow-job';
  idempotencyKey: string;
  payload: T;
  enqueuedAt: string;
  schemaVersion: 1;
  /** Durable job row id, when the message originated from the job store. */
  jobId?: string;
}

export const QueueMessageSchema = z.object({
  jobType: z.literal('process-workflow-job'),
  idempotencyKey: z.string().min(1).max(255),
  payload: WorkflowJobEventSchema,
  enqueuedAt: z.string(),
  schemaVersion: z.literal(1),
  jobId: z.string().optional(),
});

/** Deterministic idempotency key: one job per GitHub job + run attempt. */
export function buildWorkflowJobIdempotencyKey(event: {
  githubJobId: number;
  githubRunAttempt: number;
}): string {
  return `gh:job:${event.githubJobId}:run:${event.githubRunAttempt}`;
}

export interface JobDiagnosticResult {
  status:
    | 'diagnosed'
    | 'flakiness_updated'
    | 'skipped'
    | 'quota_exceeded'
    | 'deferred'
    | 'duplicate_ignored';
  signatureHash?: string;
  flakinessScore?: number;
  failureId?: string;
  reportId?: string;
  prComment?: string;
  reason?: string;
}
