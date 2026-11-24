import type { PlaceOrderPayload } from '@repo/schemas'

import { IDEMPOTENCY } from '@/constants/common'
import { API_FALLBACK_ERRORS } from '@/constants/messages'
import { API_ROUTES } from '@/constants/routes'
import { apiClient } from '@/services/api'
import type {
  ApiErrorResponse,
  Response as ApiResponse,
  ResponseMeta,
} from '@/types/api'
import type {
  Order,
  ORDER_STATUS,
  PlacedOrder,
  SHIPPING_STATUS,
} from '@/types/order'

export interface FetchOrdersOptions {
  getToken?: () => Promise<string | null>
  page?: number
  limit?: number
  search?: string
  status?: string
  shippingStatus?: string
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

export async function fetchOrders(
  options: FetchOrdersOptions = {},
): Promise<
  | { ok: true; orders: Order[]; meta?: ResponseMeta }
  | { ok: false; error: ApiErrorResponse }
> {
  const { getToken, page, limit, search, status, shippingStatus } = options
  const result = await apiClient.get<ApiResponse<Order[]>>(API_ROUTES.ORDERS, {
    getToken,
    query: {
      page,
      limit,
      search: search?.trim(),
      status: status?.trim(),
      shippingStatus: shippingStatus?.trim(),
    },
    fallbackError: API_FALLBACK_ERRORS.ORDERS_LOAD,
  })
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

export async function updateOrderStatus(
  id: string,
  status: ORDER_STATUS,
  options: { getToken?: () => Promise<string | null> } = {},
): Promise<{ ok: true } | { ok: false; error: string }> {
  const orderId = id.trim()
  if (!orderId) {
    return { ok: false, error: API_FALLBACK_ERRORS.ORDER_STATUS_UPDATE }
  }

  const result = await apiClient.patch(
    `${API_ROUTES.ORDERS}/${orderId}/status`,
    { status },
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
  shippingStatus: SHIPPING_STATUS,
  options: { getToken?: () => Promise<string | null> } = {},
): Promise<{ ok: true } | { ok: false; error: string }> {
  const orderId = id.trim()
  if (!orderId) {
    return {
      ok: false,
      error: API_FALLBACK_ERRORS.ORDER_SHIPPING_STATUS_UPDATE,
    }
  }

  const result = await apiClient.patch(
    `${API_ROUTES.ORDERS}/${orderId}/shipping-status`,
    { shippingStatus },
    {
      getToken: options.getToken,
      fallbackError: API_FALLBACK_ERRORS.ORDER_SHIPPING_STATUS_UPDATE,
    },
  )
  if (!result.ok) return result

  return { ok: true }
}
