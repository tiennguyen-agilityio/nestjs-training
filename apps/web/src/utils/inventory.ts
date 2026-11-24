import type { CartItem } from '@/types/cart'
import type { Product } from '@/types/product'

export const getPrimaryVariantQuantity = (product: Product): number => {
  const raw = product.variants[0]?.stockQuantity
  if (raw === undefined || raw === null) return 0
  const n = Number(raw)
  return Number.isFinite(n) ? Math.trunc(n) : 0
}

export const isProductOutOfStock = (product: Product): boolean =>
  getPrimaryVariantQuantity(product) <= 0

export const isCartItemOutOfStock = (item: CartItem): boolean =>
  item.isUnavailable === true ||
  (item.maxQuantity !== undefined && item.maxQuantity <= 0)

/** A line that blocks checkout: out of stock, or above the stock it has left. */
export const isCartItemBlocked = (item: CartItem): boolean =>
  isCartItemOutOfStock(item) || item.exceedsStock === true
