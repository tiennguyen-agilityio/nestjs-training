import type {
  AddCartItemPayload,
  MergeCartPayload,
  UpdateCartItemPayload,
} from '@repo/schemas'

import { IDEMPOTENCY } from '@/constants/common'
import { API_FALLBACK_ERRORS } from '@/constants/messages'
import { API_ROUTES } from '@/constants/routes'
import { apiClient, type ApiResult } from '@/services/api'
import type { ApiErrorResponse, Response as ApiResponse } from '@/types/api'
import type { MergedServerCart, ServerCart } from '@/types/cart'

interface CartFailure {
  ok: false
  error: string
  status?: number
  errorResponse?: ApiErrorResponse
}

export type CartResult<T> = { ok: true; cart: T } | CartFailure

export interface TokenOption {
  getToken?: () => Promise<string | null>
}

const itemUrl = (id: string) =>
  `${API_ROUTES.CART}/items/${encodeURIComponent(id.trim())}`

/** Unwraps the API's `{ data }` envelope around a cart. */
const toCartResult = <T>(result: ApiResult<ApiResponse<T>>): CartResult<T> =>
  result.ok ? { ok: true, cart: result.data.data } : result

export async function fetchCart(
  options: TokenOption,
): Promise<CartResult<ServerCart>> {
  const result = await apiClient.get<ApiResponse<ServerCart>>(API_ROUTES.CART, {
    getToken: options.getToken,
    fallbackError: API_FALLBACK_ERRORS.CART_LOAD,
  })
  return toCartResult(result)
}

export async function addCartItem(
  body: AddCartItemPayload,
  options: TokenOption & { idempotencyKey: string },
): Promise<CartResult<ServerCart>> {
  // apiClient.post already unwraps the `{ data }` envelope.
  const result = await apiClient.post<ServerCart>(
    `${API_ROUTES.CART}/items`,
    body,
    {
      getToken: options.getToken,
      fallbackError: API_FALLBACK_ERRORS.CART_ADD,
      headers: { [IDEMPOTENCY.HEADER]: options.idempotencyKey },
    },
  )
  return result.ok ? { ok: true, cart: result.data } : result
}

export async function updateCartItem(
  id: string,
  body: UpdateCartItemPayload,
  options: TokenOption,
): Promise<CartResult<ServerCart>> {
  const result = await apiClient.patch<ApiResponse<ServerCart>>(
    itemUrl(id),
    body,
    {
      getToken: options.getToken,
      fallbackError: API_FALLBACK_ERRORS.CART_UPDATE,
    },
  )
  return toCartResult(result)
}

export async function removeCartItem(
  id: string,
  options: TokenOption,
): Promise<{ ok: true } | CartFailure> {
  const result = await apiClient.delete(itemUrl(id), {
    getToken: options.getToken,
    fallbackError: API_FALLBACK_ERRORS.CART_REMOVE,
  })
  return result.ok ? { ok: true } : result
}

export async function mergeCart(
  body: MergeCartPayload,
  options: TokenOption & { idempotencyKey: string },
): Promise<CartResult<MergedServerCart>> {
  // apiClient.post already unwraps the `{ data }` envelope.
  const result = await apiClient.post<MergedServerCart>(
    `${API_ROUTES.CART}/merge`,
    body,
    {
      getToken: options.getToken,
      fallbackError: API_FALLBACK_ERRORS.CART_MERGE,
      headers: { [IDEMPOTENCY.HEADER]: options.idempotencyKey },
    },
  )
  return result.ok ? { ok: true, cart: result.data } : result
}
