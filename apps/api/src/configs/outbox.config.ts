import type { OutboxRetryOptions } from '@nestjs/outbox';

/**
 * 10 attempts in total, waiting 1s, 2s, 4s ... capped at 5 minutes: about
 * 8 minutes before a message is dead-lettered.
 */
export const OUTBOX_RETRY: OutboxRetryOptions = {
  attempts: 10,
  backoff: { delay: '1s', factor: 2, maxDelay: '5m' },
};

/**
 * Retention, after the `@nestjs/outbox` README: a dead letter nobody requeued
 * within 14 days is purged for good; the inbox outlives it (30 days), since a
 * requeued message keeps its id and the inbox must still recognize it.
 */
export const OUTBOX_DEAD_LETTER_RETENTION_MS = 14 * 86_400_000;
export const OUTBOX_INBOX_RETENTION = '30d';
