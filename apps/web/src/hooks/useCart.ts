'use client'

import { useAuth } from '@clerk/nextjs'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { CLERK_SESSION_TEMPLATE } from '@/constants/common'
import { sendUntilSettled, useIdempotencyKey } from '@/hooks/useIdempotencyKey'
import {
  addCartItem,
  fetchCart,
  removeCartItem,
  updateCartItem,
} from '@/services/cart'
import { useCartStore } from '@/store/useCartStore'
import type {
  CartAddItemInput,
  CartItem,
  CartTotals,
  ServerCart,
} from '@/types/cart'
import { buildCartTotals, countCartQuantity, toCartItem } from '@/utils/cart'
import { getQueryErrorMessage, throwIfServiceFailed } from '@/utils/query'

export const cartQueryKeys = {
  root: ['cart'] as const,
  detail: (userId: string) => ['cart', userId] as const,
}

export type CartActionResult = { ok: true } | { ok: false; error: string }

export interface UseCartResult {
  items: CartItem[]
  totals: CartTotals
  /** The header count: total quantity of the lines that can be bought. */
  itemCount: number
  /** True while the shopper is signed in and the cart is the server's. */
  isServerCart: boolean
  isLoading: boolean
  isError: boolean
  errorMessage: string | null
  refetch: () => void
  addItem: (input: CartAddItemInput) => Promise<CartActionResult>
  changeQuantity: (
    itemId: string,
    quantity: number,
  ) => Promise<CartActionResult>
  removeItem: (itemId: string) => Promise<CartActionResult>
}

const OK: CartActionResult = { ok: true }

/**
 * The shopper's cart: the browser store for a guest, the API's cart
 * (`GET /cart`) once Clerk reports the shopper signed in.
 */
export function useCart(): UseCartResult {
  const { isLoaded, isSignedIn, userId, getToken } = useAuth()
  const queryClient = useQueryClient()
  const idempotency = useIdempotencyKey()
  const store = useCartStore(
    useShallow((state) => ({
      items: state.items,
      isLoading: state.isLoading,
      isError: state.isError,
      errorMessage: state.errorMessage,
      isMerging: state.isMerging,
      addItem: state.addItem,
      changeQuantity: state.changeQuantity,
      removeItem: state.removeItem,
      refetch: state.refetch,
    })),
  )

  const isServerCart = Boolean(isLoaded && isSignedIn && userId)
  const queryKey = cartQueryKeys.detail(userId ?? '')
  const tokenGetter = useCallback(
    () => getToken({ template: CLERK_SESSION_TEMPLATE }),
    [getToken],
  )

  const query = useQuery({
    queryKey,
    queryFn: async () => {
      const result = await fetchCart({ getToken: tokenGetter })
      if (!result.ok) throwIfServiceFailed(result)
      return result.cart
    },
    enabled: isServerCart,
  })

  // A signed-out shopper never sees the previous account's cart.
  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      queryClient.removeQueries({ queryKey: cartQueryKeys.root })
    }
  }, [isLoaded, isSignedIn, queryClient])

  const applyCart = useCallback(
    async (cart: ServerCart) => {
      // A read started before this write would land later with an older cart.
      await queryClient.cancelQueries({ queryKey: cartQueryKeys.root })
      queryClient.setQueryData(cartQueryKeys.detail(userId ?? ''), cart)
      void queryClient.invalidateQueries({ queryKey: cartQueryKeys.root })
    },
    [queryClient, userId],
  )

  const serverItems = useMemo(
    () => (query.data?.items ?? []).map(toCartItem),
    [query.data],
  )
  const items = isServerCart ? serverItems : store.items

  const addItem = useCallback(
    async (input: CartAddItemInput): Promise<CartActionResult> => {
      if (!isServerCart) {
        store.addItem(input)
        return OK
      }
      const body = {
        productVariantId: input.variantId,
        quantity: input.quantity,
      }
      const idempotencyKey = idempotency.keyFor(body)
      const result = await sendUntilSettled(() =>
        addCartItem(body, { getToken: tokenGetter, idempotencyKey }),
      )
      if (!result.ok) return { ok: false, error: result.error }
      idempotency.clear()
      await applyCart(result.cart)
      return OK
    },
    [isServerCart, store, idempotency, tokenGetter, applyCart],
  )

  const changeQuantity = useCallback(
    async (itemId: string, quantity: number): Promise<CartActionResult> => {
      if (!isServerCart) {
        store.changeQuantity(itemId, quantity)
        return OK
      }
      const result = await updateCartItem(
        itemId,
        { quantity },
        { getToken: tokenGetter },
      )
      if (!result.ok) return { ok: false, error: result.error }
      await applyCart(result.cart)
      return OK
    },
    [isServerCart, store, tokenGetter, applyCart],
  )

  const removeItem = useCallback(
    async (itemId: string): Promise<CartActionResult> => {
      if (!isServerCart) {
        store.removeItem(itemId)
        return OK
      }
      const result = await removeCartItem(itemId, { getToken: tokenGetter })
      if (!result.ok) return { ok: false, error: result.error }
      // DELETE's body is not read by apiClient, so the cart is read again.
      await queryClient.invalidateQueries({ queryKey: cartQueryKeys.root })
      return OK
    },
    [isServerCart, store, tokenGetter, queryClient],
  )

  if (!isServerCart) {
    return {
      items,
      totals: buildCartTotals(items),
      itemCount: countCartQuantity(items),
      isServerCart,
      isLoading: !isLoaded || store.isLoading,
      isError: store.isError,
      errorMessage: store.errorMessage,
      refetch: store.refetch,
      addItem,
      changeQuantity,
      removeItem,
    }
  }

  return {
    items,
    totals: buildCartTotals(items),
    itemCount: countCartQuantity(items),
    isServerCart,
    isLoading: store.isMerging || (!query.data && query.isFetching),
    isError: query.isError,
    errorMessage: getQueryErrorMessage(query),
    refetch: () => void query.refetch(),
    addItem,
    changeQuantity,
    removeItem,
  }
}
