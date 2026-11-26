import { DiscountType, ProductStatus, ProductUnit } from '@repo/constants'
import type { TableColumn } from '@/components/Table'

// The Add form caps a new variant's stock at 500 (the API has no maximum).
export const QUANTITY_MAX = 500

export const UNIT_OPTIONS: {
  value: ProductUnit
  label: string
}[] = [
  { value: ProductUnit.G, label: 'Grams' },
  { value: ProductUnit.KG, label: 'Kilograms' },
  { value: ProductUnit.L, label: 'Liters' },
  { value: ProductUnit.ML, label: 'Milliliters' },
]

export const DISCOUNT_TYPE_OPTIONS: {
  value: DiscountType
  label: string
}[] = [
  { value: DiscountType.PERCENT, label: 'Percent' },
  { value: DiscountType.FIXED, label: 'Fixed' },
]

export const PRODUCTS_TABLE_COLUMNS: TableColumn[] = [
  {
    key: 'product',
    label: 'Product',
    className: 'w-auto min-w-0 px-6 py-4',
  },
  {
    key: 'category',
    label: 'Category',
    className: 'w-[22%] min-w-0 px-6 py-4 text-center align-middle',
  },
  { key: 'price', label: 'Price', className: 'w-[13%] px-6 py-4 text-center' },
  { key: 'stock', label: 'Stock', className: 'w-[9%] text-center' },
  {
    key: 'status',
    label: 'Status',
    className: 'w-[11%] text-center',
  },
  {
    key: 'actions',
    label: 'Actions',
    className: 'w-27 px-6 py-4 text-center',
  },
]

export const PRODUCT_STATUS_OPTIONS: {
  value: string
  label: string
}[] = [
  { value: 'all-status', label: 'All statuses' },
  { value: ProductStatus.DRAFT, label: 'Draft' },
  { value: ProductStatus.ACTIVE, label: 'Active' },
  { value: ProductStatus.INACTIVE, label: 'Inactive' },
  { value: ProductStatus.ARCHIVED, label: 'Archived' },
]

export const SERIES_KICKER = 'THE SENSORY BREW — SERIES 01'

export const COMMUNITY_KICKER = 'COMMUNITY VOICES'

export const PLACEHOLDER_RATING = 4.9
export const PLACEHOLDER_REVIEW_COUNT = 128

export interface ProductReviewDisplay {
  id: string
  authorName: string
  authorRole: string
  rating: 1 | 2 | 3 | 4 | 5
  quote: string
  dateLabel: string
}

export const MOCK_PRODUCT_REVIEWS: ProductReviewDisplay[] = [
  {
    id: 'r-1',
    authorName: 'Julian Thorne',
    authorRole: 'Verified Enthusiast',
    rating: 5,
    quote:
      'Bright acidity without harsh edges — exactly what I want from a washed Yirgacheffe.',
    dateLabel: 'October 14, 2024',
  },
  {
    id: 'r-2',
    authorName: 'Maya Chen',
    authorRole: 'Home Barista',
    rating: 5,
    quote:
      'Floral on the nose and a clean finish. My go-to for weekend pour-overs.',
    dateLabel: 'September 2, 2024',
  },
]

export const SHOP_PDP_TRUST_ITEMS = [
  {
    id: 'ship',
    title: 'Free Shipping',
    description: 'On qualifying orders',
  },
  {
    id: 'ethics',
    title: 'Ethically Sourced',
    description: 'Partner farms we trust',
  },
  {
    id: 'quality',
    title: 'Quality Guaranteed',
    description: 'Roasted with care',
  },
] as const
