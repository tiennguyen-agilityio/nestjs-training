import type { ConfigService } from '@nestjs/config';
import type { Mock } from 'vitest';
import { PayPalPaymentGateway } from './paypal-payment.gateway.js';
import {
  PayPalUnavailableError,
  type PayPalHttpClient,
} from './paypal-http.client.js';
import type { CheckoutRequest } from './payment-gateway.js';
import {
  DependencyUnavailableException,
  InvalidRequestException,
  UnauthenticatedException,
} from '../../../common/exceptions/base.exception.js';
import { ERROR_CODES } from '../../../common/constants/error-code.constant.js';

const PAYMENT_ID = '11111111-1111-4111-8111-111111111111';
const ORDER_ID = '22222222-2222-4222-8222-222222222222';
const PAYPAL_ORDER_ID = '5O190127TN364715T';
const WEBHOOK_ID = 'WH-CONFIGURED';
const APPROVE_URL = `https://www.sandbox.paypal.com/checkoutnow?token=${PAYPAL_ORDER_ID}`;

const HEADERS = {
  'paypal-transmission-id': 'tx-1',
  'paypal-transmission-time': '2026-11-24T10:00:00Z',
  'paypal-transmission-sig': 'sig',
  'paypal-cert-url': 'https://api.sandbox.paypal.com/cert.pem',
  'paypal-auth-algo': 'SHA256withRSA',
};

const request: CheckoutRequest = {
  paymentId: PAYMENT_ID,
  orderId: ORDER_ID,
  orderNumber: 'ORD-1',
  amountCents: 1234,
  currency: 'usd',
  customerEmail: 'lan@example.com',
  expiresAt: new Date('2026-11-25T09:00:00Z'),
  successUrl: 'http://localhost:3501/order-success',
  cancelUrl: 'http://localhost:3501/order-success',
  replacesCheckoutId: null,
};

const order = (status: string, extra: Record<string, unknown> = {}) => ({
  id: PAYPAL_ORDER_ID,
  status,
  links: [
    {
      rel: 'self',
      href: 'https://api-m.sandbox.paypal.com/v2/checkout/orders/x',
    },
    { rel: 'approve', href: APPROVE_URL },
  ],
  ...extra,
});

const capturedOrder = (captureStatus: string, extra = {}) =>
  order('COMPLETED', {
    purchase_units: [
      {
        payments: {
          captures: [
            {
              id: 'CAPTURE-1',
              status: captureStatus,
              create_time: '2026-11-24T10:05:00Z',
              ...extra,
            },
          ],
        },
      },
    ],
  });

interface DomainError {
  getErrors(): { errCode: string }[];
}

const failureOf = (promise: Promise<unknown>): Promise<DomainError> =>
  promise.then(
    () => {
      throw new Error('expected a rejection');
    },
    (error: unknown) => error as DomainError,
  );

describe('PayPalPaymentGateway', () => {
  let http: { request: Mock };
  let gateway: PayPalPaymentGateway;

  const answer = (status: number, body: unknown): void => {
    http.request.mockResolvedValueOnce({ status, body });
  };

  const verified = (event: Record<string, unknown>, status = 'SUCCESS') => {
    answer(200, { verification_status: status });
    return gateway.parseWebhook(Buffer.from(JSON.stringify(event)), HEADERS);
  };

  beforeEach(() => {
    http = { request: vi.fn() };
    const config = {
      getOrThrow: vi.fn().mockReturnValue(WEBHOOK_ID),
    } as unknown as ConfigService;
    gateway = new PayPalPaymentGateway(
      http as unknown as PayPalHttpClient,
      config,
    );
  });

  describe('createCheckout', () => {
    it('createCheckout posts an intent CAPTURE order and returns its approve link', async () => {
      answer(201, order('CREATED'));

      await expect(gateway.createCheckout(request)).resolves.toEqual({
        id: PAYPAL_ORDER_ID,
        url: APPROVE_URL,
        open: true,
        endedUnpaid: false,
        expiresAt: request.expiresAt,
      });
      expect(http.request).toHaveBeenCalledWith('POST', '/v2/checkout/orders', {
        headers: { 'PayPal-Request-Id': `create-${PAYMENT_ID}` },
        body: {
          intent: 'CAPTURE',
          purchase_units: [
            {
              reference_id: ORDER_ID,
              custom_id: PAYMENT_ID,
              invoice_id: 'ORD-1',
              description: 'Order ORD-1',
              amount: { currency_code: 'USD', value: '12.34' },
            },
          ],
        },
      });
    });

    it("createCheckout keeps the first attempt's PayPal-Request-Id", async () => {
      answer(201, order('CREATED'));

      await gateway.createCheckout({ ...request, replacesCheckoutId: null });

      expect(http.request).toHaveBeenCalledWith(
        'POST',
        '/v2/checkout/orders',
        expect.objectContaining({
          headers: { 'PayPal-Request-Id': `create-${PAYMENT_ID}` },
        }),
      );
    });

    it('createCheckout keys a retry by the PayPal order it replaces', async () => {
      answer(201, order('CREATED'));

      await gateway.createCheckout({
        ...request,
        replacesCheckoutId: 'PP-OLD',
      });

      expect(http.request).toHaveBeenCalledWith(
        'POST',
        '/v2/checkout/orders',
        expect.objectContaining({
          headers: { 'PayPal-Request-Id': `create-${PAYMENT_ID}-after-PP-OLD` },
        }),
      );
    });

    it('createCheckout falls back to the payer-action link', async () => {
      answer(200, {
        id: PAYPAL_ORDER_ID,
        status: 'PAYER_ACTION_REQUIRED',
        links: [{ rel: 'payer-action', href: APPROVE_URL }],
      });

      await expect(gateway.createCheckout(request)).resolves.toMatchObject({
        url: APPROVE_URL,
      });
    });

    it('PayPal outages become 503 GATEWAY_UNAVAILABLE', async () => {
      http.request.mockRejectedValueOnce(new PayPalUnavailableError('down'));

      const error = await failureOf(gateway.createCheckout(request));

      expect(error).toBeInstanceOf(DependencyUnavailableException);
      expect(error.getErrors()[0].errCode).toBe(
        ERROR_CODES.PAYMENT.GATEWAY_UNAVAILABLE,
      );
    });

    it('a 429 on create or find becomes 503', async () => {
      answer(429, { name: 'RATE_LIMIT_REACHED' });
      await expect(gateway.createCheckout(request)).rejects.toBeInstanceOf(
        DependencyUnavailableException,
      );

      answer(429, { name: 'RATE_LIMIT_REACHED' });
      await expect(
        gateway.findCheckout(PAYPAL_ORDER_ID),
      ).rejects.toBeInstanceOf(DependencyUnavailableException);
    });

    it('other 4xx on create become 400 GATEWAY_REJECTED', async () => {
      answer(422, { name: 'UNPROCESSABLE_ENTITY' });

      const error = await failureOf(gateway.createCheckout(request));

      expect(error).toBeInstanceOf(InvalidRequestException);
      expect(error.getErrors()[0].errCode).toBe(
        ERROR_CODES.PAYMENT.GATEWAY_REJECTED,
      );
    });
  });

  describe('findCheckout', () => {
    it.each([
      ['CREATED', true],
      ['PAYER_ACTION_REQUIRED', true],
      ['APPROVED', true],
      ['COMPLETED', false],
      ['VOIDED', false],
    ])('findCheckout reads a %s order as open=%s', async (status, open) => {
      answer(200, order(status));

      await expect(gateway.findCheckout(PAYPAL_ORDER_ID)).resolves.toEqual({
        id: PAYPAL_ORDER_ID,
        url: APPROVE_URL,
        open,
        endedUnpaid: !open,
        expiresAt: expect.any(Date) as Date,
      });
      expect(http.request).toHaveBeenCalledWith(
        'GET',
        `/v2/checkout/orders/${PAYPAL_ORDER_ID}`,
      );
    });

    it.each([
      ['a CREATED order', order('CREATED'), false],
      ['a VOIDED order with no capture', order('VOIDED'), true],
      [
        'a COMPLETED order with a DECLINED capture',
        capturedOrder('DECLINED'),
        true,
      ],
      [
        'a COMPLETED order with a COMPLETED capture',
        capturedOrder('COMPLETED'),
        false,
      ],
      [
        'a COMPLETED order with a PENDING capture',
        capturedOrder('PENDING'),
        false,
      ],
    ])(
      'findCheckout reports ended unpaid only for a closed order without a completed or pending capture: %s',
      async (_label, body, endedUnpaid) => {
        answer(200, body);

        await expect(
          gateway.findCheckout(PAYPAL_ORDER_ID),
        ).resolves.toMatchObject({ endedUnpaid });
      },
    );

    it('findCheckout returns null for an order PayPal does not have', async () => {
      answer(404, { name: 'RESOURCE_NOT_FOUND' });

      await expect(gateway.findCheckout(PAYPAL_ORDER_ID)).resolves.toBeNull();
    });
  });

  describe('expireCheckout', () => {
    it('expireCheckout resolves without calling PayPal', async () => {
      await expect(
        gateway.expireCheckout(PAYPAL_ORDER_ID),
      ).resolves.toBeUndefined();
      expect(http.request).not.toHaveBeenCalled();
    });
  });

  describe('refund', () => {
    const REFUND_ID = '33333333-3333-4333-8333-333333333333';
    const refundRequest = {
      refundId: REFUND_ID,
      chargeTransactionId: 'CAPTURE-1',
      amountCents: 1250,
      currency: 'usd' as const,
    };

    it('refund posts to the capture with the request id', async () => {
      answer(201, {
        id: 'REFUND-1',
        status: 'COMPLETED',
        create_time: '2026-11-25T10:00:00Z',
      });

      await gateway.refund(refundRequest);

      expect(http.request).toHaveBeenCalledWith(
        'POST',
        '/v2/payments/captures/CAPTURE-1/refund',
        {
          headers: { 'PayPal-Request-Id': `refund-${REFUND_ID}` },
          body: {
            amount: { value: '12.50', currency_code: 'USD' },
            custom_id: REFUND_ID,
          },
        },
      );
    });

    it('refund maps COMPLETED, PENDING and FAILED', async () => {
      answer(201, {
        id: 'REFUND-1',
        status: 'COMPLETED',
        create_time: '2026-11-25T10:00:00Z',
      });
      answer(201, { id: 'REFUND-2', status: 'PENDING' });
      answer(201, {
        id: 'REFUND-3',
        status: 'FAILED',
        status_details: { reason: 'ECHECK' },
      });

      await expect(gateway.refund(refundRequest)).resolves.toEqual({
        kind: 'succeeded',
        refundTransactionId: 'REFUND-1',
        refundedAt: new Date('2026-11-25T10:00:00Z'),
      });
      await expect(gateway.refund(refundRequest)).resolves.toEqual({
        kind: 'pending',
        refundTransactionId: 'REFUND-2',
      });
      await expect(gateway.refund(refundRequest)).resolves.toEqual({
        kind: 'failed',
        refundTransactionId: 'REFUND-3',
        reason: 'ECHECK',
      });
    });

    it('refund returns failed on a 422', async () => {
      answer(422, {
        name: 'UNPROCESSABLE_ENTITY',
        details: [
          {
            issue: 'CAPTURE_FULLY_REFUNDED',
            description: 'The capture has already been fully refunded',
          },
        ],
      });

      await expect(gateway.refund(refundRequest)).resolves.toEqual({
        kind: 'failed',
        refundTransactionId: null,
        reason: 'The capture has already been fully refunded',
      });
    });

    it('refund rejects on a 503', async () => {
      http.request.mockRejectedValueOnce(new PayPalUnavailableError('down'));

      await expect(gateway.refund(refundRequest)).rejects.toBeInstanceOf(
        DependencyUnavailableException,
      );
    });

    it('parseWebhook maps PAYMENT.CAPTURE.REFUNDED to a refund event', async () => {
      await expect(
        verified({
          id: 'WH-R1',
          event_type: 'PAYMENT.CAPTURE.REFUNDED',
          resource: {
            id: 'REFUND-1',
            status: 'COMPLETED',
            amount: { value: '5.00', currency_code: 'USD' },
            create_time: '2026-11-25T10:00:00Z',
            links: [
              {
                rel: 'up',
                href: 'https://api.sandbox.paypal.com/v2/payments/captures/CAPTURE-1',
              },
            ],
          },
        }),
      ).resolves.toEqual({
        id: 'WH-R1',
        type: 'PAYMENT.CAPTURE.REFUNDED',
        event: {
          kind: 'refund',
          refundTransactionId: 'REFUND-1',
          chargeTransactionId: 'CAPTURE-1',
          refundId: null,
          amountCents: 500,
          currency: 'usd',
          status: 'succeeded',
          reason: null,
          at: new Date('2026-11-25T10:00:00Z'),
        },
      });
    });

    it('parseWebhook maps PAYMENT.REFUND.FAILED with its reason', async () => {
      const { event } = await verified({
        id: 'WH-R2',
        event_type: 'PAYMENT.REFUND.FAILED',
        resource: {
          id: 'REFUND-3',
          status: 'FAILED',
          status_details: { reason: 'ECHECK' },
          custom_id: REFUND_ID,
          amount: { value: '12.50', currency_code: 'USD' },
          links: [
            {
              rel: 'up',
              href: 'https://api.sandbox.paypal.com/v2/payments/captures/CAPTURE-1',
            },
          ],
        },
      });

      expect(event).toMatchObject({
        kind: 'refund',
        refundId: REFUND_ID,
        status: 'failed',
        reason: 'ECHECK',
      });
    });
  });

  describe('capture', () => {
    it('capture maps COMPLETED to succeeded and sends no fixed PayPal-Request-Id', async () => {
      answer(201, capturedOrder('COMPLETED'));

      await expect(gateway.capture(PAYPAL_ORDER_ID)).resolves.toEqual({
        kind: 'succeeded',
        transactionId: 'CAPTURE-1',
        paidAt: new Date('2026-11-24T10:05:00Z'),
      });
      expect(http.request).toHaveBeenCalledWith(
        'POST',
        `/v2/checkout/orders/${PAYPAL_ORDER_ID}/capture`,
        { headers: { Prefer: 'return=representation' } },
      );
    });

    it('capture maps INSTRUMENT_DECLINED to a retryable failure', async () => {
      answer(422, {
        name: 'UNPROCESSABLE_ENTITY',
        details: [
          {
            issue: 'INSTRUMENT_DECLINED',
            description: 'The instrument presented was declined.',
          },
        ],
      });

      await expect(gateway.capture(PAYPAL_ORDER_ID)).resolves.toEqual({
        kind: 'failed',
        retryable: true,
        reason: 'The instrument presented was declined.',
      });
    });

    it('capture maps a DECLINED capture to a final failure', async () => {
      answer(
        201,
        capturedOrder('DECLINED', { status_details: { reason: 'RISK' } }),
      );
      await expect(gateway.capture(PAYPAL_ORDER_ID)).resolves.toEqual({
        kind: 'failed',
        retryable: false,
        reason: 'RISK',
      });

      answer(201, capturedOrder('DECLINED'));
      await expect(gateway.capture(PAYPAL_ORDER_ID)).resolves.toEqual({
        kind: 'failed',
        retryable: false,
        reason: 'PayPal denied the payment',
      });
    });

    it('capture maps a PENDING capture to pending', async () => {
      answer(201, capturedOrder('PENDING'));

      await expect(gateway.capture(PAYPAL_ORDER_ID)).resolves.toEqual({
        kind: 'pending',
        transactionId: 'CAPTURE-1',
      });
    });

    it('capture maps ORDER_NOT_APPROVED to not_approved', async () => {
      answer(422, { details: [{ issue: 'ORDER_NOT_APPROVED' }] });

      await expect(gateway.capture(PAYPAL_ORDER_ID)).resolves.toEqual({
        kind: 'not_approved',
      });
    });

    it('capture reads back ORDER_ALREADY_CAPTURED as the existing capture', async () => {
      answer(422, { details: [{ issue: 'ORDER_ALREADY_CAPTURED' }] });
      answer(200, capturedOrder('COMPLETED'));

      await expect(gateway.capture(PAYPAL_ORDER_ID)).resolves.toEqual({
        kind: 'succeeded',
        transactionId: 'CAPTURE-1',
        paidAt: new Date('2026-11-24T10:05:00Z'),
      });
      expect(http.request).toHaveBeenLastCalledWith(
        'GET',
        `/v2/checkout/orders/${PAYPAL_ORDER_ID}`,
      );
    });

    it('capture reads back the order on an unmapped 4xx (a concurrent capture)', async () => {
      answer(422, { details: [{ issue: 'ORDER_COMPLETION_IN_PROGRESS' }] });
      answer(200, capturedOrder('COMPLETED'));

      await expect(gateway.capture(PAYPAL_ORDER_ID)).resolves.toMatchObject({
        kind: 'succeeded',
        transactionId: 'CAPTURE-1',
      });
    });

    it('capture reads a refusal on an order still open, with no capture, as a retryable failure', async () => {
      answer(422, {
        details: [
          {
            issue: 'TRANSACTION_REFUSED',
            description: 'The request was refused.',
          },
        ],
      });
      answer(200, order('APPROVED'));

      await expect(gateway.capture(PAYPAL_ORDER_ID)).resolves.toEqual({
        kind: 'failed',
        retryable: true,
        reason: 'The request was refused.',
      });
    });

    it.each(['CREATED', 'PAYER_ACTION_REQUIRED', 'APPROVED'])(
      'capture reads a refused %s order with no capture as a retryable failure',
      async (status) => {
        answer(422, {
          details: [
            {
              issue: 'TRANSACTION_REFUSED',
              description: 'The request was refused.',
            },
          ],
        });
        answer(200, order(status));

        await expect(gateway.capture(PAYPAL_ORDER_ID)).resolves.toEqual({
          kind: 'failed',
          retryable: true,
          reason: 'The request was refused.',
        });
      },
    );

    it('capture treats an open order holding a stale DECLINED capture as retryable', async () => {
      answer(422, {
        details: [
          {
            issue: 'TRANSACTION_REFUSED',
            description: 'The request was refused.',
          },
        ],
      });
      answer(
        200,
        order('APPROVED', {
          purchase_units: [
            { payments: { captures: [{ id: 'C-0', status: 'DECLINED' }] } },
          ],
        }),
      );

      await expect(gateway.capture(PAYPAL_ORDER_ID)).resolves.toEqual({
        kind: 'failed',
        retryable: true,
        reason: 'The request was refused.',
      });
    });

    it('a 2xx whose only capture is DECLINED while the order stays open is retryable', async () => {
      answer(
        201,
        order('APPROVED', {
          purchase_units: [
            {
              payments: {
                captures: [
                  {
                    id: 'C-0',
                    status: 'DECLINED',
                    status_details: { reason: 'RISK' },
                  },
                ],
              },
            },
          ],
        }),
      );

      await expect(gateway.capture(PAYPAL_ORDER_ID)).resolves.toEqual({
        kind: 'failed',
        retryable: true,
        reason: 'RISK',
      });
    });

    it("the retryable reason is PayPal's refusal, not a notice before it", async () => {
      answer(422, {
        details: [
          { issue: 'PAYEE_NOTICE', description: 'Unrelated notice.' },
          {
            issue: 'TRANSACTION_REFUSED',
            description: 'The request was refused.',
          },
        ],
      });
      answer(200, order('APPROVED'));

      await expect(gateway.capture(PAYPAL_ORDER_ID)).resolves.toMatchObject({
        reason: 'The request was refused.',
      });
    });

    it('a 2xx without a capture on an open order fails retryably without claiming a denial', async () => {
      answer(201, order('APPROVED'));
      answer(200, order('APPROVED'));

      await expect(gateway.capture(PAYPAL_ORDER_ID)).resolves.toEqual({
        kind: 'failed',
        retryable: true,
        reason: 'PayPal did not complete the payment',
      });
    });

    it('a 2xx null body or a refusal with non-array details still reads the order back', async () => {
      answer(201, null);
      answer(200, capturedOrder('COMPLETED'));
      await expect(gateway.capture(PAYPAL_ORDER_ID)).resolves.toMatchObject({
        kind: 'succeeded',
      });

      answer(422, { details: { issue: 'X' } });
      answer(200, capturedOrder('COMPLETED'));
      await expect(gateway.capture(PAYPAL_ORDER_ID)).resolves.toMatchObject({
        kind: 'succeeded',
      });
    });

    it('capture reads a closed order whose latest capture FAILED as a final failure', async () => {
      answer(201, capturedOrder('FAILED'));

      await expect(gateway.capture(PAYPAL_ORDER_ID)).resolves.toEqual({
        kind: 'failed',
        retryable: false,
        reason: 'PayPal denied the payment',
      });
    });

    it('capture reads back a closed order with a DECLINED capture as a final failure', async () => {
      answer(422, { details: [{ issue: 'ORDER_ALREADY_CAPTURED' }] });
      answer(
        200,
        capturedOrder('DECLINED', { status_details: { reason: 'RISK' } }),
      );

      await expect(gateway.capture(PAYPAL_ORDER_ID)).resolves.toEqual({
        kind: 'failed',
        retryable: false,
        reason: 'RISK',
      });
    });

    it('capture refuses for good when a closed order has no capture', async () => {
      answer(422, { details: [{ issue: 'SOMETHING_ELSE' }] });
      answer(200, order('COMPLETED'));

      await expect(gateway.capture(PAYPAL_ORDER_ID)).rejects.toBeInstanceOf(
        InvalidRequestException,
      );
    });

    it('capture refuses for good when PayPal voided the order', async () => {
      answer(422, { details: [{ issue: 'SOMETHING_ELSE' }] });
      answer(200, order('VOIDED'));

      await expect(gateway.capture(PAYPAL_ORDER_ID)).rejects.toBeInstanceOf(
        InvalidRequestException,
      );
    });

    it('capture answers 503 when the read-back is refused (credentials)', async () => {
      answer(403, { name: 'NOT_AUTHORIZED' });
      answer(403, { name: 'NOT_AUTHORIZED' });

      await expect(gateway.capture(PAYPAL_ORDER_ID)).rejects.toBeInstanceOf(
        DependencyUnavailableException,
      );
    });

    it('a 2xx capture without captures reads the order back', async () => {
      answer(201, order('COMPLETED'));
      answer(200, capturedOrder('COMPLETED'));

      await expect(gateway.capture(PAYPAL_ORDER_ID)).resolves.toMatchObject({
        kind: 'succeeded',
        transactionId: 'CAPTURE-1',
      });
    });

    it('capture takes the reason from the INSTRUMENT_DECLINED detail', async () => {
      answer(422, {
        details: [
          { issue: 'PAYEE_NOTICE', description: 'Unrelated notice.' },
          {
            issue: 'INSTRUMENT_DECLINED',
            description: 'The instrument presented was declined.',
          },
        ],
      });

      await expect(gateway.capture(PAYPAL_ORDER_ID)).resolves.toMatchObject({
        reason: 'The instrument presented was declined.',
      });
    });

    it('capture maps a 429, or a failed read-back, to 503', async () => {
      answer(429, { name: 'RATE_LIMIT_REACHED' });
      await expect(gateway.capture(PAYPAL_ORDER_ID)).rejects.toBeInstanceOf(
        DependencyUnavailableException,
      );

      answer(422, { details: [{ issue: 'SOMETHING_ELSE' }] });
      answer(429, { name: 'RATE_LIMIT_REACHED' });
      await expect(gateway.capture(PAYPAL_ORDER_ID)).rejects.toBeInstanceOf(
        DependencyUnavailableException,
      );
    });

    it('capture refuses for good when the read-back is a 404', async () => {
      answer(404, { details: [{ issue: 'RESOURCE_NOT_FOUND' }] });
      answer(404, { name: 'RESOURCE_NOT_FOUND' });

      await expect(gateway.capture(PAYPAL_ORDER_ID)).rejects.toBeInstanceOf(
        InvalidRequestException,
      );
    });

    it('capture prefers the COMPLETED capture over an earlier declined one', async () => {
      answer(422, { details: [{ issue: 'ORDER_ALREADY_CAPTURED' }] });
      answer(
        200,
        order('COMPLETED', {
          purchase_units: [
            {
              payments: {
                captures: [
                  { id: 'CAPTURE-0', status: 'DECLINED' },
                  {
                    id: 'CAPTURE-2',
                    status: 'COMPLETED',
                    create_time: '2026-11-24T10:06:00Z',
                  },
                ],
              },
            },
          ],
        }),
      );

      await expect(gateway.capture(PAYPAL_ORDER_ID)).resolves.toEqual({
        kind: 'succeeded',
        transactionId: 'CAPTURE-2',
        paidAt: new Date('2026-11-24T10:06:00Z'),
      });
    });

    it('capture turns an outage into 503', async () => {
      http.request.mockRejectedValueOnce(new PayPalUnavailableError('down'));

      await expect(gateway.capture(PAYPAL_ORDER_ID)).rejects.toBeInstanceOf(
        DependencyUnavailableException,
      );
    });
  });

  describe('parseWebhook', () => {
    it.each(Object.keys(HEADERS))(
      'parseWebhook rejects a request without %s with 401',
      async (missing) => {
        const headers: Record<string, string> = { ...HEADERS };
        delete headers[missing];

        await expect(
          gateway.parseWebhook(Buffer.from('{}'), headers),
        ).rejects.toBeInstanceOf(UnauthenticatedException);
        expect(http.request).not.toHaveBeenCalled();
      },
    );

    it('parseWebhook rejects a missing body or a non-SUCCESS verification with 401', async () => {
      await expect(
        gateway.parseWebhook(undefined, HEADERS),
      ).rejects.toBeInstanceOf(UnauthenticatedException);

      const error = await failureOf(verified({ id: 'WH-1' }, 'FAILURE'));
      expect(error).toBeInstanceOf(UnauthenticatedException);
      expect(error.getErrors()[0].errCode).toBe(
        ERROR_CODES.PAYMENT.INVALID_SIGNATURE,
      );
    });

    it('parseWebhook sends the five headers, PAYPAL_WEBHOOK_ID and the raw event to verify-webhook-signature', async () => {
      const raw = '{"id":"WH-1","event_type":"X","resource":{"amount":1.10}}';
      answer(200, { verification_status: 'SUCCESS' });

      await gateway.parseWebhook(Buffer.from(raw), HEADERS);

      expect(http.request).toHaveBeenCalledWith(
        'POST',
        '/v1/notifications/verify-webhook-signature',
        {
          rawBody:
            '{"auth_algo":"SHA256withRSA","cert_url":"https://api.sandbox.paypal.com/cert.pem",' +
            '"transmission_id":"tx-1","transmission_sig":"sig",' +
            '"transmission_time":"2026-11-24T10:00:00Z","webhook_id":"WH-CONFIGURED",' +
            `"webhook_event":${raw}}`,
        },
      );
    });

    it('parseWebhook translates PAYMENT.CAPTURE.COMPLETED to succeeded', async () => {
      await expect(
        verified({
          id: 'WH-1',
          event_type: 'PAYMENT.CAPTURE.COMPLETED',
          resource: {
            id: 'CAPTURE-1',
            status: 'COMPLETED',
            custom_id: PAYMENT_ID,
            create_time: '2026-11-24T10:05:00Z',
            supplementary_data: { related_ids: { order_id: PAYPAL_ORDER_ID } },
          },
        }),
      ).resolves.toEqual({
        id: 'WH-1',
        type: 'PAYMENT.CAPTURE.COMPLETED',
        event: {
          kind: 'succeeded',
          paymentId: PAYMENT_ID,
          checkoutSessionId: PAYPAL_ORDER_ID,
          transactionId: 'CAPTURE-1',
          paidAt: new Date('2026-11-24T10:05:00Z'),
        },
      });
    });

    it('parseWebhook translates PAYMENT.CAPTURE.DENIED to failed', async () => {
      const denied = (statusDetails?: unknown) =>
        verified({
          id: 'WH-2',
          event_type: 'PAYMENT.CAPTURE.DENIED',
          resource: {
            id: 'CAPTURE-1',
            custom_id: PAYMENT_ID,
            status_details: statusDetails,
            supplementary_data: { related_ids: { order_id: PAYPAL_ORDER_ID } },
          },
        });

      await expect(denied()).resolves.toMatchObject({
        event: {
          kind: 'failed',
          paymentId: PAYMENT_ID,
          checkoutSessionId: PAYPAL_ORDER_ID,
          reason: 'PayPal denied the payment',
        },
      });
      await expect(
        denied({ reason: 'BUYER_COMPLAINT' }),
      ).resolves.toMatchObject({ event: { reason: 'BUYER_COMPLAINT' } });
    });

    it('parseWebhook translates CHECKOUT.ORDER.APPROVED to an approved checkout', async () => {
      await expect(
        verified({
          id: 'WH-3',
          event_type: 'CHECKOUT.ORDER.APPROVED',
          resource: { id: PAYPAL_ORDER_ID, status: 'APPROVED' },
        }),
      ).resolves.toEqual({
        id: 'WH-3',
        type: 'CHECKOUT.ORDER.APPROVED',
        event: { kind: 'approved', checkoutSessionId: PAYPAL_ORDER_ID },
      });
    });

    it('parseWebhook ignores other event types and events without a payment', async () => {
      await expect(
        verified({
          id: 'WH-4',
          event_type: 'PAYMENT.CAPTURE.REFUNDED',
          resource: {},
        }),
      ).resolves.toEqual({
        id: 'WH-4',
        type: 'PAYMENT.CAPTURE.REFUNDED',
        event: null,
      });
      await expect(
        verified({
          id: 'WH-5',
          event_type: 'PAYMENT.CAPTURE.COMPLETED',
          resource: { id: 'CAPTURE-1' },
        }),
      ).resolves.toMatchObject({ event: null });
    });

    it('parseWebhook refuses an event without an id before calling PayPal', async () => {
      await expect(
        gateway.parseWebhook(
          Buffer.from('{"event_type":"PAYMENT.CAPTURE.COMPLETED"}'),
          HEADERS,
        ),
      ).rejects.toBeInstanceOf(UnauthenticatedException);
      expect(http.request).not.toHaveBeenCalled();
    });

    it('parseWebhook refuses a null body with 401', async () => {
      await expect(
        gateway.parseWebhook(Buffer.from('null'), HEADERS),
      ).rejects.toBeInstanceOf(UnauthenticatedException);
      expect(http.request).not.toHaveBeenCalled();
    });

    it('parseWebhook answers 503 when the verify call is throttled', async () => {
      answer(429, { name: 'RATE_LIMIT_REACHED' });

      await expect(
        gateway.parseWebhook(Buffer.from('{"id":"WH-1"}'), HEADERS),
      ).rejects.toBeInstanceOf(DependencyUnavailableException);
    });

    it('parseWebhook answers 503 when PayPal cannot verify', async () => {
      http.request.mockRejectedValueOnce(new PayPalUnavailableError('down'));

      await expect(
        gateway.parseWebhook(Buffer.from('{"id":"WH-1"}'), HEADERS),
      ).rejects.toBeInstanceOf(DependencyUnavailableException);
    });
  });
});
