import { ShippingMethodStatus } from '@repo/constants'

import { IDEMPOTENCY } from '@/constants/common'
import { API_FALLBACK_ERRORS } from '@/constants/messages'
import { API_ROUTES } from '@/constants/routes'
import {
  createShippingMethod,
  deleteShippingMethod,
  fetchShippingMethodById,
  fetchShippingMethods,
  updateShippingMethod,
} from '@/services/shippingMethod'

const method = {
  id: 'sm-1',
  name: 'Roast Express',
  description: '1-2 business days',
  price: 12,
  status: ShippingMethodStatus.ACTIVE,
  createdAt: '2026-11-24T00:00:00.000Z',
  updatedAt: '2026-11-24T00:00:00.000Z',
  deletedAt: null,
}

const okResponse = (body: unknown, status = 200) => ({
  ok: true,
  status,
  json: async () => body,
  text: async () => (body === undefined ? '' : JSON.stringify(body)),
})

const requestInit = (fetchMock: jest.Mock, call = 0) =>
  fetchMock.mock.calls[call]?.[1] as RequestInit

describe('shipping method service', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('fetchShippingMethods sends page, limit, search and status with the token', async () => {
    const meta = { limit: 10, currentPage: 2, pageCount: 3, totalCount: 21 }
    const fetchMock = jest
      .fn()
      .mockResolvedValue(okResponse({ data: [method], meta }))
    globalThis.fetch = fetchMock as typeof fetch

    const result = await fetchShippingMethods({
      getToken: async () => 'tok',
      page: 2,
      limit: 10,
      search: ' express ',
      status: ShippingMethodStatus.INACTIVE,
    })

    expect(fetchMock).toHaveBeenCalledWith(
      `${API_ROUTES.SHIPPING_METHODS}?page=2&limit=10&search=express&status=INACTIVE`,
      expect.objectContaining({ credentials: 'include' }),
    )
    expect(
      (requestInit(fetchMock).headers as Headers).get('Authorization'),
    ).toBe('Bearer tok')
    expect(result).toEqual({ ok: true, shippingMethods: [method], meta })
  })

  it('fetchShippingMethodById reads the method from data', async () => {
    const fetchMock = jest.fn().mockResolvedValue(okResponse({ data: method }))
    globalThis.fetch = fetchMock as typeof fetch

    const result = await fetchShippingMethodById(' sm-1 ')

    expect(fetchMock).toHaveBeenCalledWith(
      `${API_ROUTES.SHIPPING_METHODS}/sm-1`,
      expect.objectContaining({ credentials: 'include' }),
    )
    expect(result).toEqual({ ok: true, shippingMethod: method })
  })

  it('createShippingMethod posts the body with the idempotency key', async () => {
    const created = { ...method, id: 'sm-2', name: 'Same day', price: 25 }
    const fetchMock = jest
      .fn()
      .mockResolvedValue(okResponse({ data: created }, 201))
    globalThis.fetch = fetchMock as typeof fetch
    const body = { name: 'Same day', description: 'Today', price: 25 }

    const result = await createShippingMethod(body, {
      idempotencyKey: 'key-1',
    })

    expect(fetchMock).toHaveBeenCalledWith(
      API_ROUTES.SHIPPING_METHODS,
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify(body),
      }),
    )
    expect(
      (requestInit(fetchMock).headers as Headers).get(IDEMPOTENCY.HEADER),
    ).toBe('key-1')
    expect(result).toEqual({ ok: true, shippingMethod: created })
  })

  it('updateShippingMethod patches only the given fields', async () => {
    const updated = { ...method, status: ShippingMethodStatus.INACTIVE }
    const fetchMock = jest.fn().mockResolvedValue(okResponse({ data: updated }))
    globalThis.fetch = fetchMock as typeof fetch

    const result = await updateShippingMethod('sm-1', {
      status: ShippingMethodStatus.INACTIVE,
    })

    expect(fetchMock).toHaveBeenCalledWith(
      `${API_ROUTES.SHIPPING_METHODS}/sm-1`,
      expect.objectContaining({
        method: 'PATCH',
        credentials: 'include',
        body: JSON.stringify({ status: 'INACTIVE' }),
      }),
    )
    expect(result).toEqual({ ok: true, shippingMethod: updated })
  })

  it('deleteShippingMethod returns ok on 204', async () => {
    const fetchMock = jest.fn().mockResolvedValue(okResponse(undefined, 204))
    globalThis.fetch = fetchMock as typeof fetch

    const result = await deleteShippingMethod('a/b')

    expect(fetchMock).toHaveBeenCalledWith(
      `${API_ROUTES.SHIPPING_METHODS}/a%2Fb`,
      expect.objectContaining({ method: 'DELETE', credentials: 'include' }),
    )
    expect(result).toEqual({ ok: true })
  })

  it('a 409 keeps the API error response', async () => {
    const errorResponse = {
      statusCode: 409,
      message: 'Conflict',
      errors: [
        {
          errCode: 'X',
          field: 'name',
          message: 'Shipping method name already exists',
        },
      ],
    }
    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => errorResponse,
    })
    globalThis.fetch = fetchMock as typeof fetch

    const result = await createShippingMethod(
      { name: 'Roast Express', description: '1-2 business days', price: 12 },
      { idempotencyKey: 'key-2' },
    )

    expect(result).toEqual({
      ok: false,
      error: 'Shipping method name already exists',
      status: 409,
      errorResponse,
    })
  })

  it('a failed response without a message returns the fallback error', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ message: '' }),
    })
    globalThis.fetch = fetchMock as typeof fetch

    const result = await fetchShippingMethods()

    expect(result).toEqual({
      ok: false,
      error: `${API_FALLBACK_ERRORS.SHIPPING_METHODS_LOAD} (500)`,
      status: 500,
    })
  })
})
