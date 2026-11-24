'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { NOTICE_MESSAGES } from '@/constants/messages'
import { useStartPayment } from '@/hooks/usePayment'
import type { OrderDetail } from '@/types/order'
import {
  getOrderSuccessPaymentView,
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
  const badge = getPaymentStatusPresentation(view.badgeStatus)
  const message = MESSAGES[view.kind]

  const handlePayNow = async () => {
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
      className="mx-auto mt-6 flex max-w-xl flex-col items-center gap-3 rounded-2xl bg-surface-container-low p-5 text-center"
    >
      <span
        className={cn(
          'rounded-full px-3 py-1 text-xs font-semibold',
          badge.badgeClassName,
        )}
      >
        {badge.label}
      </span>
      {message && <p className="text-sm text-on-surface">{message}</p>}
      {view.errorMessage && !hasTriedPayNow && (
        <p className="text-sm text-destructive">{view.errorMessage}</p>
      )}
      {view.canPayNow && (
        <Button
          type="button"
          className="w-auto rounded-full px-8"
          disabled={isPending || isRedirecting}
          onClick={() => void handlePayNow()}
        >
          Pay now
        </Button>
      )}
      {payNowError && (
        <p role="alert" className="text-sm text-destructive">
          {payNowError}
        </p>
      )}
    </section>
  )
}

export default OrderSuccessPayment
