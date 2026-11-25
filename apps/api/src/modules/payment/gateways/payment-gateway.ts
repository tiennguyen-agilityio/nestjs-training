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
    }
  | {
      /** The gateway holds the money for review; the payment waits again. */
      kind: 'pending';
      paymentId: string;
      checkoutSessionId?: string;
      transactionId: string;
    };

/** A checkout the payer approved that the shop still has to capture. */
export interface ApprovedCheckout {
  kind: 'approved';
  checkoutSessionId: string;
}

export interface VerifiedWebhook {
  id: string;
  type: string;
  event: GatewayEvent | ApprovedCheckout | null;
}

/** What capturing an approved checkout gave. */
export type CaptureOutcome =
  | { kind: 'succeeded'; transactionId: string; paidAt: Date }
  | { kind: 'failed'; reason: string; retryable: boolean }
  | { kind: 'pending'; transactionId: string }
  | { kind: 'not_approved' };

export abstract class PaymentGateway {
  abstract createCheckout(request: CheckoutRequest): Promise<CheckoutSession>;
  abstract findCheckout(sessionId: string): Promise<CheckoutSession | null>;
  /**
   * Closes a checkout session so it can no longer be paid. A session that is
   * already closed or missing is done; any other failure rejects.
   */
  abstract expireCheckout(sessionId: string): Promise<void>;
  abstract parseWebhook(
    rawBody: Buffer | undefined,
    headers: IncomingHttpHeaders,
  ): Promise<VerifiedWebhook>;

  /** Captures an approved checkout; `null` when the gateway has no capture step. */
  abstract capture(checkoutId: string): Promise<CaptureOutcome | null>;
}
