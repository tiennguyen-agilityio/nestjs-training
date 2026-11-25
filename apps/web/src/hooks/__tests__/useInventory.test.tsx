import type { ReactNode } from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAuth } from '@clerk/nextjs'

import {
  inventoryQueryKeys,
  useInventory,
  useInventoryItem,
  useLowStockCount,
  useRestockVariant,
} from '@/hooks/useInventory'
import {
  fetchInventory,
  fetchInventoryItem,
  restockVariant,
} from '@/services/inventory'

jest.mock('@clerk/nextjs', () => ({ useAuth: jest.fn() }))
jest.mock('@/services/inventory', () => ({
  fetchInventory: jest.fn(),
  fetchInventoryItem: jest.fn(),
  restockVariant: jest.fn(),
  adjustVariant: jest.fn(),
  fetchVariantMovements: jest.fn(),
}))

const mockUseAuth = jest.mocked(useAuth)
const mockFetchInventory = jest.mocked(fetchInventory)
const mockRestock = jest.mocked(restockVariant)
const meta = { limit: 10, currentPage: 1, pageCount: 1, totalCount: 3 }

const signedIn = () =>
  mockUseAuth.mockReturnValue({
    isLoaded: true,
    isSignedIn: true,
    userId: 'u1',
    getToken: jest.fn().mockResolvedValue('tok'),
  } as unknown as ReturnType<typeof useAuth>)

const renderWithClient = <T,>(hook: () => T) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const invalidate = jest.spyOn(client, 'invalidateQueries')
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { ...renderHook(hook, { wrapper }), invalidate, wrapper }
}

describe('useInventory', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    signedIn()
  })

  it('inventoryQueryKeys carry the user id under the inventory root', () => {
    expect(inventoryQueryKeys.list('u1', { page: 2, lowStock: true })).toEqual([
      'inventory',
      'list',
      'u1',
      2,
      10,
      '',
      true,
    ])
    expect(inventoryQueryKeys.item('u1', 'v-1')).toEqual([
      'inventory',
      'item',
      'u1',
      'v-1',
    ])
    expect(inventoryQueryKeys.lowStockCount('u1')).toEqual([
      'inventory',
      'low-stock-count',
      'u1',
    ])
  })

  it('useInventory exposes the service error message', async () => {
    mockFetchInventory.mockResolvedValue({
      ok: false,
      error: {
        statusCode: 500,
        message: 'Could not load inventory',
        errors: [],
      },
    })

    const { result } = renderWithClient(() => useInventory({ page: 1 }))

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.errorMessage).toBe('Could not load inventory')
  })

  it('useInventoryItem reports a 404 as not found', async () => {
    jest.mocked(fetchInventoryItem).mockResolvedValue({
      ok: false,
      error: {
        statusCode: 404,
        message: 'Product variant not found',
        errors: [],
      },
    })

    const { result } = renderWithClient(() => useInventoryItem('v-1'))

    await waitFor(() => expect(result.current.isNotFound).toBe(true))
    expect(fetchInventoryItem).toHaveBeenCalledTimes(1)
  })

  it('useInventoryItem refetches a cached variant when it mounts again', async () => {
    jest.mocked(fetchInventoryItem).mockResolvedValue({
      ok: true,
      item: { id: 'v-1' } as never,
    })

    const first = renderWithClient(() => useInventoryItem('v-1'))
    await waitFor(() => expect(first.result.current.item).not.toBeNull())
    first.unmount()
    const { result } = renderHook(() => useInventoryItem('v-1'), {
      wrapper: first.wrapper,
    })

    await waitFor(() => expect(fetchInventoryItem).toHaveBeenCalledTimes(2))
    expect(result.current.item).not.toBeNull()
  })

  it('useLowStockCount reads the count of ACTIVE low-stock variants', async () => {
    mockFetchInventory.mockResolvedValue({ ok: true, items: [], meta })

    const { result } = renderWithClient(() => useLowStockCount())

    await waitFor(() => expect(result.current.count).toBe(3))
    expect(mockFetchInventory).toHaveBeenCalledWith(
      expect.objectContaining({ lowStock: true, activeOnly: true, limit: 1 }),
    )
  })

  it('two restocks of 10 in a row send two keys', async () => {
    mockRestock.mockResolvedValue({
      ok: true,
      result: { variant: {}, movement: {} },
    } as never)

    const { result, invalidate } = renderWithClient(() => useRestockVariant())

    await act(() =>
      result.current.mutateAsync({ variantId: 'v-1', body: { quantity: 10 } }),
    )
    await act(() =>
      result.current.mutateAsync({ variantId: 'v-1', body: { quantity: 10 } }),
    )

    const keys = mockRestock.mock.calls.map(
      ([, , options]) => options.idempotencyKey,
    )
    expect(keys).toHaveLength(2)
    expect(keys[0]).not.toBe(keys[1])
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['inventory'] })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['products'] })
  })
})
