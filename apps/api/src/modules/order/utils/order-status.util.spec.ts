import { OrderStatus, ShippingStatus } from '@repo/constants';
import {
  canMoveOrderStatus,
  canMoveShippingStatus,
} from './order-status.util.js';

const pairsOf = <T extends string>(values: T[]): [T, T][] =>
  values.flatMap((from) => values.map((to): [T, T] => [from, to]));

const ALLOWED_ORDER_MOVES = new Set([
  `${OrderStatus.PENDING}>${OrderStatus.CONFIRMED}`,
  `${OrderStatus.PENDING}>${OrderStatus.CANCELLED}`,
  `${OrderStatus.CONFIRMED}>${OrderStatus.COMPLETED}`,
  `${OrderStatus.CONFIRMED}>${OrderStatus.CANCELLED}`,
]);

const ALLOWED_SHIPPING_MOVES = new Set([
  `${ShippingStatus.PENDING}>${ShippingStatus.SHIPPING}`,
  `${ShippingStatus.SHIPPING}>${ShippingStatus.DELIVERED}`,
  `${ShippingStatus.SHIPPING}>${ShippingStatus.RETURNED}`,
]);

describe('canMoveOrderStatus', () => {
  it.each(pairsOf(Object.values(OrderStatus)))(
    "canMoveOrderStatus allows only the card's moves (%s → %s)",
    (from, to) => {
      expect(canMoveOrderStatus(from, to)).toBe(
        ALLOWED_ORDER_MOVES.has(`${from}>${to}`),
      );
    },
  );
});

describe('canMoveShippingStatus', () => {
  it.each(pairsOf(Object.values(ShippingStatus)))(
    "canMoveShippingStatus allows only the card's moves (%s → %s)",
    (from, to) => {
      expect(canMoveShippingStatus(from, to)).toBe(
        ALLOWED_SHIPPING_MOVES.has(`${from}>${to}`),
      );
    },
  );
});
