import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { UserModule } from '../user/user.module.js';
import { PaymentModule } from '../payment/payment.module.js';
import { WebhookController } from './controllers/webhook.controller.js';
import { ClerkWebhookService } from './services/clerk-webhook.service.js';
import { WebhookEventService } from './services/webhook-event.service.js';
import { WebhookEventRepository } from './repositories/webhook-event.repository.js';
import { WebhookEvent } from './entities/webhook-event.entity.js';

@Module({
  imports: [
    MikroOrmModule.forFeature([WebhookEvent]),
    UserModule,
    PaymentModule,
  ],
  controllers: [WebhookController],
  providers: [ClerkWebhookService, WebhookEventService, WebhookEventRepository],
})
export class WebhookModule {}
