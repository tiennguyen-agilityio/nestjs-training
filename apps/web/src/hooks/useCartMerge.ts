'use client'

import { useAuth } from '@clerk/nextjs'
import { useQueryClient } from '@tanstack/react-query'
import { VALIDATION_RULES } from '@repo/constants'
import type { MergeCartPayload } from '@repo/schemas'
import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { useShallow } from 'zustand/react/shallow'

import { CLERK_SESSION_TEMPLATE } from '@/constants/common'
import { API_FALLBACK_ERRORS, SUCCESS_MESSAGES } from '@/constants/messages'
import { cartQueryKeys } from '@/hooks/useCart'
import { sendUntilSettled } from '@/hooks/useIdempotencyKey'
import { mergeCart } from '@/services/cart'
import { useCartStore } from '@/store/useCartStore'
import type { CartItem, CartMergeAdjustment, ServerCart } from '@/types/cart'
import { countMergedLines, describeMergeAdjustments } from '@/utils/cart'

/** The browser lines as `POST /cart/merge` bodies of at most MAX_ITEMS lines. */
const toMergeChunks = (lines: CartItem[]): MergeCartPayload[] => {
  const size = VALIDATION_RULES.CART_MERGE.MAX_ITEMS
  const chunks: MergeCartPayload[] = []
  for (let start = 0; start < lines.length; start += size) {
    chunks.push({
      items: lines.slice(start, start + size).map((line) => ({
        productVariantId: line.variantId,
        quantity: line.quantity,
      })),
    })
  }
  return chunks
}

const MERGE_LOCK = 'coffeehub-cart-merge'

/** Runs `task` while no other tab runs one (Web Locks), or at once without them. */
const withMergeLock = (task: () => Promise<void>): Promise<void> =>
  typeof navigator !== 'undefined' && navigator.locks
    ? navigator.locks.request(MERGE_LOCK, task)
    : task()

/**
 * Right after a successful sign-in, moves the browser cart onto the server
 * cart. The browser cart and its keys stay until every request succeeds, so a
 * failed merge runs again on the next load with the same `Idempotency-Key`.
 */
export function useCartMerge(): void {
  const { isLoaded, isSignedIn, userId, getToken } = useAuth()
  const queryClient = useQueryClient()
  const { lineCount, hasHydrated } = useCartStore(
    useShallow((state) => ({
      lineCount: state.items.length,
      hasHydrated: state.hasHydrated,
    })),
  )
  const started = useRef(false)

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      started.current = false
      return
    }
    if (started.current || !isLoaded || !isSignedIn || !userId) return
    if (!hasHydrated || lineCount === 0) return
    started.current = true

    const run = async () => {
      // Another tab may have merged, or saved keys, since this tab loaded. It
      // runs before any set(): persist writes this tab's state on every set.
      await useCartStore.persist.rehydrate()
      useCartStore.getState().setMerging(true)
      try {
        const store = useCartStore.getState()
        const lines = store.items
        if (lines.length === 0) return

        const chunks = toMergeChunks(lines)
        const keys = store.mergeKeysFor(chunks)
        const tokenGetter = () => getToken({ template: CLERK_SESSION_TEMPLATE })
        const adjusted: CartMergeAdjustment[] = []
        let cart: ServerCart | null = null

        let failed = false
        try {
          for (const [index, chunk] of chunks.entries()) {
            const idempotencyKey = keys[index] ?? ''
            const result = await sendUntilSettled(() =>
              mergeCart(chunk, { getToken: tokenGetter, idempotencyKey }),
            )
            if (!result.ok) {
              toast.error(result.error)
              failed = true
              break
            }
            const { adjusted: chunkAdjusted, ...chunkCart } = result.cart
            adjusted.push(...chunkAdjusted)
            cart = chunkCart
            // A merged chunk is never sent again, even if a later one fails.
            useCartStore.getState().removeMergedLines(chunk)
          }
        } catch {
          // getToken can reject before the request is sent.
          toast.error(API_FALLBACK_ERRORS.CART_MERGE)
          failed = true
        }

        // The chunks that merged show up, with their notice, even after a failure.
        if (cart) queryClient.setQueryData(cartQueryKeys.detail(userId), cart)
        void queryClient.invalidateQueries({ queryKey: cartQueryKeys.root })
        useCartStore
          .getState()
          .setMergeNotice(describeMergeAdjustments(adjusted, lines, cart))
        if (failed) return

        const mergedCount = countMergedLines(lines, adjusted)
        if (mergedCount > 0) {
          toast.success(SUCCESS_MESSAGES.CART_MERGED(mergedCount))
        }
        useCartStore.getState().clearMergedCart()
      } finally {
        useCartStore.getState().setMerging(false)
      }
    }

    void withMergeLock(run).catch(() =>
      toast.error(API_FALLBACK_ERRORS.CART_MERGE),
    )
  }, [
    isLoaded,
    isSignedIn,
    userId,
    hasHydrated,
    lineCount,
    getToken,
    queryClient,
  ])
}
