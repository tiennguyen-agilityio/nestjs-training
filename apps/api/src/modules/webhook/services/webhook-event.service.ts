import { Injectable } from '@nestjs/common';
import { WebhookEventRepository } from '../repositories/webhook-event.repository.js';
import type { WebhookProvider } from '../enums/webhook-provider.enum.js';
import { WebhookEventStatus } from '../enums/webhook-event-status.enum.js';

@Injectable()
export class WebhookEventService {
  constructor(private readonly repository: WebhookEventRepository) {}

  handleOnce(
    provider: WebhookProvider,
    eventId: string,
    type: string,
    process: () => Promise<boolean>,
  ): Promise<void> {
    return this.repository.transactional(async () => {
      const event = await this.repository.claim({ provider, eventId, type });
      if (!event) return;
      if (!(await process())) {
        event.status = WebhookEventStatus.IGNORED;
        await this.repository.save(event, null);
      }
    });
  }
}
