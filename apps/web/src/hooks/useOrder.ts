'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import type { PlaceOrderPayload } from '@repo/schemas'

import { PAGE_SIZE } from '@/constants/common'
import { sendUntilSettled, useIdempotencyKey } from '@/hooks/useIdempotencyKey'
import {
  createOrder,
  deleteOrder,
  fetchOrders,
  updateOrderShippingStatus,
  updateOrderStatus,
  type FetchOrdersOptions,
} from '@/services/order'
import type { ResponseMeta } from '@/types/api'
import type {
  Order,
  ORDER_STATUS,
  PlacedOrder,
  SHIPPING_STATUS,
} from '@/types/order'
import {
  listQueryOptions,
  throwIfServiceFailed,
  toQueryResult,
} from '@/utils/query'

export const ordersQueryKeys = {
  root: ['orders'] as const,
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
