'use client'

import type { MergeCartPayload } from '@repo/schemas'
import { v4 as uuidv4 } from 'uuid'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

import { EMPTY_IMAGE } from '@/constants/images'
import type { CartAddItemInput, CartItem, CartTotals } from '@/types/cart'
import { buildCartTotals, clampQuantity } from '@/utils/cart'
import type { PlacedOrder } from '@/types/order'

const CART_STORAGE_KEY = 'coffeehub-cart'

const sanitizeItems = (items: unknown): CartItem[] => {
  if (!Array.isArray(items)) return []

  return items
    .filter((item) => typeof item === 'object' && item !== null)
    .map((item) => item as CartItem)
    .filter(
      (item) => typeof item.id === 'string' && typeof item.name === 'string',
    )
    .map((item) => ({
      ...item,
      variantId: item.variantId || item.id || item.productId,
      imageUrl: item.imageUrl || EMPTY_IMAGE,
      quantity: clampQuantity(item.quantity, item.maxQuantity),
    }))
}

/** The `Idempotency-Key` of each merge request, by the JSON of the lines it sends. */
type MergeKeys = Record<string, string>

interface CartStoreState {
  items: CartItem[]
  totals: CartTotals
  hasHydrated: boolean
  isLoading: boolean
  isError: boolean
  errorMessage: string | null
  itemSnapshots: PlacedOrder | null
  mergeKeys: MergeKeys | null
  mergeNotice: string | null
  isMerging: boolean
  addItem: (item: CartAddItemInput) => void
  changeQuantity: (itemId: string, amount: number) => void
  removeItem: (itemId: string) => void
  clearCart: () => void
  setItemSnapshots: (snapshot: PlacedOrder) => void
  clearItemSnapshots: () => void
  refetch: () => void
  /** A chunk unchanged since the last call keeps its key; any other gets a new uuid v4. */
  mergeKeysFor: (chunks: MergeCartPayload[]) => string[]
  /** After one chunk merged: its lines and its key leave the browser cart. */
  removeMergedLines: (chunk: MergeCartPayload) => void
  /** After `POST /cart/merge` succeeds: the browser cart and its keys are gone. */
  clearMergedCart: () => void
  setMergeNotice: (notice: string | null) => void
  setMerging: (value: boolean) => void
}

const toStateWithItems = (items: CartItem[]) => ({
  items,
  totals: buildCartTotals(items),
})

export const useCartStore = create<CartStoreState>()(
  persist(
    (set, get) => ({
      ...toStateWithItems([]),
      hasHydrated: false,
      isLoading: true,
      isError: false,
      errorMessage: null,
      itemSnapshots: null,
      mergeKeys: null,
      mergeNotice: null,
      isMerging: false,
      addItem: (nextItem) =>
        set((state) => {
          const existing = state.items.find(
            (item) => item.variantId === nextItem.variantId,
          )

          if (existing) {
            const nextItems = state.items.map((item) =>
              item.variantId === nextItem.variantId
                ? {
                    ...item,
                    quantity: clampQuantity(
                      item.quantity + nextItem.quantity,
                      item.maxQuantity,
                    ),
                  }
                : item,
            )

            return {
              ...toStateWithItems(nextItems),
            }
          }

          const nextItems = [
            ...state.items,
            {
              ...nextItem,
              id: nextItem.variantId || nextItem.productId,
              imageUrl: nextItem.imageUrl || EMPTY_IMAGE,
              quantity: clampQuantity(nextItem.quantity, nextItem.maxQuantity),
            },
          ]

          return {
            ...toStateWithItems(nextItems),
          }
        }),
      changeQuantity: (itemId, amount) =>
        set((state) => {
          const nextItems = state.items.map((item) =>
            item.id === itemId
              ? {
                  ...item,
                  quantity: clampQuantity(amount, item.maxQuantity),
                }
              : item,
          )

          return {
            ...toStateWithItems(nextItems),
          }
        }),
      removeItem: (itemId) =>
        set((state) => {
          const nextItems = state.items.filter((item) => item.id !== itemId)
          return {
            ...toStateWithItems(nextItems),
          }
        }),
      clearCart: () =>
        set(() => ({
          ...toStateWithItems([]),
        })),
      setItemSnapshots: (snapshot) =>
        set(() => ({
          itemSnapshots: snapshot,
        })),
      clearItemSnapshots: () =>
        set(() => ({
          itemSnapshots: null,
        })),
      refetch: () =>
        set(() => ({
          errorMessage: null,
          isError: false,
        })),
      mergeKeysFor: (chunks) => {
        const stored = get().mergeKeys ?? {}
        const next: MergeKeys = {}
        const keys = chunks.map((chunk) => {
          const payload = JSON.stringify(chunk)
          const key = stored[payload] ?? next[payload] ?? uuidv4()
          next[payload] = key
          return key
        })
        set(() => ({ mergeKeys: next }))
        return keys
      },
      removeMergedLines: (chunk) =>
        set((state) => {
          const merged = new Set(
            chunk.items.map((item) => item.productVariantId),
          )
          const { [JSON.stringify(chunk)]: _merged, ...mergeKeys } =
            state.mergeKeys ?? {}
          return {
            ...toStateWithItems(
              state.items.filter((item) => !merged.has(item.variantId)),
            ),
            mergeKeys,
          }
        }),
      clearMergedCart: () =>
        set(() => ({
          ...toStateWithItems([]),
          mergeKeys: null,
        })),
      setMergeNotice: (notice) => set(() => ({ mergeNotice: notice })),
      setMerging: (value) => set(() => ({ isMerging: value })),
    }),
    {
      name: CART_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        items: state.items,
        itemSnapshots: state.itemSnapshots,
        mergeKeys: state.mergeKeys,
      }),
      onRehydrateStorage: () => (state, error) => {
        if (!state) return

        if (error) {
          state.items = []
          state.itemSnapshots = null
          state.totals = buildCartTotals([])
          state.errorMessage =
            'We could not sync your cart. Please refresh and try again.'
          state.hasHydrated = true
          state.isLoading = false
          state.isError = true
        } else {
          const sanitizedItems = sanitizeItems(state?.items)
          state.items = sanitizedItems
          state.itemSnapshots = state.itemSnapshots
          // Carts saved before the merge keys existed have none.
          state.mergeKeys = state.mergeKeys ?? null
          state.totals = buildCartTotals(sanitizedItems)
          state.hasHydrated = true
          state.isLoading = false
          state.isError = false
          state.errorMessage = null
        }
      },
    },
  ),
)
