import type { CheckoutSession } from '../gateways/payment-gateway.js';
import type { Payment } from '../../order/entities/payment.entity.js';

export class ResponsePaymentCheckoutDto {
  paymentId!: string;
  /** The gateway's checkout id: a Stripe session id, or the PayPal order id the shopper approves on PayPal's page. */
  checkoutId!: string;
  checkoutUrl!: string;
  expiresAt!: Date;

  static fromEntity(
    payment: Payment,
    session: CheckoutSession,
  ): ResponsePaymentCheckoutDto {
    const dto = new ResponsePaymentCheckoutDto();
    dto.paymentId = payment.id;
    dto.checkoutId = session.id;
    dto.checkoutUrl = session.url;
    dto.expiresAt = session.expiresAt;
    return dto;
  }
}
