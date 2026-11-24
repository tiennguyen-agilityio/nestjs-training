'use client'

import { useAuth } from '@clerk/nextjs'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { VALIDATION_RULES, type OrderStatus } from '@repo/constants'

import { CLERK_SESSION_TEMPLATE, PAGE_SIZE } from '@/constants/common'
import {
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
import type {
  Order,
  OrderDetail,
  OrderPayload,
  OrderSummary,
  ORDER_STATUS,
  SHIPPING_STATUS,
} from '@/types/order'
import {
  detailQueryOptions,
  listQueryOptions,
  toQueryResult,
} from '@/utils/query'

export function useCreateOrder() {
  return useMutation({
    mutationFn: async (input: {
      body: OrderPayload
      getToken?: () => Promise<string | null>
    }): Promise<Order> => {
      const result = await createOrder(input.body, { getToken: input.getToken })
      if (!result.ok) {
        throw Object.assign(new Error(result.error.message), {
          response: { data: result.error },
        })
      }
      return result.order
    },
  })
}

const ordersQueryRoot = ['orders'] as const

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
    mutationFn: async (input: { id: string; status: ORDER_STATUS }) => {
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
      shippingStatus: SHIPPING_STATUS
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

export type UseOrdersParams = FetchOrdersOptions

export interface UseOrdersResult {
  orders: Order[]
  meta: ResponseMeta | null
  isLoading: boolean
  isFetching: boolean
  isError: boolean
  errorMessage: string | null
  refetch: () => Promise<void>
}

export function ordersListQueryKey(params: FetchOrdersOptions) {
  return [
    'orders',
    'list',
    params.page ?? 1,
    params.limit ?? PAGE_SIZE,
    params.search ?? '',
    params.status ?? '',
    params.shippingStatus ?? '',
  ] as const
}

export function useOrders(params: UseOrdersParams = {}): UseOrdersResult {
  const query = useQuery({
    queryKey: ordersListQueryKey(params),
    queryFn: async () => {
      const result = await fetchOrders(params)
      if (!result.ok) throw new Error(result.error.message)
      return {
        orders: result.orders,
        meta: result.meta ?? null,
      }
    },
    ...listQueryOptions,
  })

  return {
    orders: query.data?.orders ?? [],
    meta: query.data?.meta ?? null,
    ...toQueryResult(query),
  }
}

export interface MyOrdersParams {
  page: number
  status?: OrderStatus
}

/** Keys of the shopper's own orders; they carry the user id, so a switched account never reads another user's cache. */
export const orderQueryKeys = {
  root: ordersQueryRoot,
  mine: (userId: string, params: MyOrdersParams) =>
    ['orders', 'mine', userId, params.page, params.status ?? ''] as const,
  detail: (userId: string, orderNumber: string) =>
    ['orders', 'detail', userId, orderNumber] as const,
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
    queryKey: orderQueryKeys.mine(userId ?? '', params),
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

export interface UseOrderDetailResult {
  order: OrderDetail | null
  isLoading: boolean
  isError: boolean
  errorMessage: string | null
  refetch: () => Promise<void>
}

/** One of the shopper's orders; nothing is fetched without an order number. */
export function useOrderDetail(
  orderNumber: string | null,
): UseOrderDetailResult {
  const { isLoaded, isSignedIn, userId, getToken } = useAuth()

  const query = useQuery({
    queryKey: orderQueryKeys.detail(userId ?? '', orderNumber ?? ''),
    queryFn: async () => {
      const result = await fetchOrderDetail(orderNumber ?? '', {
        getToken: () => getToken({ template: CLERK_SESSION_TEMPLATE }),
      })
      if (!result.ok) throw new Error(result.error.message)
      return result.order
    },
    enabled: Boolean(isLoaded && isSignedIn && userId && orderNumber),
    ...detailQueryOptions,
  })
  const { isError, errorMessage, refetch } = toQueryResult(query)

  return {
    order: query.data ?? null,
    isLoading:
      query.isPending &&
      (!isLoaded || Boolean(isSignedIn && userId && orderNumber)),
    isError,
    errorMessage,
    refetch,
  }
}
