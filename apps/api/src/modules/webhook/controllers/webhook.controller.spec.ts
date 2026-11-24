import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import type { Mock } from 'vitest';
import { PaymentMethod } from '@repo/constants';
import { WebhookController } from './webhook.controller.js';
import { ClerkWebhookService } from '../services/clerk-webhook.service.js';
import { WebhookEventService } from '../services/webhook-event.service.js';
import { PaymentService } from '../../payment/services/payment.service.js';
import { WebhookProvider } from '../enums/webhook-provider.enum.js';

describe('WebhookController', () => {
  let controller: WebhookController;
  let clerkWebhookService: { verifyAndParse: Mock; handleEvent: Mock };
  let paymentService: { verify: Mock; apply: Mock };
  let webhookEventService: { handleOnce: Mock };
  let processed: unknown[];

  beforeEach(async () => {
    processed = [];
    clerkWebhookService = {
      verifyAndParse: vi.fn(),
      handleEvent: vi.fn().mockResolvedValue(true),
    };
    paymentService = {
      verify: vi.fn(),
      apply: vi.fn().mockResolvedValue(true),
    };
    webhookEventService = {
      handleOnce: vi.fn(
        async (
          _provider: WebhookProvider,
          _eventId: string,
          _type: string,
          process: () => Promise<boolean>,
        ) => {
          processed.push(await process());
        },
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WebhookController],
      providers: [
        { provide: ClerkWebhookService, useValue: clerkWebhookService },
        { provide: PaymentService, useValue: paymentService },
        { provide: WebhookEventService, useValue: webhookEventService },
      ],
    }).compile();

    controller = module.get(WebhookController);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('handleClerkWebhook', () => {
    const rawBody = Buffer.from('{"type":"user.created"}');
    const headers = {
      'svix-id': 'msg-1',
      'svix-timestamp': '1700000000',
      'svix-signature': 'v1,abc',
    };
    const req = { rawBody, headers } as never;

    it('handleClerkWebhook records the event under CLERK with the svix-id', async () => {
      const event = { type: 'user.created' };
      clerkWebhookService.verifyAndParse.mockReturnValue(event);

      const result = await controller.handleClerkWebhook(req);

      expect(clerkWebhookService.verifyAndParse).toHaveBeenCalledWith(
        rawBody,
        headers,
      );
      expect(webhookEventService.handleOnce).toHaveBeenCalledWith(
        WebhookProvider.CLERK,
        'msg-1',
        'user.created',
        expect.any(Function),
      );
      expect(clerkWebhookService.handleEvent).toHaveBeenCalledWith(event);
      expect(processed).toEqual([true]);
      expect(result).toEqual({ received: true });
    });

    it('propagates BadRequestException from verification without recording the event', async () => {
      clerkWebhookService.verifyAndParse.mockImplementation(() => {
        throw new BadRequestException();
      });

      await expect(controller.handleClerkWebhook(req)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(webhookEventService.handleOnce).not.toHaveBeenCalled();
      expect(clerkWebhookService.handleEvent).not.toHaveBeenCalled();
    });
  });

  describe('handleStripeWebhook', () => {
    it('handleStripeWebhook records the event under STRIPE and applies it', async () => {
      const rawBody = Buffer.from('{"type":"checkout.session.completed"}');
      const headers = { 'stripe-signature': 't=1,v1=abc' };
      const event = {
        kind: 'failed',
        paymentId: 'payment-1',
        reason: 'Payment failed',
      };
      paymentService.verify.mockReturnValue({
        id: 'evt_1',
        type: 'payment_intent.payment_failed',
        event,
      });

      const result = await controller.handleStripeWebhook({
        rawBody,
        headers,
      } as never);

      expect(paymentService.verify).toHaveBeenCalledWith(
        PaymentMethod.CARD,
        rawBody,
        headers,
      );
      expect(webhookEventService.handleOnce).toHaveBeenCalledWith(
        WebhookProvider.STRIPE,
        'evt_1',
        'payment_intent.payment_failed',
        expect.any(Function),
      );
      expect(paymentService.apply).toHaveBeenCalledWith(event);
      expect(processed).toEqual([true]);
      expect(result).toEqual({ received: true });
    });
  });
});
