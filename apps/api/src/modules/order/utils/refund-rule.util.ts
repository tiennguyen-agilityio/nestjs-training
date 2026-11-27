import {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  PaymentType,
} from '@repo/constants';

export interface RefundFacts {
  status: OrderStatus;
  payments: {
    type: PaymentType;
    method: PaymentMethod;
    status: PaymentStatus;
    amount: string;
  }[];
}

const ONLINE_METHODS = new Set<PaymentMethod>([
  PaymentMethod.CARD,
  PaymentMethod.PAYPAL,
]);

/** Any REFUND line, whatever its status: an order is refunded once. */
export const hasRefundLine = ({
  payments,
}: Pick<RefundFacts, 'payments'>): boolean =>
  payments.some((payment) => payment.type === PaymentType.REFUND);

/**
 * What an admin can refund: the PAID card or PayPal charge of a CANCELLED
 * order with no refund line yet, in cents; 0 for any other order.
 */
export const refundableCentsOf = (facts: RefundFacts): number => {
  if (facts.status !== OrderStatus.CANCELLED || hasRefundLine(facts)) return 0;
  const charge = facts.payments.find(
    (payment) =>
      payment.type === PaymentType.CHARGE &&
      payment.status === PaymentStatus.PAID &&
      ONLINE_METHODS.has(payment.method),
  );
  return charge ? Math.round(Number(charge.amount) * 100) : 0;
};
