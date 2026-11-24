import type { ReactNode } from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import {
  QueryClient,
  QueryClientProvider,
  onlineManager,
} from '@tanstack/react-query'
import { ShippingMethodStatus } from '@repo/constants'

import { API_FALLBACK_ERRORS } from '@/constants/messages'
import {
  shippingMethodsListQueryKey,
  useShippingMethods,
} from '@/hooks/useShippingMethod'
import { fetchShippingMethods } from '@/services/shippingMethod'
import type { ShippingMethod } from '@/types/shippingMethod'

jest.mock('@/services/shippingMethod', () => ({
  fetchShippingMethods: jest.fn(),
}))

const mockFetchShippingMethods = jest.mocked(fetchShippingMethods)

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

const renderWithClient = () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { client, ...renderHook(() => useShippingMethods(), { wrapper }) }
}

describe('useShippingMethods', () => {
  it('shippingMethodsListQueryKey is under the shipping-methods root', () => {
    expect(shippingMethodsListQueryKey()).toEqual(['shipping-methods', 'list'])
  })

  it('returns the methods from the service', async () => {
    mockFetchShippingMethods.mockResolvedValue({
      ok: true,
      shippingMethods: [standard],
    })

    const { client, result } = renderWithClient()

    await waitFor(() =>
      expect(result.current.shippingMethods).toEqual([standard]),
    )
    expect(result.current.isLoading).toBe(false)
    expect(result.current.isError).toBe(false)
    expect(client.getQueryData(shippingMethodsListQueryKey())).toEqual([
      standard,
    ])
  })

  it('stays loading while the request is paused offline', async () => {
    onlineManager.setOnline(false)
    try {
      mockFetchShippingMethods.mockResolvedValue({
        ok: true,
        shippingMethods: [standard],
      })

      const { result } = renderWithClient()

      // A paused query is not fetching, but it has no answer yet either.
      await waitFor(() => expect(result.current.isFetching).toBe(false))
      expect(result.current.isLoading).toBe(true)
      expect(result.current.isError).toBe(false)
    } finally {
      onlineManager.setOnline(true)
    }
  })

  it('returns the service error message', async () => {
    mockFetchShippingMethods.mockResolvedValue({
      ok: false,
      error: API_FALLBACK_ERRORS.SHIPPING_METHODS_LOAD,
    })

    const { result } = renderWithClient()

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.errorMessage).toBe(
      API_FALLBACK_ERRORS.SHIPPING_METHODS_LOAD,
    )
    expect(result.current.shippingMethods).toEqual([])
  })

  it('is loading again while Retry refetches after a failed load', async () => {
    mockFetchShippingMethods.mockResolvedValueOnce({
      ok: false,
      error: API_FALLBACK_ERRORS.SHIPPING_METHODS_LOAD,
    })
    const { result } = renderWithClient()
    await waitFor(() => expect(result.current.isError).toBe(true))

    // The retry stays in flight so the hook is caught while it fetches.
    mockFetchShippingMethods.mockReturnValueOnce(
      new Promise<never>(() => undefined),
    )
    act(() => {
      void result.current.refetch()
    })

    await waitFor(() => expect(result.current.isLoading).toBe(true))
  })
})
