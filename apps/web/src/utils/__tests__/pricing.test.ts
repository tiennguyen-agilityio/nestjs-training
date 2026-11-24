import { DiscountType } from '@repo/constants'

import {
  fromCents,
  lineTotalOf,
  pricingOf,
  sumOf,
  taxOf,
  toCents,
} from '@/utils/pricing'

describe('pricingOf', () => {
  it('reads a null discount as PERCENT 0', () => {
    expect(
      pricingOf({ price: 10, discountType: null, discountValue: null }),
    ).toEqual({ price: 10, salePrice: 10 })
  })

  it('applies a percent discount', () => {
    expect(
      pricingOf({
        price: 20,
        discountType: DiscountType.PERCENT,
        discountValue: 25,
      }).salePrice,
    ).toBe(15)
  })

  it('applies a fixed discount', () => {
    expect(
      pricingOf({
        price: 20,
        discountType: DiscountType.FIXED,
        discountValue: 3.5,
      }).salePrice,
    ).toBe(16.5)
  })

  it('rounds a percent discount to the cent', () => {
    const { salePrice } = pricingOf({
      price: 10.99,
      discountType: DiscountType.PERCENT,
      discountValue: 15,
    })

    expect(salePrice).toBe(9.34)
    expect(lineTotalOf(salePrice, 3)).toBe(28.02)
  })
})

describe('cent helpers', () => {
  it('converts to and from cents', () => {
    expect(toCents(10.99)).toBe(1099)
    expect(fromCents(1099)).toBe(10.99)
  })

  it('sums without float drift', () => {
    expect(sumOf([0.1, 0.2])).toBe(0.3)
  })
})

describe('taxOf', () => {
  it('takes TAX_PERCENT of the subtotal, rounded to the cent', () => {
    expect(taxOf(28.02)).toBe(2.8)
    expect(taxOf(0.3)).toBe(0.03)
  })

  it('is 0 for an empty subtotal', () => {
    expect(taxOf(0)).toBe(0)
  })
})
