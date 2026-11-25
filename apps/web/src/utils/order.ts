import { PaymentMethod, PaymentType } from '@repo/constants'
import type { PlaceOrderPayload } from '@repo/schemas'
import { Banknote, Package, Truck } from 'lucide-react'

import type { StatCardItem } from '@/components/StatsCards'
import { API_FALLBACK_ERRORS, ERROR_MESSAGES } from '@/constants/messages'
import type { ApiErrorResponse, ErrorDetail, ResponseMeta } from '@/types/api'
import type { CartItem, CartTotals } from '@/types/cart'
import {
  PAYMENT_METHOD,
  type CheckoutCardFormValues,
  type CheckoutFormValues,
} from '@/types/checkout'
import {
  ORDER_STATUS,
  SHIPPING_STATUS,
  type OrderSummary,
  type OrderDetail,
  type PlacedOrder,
} from '@/types/order'

import {
  OrderPaymentStatus,
  OrderStatus,
  ShippingStatus,
} from '@repo/constants'

import { formatPrice } from './common'
import { getErrorMessage } from './form'
import { ServiceError } from './query'

export function formatOrderCustomerName(order: OrderSummary): string {
  const { firstName, lastName } = order.customer
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

/** Day, short month and time, e.g. "17 Nov, 16:00". */
export function formatOrderDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d)
}

export function getOrderStatusPresentation(
  status: ORDER_STATUS | OrderStatus,
): {
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

export function getShippingStatusPresentation(
  status: SHIPPING_STATUS | ShippingStatus,
): {
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

const PAYMENT_STATUS_PRESENTATION: Record<
  OrderPaymentStatus,
  { label: string; badgeClassName: string }
> = {
  [OrderPaymentStatus.UNPAID]: {
    label: 'Unpaid',
    badgeClassName: 'bg-muted text-muted-foreground',
  },
  [OrderPaymentStatus.PENDING]: {
    label: 'Pending',
    badgeClassName:
      'bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200',
  },
  [OrderPaymentStatus.PAID]: {
    label: 'Paid',
    badgeClassName:
      'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200',
  },
  [OrderPaymentStatus.FAILED]: {
    label: 'Failed',
    badgeClassName:
      'bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-200',
  },
  [OrderPaymentStatus.PARTIALLY_REFUNDED]: {
    label: 'Partially refunded',
    badgeClassName:
      'bg-orange-100 text-orange-900 dark:bg-orange-950/40 dark:text-orange-200',
  },
  [OrderPaymentStatus.REFUNDED]: {
    label: 'Refunded',
    badgeClassName:
      'bg-sky-100 text-sky-900 dark:bg-sky-950/50 dark:text-sky-200',
  },
}

/** Badge label and colours of an order's payment status. */
export function getPaymentStatusPresentation(status: OrderPaymentStatus): {
  label: string
  badgeClassName: string
} {
  return PAYMENT_STATUS_PRESENTATION[status]
}

export function buildOrderDashboardStats(
  orders: OrderSummary[],
  meta: ResponseMeta | null,
): StatCardItem[] {
  const totalCount = meta?.totalCount ?? orders.length
  const pageIsPartial =
    meta != null && orders.length > 0 && meta.totalCount > orders.length

  const processing = orders.filter(
    (o) => o.status === OrderStatus.PENDING,
  ).length
  const shipped = orders.filter(
    (o) => o.shippingStatus === ShippingStatus.SHIPPING,
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

export const PAYMENT_ERR_CODES = {
  ORDER_EXPIRED: 'paymentOrderExpired',
  NOT_PAYABLE: 'paymentNotPayable',
  GATEWAY_UNAVAILABLE: 'paymentGatewayUnavailable',
  GATEWAY_REJECTED: 'paymentGatewayRejected',
  METHOD_UNAVAILABLE: 'paymentMethodUnavailable',
} as const

const PAYMENT_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  [PAYMENT_ERR_CODES.ORDER_EXPIRED]: ERROR_MESSAGES.PAYMENT_ORDER_EXPIRED,
  [PAYMENT_ERR_CODES.NOT_PAYABLE]: ERROR_MESSAGES.PAYMENT_NOT_PAYABLE,
  [PAYMENT_ERR_CODES.GATEWAY_UNAVAILABLE]:
    ERROR_MESSAGES.PAYMENT_GATEWAY_UNAVAILABLE,
  [PAYMENT_ERR_CODES.GATEWAY_REJECTED]: ERROR_MESSAGES.PAYMENT_GATEWAY_REJECTED,
  [PAYMENT_ERR_CODES.METHOD_UNAVAILABLE]:
    ERROR_MESSAGES.PAYMENT_METHOD_UNAVAILABLE,
}

export function paymentErrorMessage(
  errCode: string | null | undefined,
  fallback: string = API_FALLBACK_ERRORS.PAYMENT_START,
): string {
  return (
    (errCode && Object.hasOwn(PAYMENT_ERROR_MESSAGES, errCode)
      ? PAYMENT_ERROR_MESSAGES[errCode]
      : undefined) ?? fallback
  )
}

export type OrderSuccessPaymentKind =
  | 'paid'
  | 'confirming'
  | 'stillConfirming'
  | 'notCompleted'
  | 'failed'
  | 'badgeOnly'

export interface OrderSuccessPaymentView {
  kind: OrderSuccessPaymentKind
  badgeStatus: OrderPaymentStatus
  canPayNow: boolean
  errorMessage: string | null
}

/** The method of the order's newest CHARGE, or `null` without one. */
export const chargeMethodOf = (order: OrderDetail): PaymentMethod | null => {
  const charges = order.payments
    .filter((payment) => payment.type === PaymentType.CHARGE)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  return charges[0]?.method ?? null
}

const paymentKindOf = (
  status: OrderPaymentStatus,
  hasSessionId: boolean,
  isPollExhausted: boolean,
): OrderSuccessPaymentKind => {
  switch (status) {
    case OrderPaymentStatus.PAID:
      return 'paid'
    case OrderPaymentStatus.PENDING:
      if (!hasSessionId) return 'notCompleted'
      return isPollExhausted ? 'stillConfirming' : 'confirming'
    case OrderPaymentStatus.FAILED:
      return hasSessionId && !isPollExhausted ? 'confirming' : 'failed'
    case OrderPaymentStatus.UNPAID:
      return 'notCompleted'
    default:
      return 'badgeOnly'
  }
}

export function getOrderSuccessPaymentView(input: {
  order: OrderDetail
  hasSessionId: boolean
  paymentError: string | null
  isPollExhausted: boolean
}): OrderSuccessPaymentView {
  const { order, hasSessionId, paymentError, isPollExhausted } = input
  const kind = paymentKindOf(order.paymentStatus, hasSessionId, isPollExhausted)
  const isUnfinished = kind === 'notCompleted' || kind === 'failed'
  const isConfirming = kind === 'confirming' || kind === 'stillConfirming'

  return {
    kind,
    badgeStatus: isConfirming
      ? OrderPaymentStatus.PENDING
      : order.paymentStatus,
    canPayNow:
      isUnfinished &&
      order.status === OrderStatus.PENDING &&
      chargeMethodOf(order) === PaymentMethod.CARD,
    errorMessage:
      isUnfinished && paymentError ? paymentErrorMessage(paymentError) : null,
  }
}

const RETRYABLE_METHODS = new Set<PaymentMethod | null>([
  PaymentMethod.CARD,
  PaymentMethod.PAYPAL,
])

/** Order details offers "Retry payment": a FAILED online charge on a PENDING order before its deadline. */
export function canRetryPayment(
  order: OrderDetail,
  now: Date = new Date(),
): boolean {
  return (
    order.paymentStatus === OrderPaymentStatus.FAILED &&
    order.status === OrderStatus.PENDING &&
    RETRYABLE_METHODS.has(chargeMethodOf(order)) &&
    (!order.expiresAt || new Date(order.expiresAt) > now)
  )
}

/** The cancel dialog's message: the API's `errCode`, never its `message`, picks it. */
export const getCancelOrderErrorMessage = (error: unknown): string =>
  error instanceof ServiceError &&
  error.errors.some(({ errCode }) => errCode === 'statusNotAllowed')
    ? ERROR_MESSAGES.ORDER_NOT_CANCELLABLE
    : getErrorMessage(error)

/** The placed order's lines in the shape Checkout's summary shows (the cart is empty by then). */
export function placedOrderToCartItems(order: PlacedOrder): CartItem[] {
  return order.items.map((item) => ({
    id: item.id,
    variantId: item.productVariantId,
    // The order line keeps no product id; the summary only needs it to remove a line.
    productId: '',
    name: item.productName,
    meta: item.variantName,
    imageUrl: item.productImage,
    unitPrice: item.unitPrice - item.discountAmount,
    listPrice: item.unitPrice,
    quantity: item.quantity,
    lineTotal: item.lineTotal,
  }))
}

/** The placed order's totals in the shape Checkout's summary shows. */
export function placedOrderTotals(order: PlacedOrder): CartTotals {
  return {
    subtotal: order.subTotal,
    shipping: order.shippingFee,
    tax: order.tax,
    total: order.totalAmount,
  }
}
