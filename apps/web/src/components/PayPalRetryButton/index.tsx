'use client'

import { useCallback, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  PayPalProvider,
  usePayPalOneTimePaymentSession,
} from '@paypal/react-paypal-js/sdk-v6'
import { OrderPaymentStatus } from '@repo/constants'

import { Button } from '@/components/ui/button'
import {
  API_FALLBACK_ERRORS,
  ERROR_MESSAGES,
  NOTICE_MESSAGES,
  SUCCESS_MESSAGES,
} from '@/constants/messages'
import { orderSuccessPath } from '@/constants/routes'
import { useCapturePayment, useStartPayment } from '@/hooks/usePayment'
import type { PayPalNotice } from '@/types/checkout'
import type { OrderDetail } from '@/types/order'
import { PAYMENT_ERR_CODES, paymentErrorMessage } from '@/utils/order'
import { ServiceError } from '@/utils/query'
import { cn } from '@/utils/styles'

export interface PayPalRetryButtonProps {
  order: Pick<OrderDetail, 'id'>
}

const errCodeOf = (error: unknown): string | undefined =>
  error instanceof ServiceError ? error.errors[0]?.errCode : undefined

// The API refuses these for good: another click would open a popup that fails the same way.
const FINAL_ERR_CODES = new Set<string | undefined>([
  PAYMENT_ERR_CODES.NOT_PAYABLE,
  PAYMENT_ERR_CODES.ORDER_EXPIRED,
])

/** Our "Retry payment" button opens PayPal's popup for an existing order, then captures it. */
function RetryButton({ order }: PayPalRetryButtonProps) {
  const router = useRouter()
  const { mutateAsync: startPayment } = useStartPayment()
  const { mutateAsync: capturePayment, isPending: isCapturing } =
    useCapturePayment()
  // Cleared on each click, so a notice always belongs to the current attempt.
  const [notice, setNotice] = useState<PayPalNotice | null>(null)
  // From the click until PayPal reports back: a second click would start a second session.
  const [isOpen, setIsOpen] = useState(false)
  // A final refusal, or a payment that went through: no further attempt from this page.
  const [isDone, setIsDone] = useState(false)
  // The SDK error seen at the last click; a newer one shows again.
  const [dismissedError, setDismissedError] = useState<Error | null>(null)
  // Whether this click reached createOrder, i.e. a PayPal session started.
  const startedRef = useRef(false)
  // Whether PayPal approved this attempt: its capture reports the outcome.
  const approvedRef = useRef(false)
  // The current click: an earlier click settling later must not touch it.
  const attemptRef = useRef(0)

  const closePopup = useCallback(() => setIsOpen(false), [])

  const showError = useCallback((message: string) => {
    setNotice({ tone: 'error', message })
  }, [])

  // Keeps a notice this attempt already shows (a start refusal, a cancel).
  const showFallbackError = useCallback(() => {
    setNotice(
      (current) =>
        current ?? {
          tone: 'error',
          message: API_FALLBACK_ERRORS.PAYMENT_START,
        },
    )
  }, [])

  const createOrder = useCallback(async () => {
    startedRef.current = true
    try {
      const checkout = await startPayment(order.id)
      return { orderId: checkout.checkoutId }
    } catch (error) {
      const errCode = errCodeOf(error)
      if (FINAL_ERR_CODES.has(errCode)) setIsDone(true)
      const message = paymentErrorMessage(errCode)
      showError(message)
      // Unlock here: the SDK may close the popup without reporting the refusal.
      closePopup()
      throw new Error(message)
    }
  }, [closePopup, order.id, showError, startPayment])

  const onApprove = useCallback(async () => {
    approvedRef.current = true
    closePopup()
    let capture
    try {
      capture = await capturePayment(order.id)
    } catch (error) {
      const errCode = errCodeOf(error)
      // NOT_PAYABLE at capture may only mean PayPal still waits for the payer (as on Checkout).
      if (errCode === PAYMENT_ERR_CODES.ORDER_EXPIRED) setIsDone(true)
      showError(
        paymentErrorMessage(errCode, API_FALLBACK_ERRORS.PAYMENT_CAPTURE),
      )
      return
    }
    if (capture.paymentStatus === OrderPaymentStatus.FAILED) {
      // The refetched order keeps Retry payment: a closed PayPal order is replaced.
      showError(capture.failureReason ?? ERROR_MESSAGES.PAYMENT_FAILED)
      return
    }
    setIsDone(true)
    if (capture.paymentStatus === OrderPaymentStatus.PAID) {
      toast.success(SUCCESS_MESSAGES.PAYMENT_SUCCESSFUL)
      router.push(orderSuccessPath(order.id))
      return
    }
    // PayPal holds the money for review: Order success waits for the webhook.
    router.push(orderSuccessPath(order.id, undefined, { confirming: true }))
  }, [capturePayment, closePopup, order.id, router, showError])

  const onCancel = useCallback(() => {
    closePopup()
    setNotice({ tone: 'info', message: NOTICE_MESSAGES.PAYPAL_CANCELLED })
  }, [closePopup])

  const onError = useCallback(() => {
    closePopup()
    showFallbackError()
  }, [closePopup, showFallbackError])

  const {
    isPending,
    error: sessionError,
    handleClick,
  } = usePayPalOneTimePaymentSession({
    presentationMode: 'popup',
    createOrder,
    onApprove,
    onCancel,
    onError,
  })

  const handleRetry = () => {
    const attempt = ++attemptRef.current
    startedRef.current = false
    approvedRef.current = false
    setNotice(null)
    setDismissedError(sessionError)
    setIsOpen(true)
    handleClick()
      .then(() => {
        if (attempt !== attemptRef.current) return
        // No session started (the SDK returns early and sets its error): nothing will report back.
        if (!startedRef.current) closePopup()
      })
      .catch(() => {
        // An approved attempt reports through its capture.
        if (attempt !== attemptRef.current || approvedRef.current) return
        // The popup never opened (blocked), or the start was refused.
        closePopup()
        showFallbackError()
      })
  }

  const showsSessionError =
    Boolean(sessionError) && sessionError !== dismissedError

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        className="w-full"
        disabled={isPending || isCapturing || isOpen || isDone}
        onClick={handleRetry}
      >
        Retry payment
      </Button>
      {/* The SDK failed to load or to create a session; it can also be its early-click error, so the button stays. */}
      {showsSessionError && (
        <p role="alert" className="text-sm text-destructive">
          {ERROR_MESSAGES.PAYPAL_UNAVAILABLE}
        </p>
      )}
      {notice && (
        <p
          role={notice.tone === 'error' ? 'alert' : 'status'}
          className={cn(
            'text-sm',
            notice.tone === 'error'
              ? 'text-destructive'
              : 'text-on-surface-variant',
          )}
        >
          {notice.message}
        </p>
      )}
    </div>
  )
}

const PayPalRetryButton = ({ order }: PayPalRetryButtonProps) => {
  const clientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID
  const environment =
    process.env.NEXT_PUBLIC_PAYPAL_ENVIRONMENT === 'production'
      ? 'production'
      : 'sandbox'

  if (!clientId) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {ERROR_MESSAGES.PAYPAL_UNAVAILABLE}
      </p>
    )
  }

  // Only the PayPal wallet, as on Checkout.
  return (
    <PayPalProvider
      clientId={clientId}
      environment={environment}
      components={['paypal-payments']}
      pageType="checkout"
    >
      <RetryButton order={order} />
    </PayPalProvider>
  )
}

export default PayPalRetryButton
