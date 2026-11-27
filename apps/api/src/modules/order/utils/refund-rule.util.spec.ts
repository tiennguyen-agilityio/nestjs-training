import {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  PaymentType,
} from '@repo/constants';
import {
  hasRefundLine,
  refundableCentsOf,
  type RefundFacts,
} from './refund-rule.util.js';

const line = (
  type: PaymentType,
  method: PaymentMethod,
  status: PaymentStatus,
  amount = '50.00',
): RefundFacts['payments'][number] => ({ type, method, status, amount });

const paidCard = line(
  PaymentType.CHARGE,
  PaymentMethod.CARD,
  PaymentStatus.PAID,
);

const factsOf = (overrides: Partial<RefundFacts> = {}): RefundFacts => ({
  status: OrderStatus.CANCELLED,
  payments: [paidCard],
  ...overrides,
});

describe('refundableCentsOf', () => {
  it('refundableCentsOf is the paid online charge of a cancelled order with no refund', () => {
    expect(refundableCentsOf(factsOf())).toBe(5000);
    expect(
      refundableCentsOf(
        factsOf({
          payments: [
            line(PaymentType.CHARGE, PaymentMethod.PAYPAL, PaymentStatus.PAID),
          ],
        }),
      ),
    ).toBe(5000);
  });

  it('refundableCentsOf is 0 before the order is cancelled', () => {
    for (const status of [
      OrderStatus.PENDING,
      OrderStatus.CONFIRMED,
      OrderStatus.COMPLETED,
    ]) {
      expect(refundableCentsOf(factsOf({ status }))).toBe(0);
    }
  });

  it('refundableCentsOf is 0 once the order has a refund line in any status', () => {
    for (const status of [
      PaymentStatus.PENDING,
      PaymentStatus.PAID,
      PaymentStatus.FAILED,
    ]) {
      expect(
        refundableCentsOf(
          factsOf({
            payments: [
              paidCard,
              line(PaymentType.REFUND, PaymentMethod.CARD, status, '10.00'),
            ],
          }),
        ),
      ).toBe(0);
    }
  });

  it('refundableCentsOf is 0 without a paid card or PayPal charge', () => {
    expect(
      refundableCentsOf(
        factsOf({
          payments: [
            line(PaymentType.CHARGE, PaymentMethod.COD, PaymentStatus.PAID),
          ],
        }),
      ),
    ).toBe(0);
    expect(
      refundableCentsOf(
        factsOf({
          payments: [
            line(PaymentType.CHARGE, PaymentMethod.CARD, PaymentStatus.FAILED),
          ],
        }),
      ),
    ).toBe(0);
  });
});

describe('hasRefundLine', () => {
  it('hasRefundLine is true for a REFUND in any status and false for charges only', () => {
    expect(hasRefundLine({ payments: [paidCard] })).toBe(false);
    expect(
      hasRefundLine({
        payments: [
          paidCard,
          line(PaymentType.REFUND, PaymentMethod.CARD, PaymentStatus.FAILED),
        ],
      }),
    ).toBe(true);
  });
});
