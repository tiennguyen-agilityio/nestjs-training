'use client'

import { OrderPaymentStatus } from '@repo/constants'
import { useRouter } from 'next/navigation'
import { useCallback, useRef, useState } from 'react'
import { toast } from 'sonner'

import {
  API_FALLBACK_ERRORS,
  ERROR_MESSAGES,
  NOTICE_MESSAGES,
  SUCCESS_MESSAGES,
} from '@/constants/messages'
import { orderSuccessPath } from '@/constants/routes'
import { useCapturePayment, useStartPayment } from '@/hooks/usePayment'
import type { PayPalNotice } from '@/types/checkout'
import type { PlacedOrder } from '@/types/order'
import { PAYMENT_ERR_CODES, paymentErrorMessage } from '@/utils/order'
import { ServiceError } from '@/utils/query'

const errCodeOf = (error: unknown): string | undefined =>
  error instanceof ServiceError ? error.errors[0]?.errCode : undefined

const START_FINAL_ERR_CODES = new Set<string | undefined>([
  PAYMENT_ERR_CODES.NOT_PAYABLE,
  PAYMENT_ERR_CODES.ORDER_EXPIRED,
])

export interface UsePayPalCheckoutOptions {
  /** Checkout's validate-and-place routine: `null` when the form is invalid or placing failed. */
  placeOrder: () => Promise<PlacedOrder | null>
}

export interface UsePayPalCheckoutResult {
  /** The order placed for PayPal; kept across cancels and retryable declines. */
  placedOrder: PlacedOrder | null
  notice: PayPalNotice | null
  /** False once PayPal closed its order after a decline. */
  canRetry: boolean
  createPayPalOrder: () => Promise<{ orderId: string }>
  onApprove: () => Promise<void>
  onCancel: () => void
  onError: (error: unknown) => void
}

/** The PayPal popup flow of Checkout: place once, start, capture, and what to show. */
export function usePayPalCheckout({
  placeOrder,
}: UsePayPalCheckoutOptions): UsePayPalCheckoutResult {
  const router = useRouter()
  const { mutateAsync: startPayment } = useStartPayment()
  const { mutateAsync: capturePayment } = useCapturePayment()
  const [placedOrder, setPlacedOrder] = useState<PlacedOrder | null>(null)
  const [notice, setNotice] = useState<PayPalNotice | null>(null)
  const [canRetry, setCanRetry] = useState(true)
  // The next SDK callback can run before React re-renders with the placed order.
  const placedRef = useRef<PlacedOrder | null>(null)
  // The form or the API refused the order: its own errors are already shown.
  const refusedRef = useRef(false)

  const createPayPalOrder = useCallback(async () => {
    setNotice(null)
    refusedRef.current = false
    let order = placedRef.current
    if (!order) {
      order = await placeOrder()
      if (!order) {
        refusedRef.current = true
        throw new Error('The order was not placed')
      }
      placedRef.current = order
      setPlacedOrder(order)
    }
    try {
      const checkout = await startPayment(order.id)
      return { orderId: checkout.checkoutId }
    } catch (error) {
      const errCode = errCodeOf(error)
      if (START_FINAL_ERR_CODES.has(errCode)) setCanRetry(false)
      const message = paymentErrorMessage(errCode)
      setNotice({ tone: 'error', message })
      throw new Error(message)
    }
  }, [placeOrder, startPayment])

  const onApprove = useCallback(async () => {
    const order = placedRef.current
    if (!order) return
    let capture
    try {
      capture = await capturePayment(order.id)
    } catch (error) {
      const errCode = errCodeOf(error)
      // NOT_PAYABLE here may only mean PayPal still waits for the payer.
      if (errCode === PAYMENT_ERR_CODES.ORDER_EXPIRED) setCanRetry(false)
      setNotice({
        tone: 'error',
        message: paymentErrorMessage(
          errCode,
          API_FALLBACK_ERRORS.PAYMENT_CAPTURE,
        ),
      })
      return
    }
    const { paymentStatus, failureReason, retryable } = capture
    if (paymentStatus === OrderPaymentStatus.PAID) {
      toast.success(SUCCESS_MESSAGES.PAYMENT_SUCCESSFUL)
      router.push(orderSuccessPath(order.id))
      return
    }
    if (paymentStatus === OrderPaymentStatus.FAILED) {
      const reason = failureReason ?? ERROR_MESSAGES.PAYMENT_FAILED
      setCanRetry(retryable)
      setNotice({
        tone: 'error',
        message: retryable
          ? reason
          : `${reason} ${ERROR_MESSAGES.PAYPAL_NOT_RETRYABLE}`,
      })
      return
    }
    // PayPal holds the money for review: Order success waits for the webhook.
    router.push(orderSuccessPath(order.id, undefined, { confirming: true }))
  }, [capturePayment, router])

  const onCancel = useCallback(() => {
    setNotice({ tone: 'info', message: NOTICE_MESSAGES.PAYPAL_CANCELLED })
  }, [])

  const onError = useCallback(() => {
    // The refused order's own error is shown; only that one SDK error is skipped.
    if (refusedRef.current) {
      refusedRef.current = false
      return
    }
    setNotice((current) =>
      current?.tone === 'error'
        ? current
        : { tone: 'error', message: API_FALLBACK_ERRORS.PAYMENT_START },
    )
  }, [])

  return {
    placedOrder,
    notice,
    canRetry,
    createPayPalOrder,
    onApprove,
    onCancel,
    onError,
  }
}
