'use client'

import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query'
import { useAuth } from '@clerk/nextjs'

import { CLERK_SESSION_TEMPLATE, PAGE_SIZE } from '@/constants/common'
import {
  createCategory,
  deleteCategory,
  fetchCategoryById,
  fetchCategories,
  restoreCategory,
  updateCategory,
  type CategoryOptions,
} from '@/services/category'
import type {
  CreateCategoryPayload,
  UpdateCategoryPayload,
} from '@repo/schemas'
import type { Category } from '@/types/category'
import type { ResponseMeta } from '@/types/api'
import {
  detailQueryOptions,
  listQueryOptions,
  removeFromCachedLists,
  throwIfServiceFailed,
  toQueryResult,
} from '@/utils/query'
import { sendUntilSettled, useIdempotencyKey } from '@/hooks/useIdempotencyKey'

export interface UseCategoriesResult {
  categories: Category[]
  meta: ResponseMeta | null
  isLoading: boolean
  isFetching: boolean
  isError: boolean
  errorMessage: string | null
  refetch: () => Promise<void>
}

export function categoriesListQueryKey(
  params: CategoryOptions,
  userId: string | null = null,
) {
  return [
    'categories',
    'list',
    params.includeDeleted ?? false,
    params.page ?? 1,
    params.limit ?? PAGE_SIZE,
    params.search ?? '',
    // Deleted rows depend on who asks, so those lists are cached per user.
    params.includeDeleted ? userId : null,
  ] as const
}

const categoriesQueryRoot = ['categories'] as const

export function categoryDetailQueryKey(id: string) {
  return ['categories', 'detail', id] as const
}

function invalidateCategoryLists(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: categoriesQueryRoot })
}

export const useCategories = (
  params: CategoryOptions = {},
): UseCategoriesResult => {
  const { isLoaded, userId, getToken } = useAuth()
  const { includeDeleted } = params

  const query = useQuery({
    queryKey: categoriesListQueryKey(params, userId ?? null),
    queryFn: async () => {
      // Without the token the API answers 200 with live rows only, so a list
      // with deleted rows must not run before Clerk can sign the request.
      const result = await fetchCategories(
        includeDeleted
          ? {
              ...params,
              getToken: () => getToken({ template: CLERK_SESSION_TEMPLATE }),
            }
          : params,
      )
      if (!result.ok) throwIfServiceFailed(result)

      return {
        categories: result.categories,
        meta: result.meta ?? null,
      }
    },
    enabled: !includeDeleted || isLoaded,
    ...listQueryOptions,
  })

  return {
    categories: query.data?.categories ?? [],
    meta: query.data?.meta ?? null,
    ...toQueryResult(query),
  }
}

export function useCreateCategory() {
  const queryClient = useQueryClient()
  const idempotency = useIdempotencyKey()

  return useMutation({
    mutationFn: async (body: CreateCategoryPayload) => {
      const idempotencyKey = idempotency.keyFor(body)
      const result = await sendUntilSettled(() =>
        createCategory(body, { idempotencyKey }),
      )
      if (!result.ok) throwIfServiceFailed(result)
      return result.category
    },
    onSuccess: () => {
      idempotency.clear()
      void invalidateCategoryLists(queryClient)
    },
  })
}

interface CategoriesListCache {
  categories: Category[]
  meta: ResponseMeta | null
}

export function useDeleteCategory() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const result = await deleteCategory(id)
      if (!result.ok) throwIfServiceFailed(result)
    },
    onSuccess: async (_result, deletedId) => {
      // Lists that include deleted rows keep the row, now marked deleted.
      queryClient.setQueriesData<CategoriesListCache>(
        { queryKey: ['categories', 'list', true] },
        (old) => {
          if (!old) return old
          if (!old.categories.some((c) => c.id === deletedId)) return old
          const deletedAt = new Date().toISOString()
          const categories = old.categories.map((c) =>
            c.id === deletedId ? { ...c, deletedAt } : c,
          )
          return { ...old, categories }
        },
      )
      removeFromCachedLists(
        queryClient,
        { queryKey: ['categories', 'list', false] },
        'categories',
        deletedId,
      )
      await invalidateCategoryLists(queryClient)
    },
  })
}

export function useRestoreCategory() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const result = await restoreCategory(id)
      if (!result.ok) throwIfServiceFailed(result)
      return result.category
    },
    onSuccess: async (_category, restoredId) => {
      // Lists that include deleted rows show the row as live again right away.
      queryClient.setQueriesData<CategoriesListCache>(
        { queryKey: ['categories', 'list', true] },
        (old) => {
          if (!old) return old
          if (!old.categories.some((c) => c.id === restoredId)) return old
          const categories = old.categories.map((c) =>
            c.id === restoredId ? { ...c, deletedAt: null } : c,
          )
          return { ...old, categories }
        },
      )
      await invalidateCategoryLists(queryClient)
    },
  })
}

export interface UseCategoryByIdResult {
  category: Category | null
  isLoading: boolean
  isError: boolean
  errorMessage: string | null
  refetch: () => Promise<void>
}

export function useCategoryById(id: string): UseCategoryByIdResult {
  const query = useQuery({
    queryKey: categoryDetailQueryKey(id),
    queryFn: async () => {
      const result = await fetchCategoryById(id)
      if (!result.ok) throwIfServiceFailed(result)
      return result.category
    },
    enabled: Boolean(id?.trim()),
    ...detailQueryOptions,
  })

  const { isFetching: _isFetching, ...state } = toQueryResult(query)

  return { category: query.data ?? null, ...state }
}

export function useUpdateCategory() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: { id: string; body: UpdateCategoryPayload }) => {
      const result = await updateCategory(input.id, input.body)
      if (!result.ok) throwIfServiceFailed(result)
      return result.category
    },
    onSuccess: (_data, variables) => {
      void invalidateCategoryLists(queryClient)
      void queryClient.invalidateQueries({
        queryKey: categoryDetailQueryKey(variables.id.trim()),
      })
    },
  })
}
