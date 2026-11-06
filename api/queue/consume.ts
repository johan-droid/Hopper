/**
 * Vercel Queues push consumer.
 *
 * Vercel invokes this handler when a message is available on the
 * `hopper-ci-events` topic (see `experimentalTriggers` in root vercel.json).
 *
 * Delivery semantics:
 *   - At-least-once. Throwing (or returning a retry instruction) redelivers.
 *   - Idempotent at the business level via `hopper_processed_events`.
 *   - Poison messages are acknowledged after a bounded number of deliveries and
 *     remain visible in the PostgreSQL dead-letter ledger for operator replay.
 */

import { handleCallback } from '@vercel/queue';
import { z } from 'zod';
import { handleQueueMessage } from '../../backend/src/queue/consumer.js';
import { getJobStore } from '../../backend/src/queue/job-store.js';
import { QueueMessageSchema } from '../../backend/src/queue/types.js';

const MAX_DELIVERIES = 6;

export const POST = handleCallback(
  async (rawMessage: unknown, metadata) => {
    const parsed = QueueMessageSchema.safeParse(rawMessage);
    if (!parsed.success) {
      // Poison payload: acknowledge so it is never redelivered forever.
      console.error(
        `[QueueConsumer] Rejecting malformed message ${metadata.messageId}: ${parsed.error.message}`
      );
      return;
    }

    const message = parsed.data;
    const store = getJobStore();

    const outcome = await handleQueueMessage(message);

    if (message.jobId) {
      if (outcome.deferred) {
        await store.retry(
          message.jobId,
          5,
          outcome.result.reason || 'deferred: diagnosis lock held'
        );
      } else {
        await store.complete(message.jobId, outcome.result);
      }
    }

    console.log(
      `[QueueConsumer] ${message.idempotencyKey} -> ${outcome.result.status}` +
        (outcome.duplicate ? ' (duplicate)' : '') +
        ` [delivery ${metadata.deliveryCount}]`
    );
  },
  {
    visibilityTimeoutSeconds: 280,
    retry: (error, metadata) => {
      if (error instanceof z.ZodError) {
        return { acknowledge: true };
      }
      if (metadata.deliveryCount >= MAX_DELIVERIES) {
        console.error(
          `[QueueConsumer] message ${metadata.messageId} exceeded ${MAX_DELIVERIES} deliveries; acknowledging to dead-letter ledger`
        );
        return { acknowledge: true };
      }
      // Exponential backoff capped at 5 minutes.
      return { afterSeconds: Math.min(300, Math.pow(2, metadata.deliveryCount) * 5) };
    },
  }
);
