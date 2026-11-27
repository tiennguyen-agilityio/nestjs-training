import type { Mock } from 'vitest';
import {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  PaymentType,
} from '@repo/constants';
import { RefundService } from './refund.service.js';
import type { OrderRepository } from '../repositories/order.repository.js';
import type { Order } from '../entities/order.entity.js';
import type { Payment } from '../entities/payment.entity.js';
import {
  InvalidStateException,
  ValidationException,
} from '../../../common/exceptions/base.exception.js';
import { ERROR_CODES } from '../../../common/constants/error-code.constant.js';
import {
  ERROR_DESCRIPTIONS,
  ERROR_MESSAGES,
} from '../../../common/constants/message.constant.js';

const ADMIN_ID = 'admin-1';

const row = (
  type: PaymentType,
  status: PaymentStatus,
  amount: string,
  method: PaymentMethod = PaymentMethod.CARD,
  id = `${type}-${status}-${amount}`,
) => ({
  id,
  type,
  status,
  amount,
  method,
  currency: 'USD',
  retriedAt: null as Date | null,
  refundReason: null as string | null,
});

const orderIn = (status: OrderStatus, ...payments: ReturnType<typeof row>[]) =>
  ({
    id: 'order-1',
    status,
    payments: { getItems: () => payments },
  }) as unknown as Order;

const orderWith = (...payments: ReturnType<typeof row>[]) =>
  orderIn(OrderStatus.CANCELLED, ...payments);

const paidCard = () => row(PaymentType.CHARGE, PaymentStatus.PAID, '34.00');

const errorOf = async (run: Promise<unknown>): Promise<InvalidStateException> =>
  run.then(
    () => {
      throw new Error('expected a rejection');
    },
    (error: unknown) => error as InvalidStateException,
  );

describe('RefundService', () => {
  let orderRepository: { addRefund: Mock };
  let enqueueRefund: Mock;
  let service: RefundService;

  beforeEach(() => {
    orderRepository = {
      addRefund: vi.fn((_order: Order, data: { amount: string }) =>
        Promise.resolve({ id: 'refund-new', ...data } as unknown as Payment),
      ),
    };
    enqueueRefund = vi.fn();
    service = new RefundService(orderRepository as unknown as OrderRepository);
  });

  it('startLocked refunds the amount given, at most the refundable', async () => {
    const order = orderWith(paidCard());

    const refund = await service.startLocked(
      order,
      10,
      ADMIN_ID,
      enqueueRefund,
      'Cancellation fee',
    );

    expect(orderRepository.addRefund).toHaveBeenCalledWith(
      order,
      {
        method: PaymentMethod.CARD,
        amount: '10.00',
        currency: 'USD',
        refundReason: 'Cancellation fee',
      },
      ADMIN_ID,
    );
    expect(enqueueRefund).toHaveBeenCalledWith({ paymentId: 'refund-new' });
    expect(refund).toMatchObject({ id: 'refund-new' });

    await service.startLocked(order, 34, ADMIN_ID, enqueueRefund);
    expect(orderRepository.addRefund).toHaveBeenLastCalledWith(
      order,
      expect.objectContaining({ amount: '34.00' }),
      ADMIN_ID,
    );
  });

  it('startLocked refuses an order with a refund line in any status with alreadyRefunded', async () => {
    for (const status of [
      PaymentStatus.PENDING,
      PaymentStatus.PAID,
      PaymentStatus.FAILED,
    ]) {
      const order = orderWith(
        paidCard(),
        row(PaymentType.REFUND, status, '10.00'),
      );

      const error = await errorOf(
        service.startLocked(order, 34, ADMIN_ID, enqueueRefund),
      );

      expect(error.getStatus()).toBe(409);
      expect(error.getErrors()[0]).toMatchObject({
        errCode: ERROR_CODES.ORDER.ALREADY_REFUNDED,
        message: ERROR_MESSAGES.ORDER.ALREADY_REFUNDED,
        description: ERROR_DESCRIPTIONS.ORDER.ALREADY_REFUNDED,
      });
    }
    expect(orderRepository.addRefund).not.toHaveBeenCalled();
  });

  it('startLocked refuses an uncancelled order with refundNeedsCancelled', async () => {
    for (const status of [
      OrderStatus.PENDING,
      OrderStatus.CONFIRMED,
      OrderStatus.COMPLETED,
    ]) {
      const error = await errorOf(
        service.startLocked(
          orderIn(status, paidCard()),
          34,
          ADMIN_ID,
          enqueueRefund,
        ),
      );

      expect(error.getStatus()).toBe(409);
      expect(error.getErrors()[0]).toMatchObject({
        errCode: ERROR_CODES.ORDER.REFUND_NEEDS_CANCELLED,
        message: ERROR_MESSAGES.ORDER.REFUND_NEEDS_CANCELLED,
        description: ERROR_DESCRIPTIONS.ORDER.REFUND_NEEDS_CANCELLED,
      });
    }
    expect(orderRepository.addRefund).not.toHaveBeenCalled();
  });

  it('startLocked trims the reason and saves null for a full refund without one', async () => {
    const order = orderWith(paidCard());

    await service.startLocked(order, 34, ADMIN_ID, enqueueRefund);
    await service.startLocked(
      orderWith(paidCard()),
      20,
      ADMIN_ID,
      enqueueRefund,
      '  Damaged on return ',
    );

    expect(orderRepository.addRefund).toHaveBeenNthCalledWith(
      1,
      order,
      expect.objectContaining({ amount: '34.00', refundReason: null }),
      ADMIN_ID,
    );
    expect(orderRepository.addRefund).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      expect.objectContaining({
        amount: '20.00',
        refundReason: 'Damaged on return',
      }),
      ADMIN_ID,
    );
  });

  it('startLocked keeps a reason on a full refund', async () => {
    const order = orderWith(paidCard());

    await service.startLocked(order, 34, ADMIN_ID, enqueueRefund, 'Goodwill');

    expect(orderRepository.addRefund).toHaveBeenCalledWith(
      order,
      expect.objectContaining({ amount: '34.00', refundReason: 'Goodwill' }),
      ADMIN_ID,
    );
  });

  it('startLocked refuses a lower amount with no or a blank reason with refundReasonRequired (400)', async () => {
    for (const reason of [undefined, null, '', '   ']) {
      const error = await errorOf(
        service.startLocked(
          orderWith(paidCard()),
          20,
          ADMIN_ID,
          enqueueRefund,
          reason,
        ),
      );

      expect(error).toBeInstanceOf(ValidationException);
      expect(error.getStatus()).toBe(400);
      expect(error.getErrors()[0]).toMatchObject({
        errCode: ERROR_CODES.ORDER.REFUND_REASON_REQUIRED,
        field: 'reason',
        message: ERROR_MESSAGES.ORDER.REFUND_REASON_REQUIRED,
        description: ERROR_DESCRIPTIONS.ORDER.REFUND_REASON_REQUIRED,
      });
    }
    expect(orderRepository.addRefund).not.toHaveBeenCalled();
  });

  it('startLocked refuses more than the PAID charge with refundExceedsPaid', async () => {
    const order = orderWith(paidCard());

    const error = await errorOf(
      service.startLocked(order, 34.01, ADMIN_ID, enqueueRefund, 'Too much'),
    );

    expect(error).toBeInstanceOf(InvalidStateException);
    expect(error.getStatus()).toBe(409);
    expect(error.getErrors()[0]).toMatchObject({
      errCode: ERROR_CODES.ORDER.REFUND_EXCEEDS_PAID,
      field: 'amount',
      message: ERROR_MESSAGES.ORDER.REFUND_EXCEEDS_PAID,
      description: ERROR_DESCRIPTIONS.ORDER.REFUND_EXCEEDS_PAID('34.00'),
    });
    expect(orderRepository.addRefund).not.toHaveBeenCalled();
    expect(enqueueRefund).not.toHaveBeenCalled();
  });

  it('startLocked refuses an order without a PAID online charge', async () => {
    for (const order of [
      orderWith(
        row(PaymentType.CHARGE, PaymentStatus.PAID, '34.00', PaymentMethod.COD),
      ),
      orderWith(row(PaymentType.CHARGE, PaymentStatus.PENDING, '34.00')),
    ]) {
      const error = await errorOf(
        service.startLocked(order, 5, ADMIN_ID, enqueueRefund),
      );

      expect(error.getStatus()).toBe(409);
      expect(error.getErrors()[0]).toMatchObject({
        errCode: ERROR_CODES.ORDER.NOT_REFUNDABLE,
        message: ERROR_MESSAGES.ORDER.NOT_REFUNDABLE,
      });
    }
    expect(orderRepository.addRefund).not.toHaveBeenCalled();
  });

  it('startLocked with rest refunds a cancelled order paid late in full', async () => {
    const order = orderWith(
      row(
        PaymentType.CHARGE,
        PaymentStatus.PAID,
        '34.00',
        PaymentMethod.PAYPAL,
      ),
    );

    await service.startLocked(order, 'rest', null, enqueueRefund);

    expect(orderRepository.addRefund).toHaveBeenCalledWith(
      order,
      {
        method: PaymentMethod.PAYPAL,
        amount: '34.00',
        currency: 'USD',
        refundReason: null,
      },
      null,
    );
    expect(enqueueRefund).toHaveBeenCalledWith({ paymentId: 'refund-new' });
  });

  it('startLocked with rest returns null when a refund line exists or nothing is paid online', async () => {
    for (const status of [
      PaymentStatus.PENDING,
      PaymentStatus.PAID,
      PaymentStatus.FAILED,
    ]) {
      await expect(
        service.startLocked(
          orderWith(paidCard(), row(PaymentType.REFUND, status, '10.50')),
          'rest',
          null,
          enqueueRefund,
        ),
      ).resolves.toBeNull();
    }
    const cod = orderWith(
      row(
        PaymentType.CHARGE,
        PaymentStatus.PENDING,
        '34.00',
        PaymentMethod.COD,
      ),
    );
    await expect(
      service.startLocked(cod, 'rest', null, enqueueRefund),
    ).resolves.toBeNull();
    expect(orderRepository.addRefund).not.toHaveBeenCalled();
  });

  it('retryLocked refuses while another refund of the order holds', async () => {
    const order = orderWith(
      paidCard(),
      row(
        PaymentType.REFUND,
        PaymentStatus.FAILED,
        '12.50',
        PaymentMethod.CARD,
        'refund-failed',
      ),
      row(PaymentType.REFUND, PaymentStatus.PAID, '5.00'),
    );

    const error = await errorOf(
      service.retryLocked(order, 'refund-failed', ADMIN_ID, enqueueRefund),
    );

    expect(error.getErrors()[0]).toMatchObject({
      errCode: ERROR_CODES.ORDER.REFUND_NOT_RETRYABLE,
    });
    expect(orderRepository.addRefund).not.toHaveBeenCalled();
  });

  it('retryLocked refunds a FAILED line again with its reason', async () => {
    const failed = row(
      PaymentType.REFUND,
      PaymentStatus.FAILED,
      '12.50',
      PaymentMethod.CARD,
      'refund-failed',
    );
    failed.refundReason = 'Cancellation fee';
    const order = orderWith(paidCard(), failed);

    await service.retryLocked(order, 'refund-failed', ADMIN_ID, enqueueRefund);

    expect(orderRepository.addRefund).toHaveBeenCalledWith(
      order,
      {
        method: PaymentMethod.CARD,
        amount: '12.50',
        currency: 'USD',
        refundReason: 'Cancellation fee',
      },
      ADMIN_ID,
    );
    expect(failed.status).toBe(PaymentStatus.FAILED);
    expect(failed.retriedAt).toBeInstanceOf(Date);
    expect(enqueueRefund).toHaveBeenCalledWith({ paymentId: 'refund-new' });
  });

  it('retryLocked refuses anything but a FAILED refund', async () => {
    const order = orderWith(
      paidCard(),
      row(
        PaymentType.REFUND,
        PaymentStatus.PAID,
        '5.00',
        PaymentMethod.CARD,
        'refund-paid',
      ),
    );

    for (const id of ['refund-paid', paidCard().id, 'missing']) {
      const error = await errorOf(
        service.retryLocked(order, id, ADMIN_ID, enqueueRefund),
      );

      expect(error.getStatus()).toBe(409);
      expect(error.getErrors()[0]).toMatchObject({
        errCode: ERROR_CODES.ORDER.REFUND_NOT_RETRYABLE,
        message: ERROR_MESSAGES.ORDER.REFUND_NOT_RETRYABLE,
      });
    }
    expect(orderRepository.addRefund).not.toHaveBeenCalled();
  });

  it('retryLocked refuses a FAILED refund that was already retried', async () => {
    const failed = {
      ...row(
        PaymentType.REFUND,
        PaymentStatus.FAILED,
        '12.50',
        PaymentMethod.CARD,
        'refund-failed',
      ),
      retriedAt: new Date('2026-11-25T10:00:00Z'),
    };
    const order = orderWith(paidCard(), failed);

    const error = await errorOf(
      service.retryLocked(order, 'refund-failed', ADMIN_ID, enqueueRefund),
    );

    expect(error.getStatus()).toBe(409);
    expect(error.getErrors()[0]).toMatchObject({
      errCode: ERROR_CODES.ORDER.REFUND_NOT_RETRYABLE,
    });
    expect(orderRepository.addRefund).not.toHaveBeenCalled();
  });

  it('retryLocked refuses a FAILED refund of an uncancelled order', async () => {
    const order = orderIn(
      OrderStatus.CONFIRMED,
      paidCard(),
      row(
        PaymentType.REFUND,
        PaymentStatus.FAILED,
        '12.50',
        PaymentMethod.CARD,
        'refund-failed',
      ),
    );

    const error = await errorOf(
      service.retryLocked(order, 'refund-failed', ADMIN_ID, enqueueRefund),
    );

    expect(error.getStatus()).toBe(409);
    expect(error.getErrors()[0]).toMatchObject({
      errCode: ERROR_CODES.ORDER.REFUND_NOT_RETRYABLE,
    });
    expect(orderRepository.addRefund).not.toHaveBeenCalled();
  });
});
