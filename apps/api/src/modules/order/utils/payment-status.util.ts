import {
  OrderPaymentStatus,
  PaymentMethod,
  PaymentStatus,
  PaymentType,
} from '@repo/constants';
export interface PaymentFacts {
  type: PaymentType;
  method: PaymentMethod;
  status: PaymentStatus;
  amount: string;
  createdAt: Date;
  checkoutSessionId: string | null;
}

const ONLINE_METHODS = new Set([PaymentMethod.CARD, PaymentMethod.PAYPAL]);

const isUnpaid = (charge: PaymentFacts): boolean =>
  charge.status === PaymentStatus.PENDING &&
  (charge.method === PaymentMethod.COD ||
    (ONLINE_METHODS.has(charge.method) && !charge.checkoutSessionId));

const STATUS_OF_CHARGE: Record<PaymentStatus, OrderPaymentStatus> = {
  [PaymentStatus.PENDING]: OrderPaymentStatus.PENDING,
  [PaymentStatus.PAID]: OrderPaymentStatus.PAID,
  [PaymentStatus.FAILED]: OrderPaymentStatus.FAILED,
};

const paidCentsOf = (payments: PaymentFacts[], type: PaymentType): number =>
  payments
    .filter((p) => p.type === type && p.status === PaymentStatus.PAID)
    .reduce((total, p) => total + Math.round(Number(p.amount) * 100), 0);

export const paymentStatusOf = (
  payments: PaymentFacts[],
): OrderPaymentStatus => {
  const refunded = paidCentsOf(payments, PaymentType.REFUND);
  if (refunded > 0) {
    return refunded >= paidCentsOf(payments, PaymentType.CHARGE)
      ? OrderPaymentStatus.REFUNDED
      : OrderPaymentStatus.PARTIALLY_REFUNDED;
  }

  const newest = payments
    .filter((p) => p.type === PaymentType.CHARGE)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  if (!newest || isUnpaid(newest)) return OrderPaymentStatus.UNPAID;
  return STATUS_OF_CHARGE[newest.status];
};
