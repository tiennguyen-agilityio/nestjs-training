import { API_FALLBACK_ERRORS } from '@/constants/messages'
import { API_ROUTES } from '@/constants/routes'
import { apiClient } from '@/services/api'
import type { ApiErrorResponse } from '@/types/api'
import type { PaymentCheckout } from '@/types/order'

export async function startPayment(
  orderId: string,
  options: { getToken?: () => Promise<string | null> },
): Promise<
  | { ok: true; checkout: PaymentCheckout }
  | {
      ok: false
      error: string
      status?: number
      errorResponse?: ApiErrorResponse
    }
> {
  const result = await apiClient.post<PaymentCheckout>(
    `${API_ROUTES.ORDERS}/${encodeURIComponent(orderId)}/payments`,
    {},
    {
      getToken: options.getToken,
      fallbackError: API_FALLBACK_ERRORS.PAYMENT_START,
    },
  )
  if (!result.ok) {
    return result.status === undefined
      ? { ...result, error: API_FALLBACK_ERRORS.PAYMENT_START }
      : result
  }

  return { ok: true, checkout: result.data }
}
