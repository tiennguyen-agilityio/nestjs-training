import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { WebhookEvent } from '../entities/webhook-event.entity.js';
import { BaseRepository } from '../../../common/repositories/base.repository.js';
import type { WebhookProvider } from '../enums/webhook-provider.enum.js';
import { WebhookEventStatus } from '../enums/webhook-event-status.enum.js';

export interface WebhookEventData {
  provider: WebhookProvider;
  eventId: string;
  type: string;
}

@Injectable()
export class WebhookEventRepository extends BaseRepository<WebhookEvent> {
  protected readonly entity = WebhookEvent;

  async claim(data: WebhookEventData): Promise<WebhookEvent | null> {
    const id = uuidv4();
    const now = new Date();
    await this.insertIgnoringConflict(
      {
        ...data,
        id,
        status: WebhookEventStatus.PROCESSED,
        createdAt: now,
        updatedAt: now,
      },
      ['provider', 'eventId'],
    );
    const stored = await this.findOneBy(
      { provider: data.provider, eventId: data.eventId },
      { includeDeleted: true },
    );
    return stored?.id === id ? stored : null;
  }
}
