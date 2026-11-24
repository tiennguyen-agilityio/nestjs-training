import { ShippingMethodStatus, VALIDATION_RULES } from '@repo/constants'

import { API_FALLBACK_ERRORS } from '@/constants/messages'
import { API_ROUTES } from '@/constants/routes'
import { fetchShippingMethods } from '@/services/shippingMethod'
import type { ShippingMethod } from '@/types/shippingMethod'

const standard: ShippingMethod = {
  id: 'standard-id',
  name: 'Artisanal Standard',
  description: '3-5 business days',
  price: 0,
  status: ShippingMethodStatus.ACTIVE,
  createdAt: '2026-11-24T00:00:00.000Z',
  updatedAt: '2026-11-24T00:00:00.000Z',
  deletedAt: null,
}

const express: ShippingMethod = {
  ...standard,
  id: 'express-id',
  name: 'Roast Express',
  description: '1-2 business days',
  price: 12,
}

const meta = { limit: 100, currentPage: 1, pageCount: 1, totalCount: 2 }

describe('shipping method service', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  const mockFetch = (response: {
    ok: boolean
    status: number
    body: unknown
  }) => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: response.ok,
      status: response.status,
      json: async () => response.body,
      text: async () => JSON.stringify(response.body),
    })
    globalThis.fetch = fetchMock as typeof fetch
    return fetchMock
  }

  it('fetchShippingMethods requests the list without a token and returns the methods', async () => {
    const fetchMock = mockFetch({
      ok: true,
      status: 200,
      body: { data: [standard, express], meta },
    })

    const result = await fetchShippingMethods()

    const [url, init] = fetchMock.mock.calls[0]
    const requestUrl = new URL(url as string)
    expect(`${requestUrl.origin}${requestUrl.pathname}`).toBe(
      API_ROUTES.SHIPPING_METHODS,
    )
    expect(requestUrl.searchParams.get('limit')).toBe(
      String(VALIDATION_RULES.PAGINATION.MAX_LIMIT),
    )
    // An admin's session cookie would otherwise list every method.
    expect(requestUrl.searchParams.get('status')).toBe(
      ShippingMethodStatus.ACTIVE,
    )
    expect(requestUrl.searchParams.has('sortBy')).toBe(false)
    expect(init).toEqual(expect.objectContaining({ credentials: 'include' }))
    expect(result).toEqual({ ok: true, shippingMethods: [standard, express] })
  })

  it('fetchShippingMethods drops INACTIVE and deleted methods', async () => {
    const inactive: ShippingMethod = {
      ...express,
      id: 'inactive-id',
      status: ShippingMethodStatus.INACTIVE,
    }
    const deleted: ShippingMethod = {
      ...express,
      id: 'deleted-id',
      deletedAt: '2026-11-24T01:00:00.000Z',
    }
    mockFetch({
      ok: true,
      status: 200,
      body: { data: [standard, inactive, deleted], meta },
    })

    const result = await fetchShippingMethods()

    expect(result).toEqual({ ok: true, shippingMethods: [standard] })
  })

  it('fetchShippingMethods returns the fallback error when the request fails', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error('not json')
      },
      text: async () => 'Internal Server Error',
    })
    globalThis.fetch = fetchMock as typeof fetch

    const result = await fetchShippingMethods()

    expect(result).toEqual(
      expect.objectContaining({
        ok: false,
        // apiClient appends the status to the fallback message.
        error: `${API_FALLBACK_ERRORS.SHIPPING_METHODS_LOAD} (500)`,
        status: 500,
      }),
    )
  })
})
