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
  InvalidRequestException,
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
    | 'findNewestChargeOf'
    | 'findByCheckoutSessionId'
    | 'lockById'
    | 'save'
    | 'transactional',
    Mock
  >;
  let orderRepository: Record<'reload' | 'findById', Mock>;
  let gateways: Record<'for', Mock>;
  let gateway: Record<
    | 'createCheckout'
    | 'findCheckout'
    | 'expireCheckout'
    | 'parseWebhook'
    | 'capture',
    Mock
  >;
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
    endedUnpaid: false,
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
      findByCheckoutSessionId: vi.fn(),
      lockById: vi.fn(),
      save: vi.fn().mockResolvedValue(undefined),
      transactional: vi.fn((work: () => Promise<unknown>) => work()),
    };
    orderRepository = { reload: vi.fn(), findById: vi.fn() };
    gateway = {
      createCheckout: vi.fn().mockResolvedValue(session()),
      findCheckout: vi.fn(),
      expireCheckout: vi.fn().mockResolvedValue(undefined),
      parseWebhook: vi.fn(),
      capture: vi.fn(),
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

    it('start rejects a method with no registered gateway with METHOD_UNAVAILABLE', async () => {
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
        checkoutId: 'cs_test_1',
        checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_test_1',
        expiresAt: new Date('2026-11-25T09:00:00Z'),
      });
      expect(gateway.findCheckout).toHaveBeenCalledWith('cs_test_1');
      expect(gateway.createCheckout).not.toHaveBeenCalled();
      expect(paymentRepository.save).not.toHaveBeenCalled();
    });

    it('start rejects a closed session with NOT_PAYABLE', async () => {
      withCharge(buildPayment({ checkoutSessionId: 'cs_test_1' }));
      gateway.findCheckout.mockResolvedValue(
        session({ open: false, endedUnpaid: true }),
      );

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
        replacesCheckoutId: null,
      });
      expect(payment.checkoutSessionId).toBe('cs_test_1');
      expect(order.expiresAt).toEqual(new Date('2026-11-25T08:59:59Z'));
      expect(paymentRepository.lockById).toHaveBeenCalledWith(PAYMENT_ID);
      expect(paymentRepository.save).toHaveBeenCalledTimes(1);
      expect(paymentRepository.save).toHaveBeenCalledWith(payment, USER_ID);
      expect(paymentRepository.transactional).toHaveBeenCalledTimes(1);
      expect(result).toEqual({
        paymentId: PAYMENT_ID,
        checkoutId: 'cs_test_1',
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
  describe('start (retry)', () => {
    const failedCharge = (overrides: Partial<Payment> = {}): Payment =>
      buildPayment({
        status: PaymentStatus.FAILED,
        failureReason: 'Card declined',
        checkoutSessionId: 'cs_old',
        ...overrides,
      });

    it('start opens a new checkout on the same FAILED payment when its checkout ended unpaid', async () => {
      payment = failedCharge();
      withCharge(payment);
      gateway.findCheckout.mockResolvedValue(
        session({ id: 'cs_old', open: false, endedUnpaid: true }),
      );
      gateway.createCheckout.mockResolvedValue(
        session({
          id: 'cs_new',
          url: 'https://checkout.stripe.com/c/pay/cs_new',
        }),
      );

      const result = await service.start(USER_ID, ORDER_ID);

      expect(gateway.createCheckout).toHaveBeenCalledWith(
        expect.objectContaining({
          paymentId: PAYMENT_ID,
          replacesCheckoutId: 'cs_old',
          expiresAt: new Date('2026-11-25T09:00:00Z'),
        }),
      );
      expect(payment.checkoutSessionId).toBe('cs_new');
      expect(payment.status).toBe(PaymentStatus.FAILED);
      expect(payment.failureReason).toBe('Card declined');
      expect(order.expiresAt).toEqual(new Date('2026-11-25T09:00:00Z'));
      expect(paymentRepository.save).toHaveBeenCalledTimes(1);
      expect(paymentRepository.save).toHaveBeenCalledWith(payment, USER_ID);
      expect(result).toEqual({
        paymentId: PAYMENT_ID,
        checkoutId: 'cs_new',
        checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_new',
        expiresAt: new Date('2026-11-25T09:00:00Z'),
      });
    });

    it('start retries when the gateway no longer knows the checkout', async () => {
      withCharge(failedCharge());
      gateway.findCheckout.mockResolvedValue(null);

      await service.start(USER_ID, ORDER_ID);

      expect(gateway.createCheckout).toHaveBeenCalledTimes(1);
      expect(gateway.createCheckout).toHaveBeenCalledWith(
        expect.objectContaining({ replacesCheckoutId: 'cs_old' }),
      );
    });

    it('start rejects a FAILED payment whose closed checkout may hold money with NOT_PAYABLE', async () => {
      withCharge(failedCharge());
      gateway.findCheckout.mockResolvedValue(
        session({ id: 'cs_old', open: false, endedUnpaid: false }),
      );

      expect(await errCodeOf(service.start(USER_ID, ORDER_ID))).toBe(
        ERROR_CODES.PAYMENT.NOT_PAYABLE,
      );
      expect(gateway.createCheckout).not.toHaveBeenCalled();
      expect(paymentRepository.save).not.toHaveBeenCalled();
    });

    it('start returns the open retry checkout again', async () => {
      payment = failedCharge();
      withCharge(payment);
      gateway.findCheckout.mockResolvedValueOnce(
        session({ id: 'cs_old', open: false, endedUnpaid: true }),
      );
      gateway.createCheckout.mockResolvedValue(session({ id: 'cs_new' }));
      await service.start(USER_ID, ORDER_ID);

      gateway.findCheckout.mockResolvedValueOnce(session({ id: 'cs_new' }));
      const again = await service.start(USER_ID, ORDER_ID);

      expect(gateway.findCheckout).toHaveBeenLastCalledWith('cs_new');
      expect(again.checkoutId).toBe('cs_new');
      expect(gateway.createCheckout).toHaveBeenCalledTimes(1);
    });

    it("start keeps the order's deadline on a retry", async () => {
      order = buildOrder({ expiresAt: new Date('2026-11-24T12:00:00Z') });
      withCharge(failedCharge({ order }));
      gateway.findCheckout.mockResolvedValue(
        session({ id: 'cs_old', open: false, endedUnpaid: true }),
      );
      gateway.createCheckout.mockResolvedValue(
        session({ id: 'cs_new', expiresAt: new Date('2026-11-25T09:00:00Z') }),
      );

      const result = await service.start(USER_ID, ORDER_ID);

      expect(gateway.createCheckout).toHaveBeenCalledWith(
        expect.objectContaining({
          expiresAt: new Date('2026-11-24T12:00:00Z'),
        }),
      );
      expect(result.expiresAt).toEqual(new Date('2026-11-24T12:00:00Z'));
      expect(order.expiresAt).toEqual(new Date('2026-11-24T12:00:00Z'));
    });

    it('start sets a 24 h deadline on a retry of an order with none', async () => {
      order = buildOrder({ expiresAt: null });
      withCharge(failedCharge({ order, method: PaymentMethod.PAYPAL }));
      gateway.findCheckout.mockResolvedValue(
        session({ id: 'cs_old', open: false, endedUnpaid: true }),
      );

      await service.start(USER_ID, ORDER_ID);

      const deadline = new Date('2026-11-25T10:00:00Z');
      expect(order.expiresAt).toEqual(deadline);
      expect(gateway.createCheckout).toHaveBeenCalledWith(
        expect.objectContaining({ expiresAt: deadline }),
      );
    });

    it('start rejects a CARD retry with under 31 minutes left with NOT_PAYABLE', async () => {
      const soon = new Date(NOW.getTime() + 20 * 60_000);
      order = buildOrder({ expiresAt: soon });
      withCharge(failedCharge({ order }));
      gateway.findCheckout.mockResolvedValue(
        session({ id: 'cs_old', open: false, endedUnpaid: true }),
      );

      expect(await errCodeOf(service.start(USER_ID, ORDER_ID))).toBe(
        ERROR_CODES.PAYMENT.NOT_PAYABLE,
      );
      expect(gateway.createCheckout).not.toHaveBeenCalled();

      order = buildOrder({ expiresAt: soon });
      withCharge(failedCharge({ order, method: PaymentMethod.PAYPAL }));
      await service.start(USER_ID, ORDER_ID);
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

  describe('expireCheckout', () => {
    const payload = {
      paymentId: 'payment-1',
      method: PaymentMethod.CARD,
      checkoutSessionId: 'cs_test_1',
    };

    it("expireCheckout expires the session on the method's gateway", async () => {
      await expect(service.expireCheckout(payload)).resolves.toBeUndefined();

      expect(gateways.for).toHaveBeenCalledWith(PaymentMethod.CARD);
      expect(gateway.expireCheckout).toHaveBeenCalledWith('cs_test_1');
    });

    it('expireCheckout logs and finishes for a method with no gateway', async () => {
      gateways.for.mockReturnValue(null);
      const warn = vi
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);

      await expect(
        service.expireCheckout({ ...payload, method: PaymentMethod.PAYPAL }),
      ).resolves.toBeUndefined();

      expect(gateway.expireCheckout).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledTimes(1);
    });

    it('expireCheckout rejects when the gateway rejects', async () => {
      const error = new Error('stripe down');
      gateway.expireCheckout.mockRejectedValue(error);

      await expect(service.expireCheckout(payload)).rejects.toBe(error);
    });
  });

  describe('start (PayPal)', () => {
    const PAYPAL_ORDER = '5O190127TN364715T';
    const approveUrl = `https://www.sandbox.paypal.com/checkoutnow?token=${PAYPAL_ORDER}`;

    it('start returns checkoutId and checkoutUrl for a PAYPAL order', async () => {
      withCharge(buildPayment({ method: PaymentMethod.PAYPAL }));
      gateway.createCheckout.mockResolvedValue(
        session({ id: PAYPAL_ORDER, url: approveUrl }),
      );

      await expect(service.start(USER_ID, ORDER_ID)).resolves.toMatchObject({
        paymentId: PAYMENT_ID,
        checkoutId: PAYPAL_ORDER,
        checkoutUrl: approveUrl,
      });
      expect(gateways.for).toHaveBeenCalledWith(PaymentMethod.PAYPAL);
    });

    it("start reuses an open PayPal order with the order's expiry", async () => {
      withCharge(
        buildPayment({
          method: PaymentMethod.PAYPAL,
          checkoutSessionId: PAYPAL_ORDER,
        }),
      );
      // The locked payment holds only a reference to its order.
      paymentRepository.lockById.mockResolvedValue(
        buildPayment({
          method: PaymentMethod.PAYPAL,
          checkoutSessionId: PAYPAL_ORDER,
          order: { id: ORDER_ID } as Order,
        }),
      );
      // PayPal orders carry no expiry: the gateway reports "now".
      gateway.findCheckout.mockResolvedValue(
        session({ id: PAYPAL_ORDER, url: approveUrl, expiresAt: NOW }),
      );

      await expect(service.start(USER_ID, ORDER_ID)).resolves.toMatchObject({
        expiresAt: order.expiresAt,
      });
    });

    it('start reuses an open PayPal order', async () => {
      withCharge(
        buildPayment({
          method: PaymentMethod.PAYPAL,
          status: PaymentStatus.FAILED,
          checkoutSessionId: PAYPAL_ORDER,
        }),
      );
      gateway.findCheckout.mockResolvedValue(
        session({ id: PAYPAL_ORDER, url: approveUrl }),
      );

      await expect(service.start(USER_ID, ORDER_ID)).resolves.toMatchObject({
        checkoutId: PAYPAL_ORDER,
      });
      expect(gateway.createCheckout).not.toHaveBeenCalled();
    });

    it("start retries with the gateway of the payment's method", async () => {
      withCharge(
        buildPayment({
          method: PaymentMethod.PAYPAL,
          status: PaymentStatus.FAILED,
          checkoutSessionId: 'PP-OLD',
        }),
      );
      gateway.findCheckout.mockResolvedValue(
        session({ id: 'PP-OLD', open: false, endedUnpaid: true }),
      );
      gateway.createCheckout.mockResolvedValue(
        session({ id: PAYPAL_ORDER, url: approveUrl }),
      );

      await expect(service.start(USER_ID, ORDER_ID)).resolves.toMatchObject({
        checkoutId: PAYPAL_ORDER,
      });
      expect(gateways.for).toHaveBeenCalledWith(PaymentMethod.PAYPAL);
      expect(gateway.createCheckout).toHaveBeenCalledWith(
        expect.objectContaining({ replacesCheckoutId: 'PP-OLD' }),
      );
    });
  });

  describe('capture', () => {
    const PAYPAL_ORDER = '5O190127TN364715T';
    const PAID_AT = new Date('2026-11-24T10:05:00Z');

    const paypalCharge = (overrides: Partial<Payment> = {}): Payment =>
      buildPayment({
        method: PaymentMethod.PAYPAL,
        checkoutSessionId: PAYPAL_ORDER,
        ...overrides,
      });

    const withPayPalCharge = (charge: Payment): void => {
      paymentRepository.findNewestChargeOf.mockResolvedValue(charge);
      paymentRepository.lockById.mockResolvedValue(charge);
      orderRepository.findById.mockResolvedValue(charge.order);
    };

    it("capture throws ItemNotFoundException for another user's order", async () => {
      paymentRepository.findNewestChargeOf.mockResolvedValue(null);

      await expect(service.capture(USER_ID, ORDER_ID)).rejects.toBeInstanceOf(
        ItemNotFoundException,
      );
      expect(gateway.capture).not.toHaveBeenCalled();
    });

    it('capture rejects COD with METHOD_NOT_ONLINE', async () => {
      withPayPalCharge(paypalCharge({ method: PaymentMethod.COD }));

      expect(await errCodeOf(service.capture(USER_ID, ORDER_ID))).toBe(
        ERROR_CODES.PAYMENT.METHOD_NOT_ONLINE,
      );
    });

    it('capture rejects CARD with CAPTURE_UNSUPPORTED', async () => {
      withPayPalCharge(paypalCharge({ method: PaymentMethod.CARD }));
      gateway.capture.mockResolvedValue(null);

      expect(await errCodeOf(service.capture(USER_ID, ORDER_ID))).toBe(
        ERROR_CODES.PAYMENT.CAPTURE_UNSUPPORTED,
      );
      expect(paymentRepository.save).not.toHaveBeenCalled();
    });

    it('capture answers PAID without calling PayPal when already PAID', async () => {
      withPayPalCharge(paypalCharge({ status: PaymentStatus.PAID }));

      await expect(service.capture(USER_ID, ORDER_ID)).resolves.toEqual({
        paymentId: PAYMENT_ID,
        paymentStatus: 'PAID',
        failureReason: null,
        retryable: false,
      });
      expect(gateway.capture).not.toHaveBeenCalled();
    });

    it('capture rejects an order that is not PENDING with NOT_PAYABLE', async () => {
      order = buildOrder({ status: OrderStatus.CANCELLED });
      withPayPalCharge(paypalCharge());

      expect(await errCodeOf(service.capture(USER_ID, ORDER_ID))).toBe(
        ERROR_CODES.PAYMENT.NOT_PAYABLE,
      );
      expect(gateway.capture).not.toHaveBeenCalled();
    });

    it('capture rejects an order past expires_at with ORDER_EXPIRED, PayPal not called', async () => {
      order = buildOrder({ expiresAt: new Date('2026-11-24T09:59:00Z') });
      withPayPalCharge(paypalCharge());

      expect(await errCodeOf(service.capture(USER_ID, ORDER_ID))).toBe(
        ERROR_CODES.PAYMENT.ORDER_EXPIRED,
      );
      expect(gateway.capture).not.toHaveBeenCalled();
    });

    it('capture rejects a payment without a PayPal order, or one not approved yet, with NOT_PAYABLE', async () => {
      withPayPalCharge(paypalCharge({ checkoutSessionId: null }));
      expect(await errCodeOf(service.capture(USER_ID, ORDER_ID))).toBe(
        ERROR_CODES.PAYMENT.NOT_PAYABLE,
      );
      expect(gateway.capture).not.toHaveBeenCalled();

      withPayPalCharge(paypalCharge());
      gateway.capture.mockResolvedValue({ kind: 'not_approved' });
      expect(await errCodeOf(service.capture(USER_ID, ORDER_ID))).toBe(
        ERROR_CODES.PAYMENT.NOT_PAYABLE,
      );
    });

    it('capture applies a COMPLETED capture as PAID', async () => {
      payment = paypalCharge();
      withPayPalCharge(payment);
      const calls: string[] = [];
      gateway.capture.mockImplementation(() => {
        calls.push('capture');
        return Promise.resolve({
          kind: 'succeeded',
          transactionId: 'CAPTURE-1',
          paidAt: PAID_AT,
        });
      });
      paymentRepository.transactional.mockImplementation(
        (work: () => Promise<unknown>) => {
          calls.push('transaction');
          return work();
        },
      );

      await expect(service.capture(USER_ID, ORDER_ID)).resolves.toEqual({
        paymentId: PAYMENT_ID,
        paymentStatus: 'PAID',
        failureReason: null,
        retryable: false,
      });
      expect(gateway.capture).toHaveBeenCalledWith(PAYPAL_ORDER);
      expect(calls).toEqual(['capture', 'transaction']);
      expect(payment.status).toBe(PaymentStatus.PAID);
      expect(payment.transactionId).toBe('CAPTURE-1');
      expect(payment.completedAt).toEqual(PAID_AT);
      expect(order.status).toBe(OrderStatus.CONFIRMED);
      expect(order.expiresAt).toBeNull();
      expect(paymentRepository.save).toHaveBeenCalledWith(payment, USER_ID);
    });

    it('capture maps INSTRUMENT_DECLINED to a retryable failure', async () => {
      payment = paypalCharge();
      withPayPalCharge(payment);
      gateway.capture.mockResolvedValue({
        kind: 'failed',
        retryable: true,
        reason: 'The instrument presented was declined.',
      });

      await expect(service.capture(USER_ID, ORDER_ID)).resolves.toEqual({
        paymentId: PAYMENT_ID,
        paymentStatus: 'FAILED',
        failureReason: 'The instrument presented was declined.',
        retryable: true,
      });
      expect(payment.status).toBe(PaymentStatus.FAILED);
      expect(order.status).toBe(OrderStatus.PENDING);
    });

    it('capture maps a DECLINED capture to a final failure', async () => {
      withPayPalCharge(paypalCharge());
      gateway.capture.mockResolvedValue({
        kind: 'failed',
        retryable: false,
        reason: 'PayPal denied the payment',
      });

      await expect(service.capture(USER_ID, ORDER_ID)).resolves.toMatchObject({
        paymentStatus: 'FAILED',
        retryable: false,
      });
    });

    it('capture answers PENDING on a pending capture and resets a FAILED payment', async () => {
      payment = paypalCharge({
        status: PaymentStatus.FAILED,
        failureReason: 'Declined',
      });
      withPayPalCharge(payment);
      gateway.capture.mockResolvedValue({
        kind: 'pending',
        transactionId: 'CAPTURE-1',
      });

      await expect(service.capture(USER_ID, ORDER_ID)).resolves.toEqual({
        paymentId: PAYMENT_ID,
        paymentStatus: 'PENDING',
        failureReason: null,
        retryable: false,
      });
      expect(payment.status).toBe(PaymentStatus.PENDING);
      expect(payment.transactionId).toBe('CAPTURE-1');
    });

    it('capture reads back ORDER_ALREADY_CAPTURED as the existing capture', async () => {
      payment = paypalCharge();
      withPayPalCharge(payment);
      // The webhook recorded the capture while PayPal answered this call.
      gateway.capture.mockImplementation(() => {
        payment.status = PaymentStatus.PAID;
        return Promise.resolve({
          kind: 'succeeded',
          transactionId: 'CAPTURE-1',
          paidAt: PAID_AT,
        });
      });

      await expect(service.capture(USER_ID, ORDER_ID)).resolves.toMatchObject({
        paymentStatus: 'PAID',
      });
      expect(paymentRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('handle', () => {
    const PAYPAL_ORDER = '5O190127TN364715T';

    const withApproved = (found: Payment | null): void => {
      paymentRepository.findByCheckoutSessionId.mockResolvedValue(found);
      paymentRepository.lockById.mockResolvedValue(found);
      orderRepository.findById.mockResolvedValue(found?.order ?? null);
    };

    const approved = {
      kind: 'approved' as const,
      checkoutSessionId: PAYPAL_ORDER,
    };

    it('handle approved captures by checkout id as a system write', async () => {
      payment = buildPayment({
        method: PaymentMethod.PAYPAL,
        checkoutSessionId: PAYPAL_ORDER,
      });
      withApproved(payment);
      gateway.capture.mockResolvedValue({
        kind: 'succeeded',
        transactionId: 'CAPTURE-1',
        paidAt: new Date('2026-11-24T10:05:00Z'),
      });

      await expect(service.handle(approved)).resolves.toBe(true);

      expect(paymentRepository.findByCheckoutSessionId).toHaveBeenCalledWith(
        PAYPAL_ORDER,
      );
      expect(gateway.capture).toHaveBeenCalledWith(PAYPAL_ORDER);
      expect(payment.status).toBe(PaymentStatus.PAID);
      expect(paymentRepository.save).toHaveBeenCalledWith(payment, null);
    });

    it('handle approved skips a PAID payment, a non-PENDING or expired order, and an unknown checkout id', async () => {
      withApproved(null);
      await expect(service.handle(approved)).resolves.toBe(false);

      withApproved(
        buildPayment({
          method: PaymentMethod.PAYPAL,
          status: PaymentStatus.PAID,
          checkoutSessionId: PAYPAL_ORDER,
        }),
      );
      await expect(service.handle(approved)).resolves.toBe(false);

      order = buildOrder({ status: OrderStatus.CANCELLED });
      withApproved(
        buildPayment({
          method: PaymentMethod.PAYPAL,
          checkoutSessionId: PAYPAL_ORDER,
        }),
      );
      await expect(service.handle(approved)).resolves.toBe(false);

      order = buildOrder({ expiresAt: new Date('2026-11-24T09:00:00Z') });
      withApproved(
        buildPayment({
          method: PaymentMethod.PAYPAL,
          checkoutSessionId: PAYPAL_ORDER,
        }),
      );
      await expect(service.handle(approved)).resolves.toBe(false);

      expect(gateway.capture).not.toHaveBeenCalled();
      expect(paymentRepository.save).not.toHaveBeenCalled();
    });

    it("handle approved ignores a gateway refusal: PayPal's COMPLETED event still records a capture", async () => {
      withApproved(
        buildPayment({
          method: PaymentMethod.PAYPAL,
          checkoutSessionId: PAYPAL_ORDER,
        }),
      );
      gateway.capture.mockRejectedValue(
        new InvalidRequestException({
          errCode: ERROR_CODES.PAYMENT.GATEWAY_REJECTED,
          field: 'payment',
          message: 'refused',
          description: 'refused',
        }),
      );

      await expect(service.handle(approved)).resolves.toBe(false);
      expect(paymentRepository.save).not.toHaveBeenCalled();
    });

    it('handle approved lets an outage propagate, so PayPal sends the event again', async () => {
      withApproved(
        buildPayment({
          method: PaymentMethod.PAYPAL,
          checkoutSessionId: PAYPAL_ORDER,
        }),
      );
      gateway.capture.mockRejectedValue(
        new DependencyUnavailableException({
          errCode: ERROR_CODES.PAYMENT.GATEWAY_UNAVAILABLE,
          field: '',
          message: 'down',
          description: 'down',
        }),
      );

      await expect(service.handle(approved)).rejects.toBeInstanceOf(
        DependencyUnavailableException,
      );
    });

    it('handle passes other events to apply', async () => {
      const apply = vi.spyOn(service, 'apply').mockResolvedValue(true);
      const event: GatewayEvent = {
        kind: 'failed',
        paymentId: PAYMENT_ID,
        reason: 'x',
      };

      await expect(service.handle(event)).resolves.toBe(true);
      expect(apply).toHaveBeenCalledWith(event);
    });
  });

  describe('apply pending', () => {
    const pending: GatewayEvent = {
      kind: 'pending',
      paymentId: PAYMENT_ID,
      transactionId: 'CAPTURE-1',
    };

    const lockReturns = (locked: Payment): void => {
      paymentRepository.lockById.mockResolvedValue(locked);
      orderRepository.findById.mockResolvedValue(locked.order);
    };

    it('apply pending moves FAILED to PENDING and clears the reason', async () => {
      payment = buildPayment({
        status: PaymentStatus.FAILED,
        failureReason: 'Declined',
      });
      lockReturns(payment);

      await expect(service.apply(pending)).resolves.toBe(true);

      expect(payment.status).toBe(PaymentStatus.PENDING);
      expect(payment.failureReason).toBeNull();
      expect(payment.transactionId).toBe('CAPTURE-1');
      expect(paymentRepository.save).toHaveBeenCalledWith(payment, null);
      expect(order.status).toBe(OrderStatus.PENDING);
      expect(order.expiresAt).toBeNull();
    });

    it('apply pending keeps the FAILED charge of a cancelled order and logs it', async () => {
      order = buildOrder({ status: OrderStatus.CANCELLED });
      payment = buildPayment({
        status: PaymentStatus.FAILED,
        failureReason: 'Cancelled',
      });
      lockReturns(payment);
      const warn = vi
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);

      await expect(service.apply(pending)).resolves.toBe(false);

      expect(payment.status).toBe(PaymentStatus.FAILED);
      expect(payment.transactionId).not.toBe('CAPTURE-1');
      expect(paymentRepository.save).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledTimes(1);
    });

    it('apply pending records the held capture on a PENDING payment', async () => {
      lockReturns(payment);

      await expect(service.apply(pending)).resolves.toBe(true);

      expect(payment.transactionId).toBe('CAPTURE-1');
      expect(paymentRepository.save).toHaveBeenCalledWith(payment, null);
    });

    it('apply pending leaves a PENDING payment holding that capture unchanged', async () => {
      payment = buildPayment({ transactionId: 'CAPTURE-1' });
      lockReturns(payment);

      await expect(service.apply(pending)).resolves.toBe(false);

      expect(payment.status).toBe(PaymentStatus.PENDING);
      expect(paymentRepository.save).not.toHaveBeenCalled();
    });

    it('apply pending never touches PAID', async () => {
      payment = buildPayment({ status: PaymentStatus.PAID });
      lockReturns(payment);

      await expect(service.apply(pending)).resolves.toBe(false);

      expect(payment.status).toBe(PaymentStatus.PAID);
      expect(paymentRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('verify', () => {
    it('verify resolves the webhook of the gateway registered for the method', async () => {
      const rawBody = Buffer.from('{}');
      const headers = { 'stripe-signature': 't=1,v1=abc' };
      const verified = { id: 'evt_1', type: 'customer.created', event: null };
      gateway.parseWebhook.mockResolvedValue(verified);

      await expect(
        service.verify(PaymentMethod.CARD, rawBody, headers),
      ).resolves.toBe(verified);
      expect(gateways.for).toHaveBeenCalledWith(PaymentMethod.CARD);
      expect(gateway.parseWebhook).toHaveBeenCalledWith(rawBody, headers);
    });
  });
});
