import { Injectable, Logger } from '@nestjs/common';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { OutboxEvents } from '@nestjs/outbox';
import type { Subscription } from 'rxjs';
import { PaymentService } from '../services/payment.service.js';
import { OUTBOX_TOPICS } from '../../../common/constants/outbox.constant.js';
import type { PaymentRefundPayload } from '../../../common/interfaces/outbox-payload.interface.js';

const UNREACHABLE_REASON = 'Payment gateway unreachable';

/** Marks a refund FAILED when the outbox dead-letters its `payment.refund` message. */
@Injectable()
export class PaymentRefundDeadLetterListener
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PaymentRefundDeadLetterListener.name);
  private subscription?: Subscription;

  constructor(
    private readonly outboxEvents: OutboxEvents,
    private readonly paymentService: PaymentService,
  ) {}

  onModuleInit(): void {
    this.subscription = this.outboxEvents.events$.subscribe((event) => {
      if (
        event.type !== 'dead-lettered' ||
        event.message.topic !== OUTBOX_TOPICS.PAYMENT_REFUND
      ) {
        return;
      }
      const { paymentId } = event.message.payload as PaymentRefundPayload;
      this.paymentService
        .failRefund(paymentId, UNREACHABLE_REASON)
        .catch((error: unknown) =>
          this.logger.error(`Refund ${paymentId} not marked FAILED`, error),
        );
    });
  }

  onModuleDestroy(): void {
    this.subscription?.unsubscribe();
  }
}
