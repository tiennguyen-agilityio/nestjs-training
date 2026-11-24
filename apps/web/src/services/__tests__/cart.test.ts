import { ProductStatus } from '@repo/constants'

import { IDEMPOTENCY } from '@/constants/common'
import { API_ROUTES } from '@/constants/routes'
import {
  addCartItem,
  fetchCart,
  mergeCart,
  removeCartItem,
  updateCartItem,
} from '@/services/cart'
import type { MergedServerCart, ServerCart } from '@/types/cart'

const cart: ServerCart = {
  id: 'cart-1',
  userId: 'user-1',
  items: [
    {
      id: 'line-1',
      productVariantId: 'v1',
      quantity: 2,
      product: {
        id: 'p1',
        name: 'Colombia Huila',
        slug: 'colombia-huila',
        status: ProductStatus.ACTIVE,
        primaryImageUrl: null,
      },
      variant: {
        sku: 'COL-250G',
        sizeName: '250g',
        price: 14,
        discountType: null,
        discountValue: 0,
        salePrice: 14,
        availableQuantity: 5,
      },
      inStock: true,
      isAvailable: true,
      lineTotal: 28,
      createdAt: '2026-11-24T00:00:00.000Z',
      updatedAt: '2026-11-24T00:00:00.000Z',
    },
  ],
  totalQuantity: 2,
  subTotal: 28,
  createdAt: '2026-11-24T00:00:00.000Z',
  updatedAt: '2026-11-24T00:00:00.000Z',
}

const okResponse = (body: unknown, status = 200) => ({
  ok: true,
  status,
  json: async () => body,
  text: async () => (body === undefined ? '' : JSON.stringify(body)),
})

const requestInit = (fetchMock: jest.Mock, call = 0) =>
  fetchMock.mock.calls[call]?.[1] as RequestInit

describe('cart service', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('fetchCart › GETs API_ROUTES.CART with credentials include and returns data', async () => {
    const fetchMock = jest.fn().mockResolvedValue(okResponse({ data: cart }))
    globalThis.fetch = fetchMock

    const result = await fetchCart({ getToken: async () => null })

    expect(fetchMock.mock.calls[0]?.[0]).toBe(API_ROUTES.CART)
    expect(requestInit(fetchMock).method).toBe('GET')
    expect(requestInit(fetchMock).credentials).toBe('include')
    expect(result).toEqual({ ok: true, cart })
  })

  it('sends the bearer token from getToken', async () => {
    const fetchMock = jest.fn().mockResolvedValue(okResponse({ data: cart }))
    globalThis.fetch = fetchMock

    await fetchCart({ getToken: async () => 'tok' })

    const headers = requestInit(fetchMock).headers as Headers
    expect(headers.get('Authorization')).toBe('Bearer tok')
  })

  it('addCartItem › POSTs the body with the Idempotency-Key header', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(okResponse({ data: cart }, 201))
    globalThis.fetch = fetchMock

    const result = await addCartItem(
      { productVariantId: 'v1', quantity: 2 },
      { getToken: async () => 'tok', idempotencyKey: 'key-1' },
    )

    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${API_ROUTES.CART}/items`)
    expect(requestInit(fetchMock).method).toBe('POST')
    expect(JSON.parse(requestInit(fetchMock).body as string)).toEqual({
      productVariantId: 'v1',
      quantity: 2,
    })
    const headers = requestInit(fetchMock).headers as Headers
    expect(headers.get(IDEMPOTENCY.HEADER)).toBe('key-1')
    expect(result).toEqual({ ok: true, cart })
  })

  it('updateCartItem › PATCHes the line by cart item id', async () => {
    const fetchMock = jest.fn().mockResolvedValue(okResponse({ data: cart }))
    globalThis.fetch = fetchMock

    const result = await updateCartItem(
      'line-1',
      { quantity: 3 },
      { getToken: async () => 'tok' },
    )

    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${API_ROUTES.CART}/items/line-1`)
    expect(requestInit(fetchMock).method).toBe('PATCH')
    expect(JSON.parse(requestInit(fetchMock).body as string)).toEqual({
      quantity: 3,
    })
    expect(result).toEqual({ ok: true, cart })
  })

  it('removeCartItem › DELETEs the line by cart item id', async () => {
    const fetchMock = jest.fn().mockResolvedValue(okResponse({ data: cart }))
    globalThis.fetch = fetchMock

    const result = await removeCartItem('line-1', {
      getToken: async () => 'tok',
    })

    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${API_ROUTES.CART}/items/line-1`)
    expect(requestInit(fetchMock).method).toBe('DELETE')
    expect(result).toEqual({ ok: true })
  })

  it('mergeCart › POSTs items with the key and returns the cart with adjusted', async () => {
    const merged: MergedServerCart = {
      ...cart,
      adjusted: [{ productVariantId: 'v2', requestedQuantity: 1, quantity: 0 }],
    }
    const fetchMock = jest.fn().mockResolvedValue(okResponse({ data: merged }))
    globalThis.fetch = fetchMock

    const result = await mergeCart(
      { items: [{ productVariantId: 'v1', quantity: 2 }] },
      { getToken: async () => 'tok', idempotencyKey: 'key-2' },
    )

    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${API_ROUTES.CART}/merge`)
    expect(requestInit(fetchMock).method).toBe('POST')
    expect(JSON.parse(requestInit(fetchMock).body as string)).toEqual({
      items: [{ productVariantId: 'v1', quantity: 2 }],
    })
    const headers = requestInit(fetchMock).headers as Headers
    expect(headers.get(IDEMPOTENCY.HEADER)).toBe('key-2')
    expect(result).toEqual({ ok: true, cart: merged })
  })

  it('returns the API error message on a 409', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({
        statusCode: 409,
        message: 'Conflict',
        errors: [{ message: 'Only 3 left for this variant' }],
      }),
    })
    globalThis.fetch = fetchMock

    const result = await addCartItem(
      { productVariantId: 'v1', quantity: 9 },
      { getToken: async () => 'tok', idempotencyKey: 'key-3' },
    )

    expect(result).toMatchObject({
      ok: false,
      error: 'Only 3 left for this variant',
      status: 409,
    })
  })
})
