import { orderTotalsOf } from './order-pricing.util.js';

describe('orderTotalsOf', () => {
  it('orderTotalsOf works out subTotal, 10% tax and total in cents', () => {
    expect(
      orderTotalsOf([{ unitPrice: 10, discountAmount: 0, quantity: 2 }], 12),
    ).toEqual({ subTotal: 20, tax: 2, totalAmount: 34 });

    expect(
      orderTotalsOf([{ unitPrice: 9.99, discountAmount: 1, quantity: 3 }], 0),
    ).toEqual({ subTotal: 26.97, tax: 2.7, totalAmount: 29.67 });
  });

  it('orderTotalsOf adds every line', () => {
    expect(
      orderTotalsOf(
        [
          { unitPrice: 0.1, discountAmount: 0, quantity: 3 },
          { unitPrice: 0.2, discountAmount: 0, quantity: 1 },
        ],
        0.05,
      ),
    ).toEqual({ subTotal: 0.5, tax: 0.05, totalAmount: 0.6 });
  });
});
