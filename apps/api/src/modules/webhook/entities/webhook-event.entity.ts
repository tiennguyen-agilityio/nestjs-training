import { Opt } from '@mikro-orm/core';
import { Entity, Enum, Property, Unique } from '@mikro-orm/decorators/legacy';
import { BaseEntity } from '../../../common/entities/base.entity.js';
import { WebhookProvider } from '../enums/webhook-provider.enum.js';
import { WebhookEventStatus } from '../enums/webhook-event-status.enum.js';

const EVENT_ID_LENGTH = 255;
const TYPE_LENGTH = 100;

@Entity({ tableName: 'webhook_events' })
@Unique({
  name: 'webhook_events_provider_event_id_unique',
  properties: ['provider', 'eventId'],
})
export class WebhookEvent extends BaseEntity {
  @Enum({ items: () => WebhookProvider })
  provider!: WebhookProvider;

  @Property({ type: 'string', fieldName: 'event_id', length: EVENT_ID_LENGTH })
  eventId!: string;

  @Property({ type: 'string', length: TYPE_LENGTH })
  type!: string;

  @Enum({ items: () => WebhookEventStatus })
  status: WebhookEventStatus & Opt = WebhookEventStatus.PROCESSED;
}
