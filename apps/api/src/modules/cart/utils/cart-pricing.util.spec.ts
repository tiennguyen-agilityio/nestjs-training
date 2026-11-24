import { DiscountType } from '@repo/constants';
import { lineTotalOf, pricingOf, sumOf } from './cart-pricing.util.js';

describe('cart pricing', () => {
  it('reads a null discount as PERCENT 0', () => {
    expect(
      pricingOf({ price: '10.00', discountType: null, discountValue: null }),
    ).toEqual({
      price: 10,
      discountType: DiscountType.PERCENT,
      discountValue: 0,
      salePrice: 10,
    });
  });

  it('applies a percent discount', () => {
    expect(
      pricingOf({
        price: '20.00',
        discountType: DiscountType.PERCENT,
        discountValue: '25.00',
      }).salePrice,
    ).toBe(15);
  });

  it('applies a fixed discount', () => {
    expect(
      pricingOf({
        price: 20,
        discountType: DiscountType.FIXED,
        discountValue: 3.5,
      }).salePrice,
    ).toBe(16.5);
  });

  it('rounds a percent discount to the cent', () => {
    const { salePrice } = pricingOf({
      price: '10.99',
      discountType: DiscountType.PERCENT,
      discountValue: '15.00',
    });

    expect(salePrice).toBe(9.34);
    expect(lineTotalOf(salePrice, 3)).toBe(28.02);
  });

  it('sums without float drift', () => {
    expect(sumOf([0.1, 0.2])).toBe(0.3);
  });
});
