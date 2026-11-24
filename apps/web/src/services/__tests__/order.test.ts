import { PaymentMethod } from '@repo/constants'
import type { PlaceOrderPayload } from '@repo/schemas'

import { IDEMPOTENCY } from '@/constants/common'
import { API_FALLBACK_ERRORS } from '@/constants/messages'
import { API_ROUTES } from '@/constants/routes'
import { createOrder } from '@/services/order'
import type { PlacedOrder } from '@/types/order'

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
