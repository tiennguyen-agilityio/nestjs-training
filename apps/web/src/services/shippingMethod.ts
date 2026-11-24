import { ShippingMethodStatus, VALIDATION_RULES } from '@repo/constants'

import { API_FALLBACK_ERRORS } from '@/constants/messages'
import { API_ROUTES } from '@/constants/routes'
import { apiClient } from '@/services/api'
import type { Response as ApiResponse } from '@/types/api'
import type { ShippingMethod } from '@/types/shippingMethod'

export async function fetchShippingMethods(): Promise<
  | { ok: true; shippingMethods: ShippingMethod[] }
  | { ok: false; error: string; status?: number }
> {
  const result = await apiClient.get<ApiResponse<ShippingMethod[]>>(
    API_ROUTES.SHIPPING_METHODS,
    {
      skipAuth: true,
      query: {
        limit: VALIDATION_RULES.PAGINATION.MAX_LIMIT,
        status: ShippingMethodStatus.ACTIVE,
      },
      fallbackError: API_FALLBACK_ERRORS.SHIPPING_METHODS_LOAD,
    },
  )
  if (!result.ok) return result

  // The session cookie still reaches the API, which lists every method to an
  // active admin: the query asks for ACTIVE ones and this keeps only those.
  const shippingMethods = result.data.data.filter(
    (method) =>
      method.status === ShippingMethodStatus.ACTIVE &&
      method.deletedAt === null,
  )

  return { ok: true, shippingMethods }
}
