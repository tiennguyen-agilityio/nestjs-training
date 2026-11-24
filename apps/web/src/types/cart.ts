import type { DiscountType, ProductStatus } from '@repo/constants'

export interface CartItem {
  id: string
  variantId: string
  productId: string
  name: string
  meta: string
  imageUrl: string
  unitPrice: number
  quantity: number
  maxQuantity?: number
  /** Server cart only: the line cannot be bought (not ACTIVE, deleted, or no stock left). */
  isUnavailable?: boolean
  /** Server cart only: `inStock` false while stock is left: lower it to check out. */
  exceedsStock?: boolean
  /** Server cart only: the API's `lineTotal`. */
  lineTotal?: number
}

/** A line of the API's `ResponseCartDto` (`GET /cart`). */
export interface ServerCartItem {
  id: string
  productVariantId: string
  quantity: number
  product: {
    id: string
    name: string
    slug: string
    status: ProductStatus
    primaryImageUrl: string | null
  }
  variant: {
    sku: string
    sizeName: string
    price: number
    discountType: DiscountType | null
    discountValue: number
    salePrice: number
    availableQuantity: number
  }
  inStock: boolean
  isAvailable: boolean
  lineTotal: number
  createdAt: string
  updatedAt: string
}

/** The API's `ResponseCartDto`. */
export interface ServerCart {
  id: string | null
  userId: string
  items: ServerCartItem[]
  totalQuantity: number
  subTotal: number
  createdAt: string | null
  updatedAt: string | null
}

/** A merged line the API lowered (`quantity` < requested) or skipped (`quantity` 0). */
export interface CartMergeAdjustment {
  productVariantId: string
  requestedQuantity: number
  quantity: number
}

/** The API's `ResponseMergedCartDto` (`POST /cart/merge`). */
export interface MergedServerCart extends ServerCart {
  adjusted: CartMergeAdjustment[]
}

export interface CartTotals {
  subtotal: number
  shipping: number | null
  tax: number
  total: number
}

export interface CartAddItemInput {
  variantId: string
  productId: string
  name: string
  meta: string
  imageUrl: string
  unitPrice: number
  quantity: number
  maxQuantity?: number
}
