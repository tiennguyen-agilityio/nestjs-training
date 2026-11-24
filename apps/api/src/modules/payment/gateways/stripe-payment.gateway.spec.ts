import type { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { StripePaymentGateway } from './stripe-payment.gateway.js';
import type { CheckoutRequest } from './payment-gateway.js';
import {
  DependencyUnavailableException,
  InvalidRequestException,
  UnauthenticatedException,
} from '../../../common/exceptions/base.exception.js';
import { ERROR_CODES } from '../../../common/constants/error-code.constant.js';

const SECRET = 'whsec_test_unit';
const PAYMENT_ID = '11111111-1111-4111-8111-111111111111';
const ORDER_ID = '22222222-2222-4222-8222-222222222222';
const EXPIRES_AT = new Date('2026-11-25T09:00:00Z');
const EXPIRES_SECONDS = EXPIRES_AT.getTime() / 1000;

describe('StripePaymentGateway', () => {
  let stripe: Stripe;
  let gateway: StripePaymentGateway;

  const request: CheckoutRequest = {
    paymentId: PAYMENT_ID,
    orderId: ORDER_ID,
    orderNumber: 'ORD-1',
    amountCents: 2350,
    currency: 'usd',
    customerEmail: 'lan@example.com',
    expiresAt: EXPIRES_AT,
    successUrl: 'http://localhost:3101/order-success?orderId=o1',
    cancelUrl: 'http://localhost:3101/order-success?orderId=o1',
  };

  const session = (overrides: Record<string, unknown> = {}) =>
    ({
      id: 'cs_test_1',
      url: 'https://checkout.stripe.com/c/pay/cs_test_1',
      status: 'open',
      expires_at: EXPIRES_SECONDS,
      ...overrides,
    }) as unknown as Stripe.Checkout.Session;

  const signed = (event: Record<string, unknown>) => {
    const payload = JSON.stringify(event);
    return {
      body: Buffer.from(payload),
      headers: {
        'stripe-signature': stripe.webhooks.generateTestHeaderString({
          payload,
          secret: SECRET,
        }),
      },
    };
  };

  const event = (type: string, object: Record<string, unknown>) => ({
    id: 'evt_1',
    object: 'event',
    type,
    created: 1764061200,
    data: { object },
  });

  const parse = (body: Record<string, unknown>) => {
    const { body: raw, headers } = signed(body);
    return gateway.parseWebhook(raw, headers).event;
  };

  beforeEach(() => {
    stripe = new Stripe('sk_test_unit');
    const config = {
      getOrThrow: vi.fn().mockReturnValue(SECRET),
    } as unknown as ConfigService;
    gateway = new StripePaymentGateway(stripe, config);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createCheckout', () => {
    it('createCheckout sends a card-only USD session with the payment metadata and idempotency key', async () => {
      const create = vi
        .spyOn(stripe.checkout.sessions, 'create')
        .mockResolvedValue(session() as never);

      const result = await gateway.createCheckout(request);

      expect(create).toHaveBeenCalledWith(
        {
          mode: 'payment',
          allowed_payment_method_types: ['card'],
          line_items: [
            {
              price_data: {
                currency: 'usd',
                unit_amount: 2350,
                product_data: { name: 'Order ORD-1' },
              },
              quantity: 1,
            },
          ],
          client_reference_id: PAYMENT_ID,
          metadata: { paymentId: PAYMENT_ID, orderId: ORDER_ID },
          payment_intent_data: {
            metadata: { paymentId: PAYMENT_ID, orderId: ORDER_ID },
          },
          customer_email: 'lan@example.com',
          expires_at: EXPIRES_SECONDS,
          success_url: request.successUrl,
          cancel_url: request.cancelUrl,
        },
        { idempotencyKey: `checkout-${PAYMENT_ID}-${EXPIRES_SECONDS}` },
      );
      expect(result).toEqual({
        id: 'cs_test_1',
        url: 'https://checkout.stripe.com/c/pay/cs_test_1',
        open: true,
        expiresAt: EXPIRES_AT,
      });
    });

    it.each([
      new Stripe.errors.StripeConnectionError({ message: 'offline' }),
      new Stripe.errors.StripeAPIError({ message: 'stripe down' }),
      new Stripe.errors.StripeRateLimitError({ message: 'slow down' }),
    ])(
      'createCheckout maps a connection error to DependencyUnavailableException (%#)',
      async (error) => {
        vi.spyOn(stripe.checkout.sessions, 'create').mockRejectedValue(error);

        await expect(gateway.createCheckout(request)).rejects.toMatchObject({
          constructor: DependencyUnavailableException,
          errors: [
            expect.objectContaining({
              errCode: ERROR_CODES.PAYMENT.GATEWAY_UNAVAILABLE,
            }),
          ],
        });
      },
    );

    it('createCheckout maps an invalid request to InvalidRequestException', async () => {
      vi.spyOn(stripe.checkout.sessions, 'create').mockRejectedValue(
        new Stripe.errors.StripeInvalidRequestError({
          message: 'Amount must be at least $0.50 usd',
          code: 'amount_too_small',
        }),
      );

      const rejection = gateway.createCheckout(request);

      await expect(rejection).rejects.toBeInstanceOf(InvalidRequestException);
      await expect(rejection).rejects.toMatchObject({
        errors: [
          expect.objectContaining({
            errCode: ERROR_CODES.PAYMENT.GATEWAY_REJECTED,
          }),
        ],
      });
    });
  });

  describe('findCheckout', () => {
    it('findCheckout maps an open and an expired session', async () => {
      const retrieve = vi
        .spyOn(stripe.checkout.sessions, 'retrieve')
        .mockResolvedValueOnce(session() as never)
        .mockResolvedValueOnce(session({ status: 'expired' }) as never);

      await expect(gateway.findCheckout('cs_test_1')).resolves.toMatchObject({
        id: 'cs_test_1',
        open: true,
      });
      await expect(gateway.findCheckout('cs_test_1')).resolves.toMatchObject({
        open: false,
      });
      expect(retrieve).toHaveBeenCalledWith('cs_test_1');
    });

    it('findCheckout returns null for a session Stripe does not have', async () => {
      vi.spyOn(stripe.checkout.sessions, 'retrieve').mockRejectedValue(
        new Stripe.errors.StripeInvalidRequestError({
          message: 'No such checkout.session',
          code: 'resource_missing',
        }),
      );

      await expect(gateway.findCheckout('cs_missing')).resolves.toBeNull();
    });
  });

  describe('expireCheckout', () => {
    it('expireCheckout expires an open session', async () => {
      vi.spyOn(stripe.checkout.sessions, 'retrieve').mockResolvedValue(
        session() as never,
      );
      const expire = vi
        .spyOn(stripe.checkout.sessions, 'expire')
        .mockResolvedValue(session({ status: 'expired' }) as never);

      await expect(
        gateway.expireCheckout('cs_test_1'),
      ).resolves.toBeUndefined();
      expect(expire).toHaveBeenCalledWith('cs_test_1');
    });

    it('expireCheckout does nothing for a session that is not open or is missing', async () => {
      const expire = vi.spyOn(stripe.checkout.sessions, 'expire');
      vi.spyOn(stripe.checkout.sessions, 'retrieve')
        .mockResolvedValueOnce(session({ status: 'expired' }) as never)
        .mockResolvedValueOnce(session({ status: 'complete' }) as never)
        .mockRejectedValueOnce(
          new Stripe.errors.StripeInvalidRequestError({
            message: 'No such checkout.session',
            code: 'resource_missing',
          }),
        );

      for (let i = 0; i < 3; i++) {
        await expect(
          gateway.expireCheckout('cs_test_1'),
        ).resolves.toBeUndefined();
      }
      expect(expire).not.toHaveBeenCalled();
    });

    it('expireCheckout treats an invalid-request error on a session that just closed as done', async () => {
      const retrieve = vi
        .spyOn(stripe.checkout.sessions, 'retrieve')
        .mockResolvedValueOnce(session() as never)
        .mockResolvedValueOnce(session({ status: 'complete' }) as never);
      vi.spyOn(stripe.checkout.sessions, 'expire').mockRejectedValue(
        new Stripe.errors.StripeInvalidRequestError({
          message:
            'Only Checkout Sessions with a status in ["open"] can be expired.',
        }),
      );

      await expect(
        gateway.expireCheckout('cs_test_1'),
      ).resolves.toBeUndefined();
      expect(retrieve).toHaveBeenCalledTimes(2);
    });

    it('expireCheckout rejects an invalid-request error while the session is still open', async () => {
      vi.spyOn(stripe.checkout.sessions, 'retrieve').mockResolvedValue(
        session() as never,
      );
      vi.spyOn(stripe.checkout.sessions, 'expire').mockRejectedValue(
        new Stripe.errors.StripeInvalidRequestError({ message: 'Bad request' }),
      );

      await expect(gateway.expireCheckout('cs_test_1')).rejects.toBeInstanceOf(
        InvalidRequestException,
      );
    });

    it('expireCheckout rethrows a connection error so the outbox retries', async () => {
      vi.spyOn(stripe.checkout.sessions, 'retrieve').mockResolvedValue(
        session() as never,
      );
      vi.spyOn(stripe.checkout.sessions, 'expire').mockRejectedValue(
        new Stripe.errors.StripeConnectionError({ message: 'socket hang up' }),
      );

      await expect(gateway.expireCheckout('cs_test_1')).rejects.toBeInstanceOf(
        DependencyUnavailableException,
      );
    });
  });

  describe('parseWebhook', () => {
    it('parseWebhook throws UnauthenticatedException for a bad signature', () => {
      const payload = JSON.stringify(event('customer.created', {}));
      const headers = {
        'stripe-signature': stripe.webhooks.generateTestHeaderString({
          payload,
          secret: 'whsec_wrong',
        }),
      };

      expect(() => gateway.parseWebhook(Buffer.from(payload), headers)).toThrow(
        UnauthenticatedException,
      );
    });

    it('parseWebhook throws UnauthenticatedException without a raw body or a Stripe-Signature header', () => {
      const { body, headers } = signed(event('customer.created', {}));

      expect(() => gateway.parseWebhook(undefined, headers)).toThrow(
        UnauthenticatedException,
      );
      expect(() => gateway.parseWebhook(body, {})).toThrow(
        UnauthenticatedException,
      );
    });

    it('parseWebhook maps a paid checkout.session.completed to succeeded', () => {
      expect(
        parse(
          event('checkout.session.completed', {
            id: 'cs_test_1',
            object: 'checkout.session',
            payment_status: 'paid',
            payment_intent: 'pi_1',
            metadata: { paymentId: PAYMENT_ID, orderId: ORDER_ID },
          }),
        ),
      ).toEqual({
        kind: 'succeeded',
        paymentId: PAYMENT_ID,
        checkoutSessionId: 'cs_test_1',
        transactionId: 'pi_1',
        paidAt: new Date(1764061200 * 1000),
      });
    });

    it('parseWebhook ignores an unpaid checkout.session.completed', () => {
      expect(
        parse(
          event('checkout.session.completed', {
            object: 'checkout.session',
            payment_status: 'unpaid',
            payment_intent: 'pi_1',
            metadata: { paymentId: PAYMENT_ID },
          }),
        ),
      ).toBeNull();
    });

    it('parseWebhook maps checkout.session.expired to failed', () => {
      expect(
        parse(
          event('checkout.session.expired', {
            id: 'cs_test_1',
            object: 'checkout.session',
            metadata: { paymentId: PAYMENT_ID },
          }),
        ),
      ).toEqual({
        kind: 'failed',
        paymentId: PAYMENT_ID,
        checkoutSessionId: 'cs_test_1',
        reason: 'Checkout session expired',
      });
    });

    it('parseWebhook maps payment_intent.payment_failed to failed with the decline message', () => {
      expect(
        parse(
          event('payment_intent.payment_failed', {
            object: 'payment_intent',
            metadata: { paymentId: PAYMENT_ID },
            last_payment_error: { message: 'Your card was declined.' },
          }),
        ),
      ).toEqual({
        kind: 'failed',
        paymentId: PAYMENT_ID,
        reason: 'Your card was declined.',
      });
      expect(
        parse(
          event('payment_intent.payment_failed', {
            object: 'payment_intent',
            metadata: { paymentId: PAYMENT_ID },
            last_payment_error: null,
          }),
        ),
      ).toEqual({
        kind: 'failed',
        paymentId: PAYMENT_ID,
        reason: 'Payment failed',
      });
    });

    it('parseWebhook returns null when the payment id is missing', () => {
      expect(
        parse(
          event('checkout.session.completed', {
            object: 'checkout.session',
            payment_status: 'paid',
            payment_intent: 'pi_1',
            metadata: {},
          }),
        ),
      ).toBeNull();
      expect(
        parse(
          event('payment_intent.payment_failed', {
            object: 'payment_intent',
            metadata: {},
            last_payment_error: null,
          }),
        ),
      ).toBeNull();
    });

    it('parseWebhook returns the event id and type with the translated event', () => {
      const { body, headers } = signed(
        event('checkout.session.expired', {
          id: 'cs_test_1',
          object: 'checkout.session',
          metadata: { paymentId: PAYMENT_ID },
        }),
      );

      expect(gateway.parseWebhook(body, headers)).toEqual({
        id: 'evt_1',
        type: 'checkout.session.expired',
        event: {
          kind: 'failed',
          paymentId: PAYMENT_ID,
          checkoutSessionId: 'cs_test_1',
          reason: 'Checkout session expired',
        },
      });
    });

    it('parseWebhook ignores other event types', () => {
      expect(
        parse(event('customer.created', { object: 'customer' })),
      ).toBeNull();
    });
  });
});
