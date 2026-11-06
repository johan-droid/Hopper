/**
 * CI Events Queue Producer.
 *
 * Replaces the BullMQ producer. Enqueueing is a two-step, loss-proof operation:
 *   1. Durably insert the job into PostgreSQL (idempotent on the GitHub job key).
 *   2. Best-effort publish to Vercel Queues for immediate push delivery.
 *
 * Because step 1 is the durable record, a webhook is only acknowledged once the
 * job is safely persisted — even if the queue publish failed and the cron drain
 * will have to pick it up.
 */

import { getJobStore, buildQueueMessage } from './job-store.js';
import { publishQueueMessage, PublishResult } from './transport.js';
import {
  CI_EVENTS_QUEUE_NAME,
  WorkflowJobEventData,
  QueueMessage,
  buildWorkflowJobIdempotencyKey,
} from './types.js';

export { CI_EVENTS_QUEUE_NAME };

export interface EnqueueWorkflowJobResult {
  jobId: string;
  idempotencyKey: string;
  duplicate: boolean;
  transport: PublishResult;
}

/**
 * Enqueue a GitHub Action job event for asynchronous diagnosis.
 * The deterministic idempotency key prevents duplicate processing of a
 * redelivered webhook or a matrix re-run of the same attempt.
 */
export async function enqueueWorkflowJob(
  event: WorkflowJobEventData
): Promise<EnqueueWorkflowJobResult> {
  const store = getJobStore();
  const idempotencyKey = buildWorkflowJobIdempotencyKey(event);

  const { id, duplicate } = await store.enqueue({
    payload: event,
    idempotencyKey,
    queueName: CI_EVENTS_QUEUE_NAME,
  });

  const message: QueueMessage = {
    ...buildQueueMessage(event, idempotencyKey),
    jobId: id,
  };

  const transport = await publishQueueMessage(message);

  return { jobId: id, idempotencyKey, duplicate, transport };
}

/**
 * No persistent queue connection is held by the producer, so shutdown is a
 * no-op. Retained for call-site compatibility with the previous BullMQ API.
 */
export async function closeCiQueue(): Promise<void> {
  return;
}
