import { Injectable } from '@nestjs/common';
import { PaymentMethod } from '@repo/constants';
import type { PaymentGateway } from './payment-gateway.js';
import { StripePaymentGateway } from './stripe-payment.gateway.js';

@Injectable()
export class PaymentGateways {
  private readonly byMethod: ReadonlyMap<PaymentMethod, PaymentGateway>;

  constructor(stripe: StripePaymentGateway) {
    this.byMethod = new Map([[PaymentMethod.CARD, stripe]]);
  }

  for(method: PaymentMethod): PaymentGateway | null {
    return this.byMethod.get(method) ?? null;
  }
}
