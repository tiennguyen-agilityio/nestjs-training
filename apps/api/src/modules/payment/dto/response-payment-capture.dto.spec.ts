import { OrderPaymentStatus } from '@repo/constants';
import { ResponsePaymentCaptureDto } from './response-payment-capture.dto.js';
import type { Payment } from '../../order/entities/payment.entity.js';

describe('ResponsePaymentCaptureDto', () => {
  it('fromEntity copies the id, status, reason and retryable', () => {
    const payment = {
      id: 'payment-1',
      failureReason: 'The instrument presented was declined.',
    } as Payment;

    expect(
      ResponsePaymentCaptureDto.fromEntity(
        payment,
        OrderPaymentStatus.FAILED,
        true,
      ),
    ).toEqual({
      paymentId: 'payment-1',
      paymentStatus: OrderPaymentStatus.FAILED,
      failureReason: 'The instrument presented was declined.',
      retryable: true,
    });
  });
});
