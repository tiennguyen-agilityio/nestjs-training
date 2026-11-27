import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { IncomingHttpHeaders } from 'node:http';
import {
  PaymentGateway,
  type CaptureOutcome,
  type CheckoutRequest,
  type CheckoutSession,
  type RefundEvent,
  type RefundOutcome,
  type RefundRequest,
  type VerifiedWebhook,
} from './payment-gateway.js';
import {
  PayPalHttpClient,
  PayPalUnavailableError,
  type PayPalResponse,
} from './paypal-http.client.js';
import {
  DependencyUnavailableException,
  InvalidRequestException,
  UnauthenticatedException,
} from '../../../common/exceptions/base.exception.js';
import { ERROR_CODES } from '../../../common/constants/error-code.constant.js';
import {
  ERROR_DESCRIPTIONS,
  ERROR_MESSAGES,
} from '../../../common/constants/message.constant.js';

const ORDERS_PATH = '/v2/checkout/orders';
const VERIFY_PATH = '/v1/notifications/verify-webhook-signature';
const DENIED_REASON = 'PayPal denied the payment';
const NO_RESULT_REASON = 'PayPal did not complete the payment';
const OPEN_STATUSES = new Set(['CREATED', 'PAYER_ACTION_REQUIRED', 'APPROVED']);
const HELD_CAPTURE_STATUSES = new Set(['COMPLETED', 'PENDING']);
const APPROVAL_RELS = ['approve', 'payer-action'];
const NOT_FOUND = 404;
const TOO_MANY_REQUESTS = 429;
const CLIENT_ERROR = 400;

/** The headers PayPal signs a webhook delivery with, in the verify body's order. */
const SIGNATURE_HEADERS = {
  auth_algo: 'paypal-auth-algo',
  cert_url: 'paypal-cert-url',
  transmission_id: 'paypal-transmission-id',
  transmission_sig: 'paypal-transmission-sig',
  transmission_time: 'paypal-transmission-time',
} as const;

interface PayPalLink {
  rel: string;
  href: string;
}

interface PayPalCapture {
  id: string;
  status: string;
  create_time?: string;
  status_details?: { reason?: string };
}

interface PayPalOrder {
  id: string;
  status: string;
  links?: PayPalLink[];
  purchase_units?: { payments?: { captures?: PayPalCapture[] } }[];
}

interface PayPalError {
  details?: { issue?: string; description?: string }[];
}

interface PayPalRefund {
  id?: string;
  status?: string;
  custom_id?: string;
  create_time?: string;
  status_details?: { reason?: string };
  amount?: { value?: string; currency_code?: string };
  links?: PayPalLink[];
}

interface PayPalEvent {
  id?: string;
  event_type?: string;
  resource?: PayPalRefund & {
    supplementary_data?: { related_ids?: { order_id?: string } };
  };
}

const REFUND_EVENT_TYPES = new Set([
  'PAYMENT.CAPTURE.REFUNDED',
  'PAYMENT.REFUND.PENDING',
  'PAYMENT.REFUND.FAILED',
]);
const REFUND_REFUSED_REASON = 'PayPal refused the refund';
const CAPTURE_HREF = /\/captures\/([^/?#]+)/;

const refundStatusOf = (status: string | undefined): RefundEvent['status'] => {
  if (status === 'COMPLETED') return 'succeeded';
  if (status === 'FAILED' || status === 'CANCELLED') return 'failed';
  return 'pending';
};

const toAmount = (cents: number): string => (cents / 100).toFixed(2);

type PayPalIssue = NonNullable<PayPalError['details']>[number];

const issueOf = (body: unknown): PayPalIssue[] => {
  const details = (body as PayPalError | null | undefined)?.details;
  return Array.isArray(details) ? details : [];
};

const cancelledUrlOf = (url: string): string => {
  const cancelled = new URL(url);
  cancelled.searchParams.set('payment', 'cancelled');
  return cancelled.toString();
};

/** PayPal Orders v2 behind the gateway contract; the shopper approves on PayPal's page and returns to Order success. */
@Injectable()
export class PayPalPaymentGateway extends PaymentGateway {
  private readonly webhookId: string;

  constructor(
    private readonly http: PayPalHttpClient,
    config: ConfigService,
  ) {
    super();
    this.webhookId = config.getOrThrow<string>('PAYPAL_WEBHOOK_ID');
  }

  async createCheckout(request: CheckoutRequest): Promise<CheckoutSession> {
    const response = await this.call<PayPalOrder>('POST', ORDERS_PATH, {
      headers: {
        'PayPal-Request-Id': request.replacesCheckoutId
          ? `create-${request.paymentId}-after-${request.replacesCheckoutId}`
          : `create-${request.paymentId}`,
      },
      body: {
        intent: 'CAPTURE',
        purchase_units: [
          {
            reference_id: request.orderId,
            custom_id: request.paymentId,
            invoice_id: request.orderNumber,
            description: `Order ${request.orderNumber}`,
            amount: {
              currency_code: request.currency.toUpperCase(),
              value: toAmount(request.amountCents),
            },
          },
        ],
        // successUrl carries Stripe's {CHECKOUT_SESSION_ID} placeholder.
        payment_source: {
          paypal: {
            experience_context: {
              return_url: request.cancelUrl,
              cancel_url: cancelledUrlOf(request.cancelUrl),
              user_action: 'PAY_NOW',
              shipping_preference: 'NO_SHIPPING',
            },
          },
        },
      },
    });
    if (response.status >= CLIENT_ERROR) throw this.rejected();
    return this.toSession(response.body, request.expiresAt);
  }

  async findCheckout(sessionId: string): Promise<CheckoutSession | null> {
    const response = await this.call<PayPalOrder>(
      'GET',
      `${ORDERS_PATH}/${sessionId}`,
    );
    if (response.status === NOT_FOUND) return null;
    if (response.status >= CLIENT_ERROR) throw this.rejected();
    return this.toSession(response.body);
  }

  // PayPal cannot close an uncaptured order; capture refuses a cancelled one.
  expireCheckout(): Promise<void> {
    return Promise.resolve();
  }

  async capture(checkoutId: string): Promise<CaptureOutcome> {
    // No fixed PayPal-Request-Id: it would replay a first decline.
    const response = await this.call<PayPalOrder | null>(
      'POST',
      `${ORDERS_PATH}/${checkoutId}/capture`,
      { headers: { Prefer: 'return=representation' } },
    );
    const refused = response.status >= CLIENT_ERROR;
    if (!refused && this.capturesOf(response.body).length > 0) {
      return this.resolve(response.body, []);
    }

    const details = refused ? issueOf(response.body) : [];
    const declined = details.find(
      (detail) => detail.issue === 'INSTRUMENT_DECLINED',
    );
    if (declined) {
      return {
        kind: 'failed',
        retryable: true,
        reason: declined.description ?? DENIED_REASON,
      };
    }
    if (details.some((detail) => detail.issue === 'ORDER_NOT_APPROVED')) {
      return { kind: 'not_approved' };
    }
    // ORDER_ALREADY_CAPTURED, any other refusal, or a 2xx without a capture:
    // the order itself is the answer (the webhook or another tab may have
    // captured it).
    const existing = await this.call<PayPalOrder | null>(
      'GET',
      `${ORDERS_PATH}/${checkoutId}`,
    );
    if (existing.status === NOT_FOUND) throw this.rejected();
    // Any other refusal (credentials, permissions) may be fixed: retry later.
    if (existing.status >= CLIENT_ERROR) throw this.unavailable();
    return this.resolve(existing.body, details);
  }

  // Completed wins, then pending; otherwise an open order can be approved
  // again and a closed one with a declined capture failed for good.
  private resolve(
    order: PayPalOrder | null,
    details: PayPalIssue[],
  ): CaptureOutcome {
    const captures = this.capturesOf(order);
    const completed = captures.find(
      (capture) => capture.status === 'COMPLETED',
    );
    if (completed) {
      return {
        kind: 'succeeded',
        transactionId: completed.id,
        paidAt: new Date(completed.create_time ?? Date.now()),
      };
    }
    const pending = captures.find((capture) => capture.status === 'PENDING');
    if (pending) return { kind: 'pending', transactionId: pending.id };
    const latest = captures.at(-1);
    const declinedReason = latest?.status_details?.reason;
    if (order && OPEN_STATUSES.has(order.status)) {
      return {
        kind: 'failed',
        retryable: true,
        reason:
          details.filter((detail) => detail.description).at(-1)?.description ??
          declinedReason ??
          NO_RESULT_REASON,
      };
    }
    if (latest?.status === 'DECLINED' || latest?.status === 'FAILED') {
      return {
        kind: 'failed',
        retryable: false,
        reason: declinedReason ?? DENIED_REASON,
      };
    }
    throw this.rejected();
  }

  async refund(request: RefundRequest): Promise<RefundOutcome> {
    const response = await this.call<PayPalRefund>(
      'POST',
      `/v2/payments/captures/${encodeURIComponent(request.chargeTransactionId)}/refund`,
      {
        headers: { 'PayPal-Request-Id': `refund-${request.refundId}` },
        body: {
          amount: {
            value: toAmount(request.amountCents),
            currency_code: request.currency.toUpperCase(),
          },
          custom_id: request.refundId,
        },
      },
    );
    if (response.status >= CLIENT_ERROR) {
      return {
        kind: 'failed',
        refundTransactionId: null,
        reason: issueOf(response.body)[0]?.description ?? REFUND_REFUSED_REASON,
      };
    }
    const refund = response.body;
    const id = refund.id ?? null;
    const status = refundStatusOf(refund.status);
    if (status === 'succeeded' && id) {
      return {
        kind: 'succeeded',
        refundTransactionId: id,
        refundedAt: new Date(refund.create_time ?? Date.now()),
      };
    }
    if (status === 'pending' && id) {
      return { kind: 'pending', refundTransactionId: id };
    }
    return {
      kind: 'failed',
      refundTransactionId: id,
      reason: refund.status_details?.reason ?? REFUND_REFUSED_REASON,
    };
  }

  private toRefundEvent(refund: PayPalRefund): RefundEvent | null {
    const up = refund.links?.find((link) => link.rel === 'up')?.href ?? '';
    const chargeTransactionId = CAPTURE_HREF.exec(up)?.[1];
    if (!refund.id || !chargeTransactionId) return null;
    const status = refundStatusOf(refund.status);
    return {
      kind: 'refund',
      refundTransactionId: refund.id,
      chargeTransactionId,
      refundId: refund.custom_id ?? null,
      amountCents: Math.round(Number(refund.amount?.value ?? 0) * 100),
      currency: (refund.amount?.currency_code ?? 'USD').toLowerCase(),
      status,
      reason:
        status === 'failed'
          ? (refund.status_details?.reason ?? REFUND_REFUSED_REASON)
          : null,
      at: new Date(refund.create_time ?? Date.now()),
    };
  }

  private capturesOf(order: PayPalOrder | null): PayPalCapture[] {
    const captures = order?.purchase_units?.[0]?.payments?.captures;
    return Array.isArray(captures) ? captures : [];
  }

  async parseWebhook(
    rawBody: Buffer | undefined,
    headers: IncomingHttpHeaders,
  ): Promise<VerifiedWebhook> {
    const signature = Object.entries(SIGNATURE_HEADERS).map(
      ([field, header]) => [field, headers[header]] as const,
    );
    if (
      !rawBody ||
      signature.some(([, value]) => typeof value !== 'string' || !value)
    ) {
      throw this.invalidSignature();
    }
    const text = rawBody.toString('utf8');
    let event: PayPalEvent;
    try {
      event = JSON.parse(text) as PayPalEvent;
    } catch {
      throw this.invalidSignature();
    }
    // An event without an id could not be recorded once: refuse it unverified.
    const id =
      event && typeof event === 'object' && typeof event.id === 'string'
        ? event.id
        : '';
    if (!id) throw this.invalidSignature();

    // The event goes back verbatim: re-serialized JSON can fail PayPal's check.
    const fields = [...signature, ['webhook_id', this.webhookId] as const]
      .map(
        ([field, value]) => `${JSON.stringify(field)}:${JSON.stringify(value)}`,
      )
      .join(',');
    const verification = await this.call<{ verification_status?: string }>(
      'POST',
      VERIFY_PATH,
      { rawBody: `{${fields},"webhook_event":${text}}` },
    );
    if (verification.body.verification_status !== 'SUCCESS') {
      throw this.invalidSignature();
    }

    return {
      id,
      type: event.event_type ?? '',
      event: this.translate(event),
    };
  }

  private translate(event: PayPalEvent): VerifiedWebhook['event'] {
    const resource = event.resource ?? {};
    if (REFUND_EVENT_TYPES.has(event.event_type ?? '')) {
      return this.toRefundEvent(resource);
    }
    const checkoutSessionId =
      resource.supplementary_data?.related_ids?.order_id;
    switch (event.event_type) {
      case 'PAYMENT.CAPTURE.COMPLETED':
        return resource.custom_id && resource.id
          ? {
              kind: 'succeeded',
              paymentId: resource.custom_id,
              checkoutSessionId,
              transactionId: resource.id,
              paidAt: new Date(resource.create_time ?? Date.now()),
            }
          : null;
      case 'PAYMENT.CAPTURE.DENIED':
        return resource.custom_id
          ? {
              kind: 'failed',
              paymentId: resource.custom_id,
              checkoutSessionId,
              reason: resource.status_details?.reason ?? DENIED_REASON,
            }
          : null;
      case 'CHECKOUT.ORDER.APPROVED':
        return resource.id
          ? { kind: 'approved', checkoutSessionId: resource.id }
          : null;
      default:
        return null;
    }
  }

  private toSession(
    order: PayPalOrder,
    expiresAt = new Date(),
  ): CheckoutSession {
    const link = order.links?.find((candidate) =>
      APPROVAL_RELS.includes(candidate.rel),
    );
    const open = OPEN_STATUSES.has(order.status);
    const holdsMoney = this.capturesOf(order).some((capture) =>
      HELD_CAPTURE_STATUSES.has(capture.status),
    );
    return {
      id: order.id,
      url: link?.href ?? '',
      open,
      endedUnpaid: !open && !holdsMoney,
      expiresAt,
    };
  }

  private async call<T>(
    method: 'GET' | 'POST',
    path: string,
    options?: Parameters<PayPalHttpClient['request']>[2],
  ): Promise<PayPalResponse<T>> {
    let response: PayPalResponse<T>;
    try {
      response =
        options === undefined
          ? await this.http.request<T>(method, path)
          : await this.http.request<T>(method, path, options);
    } catch (error) {
      if (error instanceof PayPalUnavailableError) throw this.unavailable();
      throw error;
    }
    // Throttled: try again later, never a final refusal.
    if (response.status === TOO_MANY_REQUESTS) throw this.unavailable();
    return response;
  }

  private unavailable(): DependencyUnavailableException {
    return new DependencyUnavailableException({
      errCode: ERROR_CODES.PAYMENT.GATEWAY_UNAVAILABLE,
      field: '',
      message: ERROR_MESSAGES.PAYMENT.GATEWAY_UNAVAILABLE,
      description: ERROR_DESCRIPTIONS.PAYMENT.GATEWAY_UNAVAILABLE,
    });
  }

  private rejected(): InvalidRequestException {
    return new InvalidRequestException({
      errCode: ERROR_CODES.PAYMENT.GATEWAY_REJECTED,
      field: 'payment',
      message: ERROR_MESSAGES.PAYMENT.GATEWAY_REJECTED,
      description: ERROR_DESCRIPTIONS.PAYMENT.GATEWAY_REJECTED,
    });
  }

  private invalidSignature(): UnauthenticatedException {
    return new UnauthenticatedException({
      errCode: ERROR_CODES.PAYMENT.INVALID_SIGNATURE,
      field: 'paypal-transmission-sig',
      message: ERROR_MESSAGES.PAYMENT.INVALID_SIGNATURE,
      description: ERROR_DESCRIPTIONS.PAYMENT.INVALID_SIGNATURE,
    });
  }
}
