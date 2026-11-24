import {
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { PaymentMethod } from '@repo/constants';
import type { Request } from 'express';
import { ClerkWebhookService } from '../services/clerk-webhook.service.js';
import { PaymentService } from '../../payment/services/payment.service.js';
import { WebhookEventService } from '../services/webhook-event.service.js';
import { WebhookProvider } from '../enums/webhook-provider.enum.js';

const SVIX_ID_HEADER = 'svix-id';

@ApiExcludeController()
@Controller({ path: 'webhooks', version: VERSION_NEUTRAL })
export class WebhookController {
  constructor(
    private readonly clerkWebhookService: ClerkWebhookService,
    private readonly paymentService: PaymentService,
    private readonly webhookEventService: WebhookEventService,
  ) {}

  @Post('clerk')
  @HttpCode(HttpStatus.OK)
  async handleClerkWebhook(
    @Req() req: RawBodyRequest<Request>,
  ): Promise<{ received: true }> {
    const event = this.clerkWebhookService.verifyAndParse(
      req.rawBody,
      req.headers,
    );
    await this.webhookEventService.handleOnce(
      WebhookProvider.CLERK,
      String(req.headers[SVIX_ID_HEADER]),
      event.type,
      () => this.clerkWebhookService.handleEvent(event),
    );

    return { received: true };
  }

  @Post('stripe')
  @SkipThrottle()
  @HttpCode(HttpStatus.OK)
  async handleStripeWebhook(
    @Req() req: RawBodyRequest<Request>,
  ): Promise<{ received: true }> {
    const verified = this.paymentService.verify(
      PaymentMethod.CARD,
      req.rawBody,
      req.headers,
    );
    await this.webhookEventService.handleOnce(
      WebhookProvider.STRIPE,
      verified.id,
      verified.type,
      () => this.paymentService.apply(verified.event),
    );

    return { received: true };
  }
}
