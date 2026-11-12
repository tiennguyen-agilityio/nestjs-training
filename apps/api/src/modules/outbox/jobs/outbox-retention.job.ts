import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OutboxDeadLetters, OutboxInbox } from '@nestjs/outbox';
import {
  OUTBOX_DEAD_LETTER_RETENTION_MS,
  OUTBOX_INBOX_RETENTION,
} from '../../../configs/outbox.config.js';

/**
 * Deletes old outbox records: nothing in `@nestjs/outbox` does, and the inbox
 * gains one row per delivered message.
 */
@Injectable()
export class OutboxRetentionJob {
  constructor(
    private readonly deadLetters: OutboxDeadLetters,
    private readonly inbox: OutboxInbox,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async prune(): Promise<void> {
    await this.deadLetters.purge({
      failedBefore: new Date(Date.now() - OUTBOX_DEAD_LETTER_RETENTION_MS),
    });
    await this.inbox.prune(OUTBOX_INBOX_RETENTION);
  }
}
