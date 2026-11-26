import type {
  DiscountType,
  ProductStatus,
  ProductUnit,
  RoastLevel,
} from '@repo/constants'

// A variant as the product response lists it.
export interface ProductVariantSummary {
  id?: string
  sku?: string
  size: number
  unit: ProductUnit
  // Worked out by the API from size and unit, e.g. "250g".
  name: string
  price: number
  discountType: DiscountType | null
  discountValue: number | null
  stockQuantity: number
}

export interface ProductVariant {
  id: string
  productId: string
  sku?: string
  size: number
  unit: ProductUnit
  name: string
  price: number
  discountType: DiscountType | null
  discountValue: number | null
  stockQuantity: number
}

export interface ProductImage {
  id?: string
  url: string
  isPrimary: boolean
  sortOrder: number
}

export interface Product {
  id: string
  categoryId: string
  name: string
  description: string
  roastLevel: RoastLevel
  isOrganic: boolean
  isFairTrade: boolean
  status: ProductStatus
  tastingNotes: string | null
  origin: string
  processingMethod: string
  variants: ProductVariantSummary[]
  images: ProductImage[]
  createdAt: string | null
  updatedAt: string | null
  deletedAt: string | null
}

export interface ProductFormValues {
  categoryId: string
  name: string
  description: string
  roastLevel: RoastLevel
  isOrganic: boolean
  isFairTrade: boolean
  size: number | ''
  unit: ProductUnit | ''
  price: number | ''
  discountType: DiscountType
  discountValue: number
  stockQuantity: number | ''
  origin: string
  processingMethod: string
}
