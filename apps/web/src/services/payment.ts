import { API_FALLBACK_ERRORS } from '@/constants/messages'
import { API_ROUTES } from '@/constants/routes'
import { apiClient } from '@/services/api'
import type { ApiErrorResponse } from '@/types/api'
import type { PaymentCapture, PaymentCheckout } from '@/types/order'

interface PaymentFailure {
  ok: false
  error: string
  status?: number
  errorResponse?: ApiErrorResponse
}

async function postPayment<T>(
  path: string,
  fallbackError: string,
  getToken?: () => Promise<string | null>,
): Promise<{ ok: true; data: T } | PaymentFailure> {
  const result = await apiClient.post<T>(path, {}, { getToken, fallbackError })
  if (!result.ok) {
    return result.status === undefined
      ? { ...result, error: fallbackError }
      : result
  }

  return { ok: true, data: result.data }
}

const paymentsPath = (orderId: string) =>
  `${API_ROUTES.ORDERS}/${encodeURIComponent(orderId)}/payments`

export async function startPayment(
  orderId: string,
  options: { getToken?: () => Promise<string | null> },
): Promise<{ ok: true; checkout: PaymentCheckout } | PaymentFailure> {
  const result = await postPayment<PaymentCheckout>(
    paymentsPath(orderId),
    API_FALLBACK_ERRORS.PAYMENT_START,
    options.getToken,
  )
  return result.ok ? { ok: true, checkout: result.data } : result
}

export async function capturePayment(
  orderId: string,
  options: { getToken?: () => Promise<string | null> },
): Promise<{ ok: true; capture: PaymentCapture } | PaymentFailure> {
  const result = await postPayment<PaymentCapture>(
    `${paymentsPath(orderId)}/capture`,
    API_FALLBACK_ERRORS.PAYMENT_CAPTURE,
    options.getToken,
  )
  return result.ok ? { ok: true, capture: result.data } : result
}
