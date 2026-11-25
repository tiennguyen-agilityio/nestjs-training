import { Subject } from 'rxjs';
import type { OutboxEvent, OutboxEvents } from '@nestjs/outbox';
import { PaymentRefundDeadLetterListener } from './payment-refund-dead-letter.listener.js';
import type { PaymentService } from '../services/payment.service.js';
import { OUTBOX_TOPICS } from '../../../common/constants/outbox.constant.js';

describe('PaymentRefundDeadLetterListener', () => {
  it('the dead-letter listener fails only payment.refund messages', async () => {
    const events$ = new Subject<OutboxEvent>();
    const paymentService = { failRefund: vi.fn().mockResolvedValue(undefined) };
    const listener = new PaymentRefundDeadLetterListener(
      { events$ } as unknown as OutboxEvents,
      paymentService as unknown as PaymentService,
    );
    listener.onModuleInit();

    const deadLettered = (topic: string) =>
      ({
        type: 'dead-lettered',
        message: { topic, payload: { paymentId: 'refund-1' } },
        transport: undefined,
        error: new Error('down'),
        attempt: 5,
        reason: 'retries-exhausted',
      }) as unknown as OutboxEvent;

    events$.next(deadLettered(OUTBOX_TOPICS.PAYMENT_REFUND));
    events$.next(deadLettered(OUTBOX_TOPICS.PAYMENT_CHECKOUT_EXPIRE));
    events$.next({
      type: 'lease-lost',
      message: { topic: OUTBOX_TOPICS.PAYMENT_REFUND },
    } as unknown as OutboxEvent);
    await Promise.resolve();

    expect(paymentService.failRefund).toHaveBeenCalledTimes(1);
    expect(paymentService.failRefund).toHaveBeenCalledWith(
      'refund-1',
      'Payment gateway unreachable',
    );
    listener.onModuleDestroy();
  });
});
