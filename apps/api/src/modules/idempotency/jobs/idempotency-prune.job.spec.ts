import type { PostgresIdempotencyStore } from '../stores/postgres-idempotency.store.js';
import { IdempotencyPruneJob } from './idempotency-prune.job.js';

describe('IdempotencyPruneJob', () => {
  it('prunes up to 1000 expired keys', async () => {
    const store = { prune: vi.fn().mockResolvedValue(3) };
    const job = new IdempotencyPruneJob(
      store as unknown as PostgresIdempotencyStore,
    );

    await job.prune();

    expect(store.prune).toHaveBeenCalledWith(1000);
  });
});
