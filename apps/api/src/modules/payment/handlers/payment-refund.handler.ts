import { Injectable } from '@nestjs/common';
import { OnOutboxMessage } from '@nestjs/outbox';
import { PaymentService } from '../services/payment.service.js';
import {
  OUTBOX_CONSUMERS,
  OUTBOX_TOPICS,
} from '../../../common/constants/outbox.constant.js';
import type { PaymentRefundPayload } from '../../../common/interfaces/outbox-payload.interface.js';

/**
 * Delivers `payment.refund` messages, written with the refund row by
 * `OrderRepository.transactionalWithOutbox`. A rejection is a failed attempt:
 * the relay retries it, then dead-letters it (`OUTBOX_RETRY`).
 */
@Injectable()
export class PaymentRefundHandler {
  constructor(private readonly paymentService: PaymentService) {}

  @OnOutboxMessage(OUTBOX_TOPICS.PAYMENT_REFUND, {
    consumer: OUTBOX_CONSUMERS.PAYMENT_REFUND,
  })
  handle(payload: PaymentRefundPayload): Promise<void> {
    return this.paymentService.processRefund(payload);
  }
}
