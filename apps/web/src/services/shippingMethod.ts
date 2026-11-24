import type { ShippingMethodStatus } from '@repo/constants'
import type {
  CreateShippingMethodPayload,
  UpdateShippingMethodPayload,
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
import type { ShippingMethod } from '@/types/shippingMethod'

type TokenGetter = () => Promise<string | null>

export interface ServiceFailure {
  ok: false
  error: string
  status?: number
  errorResponse?: ApiErrorResponse
}

export interface ShippingMethodListOptions {
  getToken?: TokenGetter
  page?: number
  limit?: number
  search?: string
  status?: ShippingMethodStatus
}

interface AuthOptions {
  getToken?: TokenGetter
}

const shippingMethodUrl = (id: string) =>
  `${API_ROUTES.SHIPPING_METHODS}/${encodeURIComponent(id.trim())}`

export async function fetchShippingMethods(
  options: ShippingMethodListOptions = {},
): Promise<
  | { ok: true; shippingMethods: ShippingMethod[]; meta?: ResponseMeta }
  | ServiceFailure
> {
  const { getToken, page, limit, search, status } = options
  const result = await apiClient.get<ApiResponse<ShippingMethod[]>>(
    API_ROUTES.SHIPPING_METHODS,
    {
      getToken,
      query: { page, limit, search: search?.trim(), status },
      fallbackError: API_FALLBACK_ERRORS.SHIPPING_METHODS_LOAD,
    },
  )
  if (!result.ok) return result

  const { data, meta } = result.data
  return { ok: true, shippingMethods: data, meta }
}

export async function fetchShippingMethodById(
  id: string,
  options: AuthOptions = {},
): Promise<{ ok: true; shippingMethod: ShippingMethod } | ServiceFailure> {
  const result = await apiClient.get<ApiResponse<ShippingMethod>>(
    shippingMethodUrl(id),
    {
      getToken: options.getToken,
      fallbackError: API_FALLBACK_ERRORS.SHIPPING_METHOD_LOAD,
    },
  )
  if (!result.ok) return result

  return { ok: true, shippingMethod: result.data.data }
}

export async function createShippingMethod(
  body: CreateShippingMethodPayload,
  options: AuthOptions & { idempotencyKey: string },
): Promise<{ ok: true; shippingMethod: ShippingMethod } | ServiceFailure> {
  const result = await apiClient.post<ShippingMethod>(
    API_ROUTES.SHIPPING_METHODS,
    body,
    {
      getToken: options.getToken,
      fallbackError: API_FALLBACK_ERRORS.SHIPPING_METHOD_CREATE,
      headers: { [IDEMPOTENCY.HEADER]: options.idempotencyKey },
    },
  )
  if (!result.ok) return result

  return { ok: true, shippingMethod: result.data }
}

export async function updateShippingMethod(
  id: string,
  body: UpdateShippingMethodPayload,
  options: AuthOptions = {},
): Promise<{ ok: true; shippingMethod: ShippingMethod } | ServiceFailure> {
  const result = await apiClient.patch<ApiResponse<ShippingMethod>>(
    shippingMethodUrl(id),
    body,
    {
      getToken: options.getToken,
      fallbackError: API_FALLBACK_ERRORS.SHIPPING_METHOD_UPDATE,
    },
  )
  if (!result.ok) return result

  return { ok: true, shippingMethod: result.data.data }
}

export async function deleteShippingMethod(
  id: string,
  options: AuthOptions = {},
): Promise<{ ok: true } | ServiceFailure> {
  const result = await apiClient.delete(shippingMethodUrl(id), {
    getToken: options.getToken,
    fallbackError: API_FALLBACK_ERRORS.SHIPPING_METHOD_DELETE,
  })
  if (!result.ok) return result

  return { ok: true }
}
