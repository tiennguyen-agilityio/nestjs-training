import { API_FALLBACK_ERRORS } from '@/constants/messages'
import { API_ROUTES } from '@/constants/routes'
import { apiClient } from '@/services/api'
import type {
  ApiErrorResponse,
  Response as ApiResponse,
  ResponseMeta,
} from '@/types/api'
import type { OrderStatus } from '@repo/constants'
import type {
  Order,
  OrderDetail,
  OrderPayload,
  OrderSummary,
  ORDER_STATUS,
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

export async function createOrder(
  body: OrderPayload,
  options: { getToken?: () => Promise<string | null> } = {},
): Promise<
  { ok: true; order: Order } | { ok: false; error: ApiErrorResponse }
> {
  const result = await apiClient.post<Order>(API_ROUTES.ORDERS, body, {
    getToken: options.getToken,
    fallbackError: API_FALLBACK_ERRORS.ORDER_CREATE,
  })
  if (!result.ok) {
    return {
      ok: false,
      error: toApiErrorResponse(result),
    }
  }

  return {
    ok: true,
    order: result.data,
  }
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

/** One of the signed-in shopper's orders, by order number. */
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
