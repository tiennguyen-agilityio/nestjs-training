import { Injectable } from '@nestjs/common';
import { OnOutboxMessage } from '@nestjs/outbox';
import { PaymentService } from '../services/payment.service.js';
import {
  OUTBOX_CONSUMERS,
  OUTBOX_TOPICS,
} from '../../../common/constants/outbox.constant.js';
import type { PaymentCheckoutExpirePayload } from '../../../common/interfaces/outbox-payload.interface.js';

/**
 * Delivers `payment.checkout-expire` messages, written with the cancelled
 * order by `OrderRepository.transactionalWithOutbox`. A rejection is a failed
 * attempt: the relay retries it, then dead-letters it (`OUTBOX_RETRY`).
 */
@Injectable()
export class PaymentCheckoutExpireHandler {
  constructor(private readonly paymentService: PaymentService) {}

  @OnOutboxMessage(OUTBOX_TOPICS.PAYMENT_CHECKOUT_EXPIRE, {
    consumer: OUTBOX_CONSUMERS.PAYMENT_CHECKOUT_EXPIRE,
  })
  handle(payload: PaymentCheckoutExpirePayload): Promise<void> {
    return this.paymentService.expireCheckout(payload);
  }
}
