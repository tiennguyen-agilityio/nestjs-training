import type { ReactNode } from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAuth } from '@clerk/nextjs'
import {
  OrderPaymentStatus,
  OrderStatus,
  PaymentMethod,
  ShippingStatus,
} from '@repo/constants'
import type { PlaceOrderPayload } from '@repo/schemas'

import { CLERK_SESSION_TEMPLATE, PAGE_SIZE } from '@/constants/common'
import { API_FALLBACK_ERRORS } from '@/constants/messages'
import { ORDER_PAYMENT_POLL } from '@/constants/order'
import {
  orderDetailRetry,
  ordersQueryKeys,
  useCancelOrder,
  useCreateOrder,
  useMyOrders,
  useOrderDetail,
  useOrders,
} from '@/hooks/useOrder'
import {
  cancelOrder,
  createOrder,
  fetchMyOrders,
  fetchOrderDetail,
  fetchOrders,
} from '@/services/order'
import type { OrderDetail, OrderSummary, PlacedOrder } from '@/types/order'
import { ServiceError } from '@/utils/query'

jest.mock('@clerk/nextjs', () => ({ useAuth: jest.fn() }))

jest.mock('@/services/order', () => ({
  cancelOrder: jest.fn(),
  createOrder: jest.fn(),
  deleteOrder: jest.fn(),
  fetchOrders: jest.fn(),
  updateOrderShippingStatus: jest.fn(),
  updateOrderStatus: jest.fn(),
  fetchMyOrders: jest.fn(),
  fetchOrderDetail: jest.fn(),
}))

const mockCreateOrder = jest.mocked(createOrder)

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
const getToken = async () => 'session-token'

const outOfStock = {
  ok: false as const,
  status: 400,
  error: 'Validation failed',
  errorResponse: {
    statusCode: 400,
    message: 'Validation failed',
    errors: [
      {
        errCode: 'outOfStock',
        field: 'items.0.productVariantId',
        message: 'Only 1 left',
        description: 'Update your cart and try again.',
      },
    ],
  },
}

const setup = () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const invalidate = jest.spyOn(client, 'invalidateQueries')
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  const view = renderHook(() => useCreateOrder(), { wrapper })
  return { ...view, invalidate }
}

const keyOfCall = (n: number) =>
  mockCreateOrder.mock.calls[n]?.[1].idempotencyKey

describe('useCreateOrder', () => {
  beforeEach(() => mockCreateOrder.mockReset())

  it('useCreateOrder reuses the key for the same body and invalidates the orders root', async () => {
    mockCreateOrder
      .mockResolvedValueOnce({ ok: false, error: 'Network error' })
      .mockResolvedValueOnce({ ok: true, order })
      .mockResolvedValueOnce({ ok: true, order })
    const { result, invalidate } = setup()

    await act(async () => {
      await result.current.mutateAsync({ body, getToken }).catch(() => null)
    })
    await act(async () => {
      await result.current.mutateAsync({ body, getToken })
    })
    expect(keyOfCall(0)).toEqual(expect.any(String))
    expect(keyOfCall(1)).toBe(keyOfCall(0))
    expect(mockCreateOrder.mock.calls[1]?.[1].getToken).toBe(getToken)
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ordersQueryKeys.root })
    expect(ordersQueryKeys.root).toEqual(['orders'])

    await act(async () => {
      await result.current.mutateAsync({ body, getToken })
    })
    expect(keyOfCall(2)).not.toBe(keyOfCall(1))
  })

  it('sends a new key when the body changes', async () => {
    mockCreateOrder.mockResolvedValue({ ok: false, error: 'Network error' })
    const { result } = setup()

    await act(async () => {
      await result.current.mutateAsync({ body, getToken }).catch(() => null)
    })
    await act(async () => {
      await result.current
        .mutateAsync({ body: { ...body, ward: 'Ward 2' }, getToken })
        .catch(() => null)
    })
    expect(keyOfCall(1)).not.toBe(keyOfCall(0))
  })

  it('throws a ServiceError carrying the API errors', async () => {
    mockCreateOrder.mockResolvedValue(outOfStock)
    const { result } = setup()

    let caught: unknown
    await act(async () => {
      caught = await result.current
        .mutateAsync({ body, getToken })
        .catch((error: unknown) => error)
    })

    expect(caught).toBeInstanceOf(ServiceError)
    expect((caught as ServiceError).errors[0]?.errCode).toBe('outOfStock')
  })
})

const mockUseAuth = jest.mocked(useAuth)
const mockFetchMyOrders = jest.mocked(fetchMyOrders)
const mockFetchOrderDetail = jest.mocked(fetchOrderDetail)
const mockFetchOrders = jest.mocked(fetchOrders)

const clerkGetToken = jest.fn().mockResolvedValue('clerk-token')

const signedIn = (userId = 'u1', isLoaded = true) =>
  mockUseAuth.mockReturnValue({
    isLoaded,
    isSignedIn: isLoaded,
    userId: isLoaded ? userId : null,
    getToken: clerkGetToken,
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

const summaryRow = { id: 'order-1', orderNumber: 'CH-1' } as OrderSummary
const detail = { id: 'order-1', orderNumber: 'CH-1' } as OrderDetail
const meta = { limit: 10, currentPage: 1, pageCount: 1, totalCount: 1 }

describe('ordersQueryKeys', () => {
  it('myOrdersQueryKey and orderDetailQueryKey carry the user id', () => {
    expect(ordersQueryKeys.mine('u1', { page: 1 })).toEqual([
      'orders',
      'mine',
      'u1',
      1,
      '',
    ])
    expect(
      ordersQueryKeys.mine('u2', { page: 1, status: OrderStatus.PENDING }),
    ).toEqual(['orders', 'mine', 'u2', 1, 'PENDING'])
    expect(ordersQueryKeys.detail('u1', 'CH-1')).toEqual([
      'orders',
      'detail',
      'u1',
      'CH-1',
    ])
  })
})

describe('ordersQueryKeys.all', () => {
  it('ordersQueryKeys.all carries the user id and the filters', () => {
    expect(ordersQueryKeys.all('u1', {})).toEqual([
      'orders',
      'all',
      'u1',
      1,
      PAGE_SIZE,
      '',
      '',
      '',
    ])
    expect(
      ordersQueryKeys.all('u2', {
        page: 3,
        limit: 20,
        search: 'lan',
        status: OrderStatus.PENDING,
        shippingStatus: ShippingStatus.SHIPPING,
      }),
    ).toEqual(['orders', 'all', 'u2', 3, 20, 'lan', 'PENDING', 'SHIPPING'])
  })
})

describe('useOrders', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('useOrders waits for Clerk and a signed-in user', async () => {
    signedIn('u1', false)

    const { result } = renderWithClient(() => useOrders({ page: 1 }))

    expect(result.current.isLoading).toBe(true)
    expect(mockFetchOrders).not.toHaveBeenCalled()
  })

  it('useOrders passes the filters and the session token to fetchOrders', async () => {
    signedIn()
    mockFetchOrders.mockResolvedValue({ ok: true, orders: [summaryRow], meta })

    const { result } = renderWithClient(() =>
      useOrders({ page: 2, search: 'lan', status: OrderStatus.PENDING }),
    )

    await waitFor(() => expect(result.current.orders).toEqual([summaryRow]))
    expect(mockFetchOrders).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 2,
        search: 'lan',
        status: OrderStatus.PENDING,
      }),
    )
    const passed = mockFetchOrders.mock.calls[0][0]?.getToken
    await passed?.()
    expect(clerkGetToken).toHaveBeenCalledWith({
      template: CLERK_SESSION_TEMPLATE,
    })
    expect(result.current.meta).toEqual(meta)
  })

  it('useOrders exposes the service error message', async () => {
    signedIn()
    mockFetchOrders.mockResolvedValue({
      ok: false,
      error: { statusCode: 403, message: 'Forbidden', errors: [] },
    })

    const { result } = renderWithClient(() => useOrders({ page: 1 }))

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.errorMessage).toBe('Forbidden')
  })
})

describe('useMyOrders', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    signedIn()
  })

  it('passes page, limit 10 and status to fetchMyOrders', async () => {
    mockFetchMyOrders.mockResolvedValue({
      ok: true,
      orders: [summaryRow],
      meta,
    })

    const { result } = renderWithClient(() =>
      useMyOrders({ page: 2, status: OrderStatus.PENDING }),
    )

    await waitFor(() => expect(result.current.orders).toEqual([summaryRow]))
    expect(mockFetchMyOrders).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 2,
        limit: 10,
        status: OrderStatus.PENDING,
      }),
    )
    const { getToken: passed } = mockFetchMyOrders.mock.calls[0][0]
    await passed()
    expect(clerkGetToken).toHaveBeenCalledWith({
      template: CLERK_SESSION_TEMPLATE,
    })
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
      getToken: clerkGetToken,
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
      .mockResolvedValueOnce({ ok: true, orders: [summaryRow], meta })
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveU2 = resolve
        }),
      )
    const { result, rerender } = renderWithClient(() =>
      useMyOrders({ page: 1 }),
    )
    await waitFor(() => expect(result.current.orders).toEqual([summaryRow]))

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
      .mockResolvedValueOnce({ ok: true, orders: [summaryRow], meta })
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
      .mockResolvedValueOnce({ ok: true, orders: [summaryRow], meta })
      .mockReturnValueOnce(new Promise(() => undefined))
    const { result, rerender } = renderWithClient(
      ({ page }: { page: number }) => useMyOrders({ page }),
      { page: 1 },
    )
    await waitFor(() => expect(result.current.orders).toEqual([summaryRow]))

    rerender({ page: 2 })

    await waitFor(() => expect(mockFetchMyOrders).toHaveBeenCalledTimes(2))
    expect(result.current.orders).toEqual([summaryRow])
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
        error: { statusCode: 500, message: API_FALLBACK_ERRORS.ORDER_LOAD },
      })
      .mockResolvedValueOnce({
        ok: false,
        error: { statusCode: 500, message: API_FALLBACK_ERRORS.ORDER_LOAD },
      })
      .mockReturnValueOnce(new Promise(() => undefined))
    const { result } = renderWithClient(() => useOrderDetail('CH-1'))

    // A non-404 error is retried once before the query fails.
    await waitFor(() => expect(result.current.isError).toBe(true), {
      timeout: 4000,
    })
    expect(mockFetchOrderDetail).toHaveBeenCalledTimes(2)
    expect(result.current.errorMessage).toBe(API_FALLBACK_ERRORS.ORDER_LOAD)
    expect(result.current.isNotFound).toBe(false)
    expect(result.current.isLoading).toBe(false)

    void act(() => {
      void result.current.refetch()
    })

    await waitFor(() => expect(result.current.isLoading).toBe(true))
  })

  it('reports isNotFound for a 404', async () => {
    mockFetchOrderDetail.mockResolvedValueOnce({
      ok: false,
      error: { statusCode: 404, message: 'Order not found' },
    })
    const { result } = renderWithClient(() => useOrderDetail('CH-404'))

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.isNotFound).toBe(true)
    expect(mockFetchOrderDetail).toHaveBeenCalledTimes(1)
  })

  it('does not retry a 404, but retries other errors once', () => {
    const retry = orderDetailRetry
    expect(retry(0, Object.assign(new Error('x'), { statusCode: 404 }))).toBe(
      false,
    )
    expect(retry(0, Object.assign(new Error('x'), { statusCode: 500 }))).toBe(
      true,
    )
    expect(retry(1, Object.assign(new Error('x'), { statusCode: 500 }))).toBe(
      false,
    )
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

describe('useOrderDetail polling', () => {
  const pending = {
    ...detail,
    paymentStatus: OrderPaymentStatus.PENDING,
  } as OrderDetail
  const paid = {
    ...detail,
    paymentStatus: OrderPaymentStatus.PAID,
  } as OrderDetail

  const advance = (ms: number) =>
    act(async () => {
      await jest.advanceTimersByTimeAsync(ms)
    })

  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers()
    signedIn()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('without a poll option it fetches once', async () => {
    mockFetchOrderDetail.mockResolvedValue({ ok: true, order: pending })
    const { result } = renderWithClient(() => useOrderDetail('o-1'))

    await advance(ORDER_PAYMENT_POLL.INTERVAL_MS * 3)

    expect(result.current.order).toEqual(pending)
    expect(mockFetchOrderDetail).toHaveBeenCalledTimes(1)
    expect(result.current.isPollExhausted).toBe(false)
  })

  it('polls while pollWhile holds, at most ORDER_PAYMENT_POLL.MAX_TRIES times', async () => {
    mockFetchOrderDetail.mockResolvedValue({ ok: true, order: pending })
    const { result } = renderWithClient(() =>
      useOrderDetail('o-1', { pollWhile: () => true }),
    )

    await advance(
      ORDER_PAYMENT_POLL.INTERVAL_MS * (ORDER_PAYMENT_POLL.MAX_TRIES + 3),
    )

    expect(mockFetchOrderDetail).toHaveBeenCalledTimes(
      1 + ORDER_PAYMENT_POLL.MAX_TRIES,
    )
    expect(result.current.isPollExhausted).toBe(true)
  })

  it('counts polls from mount, not the cached query updates', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    for (let i = 0; i < ORDER_PAYMENT_POLL.MAX_TRIES + 2; i += 1) {
      client.setQueryData(ordersQueryKeys.detail('u1', 'o-1'), pending)
    }
    mockFetchOrderDetail.mockResolvedValue({ ok: true, order: pending })
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    const { result } = renderHook(
      () => useOrderDetail('o-1', { pollWhile: () => true }),
      { wrapper },
    )

    expect(result.current.isPollExhausted).toBe(false)
    await advance(
      ORDER_PAYMENT_POLL.INTERVAL_MS * (ORDER_PAYMENT_POLL.MAX_TRIES + 3),
    )

    expect(mockFetchOrderDetail).toHaveBeenCalledTimes(
      ORDER_PAYMENT_POLL.MAX_TRIES,
    )
    expect(result.current.isPollExhausted).toBe(true)
  })

  it('failed polls count toward the limit', async () => {
    mockFetchOrderDetail
      .mockResolvedValueOnce({ ok: true, order: pending })
      .mockResolvedValue({
        ok: false,
        error: { statusCode: 500, message: API_FALLBACK_ERRORS.ORDER_LOAD },
      })
    const { result } = renderWithClient(() =>
      useOrderDetail('o-1', { pollWhile: () => true }),
    )

    await advance(
      ORDER_PAYMENT_POLL.INTERVAL_MS * (ORDER_PAYMENT_POLL.MAX_TRIES * 3),
    )
    await advance(ORDER_PAYMENT_POLL.INTERVAL_MS * 5)

    expect(mockFetchOrderDetail).toHaveBeenCalledTimes(
      1 + 2 * ORDER_PAYMENT_POLL.MAX_TRIES,
    )
    expect(result.current.isPollExhausted).toBe(true)
    expect(result.current.order).toEqual(pending)
  })

  it('failed loads before the first data do not use the poll budget', async () => {
    const failure = {
      ok: false as const,
      error: { statusCode: 500, message: API_FALLBACK_ERRORS.ORDER_LOAD },
    }
    mockFetchOrderDetail
      .mockResolvedValueOnce(failure)
      .mockResolvedValueOnce(failure)
      .mockResolvedValue({ ok: true, order: pending })
    const { result } = renderWithClient(() =>
      useOrderDetail('o-1', { pollWhile: () => true }),
    )
    await advance(ORDER_PAYMENT_POLL.INTERVAL_MS)
    expect(result.current.isError).toBe(true)

    await act(async () => {
      await result.current.refetch()
    })
    const callsAtFirstData = mockFetchOrderDetail.mock.calls.length
    await advance(
      ORDER_PAYMENT_POLL.INTERVAL_MS * (ORDER_PAYMENT_POLL.MAX_TRIES + 3),
    )

    expect(mockFetchOrderDetail).toHaveBeenCalledTimes(
      callsAtFirstData + ORDER_PAYMENT_POLL.MAX_TRIES,
    )
    expect(result.current.isPollExhausted).toBe(true)
  })

  it('stops polling once pollWhile is false', async () => {
    mockFetchOrderDetail
      .mockResolvedValueOnce({ ok: true, order: pending })
      .mockResolvedValueOnce({ ok: true, order: pending })
      .mockResolvedValue({ ok: true, order: paid })
    const { result } = renderWithClient(() =>
      useOrderDetail('o-1', {
        pollWhile: (o) => o.paymentStatus === OrderPaymentStatus.PENDING,
      }),
    )

    await advance(ORDER_PAYMENT_POLL.INTERVAL_MS * 6)

    expect(mockFetchOrderDetail).toHaveBeenCalledTimes(3)
    expect(result.current.order?.paymentStatus).toBe(OrderPaymentStatus.PAID)
    expect(result.current.isPollExhausted).toBe(false)
  })
})

describe('useCancelOrder', () => {
  const mockCancelOrder = jest.mocked(cancelOrder)
  const conflict = {
    ok: false as const,
    status: 409,
    error: 'Order cannot be cancelled: it is confirmed',
    errorResponse: {
      statusCode: 409,
      message: 'Conflict',
      errors: [
        {
          errCode: 'statusNotAllowed',
          field: 'status',
          message: 'Order cannot be cancelled: it is confirmed',
          description: 'Contact the shop to cancel a confirmed order.',
        },
      ],
    },
  }

  const setupCancel = () => {
    signedIn()
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
    const invalidate = jest.spyOn(client, 'invalidateQueries')
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    return { ...renderHook(() => useCancelOrder(), { wrapper }), invalidate }
  }

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('useCancelOrder invalidates the orders root on success and on failure', async () => {
    mockCancelOrder.mockResolvedValueOnce({ ok: true, order: detail })
    const { result, invalidate } = setupCancel()

    await act(async () => {
      await result.current.mutateAsync('order-1')
    })
    expect(mockCancelOrder).toHaveBeenCalledWith('order-1', {
      getToken: expect.any(Function),
    })
    await mockCancelOrder.mock.calls[0]?.[1].getToken()
    expect(clerkGetToken).toHaveBeenCalledWith({
      template: CLERK_SESSION_TEMPLATE,
    })
    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: ordersQueryKeys.root,
      }),
    )

    invalidate.mockClear()
    mockCancelOrder.mockResolvedValueOnce(conflict)
    await act(async () => {
      await result.current.mutateAsync('order-1').catch(() => undefined)
    })
    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: ordersQueryKeys.root,
      }),
    )
  })

  it('useCancelOrder throws a ServiceError carrying the API errors', async () => {
    mockCancelOrder.mockResolvedValueOnce(conflict)
    const { result } = setupCancel()

    let caught: unknown
    await act(async () => {
      caught = await result.current
        .mutateAsync('order-1')
        .catch((error: unknown) => error)
    })

    expect(caught).toBeInstanceOf(ServiceError)
    expect((caught as ServiceError).errors[0]?.errCode).toBe('statusNotAllowed')
  })
})
