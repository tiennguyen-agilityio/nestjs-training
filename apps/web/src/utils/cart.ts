import { EMPTY_IMAGE } from '@/constants/images'
import { ERROR_MESSAGES } from '@/constants/messages'
import { formatPrice } from '@/utils/common'
import type {
  CartItem,
  CartMergeAdjustment,
  CartTotals,
  ServerCart,
  ServerCartItem,
} from '@/types/cart'

const DEFAULT_MAX_QUANTITY = 99

export const clampQuantity = (
  quantity: number,
  maxQuantity = DEFAULT_MAX_QUANTITY,
): number => {
  if (maxQuantity <= 0) {
    if (!Number.isFinite(quantity)) return 0
    return Math.max(0, Math.trunc(quantity))
  }

  const safeMax = Math.max(1, Math.min(maxQuantity, DEFAULT_MAX_QUANTITY))

  if (!Number.isFinite(quantity)) return 1
  return Math.max(1, Math.min(Math.trunc(quantity), safeMax))
}

/** A line the API flagged (server cart only); browser lines are never flagged. */
const isCountedLine = (item: CartItem): boolean => !item.isUnavailable

/** Leaves out the lines the API flagged; a server line counts its `lineTotal`. */
export const calculateSubtotal = (items: CartItem[]): number =>
  items
    .filter(isCountedLine)
    .reduce(
      (sum, item) => sum + (item.lineTotal ?? item.unitPrice * item.quantity),
      0,
    )

/** The header count: the total quantity of the lines that can be bought. */
export const countCartQuantity = (items: CartItem[]): number =>
  items.filter(isCountedLine).reduce((sum, item) => sum + item.quantity, 0)

/** Maps a line of the API's cart to the `CartItem` the cart pages render. */
export const toCartItem = (item: ServerCartItem): CartItem => ({
  id: item.id,
  variantId: item.productVariantId,
  productId: item.product.id,
  name: item.product.name,
  meta: item.variant.sizeName,
  imageUrl: item.product.primaryImageUrl ?? EMPTY_IMAGE,
  unitPrice: item.variant.salePrice,
  quantity: item.quantity,
  maxQuantity: item.variant.availableQuantity,
  lineTotal: item.lineTotal,
  isUnavailable: !item.isAvailable || item.variant.availableQuantity <= 0,
  exceedsStock:
    item.isAvailable && item.variant.availableQuantity > 0 && !item.inStock,
})

/** The merged cart's line for a variant, when it can still be bought. */
const mergedLineOf = (
  cart: Pick<ServerCart, 'items'> | null,
  productVariantId: string,
) =>
  cart?.items.find(
    (item) =>
      item.productVariantId === productVariantId &&
      item.isAvailable &&
      item.variant.availableQuantity > 0,
  )

/** The success toast count: the browser lines the merge added something to. */
export const countMergedLines = (
  lines: CartItem[],
  adjusted: CartMergeAdjustment[],
): number =>
  lines.length - adjusted.filter((item) => item.quantity === 0).length

/**
 * The Cart page banner for the lines `POST /cart/merge` lowered or skipped.
 * `adjusted[].quantity` is what was added, so the stock left comes from the
 * merged cart's line.
 */
export const describeMergeAdjustments = (
  adjusted: CartMergeAdjustment[],
  lines: CartItem[],
  cart: Pick<ServerCart, 'items'> | null,
): string | null => {
  if (adjusted.length === 0) return null

  const parts = adjusted.map((adjustment) => {
    const name =
      lines.find((line) => line.variantId === adjustment.productVariantId)
        ?.name ?? adjustment.productVariantId
    const merged = mergedLineOf(cart, adjustment.productVariantId)
    return merged
      ? ERROR_MESSAGES.CART_MERGE_LOWERED(
          name,
          merged.variant.availableQuantity,
        )
      : ERROR_MESSAGES.CART_MERGE_SKIPPED(name)
  })
  return `${ERROR_MESSAGES.CART_MERGE_ADJUSTED}${parts.join(', ')}.`
}

export const calculateTotal = ({
  subtotal,
  shipping,
  tax,
}: {
  subtotal: number
  shipping: number | null
  tax: number
}): number => subtotal + (shipping ?? 0) + tax

export const buildCartTotals = (items: CartItem[]): CartTotals => {
  const subtotal = calculateSubtotal(items)
  const shipping = null
  const tax = 0

  return {
    subtotal,
    shipping,
    tax,
    total: calculateTotal({ subtotal, shipping, tax }),
  }
}

export const formatCurrency = (amount: number): string => formatPrice(amount)
