'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

import { Button } from '@/components/ui/button'
import { useStartPayment } from '@/hooks/usePayment'
import type { OrderDetail } from '@/types/order'
import { canRetryPayment, paymentErrorMessage } from '@/utils/order'
import { ServiceError } from '@/utils/query'

export interface OrderRetryPaymentProps {
  order: OrderDetail
}

function RedirectRetry({ order }: OrderRetryPaymentProps) {
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
const OrderRetryPayment = ({ order }: OrderRetryPaymentProps) =>
  canRetryPayment(order) ? <RedirectRetry order={order} /> : null

export default OrderRetryPayment
