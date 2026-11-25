import { type OptionItem } from '@/types/common'
import { ProductSortBy, RoastLevel, VALIDATION_RULES } from '@repo/constants'

export const ROAST_PRICE_MIN = VALIDATION_RULES.PRICE.MIN
export const ROAST_PRICE_MAX = VALIDATION_RULES.PRICE.MAX

export const ROAST_DEFAULT_PRICE_RANGE: [number, number] = [
  ROAST_PRICE_MIN,
  ROAST_PRICE_MAX,
]

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
