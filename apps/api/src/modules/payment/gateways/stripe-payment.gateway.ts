import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { IncomingHttpHeaders } from 'node:http';
import Stripe from 'stripe';
import {
  PaymentGateway,
  type CheckoutRequest,
  type CheckoutSession,
  type GatewayEvent,
  type VerifiedWebhook,
} from './payment-gateway.js';
import { STRIPE_CLIENT } from './stripe-client.provider.js';
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

const SIGNATURE_HEADER = 'stripe-signature';
const EXPIRED_REASON = 'Checkout session expired';
const FAILED_REASON = 'Payment failed';
const MISSING_RESOURCE = 'resource_missing';

const toSeconds = (date: Date): number => Math.floor(date.getTime() / 1000);

@Injectable()
export class StripePaymentGateway extends PaymentGateway {
  private readonly webhookSecret: string;

  constructor(
    @Inject(STRIPE_CLIENT) private readonly stripe: Stripe,
    config: ConfigService,
  ) {
    super();
    this.webhookSecret = config.getOrThrow<string>('STRIPE_WEBHOOK_SECRET');
  }

  async createCheckout(request: CheckoutRequest): Promise<CheckoutSession> {
    const expiresAt = toSeconds(request.expiresAt);
    const metadata = {
      paymentId: request.paymentId,
      orderId: request.orderId,
    };
    try {
      const session = await this.stripe.checkout.sessions.create(
        {
          mode: 'payment',
          allowed_payment_method_types: ['card'],
          line_items: [
            {
              price_data: {
                currency: request.currency,
                unit_amount: request.amountCents,
                product_data: { name: `Order ${request.orderNumber}` },
              },
              quantity: 1,
            },
          ],
          client_reference_id: request.paymentId,
          metadata,
          payment_intent_data: { metadata },
          customer_email: request.customerEmail,
          expires_at: expiresAt,
          success_url: request.successUrl,
          cancel_url: request.cancelUrl,
        },
        { idempotencyKey: `checkout-${request.paymentId}-${expiresAt}` },
      );
      return this.toSession(session);
    } catch (error) {
      throw this.translate(error);
    }
  }

  async findCheckout(sessionId: string): Promise<CheckoutSession | null> {
    try {
      return this.toSession(
        await this.stripe.checkout.sessions.retrieve(sessionId),
      );
    } catch (error) {
      if (
        error instanceof Stripe.errors.StripeInvalidRequestError &&
        error.code === MISSING_RESOURCE
      ) {
        return null;
      }
      throw this.translate(error);
    }
  }

  capture(): Promise<null> {
    return Promise.resolve(null);
  }

  async expireCheckout(sessionId: string): Promise<void> {
    if (!(await this.findCheckout(sessionId))?.open) return;
    try {
      await this.stripe.checkout.sessions.expire(sessionId);
    } catch (error) {
      // Stripe refuses to expire a session that is no longer open (paid or
      // expired between the read and the call): done, unless it is still open.
      if (
        error instanceof Stripe.errors.StripeInvalidRequestError &&
        !(await this.findCheckout(sessionId))?.open
      ) {
        return;
      }
      throw this.translate(error);
    }
  }

  parseWebhook(
    rawBody: Buffer | undefined,
    headers: IncomingHttpHeaders,
  ): Promise<VerifiedWebhook> {
    return Promise.resolve().then(() => this.verify(rawBody, headers));
  }

  private verify(
    rawBody: Buffer | undefined,
    headers: IncomingHttpHeaders,
  ): VerifiedWebhook {
    const signature = headers[SIGNATURE_HEADER];
    if (!rawBody || typeof signature !== 'string') {
      throw this.invalidSignature();
    }
    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(
        rawBody,
        signature,
        this.webhookSecret,
      );
    } catch {
      throw this.invalidSignature();
    }
    return {
      id: event.id,
      type: event.type,
      event: this.toGatewayEvent(event),
    };
  }

  private toGatewayEvent(event: Stripe.Event): GatewayEvent | null {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const paymentId = session.metadata?.paymentId;
        const intent = session.payment_intent;
        const transactionId = typeof intent === 'string' ? intent : intent?.id;
        if (!paymentId || session.payment_status !== 'paid' || !transactionId) {
          return null;
        }
        return {
          kind: 'succeeded',
          paymentId,
          checkoutSessionId: session.id,
          transactionId,
          paidAt: new Date(event.created * 1000),
        };
      }
      case 'checkout.session.expired': {
        const session = event.data.object;
        const paymentId = session.metadata?.paymentId;
        return paymentId
          ? {
              kind: 'failed',
              paymentId,
              checkoutSessionId: session.id,
              reason: EXPIRED_REASON,
            }
          : null;
      }
      case 'payment_intent.payment_failed': {
        const intent = event.data.object;
        const paymentId = intent.metadata?.paymentId;
        return paymentId
          ? {
              kind: 'failed',
              paymentId,
              reason: intent.last_payment_error?.message ?? FAILED_REASON,
            }
          : null;
      }
      default:
        return null;
    }
  }

  private toSession(session: Stripe.Checkout.Session): CheckoutSession {
    return {
      id: session.id,
      url: session.url ?? '',
      open: session.status === 'open',
      expiresAt: new Date(session.expires_at * 1000),
    };
  }

  private translate(error: unknown): unknown {
    if (
      error instanceof Stripe.errors.StripeInvalidRequestError ||
      error instanceof Stripe.errors.StripeCardError
    ) {
      return new InvalidRequestException({
        errCode: ERROR_CODES.PAYMENT.GATEWAY_REJECTED,
        field: 'payment',
        message: ERROR_MESSAGES.PAYMENT.GATEWAY_REJECTED,
        description: ERROR_DESCRIPTIONS.PAYMENT.GATEWAY_REJECTED,
      });
    }
    if (error instanceof Stripe.errors.StripeError) {
      return new DependencyUnavailableException({
        errCode: ERROR_CODES.PAYMENT.GATEWAY_UNAVAILABLE,
        field: '',
        message: ERROR_MESSAGES.PAYMENT.GATEWAY_UNAVAILABLE,
        description: ERROR_DESCRIPTIONS.PAYMENT.GATEWAY_UNAVAILABLE,
      });
    }
    return error;
  }

  private invalidSignature(): UnauthenticatedException {
    return new UnauthenticatedException({
      errCode: ERROR_CODES.PAYMENT.INVALID_SIGNATURE,
      field: SIGNATURE_HEADER,
      message: ERROR_MESSAGES.PAYMENT.INVALID_SIGNATURE,
      description: ERROR_DESCRIPTIONS.PAYMENT.INVALID_SIGNATURE,
    });
  }
}
