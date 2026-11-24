import {
  OrderPaymentStatus,
  OrderStatus,
  PaymentMethod,
  ShippingStatus,
} from '@repo/constants'

import { API_FALLBACK_ERRORS } from '@/constants/messages'
import { API_ROUTES } from '@/constants/routes'
import { fetchMyOrders, fetchOrderDetail } from '@/services/order'
import type { OrderDetail, OrderSummary } from '@/types/order'

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

const response = (body: unknown, status = 200) => ({
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
      .mockResolvedValue(response({ data: [summary], meta }))
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
    const fetchMock = jest.fn().mockResolvedValue(response({ data: [], meta }))
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
        response({ statusCode: 401, message: 'Unauthorized', errors: [] }, 401),
      )

    const result = await fetchMyOrders({ getToken, page: 1, limit: 10 })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.statusCode).toBe(401)
  })

  it('fetchOrderDetail calls GET /orders/:orderNumber', async () => {
    const fetchMock = jest.fn().mockResolvedValue(response({ data: detail }))
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
    globalThis.fetch = jest.fn().mockResolvedValue(response(undefined, 500))

    const result = await fetchOrderDetail('CH-261124-0001', { getToken })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.message).toContain(API_FALLBACK_ERRORS.ORDER_LOAD)
    }
  })
})
