import type { ReactNode } from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAuth } from '@clerk/nextjs'
import { ShippingMethodStatus } from '@repo/constants'

import { CLERK_SESSION_TEMPLATE, PAGE_SIZE } from '@/constants/common'
import { API_FALLBACK_ERRORS } from '@/constants/messages'
import {
  shippingMethodDetailQueryKey,
  shippingMethodsListQueryKey,
  useCreateShippingMethod,
  useDeleteShippingMethod,
  useShippingMethodById,
  useShippingMethods,
  useUpdateShippingMethod,
} from '@/hooks/useShippingMethod'
import {
  createShippingMethod,
  deleteShippingMethod,
  fetchShippingMethodById,
  fetchShippingMethods,
  updateShippingMethod,
} from '@/services/shippingMethod'
import type { ResponseMeta } from '@/types/api'
import type { ShippingMethod } from '@/types/shippingMethod'

jest.mock('@clerk/nextjs', () => ({ useAuth: jest.fn() }))

jest.mock('@/services/shippingMethod', () => ({
  createShippingMethod: jest.fn(),
  deleteShippingMethod: jest.fn(),
  fetchShippingMethodById: jest.fn(),
  fetchShippingMethods: jest.fn(),
  updateShippingMethod: jest.fn(),
}))

const mockUseAuth = jest.mocked(useAuth)
const mockFetchShippingMethods = jest.mocked(fetchShippingMethods)
const mockFetchShippingMethodById = jest.mocked(fetchShippingMethodById)
const mockCreateShippingMethod = jest.mocked(createShippingMethod)
const mockUpdateShippingMethod = jest.mocked(updateShippingMethod)
const mockDeleteShippingMethod = jest.mocked(deleteShippingMethod)

interface ListCache {
  shippingMethods: ShippingMethod[]
  meta: ResponseMeta | null
}

const method = (
  id: string,
  status: ShippingMethodStatus = ShippingMethodStatus.ACTIVE,
): ShippingMethod => ({
  id,
  name: `Method ${id}`,
  description: 'Delivery',
  price: 12,
  status,
  createdAt: '2026-11-24T00:00:00.000Z',
  updatedAt: '2026-11-24T00:00:00.000Z',
  deletedAt: null,
})

const mockClerk = (isLoaded: boolean, userId: string | null = 'user-1') => {
  const getToken = jest.fn().mockResolvedValue('tok')
  mockUseAuth.mockReturnValue({
    isLoaded,
    userId,
    getToken,
  } as unknown as ReturnType<typeof useAuth>)
  return getToken
}

const createClient = () =>
  new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })

const renderWithClient = <T,>(hook: () => T, client = createClient()) => {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { client, ...renderHook(hook, { wrapper }) }
}

describe('useShippingMethod hooks', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('shippingMethodsListQueryKey includes the filter, page, limit, search and user id', () => {
    expect(
      shippingMethodsListQueryKey(
        {
          status: ShippingMethodStatus.INACTIVE,
          page: 2,
          limit: 10,
          search: 'x',
        },
        'user-1',
      ),
    ).toEqual(['shipping-methods', 'list', 'INACTIVE', 2, 10, 'x', 'user-1'])
    expect(shippingMethodsListQueryKey({}, null)).toEqual([
      'shipping-methods',
      'list',
      'all',
      1,
      PAGE_SIZE,
      '',
      null,
    ])
    expect(shippingMethodDetailQueryKey('sm-1')).toEqual([
      'shipping-methods',
      'detail',
      'sm-1',
    ])
  })

  it('useShippingMethods sends the admin token and waits for Clerk', async () => {
    mockFetchShippingMethods.mockResolvedValue({
      ok: true,
      shippingMethods: [method('S1')],
      meta: undefined,
    })
    mockClerk(false)
    const { rerender, result } = renderWithClient(() =>
      useShippingMethods({ page: 1, limit: 10, search: '' }),
    )

    expect(mockFetchShippingMethods).not.toHaveBeenCalled()

    const getToken = mockClerk(true)
    rerender()

    await waitFor(() => expect(result.current.shippingMethods).toHaveLength(1))
    const options = mockFetchShippingMethods.mock.calls[0]?.[0]
    expect(options).toMatchObject({ page: 1, limit: 10, search: '' })
    await expect(options?.getToken?.()).resolves.toBe('tok')
    expect(getToken).toHaveBeenCalledWith({ template: CLERK_SESSION_TEMPLATE })
  })

  it('useShippingMethods exposes the service error message', async () => {
    mockClerk(true)
    mockFetchShippingMethods.mockResolvedValue({
      ok: false,
      error: API_FALLBACK_ERRORS.SHIPPING_METHODS_LOAD,
    })

    const { result } = renderWithClient(() => useShippingMethods())

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.errorMessage).toBe(
      API_FALLBACK_ERRORS.SHIPPING_METHODS_LOAD,
    )
  })

  it('useShippingMethodById loads the method with the admin token', async () => {
    mockClerk(true)
    mockFetchShippingMethodById.mockResolvedValue({
      ok: true,
      shippingMethod: method('sm-1'),
    })

    const { result } = renderWithClient(() => useShippingMethodById('sm-1'))

    await waitFor(() => expect(result.current.shippingMethod?.id).toBe('sm-1'))
    const [id, options] = mockFetchShippingMethodById.mock.calls[0] ?? []
    expect(id).toBe('sm-1')
    await expect(options?.getToken?.()).resolves.toBe('tok')
  })

  it('useCreateShippingMethod sends an idempotency key and invalidates the lists', async () => {
    mockClerk(true)
    mockCreateShippingMethod.mockResolvedValue({
      ok: true,
      shippingMethod: method('sm-2'),
    })
    const { client, result } = renderWithClient(() => useCreateShippingMethod())
    const invalidateSpy = jest
      .spyOn(client, 'invalidateQueries')
      .mockResolvedValue(undefined)
    const body = { name: 'Same day', description: 'Today', price: 25 }

    await act(() => result.current.mutateAsync(body))

    expect(mockCreateShippingMethod).toHaveBeenCalledWith(body, {
      idempotencyKey: expect.any(String),
    })
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['shipping-methods'],
    })
  })

  it('useUpdateShippingMethod writes the returned method into the cached lists', async () => {
    mockClerk(true)
    const client = createClient()
    const key = shippingMethodsListQueryKey({ page: 1 }, 'user-1')
    client.setQueryData<ListCache>(key, {
      shippingMethods: [method('S1'), method('S2')],
      meta: null,
    })
    const invalidateSpy = jest
      .spyOn(client, 'invalidateQueries')
      .mockResolvedValue(undefined)
    mockUpdateShippingMethod.mockResolvedValue({
      ok: true,
      shippingMethod: method('S1', ShippingMethodStatus.INACTIVE),
    })
    const { result } = renderWithClient(() => useUpdateShippingMethod(), client)

    await act(() =>
      result.current.mutateAsync({
        id: 'S1',
        body: { status: ShippingMethodStatus.INACTIVE },
      }),
    )

    expect(mockUpdateShippingMethod).toHaveBeenCalledWith('S1', {
      status: ShippingMethodStatus.INACTIVE,
    })
    const list = client.getQueryData<ListCache>(key)
    expect(list?.shippingMethods[0]?.status).toBe(ShippingMethodStatus.INACTIVE)
    expect(list?.shippingMethods[1]?.status).toBe(ShippingMethodStatus.ACTIVE)
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['shipping-methods'],
    })
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: shippingMethodDetailQueryKey('S1'),
    })
  })

  it('useUpdateShippingMethod throws the API field errors', async () => {
    mockClerk(true)
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
    mockUpdateShippingMethod.mockResolvedValue({
      ok: false,
      error: 'Shipping method name already exists',
      status: 409,
      errorResponse,
    })
    const { result } = renderWithClient(() => useUpdateShippingMethod())

    await expect(
      act(() =>
        result.current.mutateAsync({ id: 'S1', body: { name: 'Taken' } }),
      ),
    ).rejects.toMatchObject({
      message: 'Shipping method name already exists',
      errors: errorResponse.errors,
    })
  })

  it('useDeleteShippingMethod marks the method deleted in the cached lists', async () => {
    mockClerk(true)
    const client = createClient()
    const key = shippingMethodsListQueryKey({ page: 1 }, 'user-1')
    client.setQueryData<ListCache>(key, {
      shippingMethods: [method('S1'), method('S2')],
      meta: null,
    })
    const invalidateSpy = jest
      .spyOn(client, 'invalidateQueries')
      .mockResolvedValue(undefined)
    mockDeleteShippingMethod.mockResolvedValue({ ok: true })
    const { result } = renderWithClient(() => useDeleteShippingMethod(), client)

    await act(() => result.current.mutateAsync('S1'))

    const list = client.getQueryData<ListCache>(key)
    expect(
      Number.isNaN(Date.parse(list?.shippingMethods[0]?.deletedAt ?? '')),
    ).toBe(false)
    expect(list?.shippingMethods[1]?.deletedAt).toBeNull()
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['shipping-methods'],
    })
  })
})
