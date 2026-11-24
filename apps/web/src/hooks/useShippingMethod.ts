'use client'

import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query'
import { useAuth } from '@clerk/nextjs'
import type {
  CreateShippingMethodPayload,
  UpdateShippingMethodPayload,
} from '@repo/schemas'

import { CLERK_SESSION_TEMPLATE, PAGE_SIZE } from '@/constants/common'
import { sendUntilSettled, useIdempotencyKey } from '@/hooks/useIdempotencyKey'
import {
  createShippingMethod,
  deleteShippingMethod,
  fetchShippingMethodById,
  fetchShippingMethods,
  updateShippingMethod,
  type ShippingMethodListOptions,
} from '@/services/shippingMethod'
import type { ResponseMeta } from '@/types/api'
import type { ShippingMethod } from '@/types/shippingMethod'
import {
  detailQueryOptions,
  listQueryOptions,
  throwIfServiceFailed,
  toQueryResult,
} from '@/utils/query'

type ShippingMethodListParams = Omit<ShippingMethodListOptions, 'getToken'>

export interface UseShippingMethodsResult {
  shippingMethods: ShippingMethod[]
  meta: ResponseMeta | null
  isLoading: boolean
  isFetching: boolean
  isError: boolean
  errorMessage: string | null
  refetch: () => Promise<void>
}

export interface UseShippingMethodByIdResult {
  shippingMethod: ShippingMethod | null
  isLoading: boolean
  isError: boolean
  errorMessage: string | null
  refetch: () => Promise<void>
}

interface ShippingMethodsListCache {
  shippingMethods: ShippingMethod[]
  meta: ResponseMeta | null
}

const shippingMethodsQueryRoot = ['shipping-methods'] as const
const shippingMethodsListRoot = ['shipping-methods', 'list'] as const

export function shippingMethodsListQueryKey(
  params: ShippingMethodListParams,
  userId: string | null,
) {
  return [
    'shipping-methods',
    'list',
    params.status ?? 'all',
    params.page ?? 1,
    params.limit ?? PAGE_SIZE,
    params.search ?? '',
    userId,
  ] as const
}

export function shippingMethodDetailQueryKey(id: string) {
  return ['shipping-methods', 'detail', id] as const
}

function useAdminToken() {
  const { isLoaded, userId, getToken } = useAuth()
  return {
    isLoaded,
    userId: userId ?? null,
    getAdminToken: () => getToken({ template: CLERK_SESSION_TEMPLATE }),
  }
}

function updateCachedLists(
  queryClient: QueryClient,
  id: string,
  update: (method: ShippingMethod) => ShippingMethod,
) {
  queryClient.setQueriesData<ShippingMethodsListCache>(
    { queryKey: shippingMethodsListRoot },
    (old) => {
      if (!old) return old
      if (!old.shippingMethods.some((method) => method.id === id)) return old
      return {
        ...old,
        shippingMethods: old.shippingMethods.map((method) =>
          method.id === id ? update(method) : method,
        ),
      }
    },
  )
}

function invalidateShippingMethods(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: shippingMethodsQueryRoot })
}

export function useShippingMethods(
  params: ShippingMethodListParams = {},
): UseShippingMethodsResult {
  const { isLoaded, userId, getAdminToken } = useAdminToken()

  const query = useQuery({
    queryKey: shippingMethodsListQueryKey(params, userId),
    queryFn: async () => {
      const result = await fetchShippingMethods({
        ...params,
        getToken: getAdminToken,
      })
      if (!result.ok) throwIfServiceFailed(result)

      return {
        shippingMethods: result.shippingMethods,
        meta: result.meta ?? null,
      }
    },
    enabled: isLoaded,
    ...listQueryOptions,
  })

  return {
    shippingMethods: query.data?.shippingMethods ?? [],
    meta: query.data?.meta ?? null,
    ...toQueryResult(query),
  }
}

export function useShippingMethodById(id: string): UseShippingMethodByIdResult {
  const { isLoaded, getAdminToken } = useAdminToken()
  const trimmedId = id.trim()

  const query = useQuery({
    queryKey: shippingMethodDetailQueryKey(trimmedId),
    queryFn: async () => {
      const result = await fetchShippingMethodById(trimmedId, {
        getToken: getAdminToken,
      })
      if (!result.ok) throwIfServiceFailed(result)
      return result.shippingMethod
    },
    enabled: Boolean(trimmedId) && isLoaded,
    ...detailQueryOptions,
  })

  const { isFetching: _isFetching, ...state } = toQueryResult(query)

  return { shippingMethod: query.data ?? null, ...state }
}

export function useCreateShippingMethod() {
  const queryClient = useQueryClient()
  const idempotency = useIdempotencyKey()

  return useMutation({
    mutationFn: async (body: CreateShippingMethodPayload) => {
      const idempotencyKey = idempotency.keyFor(body)
      const result = await sendUntilSettled(() =>
        createShippingMethod(body, { idempotencyKey }),
      )
      if (!result.ok) throwIfServiceFailed(result)
      return result.shippingMethod
    },
    onSuccess: () => {
      idempotency.clear()
      void invalidateShippingMethods(queryClient)
    },
  })
}

export function useUpdateShippingMethod() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: {
      id: string
      body: UpdateShippingMethodPayload
    }) => {
      const result = await updateShippingMethod(input.id, input.body)
      if (!result.ok) throwIfServiceFailed(result)
      return result.shippingMethod
    },
    onSuccess: async (updated, variables) => {
      updateCachedLists(queryClient, variables.id, () => updated)
      await Promise.all([
        invalidateShippingMethods(queryClient),
        queryClient.invalidateQueries({
          queryKey: shippingMethodDetailQueryKey(variables.id.trim()),
        }),
      ])
    },
  })
}

export function useDeleteShippingMethod() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const result = await deleteShippingMethod(id)
      if (!result.ok) throwIfServiceFailed(result)
    },
    onSuccess: async (_result, deletedId) => {
      const deletedAt = new Date().toISOString()
      updateCachedLists(queryClient, deletedId, (method) => ({
        ...method,
        deletedAt,
      }))
      await invalidateShippingMethods(queryClient)
    },
  })
}
