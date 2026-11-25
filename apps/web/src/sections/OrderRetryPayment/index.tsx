'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { PaymentMethod } from '@repo/constants'

import { Button } from '@/components/ui/button'
import PayPalRetryButton from '@/components/PayPalRetryButton'
import { useStartPayment } from '@/hooks/usePayment'
import type { OrderDetail } from '@/types/order'
import {
  canRetryPayment,
  chargeMethodOf,
  paymentErrorMessage,
} from '@/utils/order'
import { ServiceError } from '@/utils/query'

export interface OrderRetryPaymentProps {
  order: OrderDetail
}

/** A card retry: a new Stripe Checkout on the same order, as Order success's "Pay now". */
function CardRetry({ order }: OrderRetryPaymentProps) {
  const router = useRouter()
  const { mutateAsync: startPayment, isPending } = useStartPayment()
  const [isRedirecting, setIsRedirecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleRetry = async () => {
    setError(null)
    try {
      const checkout = await startPayment(order.id)
      setIsRedirecting(true)
      router.replace(checkout.checkoutUrl)
    } catch (caught) {
      const errCode =
        caught instanceof ServiceError ? caught.errors[0]?.errCode : undefined
      setError(paymentErrorMessage(errCode))
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        className="w-full"
        disabled={isPending || isRedirecting}
        onClick={() => void handleRetry()}
      >
        Retry payment
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}

/** Order details' "Retry payment" for a FAILED card or PayPal payment; nothing otherwise. */
const OrderRetryPayment = ({ order }: OrderRetryPaymentProps) => {
  if (!canRetryPayment(order)) return null
  return chargeMethodOf(order) === PaymentMethod.PAYPAL ? (
    <PayPalRetryButton order={order} />
  ) : (
    <CardRetry order={order} />
  )
}

export default OrderRetryPayment
