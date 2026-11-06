/**
 * Queue Transport — Vercel Queues publisher.
 *
 * The PostgreSQL job store is the durable system of record. Publishing to
 * Vercel Queues is the low-latency delivery accelerator: if the publish fails,
 * the job row stays `pending` and is picked up by the cron drain, so an event
 * is never lost.
 *
 * `QUEUE_TRANSPORT`:
 *   auto    (default) — publish when running on Vercel (VERCEL=1)
 *   vercel            — force publishing
 *   off               — never publish (local development; DB drain only)
 */

import { send } from '@vercel/queue';
import { CI_EVENTS_TOPIC, QueueMessage } from './types.js';

export type QueueTransportMode = 'vercel-queue' | 'disabled';

export interface PublishResult {
  published: boolean;
  messageId?: string | null;
  reason?: string;
}

export function getQueueTransportMode(): QueueTransportMode {
  const explicit = (process.env.QUEUE_TRANSPORT || 'auto').toLowerCase();

  if (explicit === 'off' || explicit === 'disabled' || explicit === 'none') {
    return 'disabled';
  }
  if (explicit === 'vercel' || explicit === 'vercel-queue') {
    return 'vercel-queue';
  }
  return process.env.VERCEL === '1' ? 'vercel-queue' : 'disabled';
}

/**
 * Publish a message to the Vercel Queue topic. Never throws: the caller decides
 * whether the durable database row is sufficient acknowledgement.
 */
export async function publishQueueMessage(message: QueueMessage): Promise<PublishResult> {
  if (getQueueTransportMode() === 'disabled') {
    return { published: false, reason: 'transport_disabled' };
  }

  try {
    const { messageId } = await send(CI_EVENTS_TOPIC, message, {
      // Dedup window bounded by retention; the SDK dedupes on this key.
      idempotencyKey: message.idempotencyKey,
      retentionSeconds: 86400,
    });

    return { published: true, messageId: messageId ?? null };
  } catch (err: any) {
    // A duplicate is a success: the message is already queued.
    const name = err?.constructor?.name || err?.name;
    if (name === 'DuplicateMessageError' || /duplicate/i.test(err?.message || '')) {
      return { published: true, messageId: null, reason: 'duplicate' };
    }

    console.error(`[Queue] Vercel Queue publish failed: ${err?.message || err}`);
    return { published: false, reason: err?.message || 'publish_failed' };
  }
}

export function getQueueTopicName(): string {
  return CI_EVENTS_TOPIC;
}
