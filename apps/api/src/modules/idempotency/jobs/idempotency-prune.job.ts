import { Injectable } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PostgresIdempotencyStore } from '../stores/postgres-idempotency.store.js';

export const IDEMPOTENCY_PRUNE_INTERVAL_MS = 3_600_000;
const PRUNE_BATCH = 1000;

/**
 * Deletes expired idempotency records. UUID keys never repeat, so an expired
 * row is never taken over again and the table would only grow without this.
 */
@Injectable()
export class IdempotencyPruneJob {
  constructor(private readonly store: PostgresIdempotencyStore) {}

  @Interval(IDEMPOTENCY_PRUNE_INTERVAL_MS)
  async prune(): Promise<void> {
    await this.store.prune(PRUNE_BATCH);
  }
}
