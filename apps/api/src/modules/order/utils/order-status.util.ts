import {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  ShippingStatus,
} from '@repo/constants';

export interface StatusFacts {
  status: OrderStatus;
  shippingStatus: ShippingStatus;
  charges: {
    method: PaymentMethod;
    status: PaymentStatus;
    transactionId: string | null;
  }[];
}

export type OrderMoveBlock =
  'notAMove' | 'unpaidOnline' | 'shipped' | 'paymentHeld' | 'notDelivered';

export type ShippingMoveBlock = 'notAMove' | 'notConfirmed' | 'paymentHeld';

const ORDER_STATUS_MOVES: Readonly<
  Record<OrderStatus, readonly OrderStatus[]>
> = {
  [OrderStatus.PENDING]: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
  [OrderStatus.CONFIRMED]: [OrderStatus.COMPLETED, OrderStatus.CANCELLED],
  [OrderStatus.COMPLETED]: [],
  [OrderStatus.CANCELLED]: [],
};

const SHIPPING_STATUS_MOVES: Readonly<
  Record<ShippingStatus, readonly ShippingStatus[]>
> = {
  [ShippingStatus.PENDING]: [ShippingStatus.SHIPPING],
  [ShippingStatus.SHIPPING]: [
    ShippingStatus.DELIVERED,
    ShippingStatus.RETURNED,
  ],
  [ShippingStatus.DELIVERED]: [],
  [ShippingStatus.RETURNED]: [],
};

const isCod = (facts: StatusFacts): boolean =>
  facts.charges.some((charge) => charge.method === PaymentMethod.COD);

const hasPaidCharge = (facts: StatusFacts): boolean =>
  facts.charges.some((charge) => charge.status === PaymentStatus.PAID);

const hasHeldCharge = (facts: StatusFacts): boolean =>
  facts.charges.some(
    (charge) =>
      charge.status === PaymentStatus.PENDING && Boolean(charge.transactionId),
  );

export const orderMoveBlockOf = (
  facts: StatusFacts,
  to: OrderStatus,
): OrderMoveBlock | null => {
  if (!ORDER_STATUS_MOVES[facts.status].includes(to)) return 'notAMove';
  switch (to) {
    case OrderStatus.CONFIRMED:
      return isCod(facts) || hasPaidCharge(facts) ? null : 'unpaidOnline';
    case OrderStatus.CANCELLED:
      if (facts.shippingStatus !== ShippingStatus.PENDING) return 'shipped';
      return hasHeldCharge(facts) ? 'paymentHeld' : null;
    case OrderStatus.COMPLETED:
      return facts.shippingStatus === ShippingStatus.DELIVERED
        ? null
        : 'notDelivered';
    default:
      return null;
  }
};

export const shippingMoveBlockOf = (
  facts: StatusFacts,
  to: ShippingStatus,
): ShippingMoveBlock | null => {
  if (!SHIPPING_STATUS_MOVES[facts.shippingStatus].includes(to)) {
    return 'notAMove';
  }
  if (facts.status !== OrderStatus.CONFIRMED) return 'notConfirmed';
  return to === ShippingStatus.RETURNED && hasHeldCharge(facts)
    ? 'paymentHeld'
    : null;
};

export const allowedStatusesOf = (facts: StatusFacts): OrderStatus[] =>
  Object.values(OrderStatus).filter(
    (to) => orderMoveBlockOf(facts, to) === null,
  );

export const allowedShippingStatusesOf = (
  facts: StatusFacts,
): ShippingStatus[] =>
  Object.values(ShippingStatus).filter(
    (to) => shippingMoveBlockOf(facts, to) === null,
  );
