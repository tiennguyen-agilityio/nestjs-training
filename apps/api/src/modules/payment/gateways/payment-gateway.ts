import type { IncomingHttpHeaders } from 'node:http';

export interface CheckoutRequest {
  paymentId: string;
  orderId: string;
  orderNumber: string;
  amountCents: number;
  currency: 'usd';
  customerEmail: string;
  expiresAt: Date;
  successUrl: string;
  cancelUrl: string;
}

export interface CheckoutSession {
  id: string;
  url: string;
  open: boolean;
  expiresAt: Date;
}

export type GatewayEvent =
  | {
      kind: 'succeeded';
      paymentId: string;
      checkoutSessionId?: string;
      transactionId: string;
      paidAt: Date;
    }
  | {
      kind: 'failed';
      paymentId: string;
      checkoutSessionId?: string;
      reason: string;
    };

export interface VerifiedWebhook {
  id: string;
  type: string;
  event: GatewayEvent | null;
}

export abstract class PaymentGateway {
  abstract createCheckout(request: CheckoutRequest): Promise<CheckoutSession>;
  abstract findCheckout(sessionId: string): Promise<CheckoutSession | null>;
  abstract parseWebhook(
    rawBody: Buffer | undefined,
    headers: IncomingHttpHeaders,
  ): VerifiedWebhook;
}
