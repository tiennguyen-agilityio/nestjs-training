import { EMPTY_IMAGE } from '@/constants/images'
import type { CartItem } from '@/types/cart'
import { isCartItemBlocked, isCartItemOutOfStock } from '@/utils/inventory'

const line = (overrides: Partial<CartItem> = {}): CartItem => ({
  id: 'v1',
  variantId: 'v1',
  productId: 'p1',
  name: 'Colombia Huila',
  meta: '250g',
  imageUrl: EMPTY_IMAGE,
  unitPrice: 12,
  quantity: 1,
  maxQuantity: 5,
  ...overrides,
})

describe('isCartItemOutOfStock', () => {
  it('is true for an unavailable line', () => {
    expect(isCartItemOutOfStock(line({ isUnavailable: true }))).toBe(true)
  })

  it('is true when maxQuantity is 0', () => {
    expect(isCartItemOutOfStock(line({ maxQuantity: 0 }))).toBe(true)
  })

  it('is false otherwise', () => {
    expect(isCartItemOutOfStock(line())).toBe(false)
  })
})

describe('isCartItemBlocked', () => {
  it('is true for a line above the stock', () => {
    expect(isCartItemBlocked(line({ exceedsStock: true }))).toBe(true)
  })

  it('is true for an out-of-stock line', () => {
    expect(isCartItemBlocked(line({ isUnavailable: true }))).toBe(true)
  })

  it('is false otherwise', () => {
    expect(isCartItemBlocked(line())).toBe(false)
  })
})

describe('isCartItemOutOfStock for a line above the stock', () => {
  it('is false, so its stepper stays usable', () => {
    expect(isCartItemOutOfStock(line({ exceedsStock: true }))).toBe(false)
  })
})
