import {
  OrderPaymentStatus,
  PaymentMethod,
  PaymentStatus,
  PaymentType,
} from '@repo/constants';
import { paymentStatusOf } from './payment-status.util.js';

const payment = (
  overrides: Partial<{
    type: PaymentType;
    method: PaymentMethod;
    status: PaymentStatus;
    amount: string;
    createdAt: Date;
  }> = {},
) => ({
  type: PaymentType.CHARGE,
  method: PaymentMethod.COD,
  status: PaymentStatus.PENDING,
  amount: '34.00',
  createdAt: new Date('2026-11-24T10:00:00Z'),
  ...overrides,
});

describe('paymentStatusOf', () => {
  it('paymentStatusOf shows a pending COD charge as UNPAID', () => {
    expect(paymentStatusOf([payment()])).toBe(OrderPaymentStatus.UNPAID);
  });

  it('paymentStatusOf shows a pending CARD charge as PENDING', () => {
    expect(paymentStatusOf([payment({ method: PaymentMethod.CARD })])).toBe(
      OrderPaymentStatus.PENDING,
    );
  });

  it('paymentStatusOf uses the newest CHARGE', () => {
    expect(
      paymentStatusOf([
        payment({
          method: PaymentMethod.CARD,
          status: PaymentStatus.PAID,
          createdAt: new Date('2026-11-24T11:00:00Z'),
        }),
        payment({
          method: PaymentMethod.CARD,
          status: PaymentStatus.FAILED,
          createdAt: new Date('2026-11-24T10:00:00Z'),
        }),
      ]),
    ).toBe(OrderPaymentStatus.PAID);
  });

  it('paymentStatusOf returns REFUNDED and PARTIALLY_REFUNDED from PAID refunds', () => {
    const paid = payment({
      method: PaymentMethod.CARD,
      status: PaymentStatus.PAID,
    });
    const refund = (amount: string) =>
      payment({
        type: PaymentType.REFUND,
        method: PaymentMethod.CARD,
        status: PaymentStatus.PAID,
        amount,
        createdAt: new Date('2026-11-25T10:00:00Z'),
      });

    expect(paymentStatusOf([paid, refund('34.00')])).toBe(
      OrderPaymentStatus.REFUNDED,
    );
    expect(paymentStatusOf([paid, refund('10.00')])).toBe(
      OrderPaymentStatus.PARTIALLY_REFUNDED,
    );
  });

  it('paymentStatusOf is UNPAID without a charge', () => {
    expect(paymentStatusOf([])).toBe(OrderPaymentStatus.UNPAID);
  });
});
