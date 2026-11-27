import { type OptionItem } from '@/types/common'
import { ProductSortBy, RoastLevel } from '@repo/constants'

export const ROAST_PRICE_FILTER = {
  ALL: 'all',
  UNDER_50: 'under-50',
  FROM_50_TO_100: '50-100',
  FROM_100_TO_150: '100-150',
  FROM_150_TO_200: '150-200',
  OVER_200: 'over-200',
} as const

export type RoastPriceFilter =
  (typeof ROAST_PRICE_FILTER)[keyof typeof ROAST_PRICE_FILTER]

export interface RoastPriceRange {
  label: string
  minPrice?: number
  maxPrice?: number
}

export const ROAST_PRICE_RANGES: Record<RoastPriceFilter, RoastPriceRange> = {
  [ROAST_PRICE_FILTER.ALL]: { label: 'All prices' },
  [ROAST_PRICE_FILTER.UNDER_50]: { label: 'Under $50', maxPrice: 49.99 },
  [ROAST_PRICE_FILTER.FROM_50_TO_100]: {
    label: '$50 – $100',
    minPrice: 50,
    maxPrice: 99.99,
  },
  [ROAST_PRICE_FILTER.FROM_100_TO_150]: {
    label: '$100 – $150',
    minPrice: 100,
    maxPrice: 149.99,
  },
  [ROAST_PRICE_FILTER.FROM_150_TO_200]: {
    label: '$150 – $200',
    minPrice: 150,
    maxPrice: 199.99,
  },
  [ROAST_PRICE_FILTER.OVER_200]: { label: 'Above $200', minPrice: 200 },
}

export const ROAST_PRICE_OPTIONS: OptionItem[] = Object.entries(
  ROAST_PRICE_RANGES,
).map(([value, { label }]) => ({ value, label }))

// The API's sort values plus the UI-only default (no sort param sent).
export const ROAST_SORT_VALUE = {
  CURATED: 'curated',
  ...ProductSortBy,
} as const

export type RoastSortValue =
  (typeof ROAST_SORT_VALUE)[keyof typeof ROAST_SORT_VALUE]

export interface RoastLevelOption {
  value: RoastLevel
  label: string
}

export const ROAST_LEVEL_OPTIONS: RoastLevelOption[] = [
  { value: RoastLevel.LIGHT, label: 'Light Roast' },
  { value: RoastLevel.MEDIUM, label: 'Medium Roast' },
  { value: RoastLevel.DARK, label: 'Dark Roast' },
]

export const ROAST_LEVEL_SPECTRUM_PERCENT: Record<RoastLevel, number> = {
  [RoastLevel.LIGHT]: 15,
  [RoastLevel.MEDIUM]: 50,
  [RoastLevel.DARK]: 85,
}

// A Record, so tsc flags a new ProductSortBy value that has no label yet.
export const ROAST_SORT_LABELS: Record<RoastSortValue, string> = {
  [ROAST_SORT_VALUE.CURATED]: 'Curated Selection',
  [ROAST_SORT_VALUE.PRICE_ASC]: 'Price: Low to High',
  [ROAST_SORT_VALUE.PRICE_DESC]: 'Price: High to Low',
  [ROAST_SORT_VALUE.NAME_ASC]: 'Name: A to Z',
  [ROAST_SORT_VALUE.NAME_DESC]: 'Name: Z to A',
}

export const ROAST_SORT_OPTIONS: OptionItem[] = Object.entries(
  ROAST_SORT_LABELS,
).map(([value, label]) => ({ value, label }))

export interface RoastCollection {
  id: string
  name: string
  /** The first variant's list price, before the discount. */
  price: number
  /** The price the shopper pays; equals `price` without a discount. */
  salePrice: number
  flavorNotes: string
  roastMeta: string
  roastLevel: RoastLevel
  imageUrl: string
  badgeLabel?: string
}
