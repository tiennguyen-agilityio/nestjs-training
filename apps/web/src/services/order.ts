import type {
  CreateRefundPayload,
  PlaceOrderPayload,
  UpdateOrderShippingStatusPayload,
  UpdateOrderStatusPayload,
} from '@repo/schemas'

import { IDEMPOTENCY } from '@/constants/common'
import { API_FALLBACK_ERRORS } from '@/constants/messages'
import { API_ROUTES } from '@/constants/routes'
import { apiClient } from '@/services/api'
import type {
  ApiErrorResponse,
  Response as ApiResponse,
  ResponseMeta,
} from '@/types/api'
import type { OrderStatus, ShippingStatus } from '@repo/constants'
import type { OrderDetail, OrderSummary, PlacedOrder } from '@/types/order'

export interface FetchOrdersOptions {
  getToken?: () => Promise<string | null>
  page?: number
  limit?: number
  search?: string
  status?: OrderStatus
  shippingStatus?: ShippingStatus
}

const toApiErrorResponse = (input: {
  error: string
  status?: number
  errorResponse?: ApiErrorResponse
}): ApiErrorResponse =>
  input.errorResponse ?? {
    statusCode: input.status ?? 500,
    message: input.error,
    errors: [],
  }

/**
 * `POST /orders`: the API places the order from the signed-in user's cart.
 * The `Idempotency-Key` makes a retry of the same values replay the first result.
 */
export async function createOrder(
  body: PlaceOrderPayload,
  options: {
    getToken?: () => Promise<string | null>
    idempotencyKey: string
  },
): Promise<
  | { ok: true; order: PlacedOrder }
  | {
      ok: false
      error: string
      status?: number
      errorResponse?: ApiErrorResponse
    }
> {
  const { getToken, idempotencyKey } = options
  // `post` unwraps the `{ data }` envelope.
  const result = await apiClient.post<PlacedOrder>(API_ROUTES.ORDERS, body, {
    getToken,
    fallbackError: API_FALLBACK_ERRORS.ORDER_CREATE,
    headers: { [IDEMPOTENCY.HEADER]: idempotencyKey },
  })
  if (!result.ok) {
    // No status: the request never got an answer (network); the browser's
    // own message ("Failed to fetch") is not shown to the shopper.
    return result.status === undefined
      ? { ...result, error: API_FALLBACK_ERRORS.ORDER_CREATE }
      : result
  }

  return { ok: true, order: result.data }
}

/**
 * `POST /orders/:id/cancel`: the API cancels one of the signed-in shopper's
 * PENDING orders and returns it.
 */
export async function cancelOrder(
  id: string,
  options: { getToken: () => Promise<string | null> },
): Promise<
  | { ok: true; order: OrderDetail }
  | {
      ok: false
      error: string
      status?: number
      errorResponse?: ApiErrorResponse
    }
> {
  // `post` unwraps the `{ data }` envelope.
  const result = await apiClient.post<OrderDetail>(
    `${API_ROUTES.ORDERS}/${encodeURIComponent(id)}/cancel`,
    undefined,
    {
      getToken: options.getToken,
      fallbackError: API_FALLBACK_ERRORS.ORDER_CANCEL,
    },
  )
  if (!result.ok) {
    return result.status === undefined
      ? { ...result, error: API_FALLBACK_ERRORS.ORDER_CANCEL }
      : result
  }

  return { ok: true, order: result.data }
}

type RefundResult =
  | { ok: true }
  | {
      ok: false
      error: string
      status?: number
      errorResponse?: ApiErrorResponse
    }

/**
 * `POST /orders/:id/refunds`: an admin refunds part of an order's paid online
 * charge. The `Idempotency-Key` makes a retry replay the first result.
 */
export async function createRefund(
  orderId: string,
  amount: CreateRefundPayload['amount'],
  options: {
    getToken: () => Promise<string | null>
    idempotencyKey: string
  },
): Promise<RefundResult> {
  const body: CreateRefundPayload = { amount }
  const result = await apiClient.post(
    `${API_ROUTES.ORDERS}/${encodeURIComponent(orderId)}/refunds`,
    body,
    {
      getToken: options.getToken,
      fallbackError: API_FALLBACK_ERRORS.REFUND_CREATE,
      headers: { [IDEMPOTENCY.HEADER]: options.idempotencyKey },
    },
  )
  if (!result.ok) return result

  return { ok: true }
}

/** `POST /payments/:id/retry`: an admin sends a FAILED refund again. */
export async function retryRefund(
  paymentId: string,
  options: {
    getToken: () => Promise<string | null>
    idempotencyKey: string
  },
): Promise<RefundResult> {
  const result = await apiClient.post(
    `${API_ROUTES.PAYMENTS}/${encodeURIComponent(paymentId)}/retry`,
    undefined,
    {
      getToken: options.getToken,
      fallbackError: API_FALLBACK_ERRORS.REFUND_RETRY,
      headers: { [IDEMPOTENCY.HEADER]: options.idempotencyKey },
    },
  )
  if (!result.ok) return result

  return { ok: true }
}

/** Every order (`GET /orders?all=true`): the API answers 403 to anyone but an active admin. */
export async function fetchOrders(
  options: FetchOrdersOptions = {},
): Promise<
  | { ok: true; orders: OrderSummary[]; meta?: ResponseMeta }
  | { ok: false; error: ApiErrorResponse }
> {
  const { getToken, page, limit, search, status, shippingStatus } = options
  const result = await apiClient.get<ApiResponse<OrderSummary[]>>(
    API_ROUTES.ORDERS,
    {
      getToken,
      query: {
        all: 'true',
        page,
        limit,
        search: search?.trim(),
        status,
        shippingStatus,
      },
      fallbackError: API_FALLBACK_ERRORS.ORDERS_LOAD,
    },
  )
  if (!result.ok) {
    return {
      ok: false,
      error: toApiErrorResponse(result),
    }
  }

  const { data, meta } = result.data
  return { ok: true, orders: data, meta }
}

export async function deleteOrder(
  id: string,
  options: { getToken?: () => Promise<string | null> } = {},
): Promise<{ ok: true } | { ok: false; error: string }> {
  const orderId = id.trim()
  if (!orderId) {
    return { ok: false, error: API_FALLBACK_ERRORS.ORDER_DELETE }
  }

  const result = await apiClient.delete(`${API_ROUTES.ORDERS}/${orderId}`, {
    getToken: options.getToken,
    fallbackError: API_FALLBACK_ERRORS.ORDER_DELETE,
  })
  if (!result.ok) {
    return result
  }

  return { ok: true }
}

type StatusUpdateResult =
  | { ok: true }
  | {
      ok: false
      error: string
      status?: number
      errorResponse?: ApiErrorResponse
    }

export async function updateOrderStatus(
  id: string,
  status: UpdateOrderStatusPayload['status'],
  options: { getToken: () => Promise<string | null> },
): Promise<StatusUpdateResult> {
  const body: UpdateOrderStatusPayload = { status }
  const result = await apiClient.patch(
    `${API_ROUTES.ORDERS}/${encodeURIComponent(id)}/status`,
    body,
    {
      getToken: options.getToken,
      fallbackError: API_FALLBACK_ERRORS.ORDER_STATUS_UPDATE,
    },
  )
  if (!result.ok) return result

  return { ok: true }
}

export async function updateOrderShippingStatus(
  id: string,
  shippingStatus: UpdateOrderShippingStatusPayload['shippingStatus'],
  options: { getToken: () => Promise<string | null> },
): Promise<StatusUpdateResult> {
  const body: UpdateOrderShippingStatusPayload = { shippingStatus }
  const result = await apiClient.patch(
    `${API_ROUTES.ORDERS}/${encodeURIComponent(id)}/shipping-status`,
    body,
    {
      getToken: options.getToken,
      fallbackError: API_FALLBACK_ERRORS.ORDER_SHIPPING_STATUS_UPDATE,
    },
  )
  if (!result.ok) return result

  return { ok: true }
}

export interface FetchMyOrdersOptions {
  getToken: () => Promise<string | null>
  page?: number
  limit?: number
  status?: OrderStatus
}

/** The signed-in shopper's own orders (`GET /orders`), newest first. */
export async function fetchMyOrders(
  options: FetchMyOrdersOptions,
): Promise<
  | { ok: true; orders: OrderSummary[]; meta?: ResponseMeta }
  | { ok: false; error: ApiErrorResponse }
> {
  const { getToken, page, limit, status } = options
  const result = await apiClient.get<ApiResponse<OrderSummary[]>>(
    API_ROUTES.ORDERS,
    {
      getToken,
      query: { page, limit, status },
      fallbackError: API_FALLBACK_ERRORS.ORDERS_LOAD,
    },
  )
  if (!result.ok) return { ok: false, error: toApiErrorResponse(result) }

  const { data, meta } = result.data
  return { ok: true, orders: data, meta }
}

/** One order the caller may read (own, or any for an active admin), by order number. */
export async function fetchOrderDetail(
  orderNumber: string,
  options: { getToken: () => Promise<string | null> },
): Promise<
  { ok: true; order: OrderDetail } | { ok: false; error: ApiErrorResponse }
> {
  const result = await apiClient.get<ApiResponse<OrderDetail>>(
    `${API_ROUTES.ORDERS}/${encodeURIComponent(orderNumber)}`,
    {
      getToken: options.getToken,
      fallbackError: API_FALLBACK_ERRORS.ORDER_LOAD,
    },
  )
  if (!result.ok) return { ok: false, error: toApiErrorResponse(result) }

  return { ok: true, order: result.data.data }
}
