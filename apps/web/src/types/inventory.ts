import type {
  DiscountType,
  InventoryMovementType,
  ProductStatus,
  ProductUnit,
  StockLevel,
} from '@repo/constants'

/** One variant as the inventory list shows it (`GET /inventory`). */
export interface InventoryItem {
  id: string
  sku: string
  name: string
  size: number
  unit: ProductUnit
  price: number
  discountType: DiscountType
  discountValue: number
  stockQuantity: number
  reservedQuantity: number
  availableQuantity: number
  stockLevel: StockLevel
  product: {
    id: string
    name: string
    slug: string
    status: ProductStatus
    primaryImageUrl: string | null
  }
}

/** One row of a variant's stock history. */
export interface InventoryMovement {
  id: string
  type: InventoryMovementType
  /** Signed for ADJUSTMENT; positive otherwise. */
  quantity: number
  reason: string | null
  orderNumber: string | null
  /** Null for a system movement (an order). */
  createdBy: { id: string; firstName: string; lastName: string } | null
  createdAt: string
}

/** `POST …/restock` and `POST …/adjustments`. */
export interface StockChangeResult {
  variant: InventoryItem
  movement: InventoryMovement
}
