import type { ReactNode } from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAuth } from '@clerk/nextjs'
import { OrderStatus } from '@repo/constants'

import { CLERK_SESSION_TEMPLATE } from '@/constants/common'
import { API_FALLBACK_ERRORS } from '@/constants/messages'
import { orderQueryKeys, useMyOrders, useOrderDetail } from '@/hooks/useOrder'
import { fetchMyOrders, fetchOrderDetail } from '@/services/order'
import type { OrderDetail, OrderSummary } from '@/types/order'

jest.mock('@clerk/nextjs', () => ({ useAuth: jest.fn() }))

jest.mock('@/services/order', () => ({
  ...jest.requireActual('@/services/order'),
  fetchMyOrders: jest.fn(),
  fetchOrderDetail: jest.fn(),
}))

const mockUseAuth = jest.mocked(useAuth)
const mockFetchMyOrders = jest.mocked(fetchMyOrders)
const mockFetchOrderDetail = jest.mocked(fetchOrderDetail)

const getToken = jest.fn().mockResolvedValue('clerk-token')

const signedIn = (userId = 'u1', isLoaded = true) =>
  mockUseAuth.mockReturnValue({
    isLoaded,
    isSignedIn: isLoaded,
    userId: isLoaded ? userId : null,
    getToken,
  } as unknown as ReturnType<typeof useAuth>)

const renderWithClient = <T, P = undefined>(
  hook: (props: P) => T,
  initialProps?: P,
) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return renderHook(hook, { wrapper, initialProps })
}

const order = { id: 'order-1', orderNumber: 'CH-1' } as OrderSummary
const detail = { id: 'order-1', orderNumber: 'CH-1' } as OrderDetail
const meta = { limit: 10, currentPage: 1, pageCount: 1, totalCount: 1 }

describe('orderQueryKeys', () => {
  it('myOrdersQueryKey and orderDetailQueryKey carry the user id', () => {
    expect(orderQueryKeys.mine('u1', { page: 1 })).toEqual([
      'orders',
      'mine',
      'u1',
      1,
      '',
    ])
    expect(
      orderQueryKeys.mine('u2', { page: 1, status: OrderStatus.PENDING }),
    ).toEqual(['orders', 'mine', 'u2', 1, 'PENDING'])
    expect(orderQueryKeys.detail('u1', 'CH-1')).toEqual([
      'orders',
      'detail',
      'u1',
      'CH-1',
    ])
  })
})

describe('useMyOrders', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    signedIn()
  })

  it('passes page, limit 10 and status to fetchMyOrders', async () => {
    mockFetchMyOrders.mockResolvedValue({ ok: true, orders: [order], meta })

    const { result } = renderWithClient(() =>
      useMyOrders({ page: 2, status: OrderStatus.PENDING }),
    )

    await waitFor(() => expect(result.current.orders).toEqual([order]))
    expect(mockFetchMyOrders).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 2,
        limit: 10,
        status: OrderStatus.PENDING,
      }),
    )
    const { getToken: passed } = mockFetchMyOrders.mock.calls[0][0]
    await passed()
    expect(getToken).toHaveBeenCalledWith({ template: CLERK_SESSION_TEMPLATE })
    expect(result.current.meta).toEqual(meta)
  })

  it('exposes the error message', async () => {
    mockFetchMyOrders.mockResolvedValue({
      ok: false,
      error: { statusCode: 500, message: API_FALLBACK_ERRORS.ORDERS_LOAD },
    })

    const { result } = renderWithClient(() => useMyOrders({ page: 1 }))

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.errorMessage).toBe(API_FALLBACK_ERRORS.ORDERS_LOAD)
  })
})

describe('useMyOrders while keys change', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('reports loading until Clerk is loaded', async () => {
    signedIn('u1', false)

    const { result } = renderWithClient(() => useMyOrders({ page: 1 }))
    await act(() => Promise.resolve())

    expect(result.current.isLoading).toBe(true)
    expect(mockFetchMyOrders).not.toHaveBeenCalled()
  })

  it('is not loading once Clerk reports the shopper signed out', async () => {
    mockUseAuth.mockReturnValue({
      isLoaded: true,
      isSignedIn: false,
      userId: null,
      getToken,
    } as unknown as ReturnType<typeof useAuth>)

    const { result } = renderWithClient(() => useMyOrders({ page: 1 }))
    await act(() => Promise.resolve())

    expect(result.current.isLoading).toBe(false)
    expect(mockFetchMyOrders).not.toHaveBeenCalled()
  })

  it('reports loading again while Retry refetches after an error', async () => {
    signedIn('u1')
    mockFetchMyOrders
      .mockResolvedValueOnce({
        ok: false,
        error: { statusCode: 500, message: API_FALLBACK_ERRORS.ORDERS_LOAD },
      })
      .mockReturnValueOnce(new Promise(() => undefined))
    const { result } = renderWithClient(() => useMyOrders({ page: 1 }))
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.isLoading).toBe(false)

    void act(() => {
      void result.current.refetch()
    })

    await waitFor(() => expect(result.current.isLoading).toBe(true))
  })

  it("never shows the previous user's rows under a new user", async () => {
    signedIn('u1')
    let resolveU2: (
      value: Awaited<ReturnType<typeof fetchMyOrders>>,
    ) => void = () => undefined
    mockFetchMyOrders
      .mockResolvedValueOnce({ ok: true, orders: [order], meta })
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveU2 = resolve
        }),
      )
    const { result, rerender } = renderWithClient(() =>
      useMyOrders({ page: 1 }),
    )
    await waitFor(() => expect(result.current.orders).toEqual([order]))

    signedIn('u2')
    rerender()

    await waitFor(() => expect(mockFetchMyOrders).toHaveBeenCalledTimes(2))
    expect(result.current.orders).toEqual([])
    expect(result.current.isLoading).toBe(true)
    resolveU2({ ok: true, orders: [], meta })
  })

  it('shows loading, not the previous rows, when the status filter changes', async () => {
    signedIn('u1')
    mockFetchMyOrders
      .mockResolvedValueOnce({ ok: true, orders: [order], meta })
      .mockReturnValueOnce(new Promise(() => undefined))
    const initialProps: { status?: OrderStatus } = {
      status: OrderStatus.CANCELLED,
    }
    const { result, rerender } = renderWithClient(
      ({ status }: { status?: OrderStatus }) =>
        useMyOrders(status ? { page: 1, status } : { page: 1 }),
      initialProps,
    )
    await waitFor(() => expect(result.current.meta).toEqual(meta))

    rerender({ status: undefined })

    await waitFor(() => expect(mockFetchMyOrders).toHaveBeenCalledTimes(2))
    expect(result.current.isLoading).toBe(true)
    expect(result.current.orders).toEqual([])
  })

  it('keeps the current rows while the next page loads', async () => {
    signedIn('u1')
    mockFetchMyOrders
      .mockResolvedValueOnce({ ok: true, orders: [order], meta })
      .mockReturnValueOnce(new Promise(() => undefined))
    const { result, rerender } = renderWithClient(
      ({ page }: { page: number }) => useMyOrders({ page }),
      { page: 1 },
    )
    await waitFor(() => expect(result.current.orders).toEqual([order]))

    rerender({ page: 2 })

    await waitFor(() => expect(mockFetchMyOrders).toHaveBeenCalledTimes(2))
    expect(result.current.orders).toEqual([order])
    expect(result.current.isLoading).toBe(false)
  })
})

describe('useOrderDetail', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    signedIn()
  })

  it('reports loading until Clerk is loaded', async () => {
    signedIn('u1', false)

    const { result } = renderWithClient(() => useOrderDetail('CH-1'))
    await act(() => Promise.resolve())

    expect(result.current.isLoading).toBe(true)
    expect(mockFetchOrderDetail).not.toHaveBeenCalled()
  })

  it('exposes the error message and reports loading while Retry refetches', async () => {
    mockFetchOrderDetail
      .mockResolvedValueOnce({
        ok: false,
        error: { statusCode: 404, message: API_FALLBACK_ERRORS.ORDER_LOAD },
      })
      .mockReturnValueOnce(new Promise(() => undefined))
    const { result } = renderWithClient(() => useOrderDetail('CH-1'))

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.errorMessage).toBe(API_FALLBACK_ERRORS.ORDER_LOAD)
    expect(result.current.isLoading).toBe(false)

    void act(() => {
      void result.current.refetch()
    })

    await waitFor(() => expect(result.current.isLoading).toBe(true))
  })

  it('does not fetch without an orderNumber', async () => {
    const { result } = renderWithClient(() => useOrderDetail(null))
    await act(() => Promise.resolve())

    expect(mockFetchOrderDetail).not.toHaveBeenCalled()
    expect(result.current.order).toBeNull()
  })

  it('returns the order', async () => {
    mockFetchOrderDetail.mockResolvedValue({ ok: true, order: detail })

    const { result } = renderWithClient(() => useOrderDetail('CH-1'))

    await waitFor(() => expect(result.current.order).toEqual(detail))
    expect(mockFetchOrderDetail).toHaveBeenCalledWith(
      'CH-1',
      expect.objectContaining({ getToken: expect.any(Function) }),
    )
  })
})
