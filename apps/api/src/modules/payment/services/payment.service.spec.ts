import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Mock } from 'vitest';
import {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  PaymentType,
} from '@repo/constants';
import { PaymentService } from './payment.service.js';
import type { PaymentRepository } from '../repositories/payment.repository.js';
import type { OrderRepository } from '../../order/repositories/order.repository.js';
import type { PaymentGateways } from '../gateways/payment-gateways.js';
import type {
  CheckoutSession,
  GatewayEvent,
} from '../gateways/payment-gateway.js';
import type { Payment } from '../../order/entities/payment.entity.js';
import type { Order } from '../../order/entities/order.entity.js';
import {
  DependencyUnavailableException,
  InvalidStateException,
  ItemNotFoundException,
  ValidationException,
} from '../../../common/exceptions/base.exception.js';
import { ERROR_CODES } from '../../../common/constants/error-code.constant.js';

const USER_ID = 'user-1';
const ORDER_ID = '22222222-2222-4222-8222-222222222222';
const PAYMENT_ID = '11111111-1111-4111-8111-111111111111';
const NOW = new Date('2026-11-24T10:00:00Z');
const WEB_APP_URL = 'http://localhost:3101';

describe('PaymentService', () => {
  let service: PaymentService;
  let paymentRepository: Record<
    'findNewestChargeOf' | 'lockById' | 'save' | 'transactional',
    Mock
  >;
  let orderRepository: Record<'reload' | 'findById', Mock>;
  let gateways: Record<'for', Mock>;
  let gateway: Record<'createCheckout' | 'findCheckout' | 'parseWebhook', Mock>;
  let order: Order;
  let payment: Payment;

  const buildOrder = (overrides: Partial<Order> = {}): Order =>
    ({
      id: ORDER_ID,
      orderNumber: 'ORD-1',
      status: OrderStatus.PENDING,
      totalAmount: '23.50',
      createdAt: new Date('2026-11-24T09:30:00Z'),
      expiresAt: new Date('2026-11-25T09:00:00Z'),
      user: { id: USER_ID, email: 'lan@example.com' },
      ...overrides,
    }) as Order;

  const buildPayment = (overrides: Partial<Payment> = {}): Payment =>
    ({
      id: PAYMENT_ID,
      type: PaymentType.CHARGE,
      method: PaymentMethod.CARD,
      status: PaymentStatus.PENDING,
      amount: '23.50',
      checkoutSessionId: null,
      transactionId: null,
      completedAt: null,
      failureReason: null,
      order,
      ...overrides,
    }) as Payment;

  const session = (overrides: Partial<CheckoutSession> = {}) => ({
    id: 'cs_test_1',
    url: 'https://checkout.stripe.com/c/pay/cs_test_1',
    open: true,
    expiresAt: new Date('2026-11-25T09:00:00Z'),
    ...overrides,
  });

  const withCharge = (charge: Payment): void => {
    paymentRepository.findNewestChargeOf.mockResolvedValue(charge);
    paymentRepository.lockById.mockResolvedValue(charge);
    orderRepository.reload.mockResolvedValue(charge.order);
  };

  const errCodeOf = async (promise: Promise<unknown>): Promise<string> => {
    const error = (await promise.catch((e: unknown) => e)) as {
      getErrors(): { errCode: string }[];
    };
    return error.getErrors()[0].errCode;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    order = buildOrder();
    payment = buildPayment();
    paymentRepository = {
      findNewestChargeOf: vi.fn(),
      lockById: vi.fn(),
      save: vi.fn().mockResolvedValue(undefined),
      transactional: vi.fn((work: () => Promise<unknown>) => work()),
    };
    orderRepository = { reload: vi.fn(), findById: vi.fn() };
    gateway = {
      createCheckout: vi.fn().mockResolvedValue(session()),
      findCheckout: vi.fn(),
      parseWebhook: vi.fn(),
    };
    gateways = { for: vi.fn().mockReturnValue(gateway) };
    const config = {
      getOrThrow: vi.fn().mockReturnValue(WEB_APP_URL),
    } as unknown as ConfigService;
    service = new PaymentService(
      paymentRepository as unknown as PaymentRepository,
      orderRepository as unknown as OrderRepository,
      gateways as unknown as PaymentGateways,
      config,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('start', () => {
    it("start throws ItemNotFoundException for another user's order", async () => {
      paymentRepository.findNewestChargeOf.mockResolvedValue(null);

      await expect(service.start('user-2', ORDER_ID)).rejects.toBeInstanceOf(
        ItemNotFoundException,
      );
      expect(paymentRepository.findNewestChargeOf).toHaveBeenCalledWith(
        ORDER_ID,
        'user-2',
      );
      expect(gateway.createCheckout).not.toHaveBeenCalled();
    });

    it('start rejects a COD payment with METHOD_NOT_ONLINE and changes nothing', async () => {
      withCharge(buildPayment({ method: PaymentMethod.COD }));

      const result = service.start(USER_ID, ORDER_ID);

      await expect(result).rejects.toBeInstanceOf(ValidationException);
      expect(await errCodeOf(service.start(USER_ID, ORDER_ID))).toBe(
        ERROR_CODES.PAYMENT.METHOD_NOT_ONLINE,
      );
      expect(paymentRepository.save).not.toHaveBeenCalled();
      expect(gateway.createCheckout).not.toHaveBeenCalled();
    });

    it('start rejects a PAYPAL payment with METHOD_UNAVAILABLE', async () => {
      withCharge(buildPayment({ method: PaymentMethod.PAYPAL }));
      gateways.for.mockReturnValue(null);

      expect(await errCodeOf(service.start(USER_ID, ORDER_ID))).toBe(
        ERROR_CODES.PAYMENT.METHOD_UNAVAILABLE,
      );
      expect(gateways.for).toHaveBeenCalledWith(PaymentMethod.PAYPAL);
    });

    it('start rejects a paid payment or a non-pending order with NOT_PAYABLE', async () => {
      withCharge(buildPayment({ status: PaymentStatus.PAID }));
      await expect(service.start(USER_ID, ORDER_ID)).rejects.toBeInstanceOf(
        InvalidStateException,
      );

      order = buildOrder({ status: OrderStatus.CANCELLED });
      withCharge(buildPayment({ order }));
      expect(await errCodeOf(service.start(USER_ID, ORDER_ID))).toBe(
        ERROR_CODES.PAYMENT.NOT_PAYABLE,
      );
      expect(paymentRepository.save).not.toHaveBeenCalled();
    });

    it('start rejects an expired order with ORDER_EXPIRED', async () => {
      order = buildOrder({ expiresAt: new Date('2026-11-24T09:59:00Z') });
      withCharge(buildPayment({ order }));

      expect(await errCodeOf(service.start(USER_ID, ORDER_ID))).toBe(
        ERROR_CODES.PAYMENT.ORDER_EXPIRED,
      );
      expect(gateway.createCheckout).not.toHaveBeenCalled();
    });

    it('start returns the open session again without creating one', async () => {
      withCharge(buildPayment({ checkoutSessionId: 'cs_test_1' }));
      gateway.findCheckout.mockResolvedValue(session());

      await expect(service.start(USER_ID, ORDER_ID)).resolves.toEqual({
        paymentId: PAYMENT_ID,
        checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_test_1',
        expiresAt: new Date('2026-11-25T09:00:00Z'),
      });
      expect(gateway.findCheckout).toHaveBeenCalledWith('cs_test_1');
      expect(gateway.createCheckout).not.toHaveBeenCalled();
      expect(paymentRepository.save).not.toHaveBeenCalled();
    });

    it('start rejects a closed session with NOT_PAYABLE', async () => {
      withCharge(buildPayment({ checkoutSessionId: 'cs_test_1' }));
      gateway.findCheckout.mockResolvedValue(session({ open: false }));

      expect(await errCodeOf(service.start(USER_ID, ORDER_ID))).toBe(
        ERROR_CODES.PAYMENT.NOT_PAYABLE,
      );
      expect(gateway.createCheckout).not.toHaveBeenCalled();
    });

    it('start creates a session, saves its id and moves expires_at', async () => {
      withCharge(payment);
      gateway.createCheckout.mockResolvedValue(
        session({ expiresAt: new Date('2026-11-25T08:59:59Z') }),
      );

      const result = await service.start(USER_ID, ORDER_ID);

      expect(gateway.createCheckout).toHaveBeenCalledWith({
        paymentId: PAYMENT_ID,
        orderId: ORDER_ID,
        orderNumber: 'ORD-1',
        amountCents: 2350,
        currency: 'usd',
        customerEmail: 'lan@example.com',
        expiresAt: new Date('2026-11-25T09:00:00Z'),
        successUrl: `${WEB_APP_URL}/order-success?orderId=${ORDER_ID}&session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${WEB_APP_URL}/order-success?orderId=${ORDER_ID}`,
      });
      expect(payment.checkoutSessionId).toBe('cs_test_1');
      expect(order.expiresAt).toEqual(new Date('2026-11-25T08:59:59Z'));
      expect(paymentRepository.lockById).toHaveBeenCalledWith(PAYMENT_ID);
      expect(paymentRepository.save).toHaveBeenCalledTimes(1);
      expect(paymentRepository.save).toHaveBeenCalledWith(payment, USER_ID);
      expect(paymentRepository.transactional).toHaveBeenCalledTimes(1);
      expect(result).toEqual({
        paymentId: PAYMENT_ID,
        checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_test_1',
        expiresAt: new Date('2026-11-25T08:59:59Z'),
      });
    });

    it("start clamps the session expiry to Stripe's limits", async () => {
      order = buildOrder({ expiresAt: new Date('2026-11-24T10:10:00Z') });
      withCharge(buildPayment({ order }));
      await service.start(USER_ID, ORDER_ID);
      expect(gateway.createCheckout).toHaveBeenLastCalledWith(
        expect.objectContaining({
          expiresAt: new Date('2026-11-24T10:31:00Z'),
        }),
      );

      order = buildOrder({ expiresAt: new Date('2026-11-26T10:00:00Z') });
      withCharge(buildPayment({ order }));
      await service.start(USER_ID, ORDER_ID);
      expect(gateway.createCheckout).toHaveBeenLastCalledWith(
        expect.objectContaining({
          expiresAt: new Date('2026-11-25T09:29:00Z'),
        }),
      );
    });

    it('start sends the same expiry when the shopper retries seconds later', async () => {
      const placedAt = new Date(NOW.getTime() - 10_000);
      order = buildOrder({
        createdAt: placedAt,
        expiresAt: new Date(placedAt.getTime() + 24 * 60 * 60 * 1000),
      });
      withCharge(buildPayment({ order }));
      gateway.createCheckout.mockRejectedValueOnce(new Error('timeout'));
      await expect(service.start(USER_ID, ORDER_ID)).rejects.toThrow('timeout');

      vi.setSystemTime(new Date(NOW.getTime() + 20_000));
      await service.start(USER_ID, ORDER_ID);

      const [first, second] = gateway.createCheckout.mock.calls.map(
        ([request]) => (request as { expiresAt: Date }).expiresAt,
      );
      expect(second).toEqual(first);
    });

    it('start leaves the payment unchanged when the gateway fails', async () => {
      withCharge(payment);
      const failure = new DependencyUnavailableException({
        errCode: ERROR_CODES.PAYMENT.GATEWAY_UNAVAILABLE,
        field: '',
        message: 'down',
        description: 'down',
      });
      gateway.createCheckout.mockRejectedValue(failure);

      await expect(service.start(USER_ID, ORDER_ID)).rejects.toBe(failure);
      expect(payment.checkoutSessionId).toBeNull();
      expect(paymentRepository.save).not.toHaveBeenCalled();
    });

    it('start uses the gateway registered for the method', async () => {
      withCharge(payment);

      await service.start(USER_ID, ORDER_ID);

      expect(gateways.for).toHaveBeenCalledWith(PaymentMethod.CARD);
      expect(gateway.createCheckout).toHaveBeenCalledTimes(1);
    });
  });
  describe('apply', () => {
    const PAID_AT = new Date('2026-11-24T10:05:00Z');
    const succeeded: GatewayEvent = {
      kind: 'succeeded',
      paymentId: PAYMENT_ID,
      transactionId: 'pi_1',
      paidAt: PAID_AT,
    };
    const failed: GatewayEvent = {
      kind: 'failed',
      paymentId: PAYMENT_ID,
      reason: 'Your card was declined.',
    };

    const lockReturns = (locked: Payment | null): void => {
      paymentRepository.lockById.mockResolvedValue(locked);
      orderRepository.findById.mockResolvedValue(locked?.order ?? null);
    };

    it('apply succeeded marks a PENDING payment PAID and confirms the order', async () => {
      lockReturns(payment);

      await expect(service.apply(succeeded)).resolves.toBe(true);

      expect(paymentRepository.lockById).toHaveBeenCalledWith(PAYMENT_ID);
      expect(payment).toMatchObject({
        status: PaymentStatus.PAID,
        transactionId: 'pi_1',
        completedAt: PAID_AT,
        failureReason: null,
      });
      expect(order.status).toBe(OrderStatus.CONFIRMED);
      expect(order.expiresAt).toBeNull();
      expect(paymentRepository.save).toHaveBeenCalledWith(payment, null);
      expect(paymentRepository.transactional).toHaveBeenCalledTimes(1);
    });

    it('apply succeeded marks a FAILED payment PAID and clears the reason', async () => {
      payment = buildPayment({
        status: PaymentStatus.FAILED,
        failureReason: 'Your card was declined.',
      });
      lockReturns(payment);

      await service.apply(succeeded);

      expect(payment.status).toBe(PaymentStatus.PAID);
      expect(payment.failureReason).toBeNull();
      expect(order.status).toBe(OrderStatus.CONFIRMED);
    });

    it('apply succeeded on a PAID payment changes nothing', async () => {
      payment = buildPayment({
        status: PaymentStatus.PAID,
        transactionId: 'pi_0',
      });
      order = buildOrder({ status: OrderStatus.CONFIRMED });
      payment.order = order;
      lockReturns(payment);

      await expect(service.apply(succeeded)).resolves.toBe(false);

      expect(payment.transactionId).toBe('pi_0');
      expect(paymentRepository.save).not.toHaveBeenCalled();
    });

    it('apply succeeded on a non-pending order records PAID and keeps the order status', async () => {
      const warn = vi
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);
      order = buildOrder({ status: OrderStatus.CANCELLED });
      payment = buildPayment({ order });
      lockReturns(payment);

      await service.apply(succeeded);

      expect(payment.status).toBe(PaymentStatus.PAID);
      expect(order.status).toBe(OrderStatus.CANCELLED);
      expect(warn).toHaveBeenCalled();
      expect(paymentRepository.save).toHaveBeenCalledWith(payment, null);
      warn.mockRestore();
    });

    it('apply failed marks the payment FAILED with the reason and leaves the order', async () => {
      lockReturns(payment);
      await expect(service.apply(failed)).resolves.toBe(true);
      expect(payment.status).toBe(PaymentStatus.FAILED);
      expect(payment.failureReason).toBe('Your card was declined.');
      expect(order.status).toBe(OrderStatus.PENDING);
      expect(order.expiresAt).toEqual(new Date('2026-11-25T09:00:00Z'));
      expect(paymentRepository.save).toHaveBeenCalledWith(payment, null);

      await service.apply({ ...failed, reason: 'Checkout session expired' });
      expect(payment.status).toBe(PaymentStatus.FAILED);
      expect(payment.failureReason).toBe('Checkout session expired');
    });

    it('apply failed on a payment already FAILED with the same reason changes nothing', async () => {
      payment = buildPayment({
        status: PaymentStatus.FAILED,
        failureReason: failed.reason,
      });
      lockReturns(payment);

      await expect(service.apply(failed)).resolves.toBe(false);
      expect(paymentRepository.save).not.toHaveBeenCalled();
    });

    it('apply failed on a PAID payment changes nothing', async () => {
      payment = buildPayment({ status: PaymentStatus.PAID });
      lockReturns(payment);

      await expect(service.apply(failed)).resolves.toBe(false);

      expect(payment.status).toBe(PaymentStatus.PAID);
      expect(payment.failureReason).toBeNull();
      expect(paymentRepository.save).not.toHaveBeenCalled();
    });

    it('apply ignores an event from another checkout session', async () => {
      payment = buildPayment({ checkoutSessionId: 'cs_live' });
      lockReturns(payment);

      await expect(
        service.apply({ ...failed, checkoutSessionId: 'cs_stray' }),
      ).resolves.toBe(false);
      await expect(
        service.apply({ ...succeeded, checkoutSessionId: 'cs_stray' }),
      ).resolves.toBe(false);

      expect(payment.status).toBe(PaymentStatus.PENDING);
      expect(paymentRepository.save).not.toHaveBeenCalled();
    });

    it('apply ignores an unknown payment', async () => {
      const warn = vi
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);
      lockReturns(null);

      await expect(service.apply(succeeded)).resolves.toBe(false);
      await expect(
        service.apply({ ...failed, paymentId: 'not-a-uuid' }),
      ).resolves.toBe(false);
      await expect(service.apply(null)).resolves.toBe(false);

      expect(paymentRepository.lockById).toHaveBeenCalledTimes(1);
      expect(paymentRepository.save).not.toHaveBeenCalled();
      warn.mockRestore();
    });
  });

  describe('verify', () => {
    it('verify uses the gateway registered for the method', () => {
      const rawBody = Buffer.from('{}');
      const headers = { 'stripe-signature': 't=1,v1=abc' };
      const verified = { id: 'evt_1', type: 'customer.created', event: null };
      gateway.parseWebhook.mockReturnValue(verified);

      expect(service.verify(PaymentMethod.CARD, rawBody, headers)).toBe(
        verified,
      );
      expect(gateways.for).toHaveBeenCalledWith(PaymentMethod.CARD);
      expect(gateway.parseWebhook).toHaveBeenCalledWith(rawBody, headers);
    });
  });
});
