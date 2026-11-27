import { PAGE_SIZE } from '@/constants/common'
import {
  ROAST_PRICE_FILTER,
  ROAST_SORT_VALUE,
  type RoastPriceFilter,
  type RoastSortValue,
} from '@/constants/roast'
import { RoastLevel } from '@repo/constants'

const ROAST_LEVEL_SET = new Set<string>(Object.values(RoastLevel))
const ROAST_SORT_VALUES: readonly string[] = Object.values(ROAST_SORT_VALUE)
const ROAST_PRICE_FILTERS: readonly string[] = Object.values(ROAST_PRICE_FILTER)

export function parseOptionalQueryParam(value: string | null): string | null {
  const v = value?.trim() ?? ''
  return v === '' ? null : v
}

export function parseListPageParam(value: string | null): number {
  const n = Number.parseInt(value ?? '1', 10)
  if (!Number.isFinite(n) || n < 1) return 1
  return n
}

export function parseListSearchParam(value: string | null): string {
  return value ?? ''
}

export function parseListLimitParam(value: string | null): number {
  if (value == null || value === '') return PAGE_SIZE
  const n = Number.parseInt(value, 10)
  if (!Number.isFinite(n) || n < 1) return PAGE_SIZE
  return n
}

export const urlSchema = {
  page: parseListPageParam,
  search: parseListSearchParam,
  limit: parseListLimitParam,
}

export const userUrlSchema = {
  ...urlSchema,
  role: parseOptionalQueryParam,
  status: parseOptionalQueryParam,
} as const

export const shippingMethodUrlSchema = {
  ...urlSchema,
  status: parseOptionalQueryParam,
} as const

export const productUrlSchema = {
  ...urlSchema,
  categoryId: parseOptionalQueryParam,
  status: parseOptionalQueryParam,
} as const

export const inventoryUrlSchema = {
  ...urlSchema,
  lowStock: parseOptionalQueryParam,
} as const

export const ordersUrlSchema = {
  ...urlSchema,
  status: parseOptionalQueryParam,
  shippingStatus: parseOptionalQueryParam,
  paymentStatus: parseOptionalQueryParam,
} as const

function isRoastPriceFilter(value: string): value is RoastPriceFilter {
  return ROAST_PRICE_FILTERS.includes(value)
}

export function parseRoastPriceFilterParam(
  value: string | null,
): RoastPriceFilter {
  const v = value?.trim() ?? ''
  return isRoastPriceFilter(v) ? v : ROAST_PRICE_FILTER.ALL
}

export function parseRoastLevelsParam(value: string | null): RoastLevel[] {
  if (value == null || value.trim() === '') return []
  const parts = value.split(',').map((s) => s.trim().toUpperCase())
  const out: RoastLevel[] = []
  for (const part of parts) {
    if (ROAST_LEVEL_SET.has(part)) {
      out.push(part as RoastLevel)
    }
  }
  return out
}

function isRoastSortValue(value: string): value is RoastSortValue {
  return ROAST_SORT_VALUES.includes(value)
}

export function parseRoastSortParam(value: string | null): RoastSortValue {
  const v = value?.trim() ?? ''
  return isRoastSortValue(v) ? v : ROAST_SORT_VALUE.CURATED
}

/** Shop /roasts: list + filters in query string (real API + shareable state). */
export const shopRoastsUrlSchema = {
  page: parseListPageParam,
  limit: parseListLimitParam,
  search: parseListSearchParam,
  price: parseRoastPriceFilterParam,
  roastLevel: parseRoastLevelsParam,
  sortBy: parseRoastSortParam,
} as const
