'use client'

import { useCartMerge } from '@/hooks/useCartMerge'

/**
 * Merges the browser cart into the signed-in shopper's server cart right after
 * sign-in. Sits inside QueryProvider so the merged cart lands in the cache.
 */
export const CartMergeBridge = () => {
  useCartMerge()
  return null
}
