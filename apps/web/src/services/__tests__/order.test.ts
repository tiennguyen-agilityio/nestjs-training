import {
  OrderPaymentStatus,
  OrderStatus,
  PaymentMethod,
  ShippingStatus,
} from '@repo/constants'
import type { PlaceOrderPayload } from '@repo/schemas'

import { IDEMPOTENCY } from '@/constants/common'
import { API_FALLBACK_ERRORS } from '@/constants/messages'
import { API_ROUTES } from '@/constants/routes'
import {
  createOrder,
  fetchMyOrders,
  fetchOrderDetail,
  fetchOrders,
} from '@/services/order'
import type { OrderDetail, OrderSummary, PlacedOrder } from '@/types/order'

const body: PlaceOrderPayload = {
  shippingMethodId: '0b0b5b8e-8b0e-4f43-9a55-3c2a1f1d0a01',
  paymentMethod: PaymentMethod.COD,
  recipientName: 'Ada Lovelace',
  recipientPhone: '0912345678',
  addressLine: '1 Analytical St',
  ward: 'Ward 1',
  district: 'Marylebone',
  city: 'London',
  postalCode: 'NW1',
}

const order = { id: 'order-1', orderNumber: 'NB-000123' } as PlacedOrder

const mockResponse = (status: number, json: unknown) =>
  jest.fn().mockResolvedValue({
    ok: status < 400,
    status,
    json: async () => json,
  })

const initOf = (fetchMock: jest.Mock): RequestInit => fetchMock.mock.calls[0][1]

describe('createOrder', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('createOrder posts the body with the Idempotency-Key and unwraps data', async () => {
    const fetchMock = mockResponse(201, {
      statusCode: 201,
      message: 'Created',
      data: order,
    })
    globalThis.fetch = fetchMock as typeof fetch

    const result = await createOrder(body, {
      getToken: async () => 'session-token',
      idempotencyKey: 'key-1',
    })

    expect(fetchMock).toHaveBeenCalledWith(
      API_ROUTES.ORDERS,
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    )
    const init = initOf(fetchMock)
    const headers = init.headers as Headers
    expect(headers.get(IDEMPOTENCY.HEADER)).toBe('key-1')
    expect(headers.get('Authorization')).toBe('Bearer session-token')
    expect(JSON.parse(init.body as string)).toEqual(body)
    expect(result).toEqual({ ok: true, order })
  })

  it('returns the error response on a 400', async () => {
    const errorResponse = {
      statusCode: 400,
      message: 'Validation failed',
      errors: [
        {
          errCode: 'outOfStock',
          field: 'items.0.productVariantId',
          message: 'Only 1 left for COL-HUI-250G',
          description: 'Update your cart and try again.',
        },
      ],
    }
    globalThis.fetch = mockResponse(400, errorResponse) as typeof fetch

    const result = await createOrder(body, { idempotencyKey: 'key-1' })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe(400)
      expect(result.errorResponse?.errors?.[0]?.errCode).toBe('outOfStock')
    }
  })

  it('falls back to ORDER_CREATE on a network error', async () => {
    globalThis.fetch = jest
      .fn()
      .mockRejectedValue(new TypeError('Failed to fetch')) as typeof fetch

    const result = await createOrder(body, { idempotencyKey: 'key-1' })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe(API_FALLBACK_ERRORS.ORDER_CREATE)
    }
  })
})

const summary: OrderSummary = {
  id: 'order-1',
  orderNumber: 'CH-261124-0001',
  userId: 'user-1',
  customer: { firstName: 'Lan', lastName: 'Nguyen', email: 'lan@example.com' },
  status: OrderStatus.PENDING,
  shippingStatus: ShippingStatus.PENDING,
  paymentStatus: OrderPaymentStatus.UNPAID,
  paymentMethod: PaymentMethod.COD,
  itemCount: 2,
  totalAmount: 34.5,
  createdAt: '2026-11-24T08:00:00.000Z',
}

const detail = {
  id: 'order-1',
  orderNumber: 'CH-261124-0001',
  items: [],
  payments: [],
} as unknown as OrderDetail

const meta = { limit: 10, currentPage: 2, pageCount: 2, totalCount: 11 }

const fetchResponse = (body: unknown, status = 200) => ({
  ok: status < 400,
  status,
  json: async () => body,
  text: async () => (body === undefined ? '' : JSON.stringify(body)),
})

const requestInit = (fetchMock: jest.Mock) =>
  fetchMock.mock.calls[0]?.[1] as RequestInit

const getToken = async () => 'tok'

describe('order service (shopper)', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('fetchMyOrders calls GET /orders with page, limit and status', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(fetchResponse({ data: [summary], meta }))
    globalThis.fetch = fetchMock

    const result = await fetchMyOrders({
      getToken,
      page: 2,
      limit: 10,
      status: OrderStatus.PENDING,
    })

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${API_ROUTES.ORDERS}?page=2&limit=10&status=PENDING`,
    )
    expect(requestInit(fetchMock).credentials).toBe('include')
    const headers = requestInit(fetchMock).headers as Headers
    expect(headers.get('Authorization')).toBe('Bearer tok')
    expect(result).toEqual({ ok: true, orders: [summary], meta })
  })

  it('fetchMyOrders leaves status out when not set', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(fetchResponse({ data: [], meta }))
    globalThis.fetch = fetchMock

    await fetchMyOrders({ getToken, page: 1, limit: 10 })

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${API_ROUTES.ORDERS}?page=1&limit=10`,
    )
  })

  it('fetchMyOrders returns the API error on 401', async () => {
    globalThis.fetch = jest
      .fn()
      .mockResolvedValue(
        fetchResponse(
          { statusCode: 401, message: 'Unauthorized', errors: [] },
          401,
        ),
      )

    const result = await fetchMyOrders({ getToken, page: 1, limit: 10 })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.statusCode).toBe(401)
  })

  it('fetchOrderDetail calls GET /orders/:orderNumber', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(fetchResponse({ data: detail }))
    globalThis.fetch = fetchMock

    const result = await fetchOrderDetail('CH 1/2', { getToken })

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${API_ROUTES.ORDERS}/${encodeURIComponent('CH 1/2')}`,
    )
    const headers = requestInit(fetchMock).headers as Headers
    expect(headers.get('Authorization')).toBe('Bearer tok')
    expect(result).toEqual({ ok: true, order: detail })
  })

  it('fetchOrderDetail returns API_FALLBACK_ERRORS.ORDER_LOAD when the body has no message', async () => {
    globalThis.fetch = jest
      .fn()
      .mockResolvedValue(fetchResponse(undefined, 500))

    const result = await fetchOrderDetail('CH-261124-0001', { getToken })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.message).toContain(API_FALLBACK_ERRORS.ORDER_LOAD)
    }
  })
})

describe('order service (admin)', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('fetchOrders sends all=true with the filters', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(fetchResponse({ data: [summary], meta }))
    globalThis.fetch = fetchMock

    const result = await fetchOrders({
      getToken,
      page: 2,
      limit: 10,
      search: ' lan ',
      status: OrderStatus.PENDING,
      shippingStatus: ShippingStatus.SHIPPING,
    })

    const url = new URL(fetchMock.mock.calls[0]?.[0] as string)
    expect(`${url.origin}${url.pathname}`).toBe(API_ROUTES.ORDERS)
    expect(Object.fromEntries(url.searchParams)).toEqual({
      all: 'true',
      page: '2',
      limit: '10',
      search: 'lan',
      status: 'PENDING',
      shippingStatus: 'SHIPPING',
    })
    expect(requestInit(fetchMock).credentials).toBe('include')
    const headers = requestInit(fetchMock).headers as Headers
    expect(headers.get('Authorization')).toBe('Bearer tok')
    expect(result).toEqual({ ok: true, orders: [summary], meta })
  })

  it('fetchOrders sends only all=true without filters', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(fetchResponse({ data: [], meta }))
    globalThis.fetch = fetchMock

    await fetchOrders({ getToken })

    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${API_ROUTES.ORDERS}?all=true`)
  })

  it('fetchOrders returns the API error on 403', async () => {
    globalThis.fetch = jest
      .fn()
      .mockResolvedValue(
        fetchResponse(
          { statusCode: 403, message: 'Forbidden', errors: [] },
          403,
        ),
      )

    const result = await fetchOrders({ getToken })

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({ statusCode: 403 }),
    })
  })
})
