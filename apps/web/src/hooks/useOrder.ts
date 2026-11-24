'use client'

import { useAuth } from '@clerk/nextjs'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import {
  VALIDATION_RULES,
  type OrderStatus,
  type ShippingStatus,
} from '@repo/constants'

import type { PlaceOrderPayload } from '@repo/schemas'

import { CLERK_SESSION_TEMPLATE, PAGE_SIZE } from '@/constants/common'
import { ORDER_PAYMENT_POLL } from '@/constants/order'
import { sendUntilSettled, useIdempotencyKey } from '@/hooks/useIdempotencyKey'
import {
  cancelOrder,
  createOrder,
  deleteOrder,
  fetchMyOrders,
  fetchOrderDetail,
  fetchOrders,
  updateOrderShippingStatus,
  updateOrderStatus,
  type FetchOrdersOptions,
} from '@/services/order'
import type { ResponseMeta } from '@/types/api'
import type { OrderDetail, OrderSummary, PlacedOrder } from '@/types/order'
import {
  detailQueryOptions,
  listQueryOptions,
  throwIfServiceFailed,
  toQueryResult,
} from '@/utils/query'

/**
 * Keys under the one `['orders']` root. The shopper's own lists and details
 * carry the user id, so a switched account never reads another user's cache.
 */
export const ordersQueryKeys = {
  root: ['orders'] as const,
  mine: (userId: string, params: MyOrdersParams) =>
    ['orders', 'mine', userId, params.page, params.status ?? ''] as const,
  detail: (userId: string, orderNumber: string) =>
    ['orders', 'detail', userId, orderNumber] as const,
  /** Every order (the admin dashboard). */
  all: (userId: string, params: FetchOrdersOptions) =>
    [
      'orders',
      'all',
      userId,
      params.page ?? 1,
      params.limit ?? PAGE_SIZE,
      params.search ?? '',
      params.status ?? '',
      params.shippingStatus ?? '',
    ] as const,
}

const ordersQueryRoot = ordersQueryKeys.root

/**
 * Places the order. A retry of the same values reuses the `Idempotency-Key`,
 * so a lost response never places a second order; a failure throws a
 * `ServiceError` carrying the API's `errors[]`.
 */
export function useCreateOrder() {
  const queryClient = useQueryClient()
  const idempotency = useIdempotencyKey()

  return useMutation({
    mutationFn: async (input: {
      body: PlaceOrderPayload
      getToken: () => Promise<string | null>
    }): Promise<PlacedOrder> => {
      const idempotencyKey = idempotency.keyFor(input.body)
      const result = await sendUntilSettled(() =>
        createOrder(input.body, { getToken: input.getToken, idempotencyKey }),
      )
      if (!result.ok) throwIfServiceFailed(result)
      return result.order
    },
    onSuccess: () => {
      idempotency.clear()
      void queryClient.invalidateQueries({ queryKey: ordersQueryRoot })
    },
  })
}

/**
 * Cancels one of the shopper's PENDING orders. Success or failure, the orders
 * are refetched, so a 409 (confirmed or paid meanwhile) shows the current
 * state; a failure throws a `ServiceError` carrying the API's `errors[]`.
 */
export function useCancelOrder() {
  const queryClient = useQueryClient()
  const { getToken } = useAuth()

  return useMutation({
    mutationFn: async (orderId: string): Promise<OrderDetail> => {
      const result = await cancelOrder(orderId, {
        getToken: () => getToken({ template: CLERK_SESSION_TEMPLATE }),
      })
      if (!result.ok) throwIfServiceFailed(result)
      return result.order
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ordersQueryRoot })
    },
  })
}

export function useDeleteOrder() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const result = await deleteOrder(id)
      if (!result.ok) throw new Error(result.error)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ordersQueryRoot })
    },
  })
}

export function useUpdateOrderStatus() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: { id: string; status: OrderStatus }) => {
      const result = await updateOrderStatus(input.id, input.status)
      if (!result.ok) throw new Error(result.error)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ordersQueryRoot })
    },
  })
}

export function useUpdateOrderShippingStatus() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: {
      id: string
      shippingStatus: ShippingStatus
    }) => {
      const result = await updateOrderShippingStatus(
        input.id,
        input.shippingStatus,
      )
      if (!result.ok) throw new Error(result.error)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ordersQueryRoot })
    },
  })
}

export type UseOrdersParams = Omit<FetchOrdersOptions, 'getToken'>

export interface UseOrdersResult {
  orders: OrderSummary[]
  meta: ResponseMeta | null
  isLoading: boolean
  isFetching: boolean
  isError: boolean
  errorMessage: string | null
  refetch: () => Promise<void>
}

/** Every order, for the admin dashboard; waits for a signed-in Clerk session. */
export function useOrders(params: UseOrdersParams = {}): UseOrdersResult {
  const { isLoaded, isSignedIn, userId, getToken } = useAuth()

  const query = useQuery({
    queryKey: ordersQueryKeys.all(userId ?? '', params),
    queryFn: async () => {
      const result = await fetchOrders({
        ...params,
        getToken: () => getToken({ template: CLERK_SESSION_TEMPLATE }),
      })
      if (!result.ok) throw new Error(result.error.message)
      return {
        orders: result.orders,
        meta: result.meta ?? null,
      }
    },
    enabled: Boolean(isLoaded && isSignedIn && userId),
    ...listQueryOptions,
  })

  return {
    orders: query.data?.orders ?? [],
    meta: query.data?.meta ?? null,
    ...toQueryResult(query),
    isLoading: query.isPending && (!isLoaded || Boolean(isSignedIn && userId)),
  }
}

export interface MyOrdersParams {
  page: number
  status?: OrderStatus
}

export interface UseMyOrdersResult {
  orders: OrderSummary[]
  meta: ResponseMeta | null
  isLoading: boolean
  isError: boolean
  errorMessage: string | null
  refetch: () => Promise<void>
}

/** The signed-in shopper's orders, 10 a page, newest first. */
export function useMyOrders(params: MyOrdersParams): UseMyOrdersResult {
  const { isLoaded, isSignedIn, userId, getToken } = useAuth()

  const query = useQuery({
    queryKey: ordersQueryKeys.mine(userId ?? '', params),
    queryFn: async () => {
      const result = await fetchMyOrders({
        getToken: () => getToken({ template: CLERK_SESSION_TEMPLATE }),
        page: params.page,
        limit: VALIDATION_RULES.PAGINATION.DEFAULT_LIMIT,
        status: params.status,
      })
      if (!result.ok) throw new Error(result.error.message)
      return { orders: result.orders, meta: result.meta ?? null }
    },
    enabled: Boolean(isLoaded && isSignedIn && userId),
    ...listQueryOptions,
    // Keep the shown rows only while paging the same user's same filter: a
    // new user or a new status starts empty (loading), never with old rows.
    placeholderData: (previous, previousQuery) => {
      const key = previousQuery?.queryKey
      return key?.[2] === userId && key?.[4] === (params.status ?? '')
        ? previous
        : undefined
    },
  })
  const { isError, errorMessage, refetch } = toQueryResult(query)

  return {
    orders: query.data?.orders ?? [],
    meta: query.data?.meta ?? null,
    // Pending until Clerk loads and the first data arrives; a signed-out
    // shopper (query disabled for good) is not loading.
    isLoading: query.isPending && (!isLoaded || Boolean(isSignedIn && userId)),
    isError,
    errorMessage,
    refetch,
  }
}

/** A 404 is final (no such order, or another user's); other errors retry once. */
export function orderDetailRetry(failureCount: number, error: Error): boolean {
  return (
    (error as { statusCode?: number }).statusCode !== 404 && failureCount < 1
  )
}

export interface UseOrderDetailResult {
  order: OrderDetail | null
  isLoading: boolean
  isError: boolean
  /** The API answered 404: no such order, or another user's. */
  isNotFound: boolean
  errorMessage: string | null
  refetch: () => Promise<void>
  isPollExhausted?: boolean
}

export interface UseOrderDetailOptions {
  pollWhile?: (order: OrderDetail) => boolean
}

const fetchesOf = (
  state: { dataUpdateCount: number; errorUpdateCount: number } | undefined,
): number => (state ? state.dataUpdateCount + state.errorUpdateCount : 0)

const pollsRunOf = (fetchCount: number, baseCount: number): number =>
  Math.max(fetchCount - Math.max(baseCount, 1), 0)

/** One order the caller may read (own, or any for an active admin); nothing is fetched without an order number. */
export function useOrderDetail(
  orderNumber: string | null,
  options: UseOrderDetailOptions = {},
): UseOrderDetailResult {
  const { isLoaded, isSignedIn, userId, getToken } = useAuth()
  const queryClient = useQueryClient()
  const { pollWhile } = options
  const queryKey = ordersQueryKeys.detail(userId ?? '', orderNumber ?? '')
  const keyId = queryKey.join('|')
  const countOf = () => fetchesOf(queryClient.getQueryState(queryKey))
  const [pollBase, setPollBase] = useState(() => ({
    keyId,
    hasData: queryClient.getQueryData(queryKey) !== undefined,
    count: countOf(),
  }))

  const query = useQuery({
    queryKey,
    queryFn: async () => {
      const result = await fetchOrderDetail(orderNumber ?? '', {
        getToken: () => getToken({ template: CLERK_SESSION_TEMPLATE }),
      })
      if (!result.ok) {
        throw Object.assign(new Error(result.error.message), {
          statusCode: result.error.statusCode,
        })
      }
      return result.order
    },
    enabled: Boolean(isLoaded && isSignedIn && userId && orderNumber),
    ...detailQueryOptions,
    retry: orderDetailRetry,
    refetchInterval: (current) => {
      const order = current.state.data
      if (!pollWhile || !order || !pollWhile(order)) return false
      return pollsRunOf(fetchesOf(current.state), pollBase.count) <
        ORDER_PAYMENT_POLL.MAX_TRIES
        ? ORDER_PAYMENT_POLL.INTERVAL_MS
        : false
    },
  })
  const hasData = query.data !== undefined
  if (pollBase.keyId !== keyId || (hasData && !pollBase.hasData)) {
    setPollBase({ keyId, hasData, count: countOf() })
  }
  const { isError, errorMessage, refetch } = toQueryResult(query)

  return {
    order: query.data ?? null,
    isPollExhausted: Boolean(
      pollWhile &&
      query.data &&
      pollWhile(query.data) &&
      pollsRunOf(countOf(), pollBase.count) >= ORDER_PAYMENT_POLL.MAX_TRIES,
    ),
    isNotFound:
      (query.error as { statusCode?: number } | null)?.statusCode === 404,
    isLoading:
      query.isPending &&
      (!isLoaded || Boolean(isSignedIn && userId && orderNumber)),
    isError,
    errorMessage,
    refetch,
  }
}
