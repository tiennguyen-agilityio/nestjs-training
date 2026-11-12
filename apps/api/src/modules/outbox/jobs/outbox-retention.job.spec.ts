import type { OutboxDeadLetters, OutboxInbox } from '@nestjs/outbox';
import { OutboxRetentionJob } from './outbox-retention.job.js';

describe('OutboxRetentionJob', () => {
  const deadLetters = { purge: vi.fn().mockResolvedValue(0) };
  const inbox = { prune: vi.fn().mockResolvedValue(0) };
  const job = new OutboxRetentionJob(
    deadLetters as unknown as OutboxDeadLetters,
    inbox as unknown as OutboxInbox,
  );

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('purges dead letters that failed more than 14 days ago and prunes inbox records older than 30 days', async () => {
    vi.setSystemTime(new Date('2026-11-30T03:00:00Z'));

    await job.prune();

    expect(deadLetters.purge).toHaveBeenCalledWith({
      failedBefore: new Date('2026-11-16T03:00:00Z'),
    });
    expect(inbox.prune).toHaveBeenCalledWith('30d');
  });
});
