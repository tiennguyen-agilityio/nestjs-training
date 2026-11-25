import type { OrderPaymentStatus } from '@repo/constants';
import type { Payment } from '../../order/entities/payment.entity.js';

export class ResponsePaymentCaptureDto {
  paymentId!: string;
  /** The order's payment status after the capture. */
  paymentStatus!: OrderPaymentStatus;
  failureReason!: string | null;
  /** A failed payment the shopper can approve again with another funding source. */
  retryable!: boolean;

  static fromEntity(
    payment: Payment,
    paymentStatus: OrderPaymentStatus,
    retryable: boolean,
  ): ResponsePaymentCaptureDto {
    const dto = new ResponsePaymentCaptureDto();
    dto.paymentId = payment.id;
    dto.paymentStatus = paymentStatus;
    dto.failureReason = payment.failureReason;
    dto.retryable = retryable;
    return dto;
  }
}
