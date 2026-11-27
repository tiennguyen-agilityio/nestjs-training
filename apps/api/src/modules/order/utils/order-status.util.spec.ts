import {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  ShippingStatus,
} from '@repo/constants';
import {
  allowedShippingStatusesOf,
  allowedStatusesOf,
  orderMoveBlockOf,
  shippingMoveBlockOf,
  type StatusFacts,
} from './order-status.util.js';

const charge = (
  method: PaymentMethod,
  status: PaymentStatus,
  transactionId: string | null = null,
): StatusFacts['charges'][number] => ({ method, status, transactionId });

const factsOf = (overrides: Partial<StatusFacts> = {}): StatusFacts => ({
  status: OrderStatus.PENDING,
  shippingStatus: ShippingStatus.PENDING,
  charges: [charge(PaymentMethod.COD, PaymentStatus.PENDING)],
  hasRefund: false,
  ...overrides,
});

describe('orderMoveBlockOf', () => {
  it('orderMoveBlockOf returns notAMove outside the move table', () => {
    expect(
      orderMoveBlockOf(
        factsOf({
          status: OrderStatus.COMPLETED,
          shippingStatus: ShippingStatus.DELIVERED,
        }),
        OrderStatus.CANCELLED,
      ),
    ).toBe('notAMove');
    expect(
      orderMoveBlockOf(
        factsOf({ status: OrderStatus.CANCELLED }),
        OrderStatus.PENDING,
      ),
    ).toBe('notAMove');
    expect(orderMoveBlockOf(factsOf(), OrderStatus.COMPLETED)).toBe('notAMove');
  });

  it('orderMoveBlockOf allows CONFIRMED for COD or a PAID charge only', () => {
    expect(orderMoveBlockOf(factsOf(), OrderStatus.CONFIRMED)).toBeNull();
    expect(
      orderMoveBlockOf(
        factsOf({
          charges: [charge(PaymentMethod.CARD, PaymentStatus.PENDING)],
        }),
        OrderStatus.CONFIRMED,
      ),
    ).toBe('unpaidOnline');
    expect(
      orderMoveBlockOf(
        factsOf({
          charges: [charge(PaymentMethod.PAYPAL, PaymentStatus.PAID, 'CAP-1')],
        }),
        OrderStatus.CONFIRMED,
      ),
    ).toBeNull();
  });

  it('orderMoveBlockOf blocks CANCELLED once shipping has started', () => {
    const confirmed = { status: OrderStatus.CONFIRMED };
    expect(
      orderMoveBlockOf(
        factsOf({ ...confirmed, shippingStatus: ShippingStatus.SHIPPING }),
        OrderStatus.CANCELLED,
      ),
    ).toBe('shipped');
    expect(
      orderMoveBlockOf(factsOf(confirmed), OrderStatus.CANCELLED),
    ).toBeNull();
  });

  it('orderMoveBlockOf blocks CANCELLED while a charge is held for review', () => {
    expect(
      orderMoveBlockOf(
        factsOf({
          charges: [charge(PaymentMethod.CARD, PaymentStatus.PENDING, 'pi_1')],
        }),
        OrderStatus.CANCELLED,
      ),
    ).toBe('paymentHeld');
    expect(
      orderMoveBlockOf(
        factsOf({
          charges: [charge(PaymentMethod.CARD, PaymentStatus.PENDING)],
        }),
        OrderStatus.CANCELLED,
      ),
    ).toBeNull();
    expect(
      orderMoveBlockOf(
        factsOf({
          charges: [charge(PaymentMethod.CARD, PaymentStatus.PENDING, '')],
        }),
        OrderStatus.CANCELLED,
      ),
    ).toBeNull();
  });

  it('orderMoveBlockOf blocks COMPLETED until DELIVERED', () => {
    const confirmed = { status: OrderStatus.CONFIRMED };
    expect(
      orderMoveBlockOf(
        factsOf({ ...confirmed, shippingStatus: ShippingStatus.SHIPPING }),
        OrderStatus.COMPLETED,
      ),
    ).toBe('notDelivered');
    expect(
      orderMoveBlockOf(
        factsOf({ ...confirmed, shippingStatus: ShippingStatus.DELIVERED }),
        OrderStatus.COMPLETED,
      ),
    ).toBeNull();
  });
});

describe('shippingMoveBlockOf', () => {
  it('shippingMoveBlockOf blocks SHIPPING until the order is CONFIRMED', () => {
    const confirmed = { status: OrderStatus.CONFIRMED };
    expect(shippingMoveBlockOf(factsOf(), ShippingStatus.SHIPPING)).toBe(
      'notConfirmed',
    );
    expect(
      shippingMoveBlockOf(factsOf(confirmed), ShippingStatus.SHIPPING),
    ).toBeNull();
    const shipping = factsOf({
      ...confirmed,
      shippingStatus: ShippingStatus.SHIPPING,
    });
    expect(shippingMoveBlockOf(shipping, ShippingStatus.DELIVERED)).toBeNull();
    expect(shippingMoveBlockOf(shipping, ShippingStatus.RETURNED)).toBeNull();
    expect(
      shippingMoveBlockOf(
        factsOf({ ...confirmed, shippingStatus: ShippingStatus.DELIVERED }),
        ShippingStatus.RETURNED,
      ),
    ).toBe('notAMove');
  });
});

describe('shippingMoveBlockOf RETURNED', () => {
  it('shippingMoveBlockOf blocks RETURNED while a charge is held for review', () => {
    expect(
      shippingMoveBlockOf(
        factsOf({
          status: OrderStatus.CONFIRMED,
          shippingStatus: ShippingStatus.SHIPPING,
          charges: [charge(PaymentMethod.CARD, PaymentStatus.PENDING, 'pi_1')],
        }),
        ShippingStatus.RETURNED,
      ),
    ).toBe('paymentHeld');
  });
});

describe('shippingMoveBlockOf with a refund', () => {
  it('a shipping move of an order with a refund is blocked as refunded', () => {
    const paid = [charge(PaymentMethod.CARD, PaymentStatus.PAID, 'pi_1')];
    const unshipped = factsOf({
      status: OrderStatus.CONFIRMED,
      charges: paid,
      hasRefund: true,
    });
    expect(shippingMoveBlockOf(unshipped, ShippingStatus.SHIPPING)).toBe(
      'refunded',
    );
    const shipping = { ...unshipped, shippingStatus: ShippingStatus.SHIPPING };
    expect(shippingMoveBlockOf(shipping, ShippingStatus.DELIVERED)).toBe(
      'refunded',
    );
    expect(shippingMoveBlockOf(shipping, ShippingStatus.RETURNED)).toBe(
      'refunded',
    );
    expect(allowedShippingStatusesOf(unshipped)).toEqual([]);
    expect(allowedShippingStatusesOf(shipping)).toEqual([]);
    expect(shippingMoveBlockOf(shipping, ShippingStatus.PENDING)).toBe(
      'notAMove',
    );
  });
});

describe('allowedStatusesOf and allowedShippingStatusesOf', () => {
  it('allowedStatusesOf lists the moves allowed now', () => {
    const shipping = factsOf({
      status: OrderStatus.CONFIRMED,
      shippingStatus: ShippingStatus.SHIPPING,
      charges: [charge(PaymentMethod.CARD, PaymentStatus.PAID, 'pi_1')],
    });
    expect(allowedStatusesOf(shipping)).toEqual([]);
    expect(allowedShippingStatusesOf(shipping)).toEqual([
      ShippingStatus.DELIVERED,
      ShippingStatus.RETURNED,
    ]);

    expect(allowedStatusesOf(factsOf())).toEqual([
      OrderStatus.CONFIRMED,
      OrderStatus.CANCELLED,
    ]);
    expect(allowedShippingStatusesOf(factsOf())).toEqual([]);
  });

  it('allowedStatusesOf gives a mismatched CANCELLED and SHIPPING order nothing', () => {
    const mismatched = factsOf({
      status: OrderStatus.CANCELLED,
      shippingStatus: ShippingStatus.SHIPPING,
    });
    expect(allowedStatusesOf(mismatched)).toEqual([]);
    expect(allowedShippingStatusesOf(mismatched)).toEqual([]);
  });
});
