import { PaymentMethod } from '@repo/constants'
import type { PlaceOrderPayload } from '@repo/schemas'
import { Banknote, Package, Truck } from 'lucide-react'

import type { StatCardItem } from '@/components/StatsCards'
import { ERROR_MESSAGES } from '@/constants/messages'
import type { ApiErrorResponse, ErrorDetail, ResponseMeta } from '@/types/api'
import {
  PAYMENT_METHOD,
  type CheckoutCardFormValues,
  type CheckoutFormValues,
} from '@/types/checkout'
import {
  ORDER_STATUS,
  SHIPPING_STATUS,
  type Order,
  type PlacedOrder,
} from '@/types/order'

import { formatPrice } from './common'

export function formatOrderCustomerName(order: Order): string {
  const { firstName, lastName } = order.addressSnapshot
  const full = [firstName, lastName].map((s) => s?.trim()).filter(Boolean)
  return full.length > 0 ? full.join(' ') : '—'
}

export function formatOrderListDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(d)
}

export function getOrderStatusPresentation(status: ORDER_STATUS): {
  label: string
  badgeClassName: string
} {
  switch (status) {
    case ORDER_STATUS.PENDING:
      return {
        label: 'Pending',
        badgeClassName:
          'bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200',
      }
    case ORDER_STATUS.CONFIRMED:
      return {
        label: 'Confirmed',
        badgeClassName:
          'bg-sky-100 text-sky-900 dark:bg-sky-950/50 dark:text-sky-200',
      }
    case ORDER_STATUS.COMPLETED:
      return {
        label: 'Completed',
        badgeClassName:
          'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200',
      }
    case ORDER_STATUS.CANCELLED:
      return {
        label: 'Cancelled',
        badgeClassName: 'bg-muted text-muted-foreground',
      }
    default:
      return {
        label: String(status),
        badgeClassName: 'bg-muted text-muted-foreground',
      }
  }
}

export function getShippingStatusPresentation(status: SHIPPING_STATUS): {
  label: string
  badgeClassName: string
} {
  switch (status) {
    case SHIPPING_STATUS.PENDING:
      return {
        label: 'Pending',
        badgeClassName:
          'bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200',
      }
    case SHIPPING_STATUS.SHIPPING:
      return {
        label: 'Shipping',
        badgeClassName:
          'bg-sky-100 text-sky-900 dark:bg-sky-950/50 dark:text-sky-200',
      }
    case SHIPPING_STATUS.DELIVERED:
      return {
        label: 'Delivered',
        badgeClassName:
          'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200',
      }
    case SHIPPING_STATUS.RETURNED:
      return {
        label: 'Returned',
        badgeClassName:
          'bg-orange-100 text-orange-900 dark:bg-orange-950/40 dark:text-orange-200',
      }
    default:
      return {
        label: String(status),
        badgeClassName: 'bg-muted text-muted-foreground',
      }
  }
}

export function buildOrderDashboardStats(
  orders: Order[],
  meta: ResponseMeta | null,
): StatCardItem[] {
  const totalCount = meta?.totalCount ?? orders.length
  const pageIsPartial =
    meta != null && orders.length > 0 && meta.totalCount > orders.length

  const processing = orders.filter(
    (o) => o.status === ORDER_STATUS.PENDING,
  ).length
  const shipped = orders.filter(
    (o) => o.shippingStatus === SHIPPING_STATUS.SHIPPING,
  ).length
  const revenueSum = orders.reduce(
    (sum, o) => sum + (Number.isFinite(o.totalAmount) ? o.totalAmount : 0),
    0,
  )

  const partialNote = pageIsPartial ? 'Based on orders on this page' : undefined

  return [
    {
      id: 'total-orders',
      label: 'Total orders',
      value: totalCount,
      footnote: partialNote,
      footnoteTone: 'muted',
    },
    {
      id: 'processing',
      label: 'Processing',
      value: processing,
      footnote: partialNote ?? 'Current active batches',
      footnoteIcon: Package,
      footnoteTone: partialNote ? 'muted' : 'muted',
    },
    {
      id: 'shipped',
      label: 'Shipped',
      value: shipped,
      footnote: partialNote ?? 'In transit to customers',
      footnoteIcon: Truck,
      footnoteTone: 'muted',
    },
    {
      id: 'revenue',
      label: 'Revenue',
      value: formatPrice(revenueSum),
      footnote: partialNote ?? 'Net earnings (current page)',
      variant: 'accent',
      icon: Banknote,
      footnoteTone: 'muted',
    },
  ]
}

// --- Place-order API: payload and line errors keyed to cart rows (checkout) ---

/** The `errCode`s `POST /orders` answers with (400, nothing saved). */
export const PLACE_ORDER_ERR_CODES = {
  CART_EMPTY: 'cartEmpty',
  SHIPPING_METHOD_UNAVAILABLE: 'shippingMethodUnavailable',
  ITEM_UNAVAILABLE: 'itemUnavailable',
  OUT_OF_STOCK: 'outOfStock',
} as const

const API_PAYMENT_METHOD: Record<PAYMENT_METHOD, PaymentMethod> = {
  [PAYMENT_METHOD.STRIPE]: PaymentMethod.CARD,
  [PAYMENT_METHOD.PAYPAL]: PaymentMethod.PAYPAL,
  [PAYMENT_METHOD.COD]: PaymentMethod.COD,
}

/** The `POST /orders` body: the API takes the lines from the server cart. */
export const buildPlaceOrderPayload = (
  // The card fields are not sent (online payment is #33).
  values: Omit<CheckoutFormValues, keyof CheckoutCardFormValues>,
  shippingMethodId: string,
): PlaceOrderPayload => ({
  shippingMethodId,
  paymentMethod: API_PAYMENT_METHOD[values.paymentMethod],
  recipientName: [values.firstName.trim(), values.lastName.trim()]
    .filter(Boolean)
    .join(' '),
  recipientPhone: values.phoneNumber.trim(),
  addressLine: values.addressLine.trim(),
  ward: values.ward.trim(),
  district: values.district.trim(),
  city: values.city.trim(),
  postalCode: values.postalCode.trim(),
})

/** `items[<i>]…` (older format) or the API's `items.<i>.productVariantId`. */
const ITEM_FIELD_PATTERN = /^items(?:\[(\d+)]|\.(\d+))/

const itemIndexOf = (match: RegExpExecArray): number =>
  Number.parseInt(match[1] ?? match[2] ?? '', 10)

type ItemFieldErrorWithLineContext = ErrorDetail & {
  submitLineId?: string
  submitProductId?: string
}

export interface SubmitLineRef {
  id: string
  productId: string
}

/**
 * Tags `items[n]` API errors with `submitLineId` / `submitProductId` from the
 * cart lines sent in that request (stable keys for UI after remove/reorder).
 */
export const tagItemErrorsWithLineRefs = (
  errors: ErrorDetail[],
  linesAtSubmit: readonly SubmitLineRef[],
): ItemFieldErrorWithLineContext[] =>
  errors.map((error) => {
    const field = error.field
    if (!field) {
      return error
    }

    const match = ITEM_FIELD_PATTERN.exec(field)
    if (!match) {
      return error
    }

    const apiIndex = itemIndexOf(match)
    if (
      !Number.isFinite(apiIndex) ||
      apiIndex < 0 ||
      apiIndex >= linesAtSubmit.length
    ) {
      return error
    }

    const line = linesAtSubmit[apiIndex]
    if (!line) {
      return error
    }

    return {
      ...error,
      submitLineId: line.id,
      submitProductId: line.productId,
    }
  })

/**
 * Maps `items[n]` errors onto current summary row indices using line id +
 * product id when present; otherwise falls back to API index (legacy).
 */
export const mapItemFieldErrorsToLineMessages = (
  errors: ErrorDetail[] | undefined,
  items: readonly SubmitLineRef[],
): string[] => {
  if (!errors?.length) {
    return []
  }

  const next: string[] = []

  for (const error of errors) {
    const field = error.field
    if (!field) {
      continue
    }

    const match = ITEM_FIELD_PATTERN.exec(field)
    if (!match) {
      continue
    }

    const apiIndex = itemIndexOf(match)
    if (!Number.isFinite(apiIndex)) {
      continue
    }

    // The shopper sees the API's `description`, never its developer `message`.
    const message = error.description ?? ERROR_MESSAGES.ORDER_LINE_ERROR

    const row = error as ItemFieldErrorWithLineContext
    if (row.submitLineId !== undefined) {
      const displayIndex = items.findIndex(
        (item) =>
          item.id === row.submitLineId &&
          (row.submitProductId === undefined ||
            item.productId === row.submitProductId),
      )
      if (displayIndex === -1) {
        continue
      }
      next[displayIndex] = message
      continue
    }

    if (apiIndex >= 0 && apiIndex < items.length) {
      next[apiIndex] = message
    }
  }

  return next
}

/** Line-level quantity messages keyed by cart line `id` (stable after reorder/remove). */
export const mapItemFieldErrorsToLineIdMessages = (
  errors: ErrorDetail[] | undefined,
  items: readonly SubmitLineRef[],
): Record<string, string> => {
  const byIndex = mapItemFieldErrorsToLineMessages(errors, items)
  const byLineId: Record<string, string> = {}
  for (let i = 0; i < items.length; i++) {
    const line = items[i]
    const message = byIndex[i]
    if (line && message) {
      byLineId[line.id] = message
    }
  }
  return byLineId
}

export const omitSubmitErrorsForRemovedLine = (
  response: ApiErrorResponse | null,
  lineId: string,
  productId: string,
): ApiErrorResponse | null => {
  if (!response?.errors?.length) {
    return response
  }

  const filtered = response.errors.filter((err) => {
    const row = err as ItemFieldErrorWithLineContext
    if (row.submitLineId !== lineId) {
      return true
    }
    if (row.submitProductId === undefined) {
      return false
    }
    return row.submitProductId !== productId
  })

  if (filtered.length === response.errors.length) {
    return response
  }

  return {
    ...response,
    errors: filtered,
  }
}

/**
 * True for the API's order (`POST /orders`); false for an Order success
 * snapshot saved in the browser before the page read the API's order.
 */
export const isPlacedOrder = (value: unknown): value is PlacedOrder => {
  if (!value || typeof value !== 'object') return false
  const order = value as Partial<PlacedOrder>
  return (
    typeof order.orderNumber === 'string' &&
    typeof order.recipientName === 'string' &&
    Array.isArray(order.items) &&
    order.items.every((item) => typeof item?.lineTotal === 'number')
  )
}
