import { OrderStatus, ShippingStatus } from '@repo/constants';

/** The order status moves an admin may make; every other move is refused. */
const ORDER_STATUS_MOVES: Readonly<
  Record<OrderStatus, readonly OrderStatus[]>
> = {
  [OrderStatus.PENDING]: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
  [OrderStatus.CONFIRMED]: [OrderStatus.COMPLETED, OrderStatus.CANCELLED],
  [OrderStatus.COMPLETED]: [],
  [OrderStatus.CANCELLED]: [],
};

/** The shipping status moves an admin may make; every other move is refused. */
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

export const canMoveOrderStatus = (
  from: OrderStatus,
  to: OrderStatus,
): boolean => ORDER_STATUS_MOVES[from].includes(to);

export const canMoveShippingStatus = (
  from: ShippingStatus,
  to: ShippingStatus,
): boolean => SHIPPING_STATUS_MOVES[from].includes(to);
