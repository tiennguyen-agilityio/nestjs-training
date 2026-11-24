import { ProductStatus } from '@repo/constants'

import { EMPTY_IMAGE } from '@/constants/images'
import { ERROR_MESSAGES } from '@/constants/messages'
import {
  buildCartTotals,
  calculateSubtotal,
  clampQuantity,
  countCartQuantity,
  countMergedLines,
  describeMergeAdjustments,
  formatCurrency,
  toCartItem,
} from '@/utils/cart'
import type { CartItem, ServerCartItem } from '@/types/cart'

const cartItemsFixture: CartItem[] = [
  {
    id: 'line-1',
    variantId: 'line-1',
    productId: 'product-1',
    name: 'Ethiopian Yirgacheffe',
    meta: 'Light Roast',
    imageUrl: '/images/empty-image.webp',
    unitPrice: 24,
    quantity: 1,
  },
  {
    id: 'line-2',
    variantId: 'line-2',
    productId: 'product-2',
    name: 'Precision Gooseneck Kettle',
    meta: 'Matte Black',
    imageUrl: '/images/empty-image.webp',
    unitPrice: 145,
    quantity: 1,
  },
]

describe('clampQuantity', () => {
  it('clamps to 1 at the lower bound', () => {
    expect(clampQuantity(0)).toBe(1)
    expect(clampQuantity(-5)).toBe(1)
  })

  it('clamps to max at the upper bound', () => {
    expect(clampQuantity(100)).toBe(99)
    expect(clampQuantity(8, 3)).toBe(3)
  })

  it('returns an integer value inside bounds', () => {
    expect(clampQuantity(2.8)).toBe(2)
    expect(clampQuantity(Number.NaN)).toBe(1)
  })
})

describe('cart totals helpers', () => {
  it('calculates subtotal from cart lines', () => {
    expect(calculateSubtotal(cartItemsFixture)).toBe(169)
  })

  it('builds totals with checkout-calculated shipping', () => {
    expect(buildCartTotals(cartItemsFixture)).toEqual({
      subtotal: 169,
      shipping: null,
      tax: 16.9,
      total: 185.9,
    })
  })

  it('buildCartTotals adds TAX_PERCENT of the subtotal in cents', () => {
    const items = [
      { ...cartItemsFixture[0], id: 'a', unitPrice: 0.1 },
      { ...cartItemsFixture[0], id: 'b', unitPrice: 0.2 },
    ] as CartItem[]
    expect(buildCartTotals(items)).toEqual({
      subtotal: 0.3,
      shipping: null,
      tax: 0.03,
      total: 0.33,
    })
  })
})

describe('formatCurrency', () => {
  it('formats price with usd format', () => {
    expect(formatCurrency(169)).toBe('$169.00')
  })
})

const serverLine = (
  overrides: Partial<ServerCartItem> = {},
): ServerCartItem => ({
  id: 'line-1',
  productVariantId: 'v1',
  quantity: 2,
  product: {
    id: 'p1',
    name: 'Colombia Huila',
    slug: 'colombia-huila',
    status: ProductStatus.ACTIVE,
    primaryImageUrl: 'https://img.example/huila.webp',
  },
  variant: {
    sku: 'COL-250G',
    sizeName: '250g',
    price: 14,
    discountType: null,
    discountValue: 10,
    salePrice: 12.6,
    availableQuantity: 5,
  },
  inStock: true,
  isAvailable: true,
  lineTotal: 25.2,
  createdAt: '2026-11-24T00:00:00.000Z',
  updatedAt: '2026-11-24T00:00:00.000Z',
  ...overrides,
})

const browserLine = (overrides: Partial<CartItem> = {}): CartItem => ({
  id: 'v1',
  variantId: 'v1',
  productId: 'p1',
  name: 'Colombia Huila',
  meta: 'Medium',
  imageUrl: EMPTY_IMAGE,
  unitPrice: 10,
  quantity: 1,
  ...overrides,
})

describe('toCartItem', () => {
  it('maps the API line to a CartItem', () => {
    expect(toCartItem(serverLine())).toEqual({
      id: 'line-1',
      variantId: 'v1',
      productId: 'p1',
      name: 'Colombia Huila',
      meta: '250g',
      imageUrl: 'https://img.example/huila.webp',
      unitPrice: 12.6,
      quantity: 2,
      maxQuantity: 5,
      listPrice: 14,
      lineTotal: 25.2,
      isUnavailable: false,
      exceedsStock: false,
    })
  })

  it('toCartItem maps the variant price to listPrice', () => {
    const item = toCartItem(
      serverLine({
        variant: { ...serverLine().variant, price: 20, salePrice: 15 },
      }),
    )
    expect(item.unitPrice).toBe(15)
    expect(item.listPrice).toBe(20)
  })

  it('uses the empty image when the product has none', () => {
    const line = serverLine()
    expect(
      toCartItem({
        ...line,
        product: { ...line.product, primaryImageUrl: null },
      }).imageUrl,
    ).toBe(EMPTY_IMAGE)
  })

  it('flags isAvailable false as unavailable', () => {
    expect(toCartItem(serverLine({ isAvailable: false }))).toMatchObject({
      isUnavailable: true,
      exceedsStock: false,
    })
  })

  it('flags a line with no stock left as unavailable', () => {
    const line = serverLine({ inStock: false })
    expect(
      toCartItem({
        ...line,
        variant: { ...line.variant, availableQuantity: 0 },
      }),
    ).toMatchObject({ isUnavailable: true, exceedsStock: false })
  })

  it('marks a line above the stock it can still lower', () => {
    const line = serverLine({ quantity: 5, inStock: false })
    expect(
      toCartItem({
        ...line,
        variant: { ...line.variant, availableQuantity: 3 },
      }),
    ).toMatchObject({
      isUnavailable: false,
      exceedsStock: true,
      maxQuantity: 3,
    })
  })
})

describe('buildCartTotals with server lines', () => {
  it('leaves out unavailable lines and uses lineTotal', () => {
    const items = [
      toCartItem(serverLine()),
      toCartItem(
        serverLine({ id: 'line-2', isAvailable: false, lineTotal: 10 }),
      ),
    ]
    expect(buildCartTotals(items).subtotal).toBe(25.2)
  })

  it('counts a line above the stock', () => {
    const items = [toCartItem(serverLine({ inStock: false }))]
    expect(buildCartTotals(items).subtotal).toBe(25.2)
    expect(countCartQuantity(items)).toBe(2)
  })

  it("keeps today's sum for browser lines", () => {
    expect(buildCartTotals(cartItemsFixture).subtotal).toBe(169)
  })
})

describe('countCartQuantity', () => {
  it('sums the quantities of the available lines', () => {
    const items = [
      browserLine({ quantity: 2 }),
      browserLine({ id: 'v2', variantId: 'v2', quantity: 3 }),
      browserLine({
        id: 'v3',
        variantId: 'v3',
        quantity: 4,
        isUnavailable: true,
      }),
    ]
    expect(countCartQuantity(items)).toBe(5)
  })
})

describe('describeMergeAdjustments', () => {
  const lines = [
    browserLine({ name: 'Colombia Huila' }),
    browserLine({ id: 'v2', variantId: 'v2', name: 'Kenya AA' }),
  ]

  it('names lowered lines with the stock left and skipped lines', () => {
    const huila = serverLine({ quantity: 5 })
    const cart = {
      items: [
        { ...huila, variant: { ...huila.variant, availableQuantity: 5 } },
      ],
    }

    expect(
      describeMergeAdjustments(
        [
          { productVariantId: 'v1', requestedQuantity: 4, quantity: 2 },
          { productVariantId: 'v2', requestedQuantity: 2, quantity: 0 },
        ],
        lines,
        cart,
      ),
    ).toBe(
      `${ERROR_MESSAGES.CART_MERGE_ADJUSTED}${ERROR_MESSAGES.CART_MERGE_LOWERED('Colombia Huila', 5)}, ${ERROR_MESSAGES.CART_MERGE_SKIPPED('Kenya AA')}.`,
    )
    expect(ERROR_MESSAGES.CART_MERGE_LOWERED('Colombia Huila', 5)).toBe(
      'Colombia Huila (only 5 left)',
    )
    expect(ERROR_MESSAGES.CART_MERGE_SKIPPED('Kenya AA')).toBe(
      'Kenya AA (out of stock)',
    )
  })

  it('treats a line already at the stock as lowered, not skipped', () => {
    const huila = serverLine({ quantity: 5 })
    const cart = {
      items: [
        { ...huila, variant: { ...huila.variant, availableQuantity: 5 } },
      ],
    }

    expect(
      describeMergeAdjustments(
        [{ productVariantId: 'v1', requestedQuantity: 2, quantity: 0 }],
        lines,
        cart,
      ),
    ).toBe(
      `${ERROR_MESSAGES.CART_MERGE_ADJUSTED}${ERROR_MESSAGES.CART_MERGE_LOWERED('Colombia Huila', 5)}.`,
    )
  })

  it('returns null for none', () => {
    expect(describeMergeAdjustments([], lines, null)).toBeNull()
  })
})

describe('describeMergeAdjustments with a line the cart cannot sell', () => {
  it('names a kept line that is unavailable or out of stock as out of stock', () => {
    const lines = [browserLine({ name: 'Colombia Huila' })]
    const huila = serverLine({ isAvailable: false })
    const cart = {
      items: [
        { ...huila, variant: { ...huila.variant, availableQuantity: 0 } },
      ],
    }

    expect(
      describeMergeAdjustments(
        [{ productVariantId: 'v1', requestedQuantity: 2, quantity: 0 }],
        lines,
        cart,
      ),
    ).toBe(
      `${ERROR_MESSAGES.CART_MERGE_ADJUSTED}${ERROR_MESSAGES.CART_MERGE_SKIPPED('Colombia Huila')}.`,
    )
  })
})

describe('countMergedLines', () => {
  it('counts the lines the merge added something to', () => {
    const lines = [
      browserLine(),
      browserLine({ id: 'v2', variantId: 'v2' }),
      browserLine({ id: 'v3', variantId: 'v3' }),
    ]

    expect(
      countMergedLines(lines, [
        { productVariantId: 'v1', requestedQuantity: 2, quantity: 1 },
        { productVariantId: 'v2', requestedQuantity: 2, quantity: 0 },
      ]),
    ).toBe(2)
  })
})
