'use client'

import { useAuth } from '@clerk/nextjs'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { CLERK_SESSION_TEMPLATE, PAGE_SIZE } from '@/constants/common'
import {
  createProduct,
  deleteProduct,
  fetchProductById,
  fetchProducts,
  updateProduct,
  type ProductOptions,
} from '@/services/product'
import type { ResponseMeta } from '@/types/api'
import type { CreateProductPayload, UpdateProductPayload } from '@repo/schemas'
import type { Product } from '@/types/product'
import { ProductStatus } from '@repo/constants'
import {
  detailQueryOptions,
  listQueryOptions,
  removeFromCachedLists,
  throwIfServiceFailed,
  toQueryResult,
} from '@/utils/query'
import { sendUntilSettled, useIdempotencyKey } from '@/hooks/useIdempotencyKey'

export interface UseProductsResult {
  products: Product[]
  meta: ResponseMeta | null
  isLoading: boolean
  isFetching: boolean
  isError: boolean
  errorMessage: string | null
  refetch: () => Promise<void>
}

const productsQueryRoot = ['products'] as const

export function productDetailQueryRoot(id: string) {
  return ['products', 'detail', id] as const
}

// What the API returns depends on who asks, so admin reads are cached per
// user and apart from the shop's.
export function productDetailQueryKey(
  id: string,
  options: { asAdmin?: boolean; userId?: string | null } = {},
) {
  const asAdmin = options.asAdmin ?? false
  return [
    ...productDetailQueryRoot(id),
    asAdmin,
    asAdmin ? (options.userId ?? null) : null,
  ] as const
}

export function productsListQueryKey(
  params: ProductOptions,
  userId: string | null = null,
) {
  const asAdmin = params.asAdmin ?? false
  return [
    'products',
    'list',
    asAdmin,
    params.page ?? 1,
    params.limit ?? PAGE_SIZE,
    params.search ?? '',
    params.categoryId ?? '',
    params.status ?? '',
    params.minPrice ?? '',
    params.maxPrice ?? '',
    params.roastLevel ?? '',
    params.sortBy ?? '',
    asAdmin ? userId : null,
  ] as const
}

export const useProducts = (params: ProductOptions = {}): UseProductsResult => {
  const { isLoaded, userId, getToken } = useAuth()
  const asAdmin = params.asAdmin ?? false

  const query = useQuery({
    queryKey: productsListQueryKey(params, userId ?? null),
    queryFn: async () => {
      // Without the token the API answers as a shopper (ACTIVE only), so an
      // admin list must not run before Clerk can sign the request.
      const result = await fetchProducts(
        asAdmin
          ? {
              ...params,
              getToken: () => getToken({ template: CLERK_SESSION_TEMPLATE }),
            }
          : params,
      )
      if (!result.ok) throwIfServiceFailed(result)
      return {
        products: result.products,
        meta: result.meta ?? null,
      }
    },
    enabled: !asAdmin || isLoaded,
    ...listQueryOptions,
  })

  return {
    products: query.data?.products ?? [],
    meta: query.data?.meta ?? null,
    ...toQueryResult(query),
    // An admin list waits for Clerk, so it is loading until Clerk is ready.
    isLoading: !query.data && (query.isFetching || (asAdmin && !isLoaded)),
  }
}

export function useCreateProduct() {
  const queryClient = useQueryClient()
  const idempotency = useIdempotencyKey()

  return useMutation({
    mutationFn: async (body: CreateProductPayload) => {
      const idempotencyKey = idempotency.keyFor(body)
      const result = await sendUntilSettled(() =>
        createProduct(body, { idempotencyKey }),
      )
      if (!result.ok) throwIfServiceFailed(result)
      return result.product
    },
    onSuccess: () => {
      idempotency.clear()
      void queryClient.invalidateQueries({ queryKey: productsQueryRoot })
    },
  })
}

interface ProductsListCache {
  products: Product[]
  meta: ResponseMeta | null
}

export function useDeleteProduct() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const result = await deleteProduct(id)
      if (!result.ok) throwIfServiceFailed(result)
    },
    onSuccess: async (_result, deletedId) => {
      // The API archives a product when it deletes it.
      const markDeleted = (product: Product): Product => ({
        ...product,
        status: ProductStatus.ARCHIVED,
        deletedAt: new Date().toISOString(),
      })
      // Admin lists show deleted products, so they keep the row, marked.
      queryClient.setQueriesData<ProductsListCache>(
        { queryKey: ['products', 'list', true] },
        (old) => {
          if (!old) return old
          if (!old.products.some((p) => p.id === deletedId)) return old
          const products = old.products.map((p) =>
            p.id === deletedId ? markDeleted(p) : p,
          )
          return { ...old, products }
        },
      )
      queryClient.setQueriesData<Product>(
        { queryKey: productDetailQueryRoot(deletedId) },
        (old) => (old ? markDeleted(old) : old),
      )
      removeFromCachedLists(
        queryClient,
        { queryKey: ['products', 'list', false] },
        'products',
        deletedId,
      )
      await queryClient.invalidateQueries({ queryKey: productsQueryRoot })
    },
  })
}

export interface UseProductByIdResult {
  product: Product | null
  isLoading: boolean
  isError: boolean
  errorMessage: string | null
  refetch: () => Promise<void>
}

export function useProductById(
  id: string,
  options: { asAdmin?: boolean } = {},
): UseProductByIdResult {
  const { isLoaded, userId, getToken } = useAuth()
  const asAdmin = options.asAdmin ?? false

  const query = useQuery({
    queryKey: productDetailQueryKey(id, { asAdmin, userId: userId ?? null }),
    queryFn: async () => {
      const result = await fetchProductById(
        id,
        asAdmin
          ? {
              asAdmin,
              getToken: () => getToken({ template: CLERK_SESSION_TEMPLATE }),
            }
          : {},
      )
      if (!result.ok) throwIfServiceFailed(result)
      return result.product
    },
    enabled: Boolean(id?.trim()) && (!asAdmin || isLoaded),
    ...detailQueryOptions,
  })

  const { isFetching: _isFetching, ...state } = toQueryResult(query)

  return {
    product: query.data ?? null,
    ...state,
    isLoading: !query.data && (query.isFetching || (asAdmin && !isLoaded)),
  }
}

export function useUpdateProduct() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: { id: string; body: UpdateProductPayload }) => {
      const result = await updateProduct(input.id, input.body)
      if (!result.ok) throwIfServiceFailed(result)
      return result.product
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: productsQueryRoot })
      void queryClient.invalidateQueries({
        queryKey: productDetailQueryRoot(variables.id.trim()),
      })
    },
  })
}
