'use client'

import { PaymentMethod } from '@repo/constants'
import { Banknote, CreditCard, Timer, Wallet } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { Select } from '@/components/Select'
import { Button } from '@/components/ui/button'
import { NOTICE_MESSAGES } from '@/constants/messages'
import {
  ORDER_SUCCESS_COUNTDOWN_TICK_MS,
  PAYMENT_METHOD_LABELS,
} from '@/constants/order'
import { useNow } from '@/hooks/useNow'
import { useStartPayment } from '@/hooks/usePayment'
import type { OrderDetail } from '@/types/order'
import { formatPrice } from '@/utils/common'
import {
  getOrderSuccessPaymentView,
  getPayByCountdown,
  getPaymentStatusPresentation,
  paymentErrorMessage,
  type OrderSuccessPaymentKind,
} from '@/utils/order'
import { ServiceError } from '@/utils/query'
import { cn } from '@/utils/styles'

export interface OrderSuccessPaymentProps {
  order: OrderDetail
  hasSessionId: boolean
  paymentError: string | null
  isPollExhausted: boolean
}

const MESSAGES: Record<OrderSuccessPaymentKind, string | null> = {
  paid: NOTICE_MESSAGES.ORDER_PAYMENT.PAID,
  confirming: NOTICE_MESSAGES.ORDER_PAYMENT.CONFIRMING,
  stillConfirming: NOTICE_MESSAGES.ORDER_PAYMENT.STILL_CONFIRMING,
  notCompleted: NOTICE_MESSAGES.ORDER_PAYMENT.NOT_COMPLETED,
  failed: NOTICE_MESSAGES.ORDER_PAYMENT.FAILED,
  badgeOnly: null,
}

const METHOD_ICONS = {
  [PaymentMethod.CARD]: CreditCard,
  [PaymentMethod.PAYPAL]: Wallet,
  [PaymentMethod.COD]: Banknote,
} as const

/** The online methods a retry can pick. */
const RETRY_METHOD_OPTIONS = [PaymentMethod.CARD, PaymentMethod.PAYPAL].map(
  (method) => ({ value: method, label: PAYMENT_METHOD_LABELS[method] }),
)

const OrderSuccessPayment = ({
  order,
  hasSessionId,
  paymentError,
  isPollExhausted,
}: OrderSuccessPaymentProps) => {
  const router = useRouter()
  const { mutateAsync: startPayment, isPending } = useStartPayment()
  const [isRedirecting, setIsRedirecting] = useState(false)
  const [payNowError, setPayNowError] = useState<string | null>(null)
  const [hasTriedPayNow, setHasTriedPayNow] = useState(false)

  const view = getOrderSuccessPaymentView({
    order,
    hasSessionId,
    paymentError,
    isPollExhausted,
  })
  // Only the shopper's own pick is state: until they pick, follow the latest charge.
  const [pickedMethod, setPickedMethod] = useState<string | null>(null)
  const selectedMethod = pickedMethod ?? view.chargeMethod
  const now = useNow(ORDER_SUCCESS_COUNTDOWN_TICK_MS, view.showRetry)
  const countdown = view.showRetry
    ? getPayByCountdown(order.expiresAt, now)
    : null
  const isExpired = countdown?.isExpired ?? false

  const badge = getPaymentStatusPresentation(view.badgeStatus)
  const isCod = view.chargeMethod === PaymentMethod.COD
  const message =
    isCod && view.kind === 'notCompleted'
      ? NOTICE_MESSAGES.ORDER_PAYMENT.COD
      : MESSAGES[view.kind]
  const MethodIcon = view.chargeMethod ? METHOD_ICONS[view.chargeMethod] : null

  const isMethodSupported =
    view.canPayNow && selectedMethod === view.chargeMethod
  const isRetryDisabled = !isMethodSupported || isPending || isRedirecting

  const handleRetry = async () => {
    setPayNowError(null)
    setHasTriedPayNow(true)
    try {
      const checkout = await startPayment(order.id)
      setIsRedirecting(true)
      router.replace(checkout.checkoutUrl)
    } catch (error) {
      const errCode =
        error instanceof ServiceError ? error.errors[0]?.errCode : undefined
      setPayNowError(paymentErrorMessage(errCode))
    }
  }

  return (
    <section
      aria-label="Payment"
      className="rounded-2xl bg-surface-container-low p-6"
    >
      <h3 className="text-xs font-semibold tracking-[0.16em] text-primary uppercase">
        Payment
      </h3>
      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          {MethodIcon && (
            <MethodIcon className="size-4 shrink-0 text-primary" aria-hidden />
          )}
          {view.chargeMethod && (
            <p className="truncate font-semibold text-on-surface">
              {PAYMENT_METHOD_LABELS[view.chargeMethod]}
            </p>
          )}
        </div>
        <span
          className={cn(
            'shrink-0 rounded-full px-3 py-1 text-xs font-semibold',
            badge.badgeClassName,
          )}
        >
          {badge.label}
        </span>
      </div>
      {message && (
        <p className="mt-2 text-sm text-on-surface-variant">{message}</p>
      )}
      <div className="mt-3 flex items-center justify-between text-sm">
        <span className="text-on-surface-variant">Total</span>
        <span className="font-semibold text-on-surface">
          {formatPrice(order.totalAmount)}
        </span>
      </div>
      {view.errorMessage && !hasTriedPayNow && (
        <p className="mt-3 text-sm text-destructive">{view.errorMessage}</p>
      )}

      {view.showRetry && isExpired && (
        <p className="mt-4 text-sm font-medium text-on-surface">
          {NOTICE_MESSAGES.ORDER_PAYMENT.WINDOW_CLOSED}
        </p>
      )}
      {view.showRetry && !isExpired && (
        <div className="mt-4 space-y-3">
          {countdown && (
            <div className="flex gap-3 rounded-2xl bg-(--warning)/15 p-4 text-on-surface">
              <Timer
                className="mt-0.5 size-4 shrink-0 text-(--warning)"
                aria-hidden
              />
              <div>
                <p className="font-semibold">
                  Pay by {countdown.deadlineLabel}
                </p>
                <p className="text-sm">
                  {NOTICE_MESSAGES.ORDER_PAYMENT.PAY_BY_HINT(
                    countdown.minutesLeft,
                  )}
                </p>
              </div>
            </div>
          )}
          <Select
            label="Pay with"
            options={RETRY_METHOD_OPTIONS}
            selected={selectedMethod ?? undefined}
            onValueChange={(value) =>
              setPickedMethod(typeof value === 'string' ? value : null)
            }
          />
          <Button
            type="button"
            className="w-full rounded-full"
            disabled={isRetryDisabled}
            onClick={() => void handleRetry()}
          >
            {view.kind === 'failed' ? 'Retry payment' : 'Complete payment'}
          </Button>
          {!isMethodSupported && (
            <p className="text-xs text-on-surface-variant">
              {NOTICE_MESSAGES.ORDER_PAYMENT.RETRY_COMING_SOON}
            </p>
          )}
        </div>
      )}
      {payNowError && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {payNowError}
        </p>
      )}
    </section>
  )
}

export default OrderSuccessPayment
