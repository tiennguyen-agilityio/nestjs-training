'use client'

import { useAuth } from '@clerk/nextjs'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { VALIDATION_RULES, type InventoryMovementType } from '@repo/constants'
import type { AdjustStockPayload, RestockStockPayload } from '@repo/schemas'

import { CLERK_SESSION_TEMPLATE } from '@/constants/common'
import { sendUntilSettled, useIdempotencyKey } from '@/hooks/useIdempotencyKey'
import {
  adjustVariant,
  fetchInventory,
  fetchInventoryItem,
  fetchVariantMovements,
  restockVariant,
} from '@/services/inventory'
import type { ResponseMeta } from '@/types/api'
import type {
  InventoryItem,
  InventoryMovement,
  StockChangeResult,
} from '@/types/inventory'
import {
  detailQueryOptions,
  listQueryOptions,
  throwIfServiceFailed,
  toQueryResult,
  type QueryResultState,
} from '@/utils/query'

const DEFAULT_LIMIT = VALIDATION_RULES.PAGINATION.DEFAULT_LIMIT

export interface InventoryListParams {
  page?: number
  limit?: number
  search?: string
  lowStock?: boolean
}

export interface MovementListParams {
  page?: number
  limit?: number
  type?: InventoryMovementType
}

/** Keys under the one `['inventory']` root, each carrying the user id. */
export const inventoryQueryKeys = {
  root: ['inventory'] as const,
  list: (userId: string, params: InventoryListParams) =>
    [
      'inventory',
      'list',
      userId,
      params.page ?? 1,
      params.limit ?? DEFAULT_LIMIT,
      params.search ?? '',
      params.lowStock ?? false,
    ] as const,
  item: (userId: string, id: string) =>
    ['inventory', 'item', userId, id] as const,
  movements: (userId: string, id: string, params: MovementListParams) =>
    [
      'inventory',
      'movements',
      userId,
      id,
      params.page ?? 1,
      params.limit ?? DEFAULT_LIMIT,
      params.type ?? '',
    ] as const,
  lowStockCount: (userId: string) =>
    ['inventory', 'low-stock-count', userId] as const,
}

const statusCodeOf = (error: unknown): number | undefined =>
  (error as { statusCode?: number } | null)?.statusCode

/** Products also show the stock, so a stock change refreshes both roots. */
const PRODUCTS_ROOT = ['products'] as const

const useSession = () => {
  const { isLoaded, isSignedIn, userId, getToken } = useAuth()
  return {
    userId: userId ?? '',
    enabled: Boolean(isLoaded && isSignedIn && userId),
    getToken: () => getToken({ template: CLERK_SESSION_TEMPLATE }),
  }
}

export interface UseInventoryResult extends QueryResultState {
  items: InventoryItem[]
  meta: ResponseMeta | null
}

/** Every non-deleted variant, for the Inventory page. */
export function useInventory(
  params: InventoryListParams = {},
): UseInventoryResult {
  const { userId, enabled, getToken } = useSession()

  const query = useQuery({
    queryKey: inventoryQueryKeys.list(userId, params),
    queryFn: async () => {
      const result = await fetchInventory({ ...params, getToken })
      if (!result.ok) throw new Error(result.error.message)
      return { items: result.items, meta: result.meta ?? null }
    },
    enabled,
    ...listQueryOptions,
  })

  return {
    items: query.data?.items ?? [],
    meta: query.data?.meta ?? null,
    ...toQueryResult(query),
  }
}

export interface UseInventoryItemResult {
  item: InventoryItem | null
  isLoading: boolean
  /** A request is running, also when a cached copy is shown meanwhile. */
  isFetching: boolean
  isError: boolean
  /** The API answered 404: no such variant, or a deleted one. */
  isNotFound: boolean
  errorMessage: string | null
  refetch: () => Promise<void>
}

/** One variant's current numbers; nothing is fetched without an id. */
export function useInventoryItem(id: string | null): UseInventoryItemResult {
  const { userId, enabled, getToken } = useSession()

  const query = useQuery({
    queryKey: inventoryQueryKeys.item(userId, id ?? ''),
    queryFn: async () => {
      const result = await fetchInventoryItem(id ?? '', { getToken })
      if (!result.ok) {
        throw Object.assign(new Error(result.error.message), {
          statusCode: result.error.statusCode,
        })
      }
      return result.item
    },
    enabled: enabled && Boolean(id),
    ...detailQueryOptions,
    // Always read the current numbers: an Adjust is worked out from them.
    staleTime: 0,
    // A 404 is final; other errors retry once.
    retry: (failureCount, error) =>
      statusCodeOf(error) !== 404 && failureCount < 1,
  })
  const { isError, errorMessage, refetch } = toQueryResult(query)

  return {
    item: query.data ?? null,
    isLoading: query.isPending && Boolean(id),
    isFetching: query.isFetching,
    isError,
    isNotFound: isError && statusCodeOf(query.error) === 404,
    errorMessage,
    refetch,
  }
}

/** How many ACTIVE variants are low or out of stock (the sidebar alert). */
export function useLowStockCount(): {
  count: number | null
  isLoading: boolean
  isError: boolean
} {
  const { userId, enabled, getToken } = useSession()

  const query = useQuery({
    queryKey: inventoryQueryKeys.lowStockCount(userId),
    queryFn: async () => {
      const result = await fetchInventory({
        getToken,
        lowStock: true,
        activeOnly: true,
        limit: 1,
      })
      if (!result.ok) throw new Error(result.error.message)
      return result.meta?.totalCount ?? result.items.length
    },
    enabled,
    ...detailQueryOptions,
  })

  return {
    count: query.data ?? null,
    isLoading: query.isPending,
    isError: query.isError,
  }
}

type StockChangeSender<B> = (
  id: string,
  body: B,
  options: { getToken: () => Promise<string | null>; idempotencyKey: string },
) => ReturnType<typeof restockVariant>

/**
 * A retry of the same values reuses the `Idempotency-Key`; it is cleared after
 * a success, so the same change made twice applies twice.
 */
function useStockChange<B extends RestockStockPayload | AdjustStockPayload>(
  send: StockChangeSender<B>,
) {
  const queryClient = useQueryClient()
  const idempotency = useIdempotencyKey()
  const { getToken } = useSession()

  return useMutation({
    mutationFn: async (input: {
      variantId: string
      body: B
    }): Promise<StockChangeResult> => {
      const idempotencyKey = idempotency.keyFor({
        variantId: input.variantId,
        ...input.body,
      })
      const result = await sendUntilSettled(() =>
        send(input.variantId, input.body, { getToken, idempotencyKey }),
      )
      if (!result.ok) throwIfServiceFailed(result)
      return result.result
    },
    onSuccess: () => {
      idempotency.clear()
      void queryClient.invalidateQueries({
        queryKey: inventoryQueryKeys.root,
      })
      void queryClient.invalidateQueries({ queryKey: PRODUCTS_ROOT })
    },
  })
}

export function useRestockVariant() {
  return useStockChange<RestockStockPayload>(restockVariant)
}

export function useAdjustVariant() {
  return useStockChange<AdjustStockPayload>(adjustVariant)
}

export interface UseVariantMovementsResult extends QueryResultState {
  movements: InventoryMovement[]
  meta: ResponseMeta | null
}

/** A variant's stock history, newest first. */
export function useVariantMovements(
  id: string,
  params: MovementListParams = {},
): UseVariantMovementsResult {
  const { userId, enabled, getToken } = useSession()

  const query = useQuery({
    queryKey: inventoryQueryKeys.movements(userId, id, params),
    queryFn: async () => {
      const result = await fetchVariantMovements(id, { ...params, getToken })
      if (!result.ok) throw new Error(result.error.message)
      return { movements: result.movements, meta: result.meta ?? null }
    },
    enabled: enabled && Boolean(id),
    ...listQueryOptions,
  })

  return {
    movements: query.data?.movements ?? [],
    meta: query.data?.meta ?? null,
    ...toQueryResult(query),
  }
}
