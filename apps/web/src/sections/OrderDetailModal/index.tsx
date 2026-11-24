'use client'

import Image from 'next/image'
import { X } from 'lucide-react'

// Constants
import { EMPTY_IMAGE } from '@/constants/images'
import { API_FALLBACK_ERRORS } from '@/constants/messages'

// Hooks
import { useOrderDetail } from '@/hooks/useOrder'

// Utils
import { cn } from '@/utils/styles'
import { formatPrice } from '@/utils/common'
import {
  formatOrderListDate,
  getPaymentStatusPresentation,
} from '@/utils/order'

// Components
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import Loading from '@/components/Loading'

export interface OrderDetailModalProps {
  /** The order to load; nothing is fetched while the modal is closed. */
  orderNumber: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function OrderDetailModal({
  orderNumber,
  open,
  onOpenChange,
}: OrderDetailModalProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent
        data-testid="order-detail-modal"
        className="max-h-[85vh] max-w-4xl grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden"
      >
        <AlertDialogCancel
          aria-label="Close order details"
          variant="ghost"
          size="icon-sm"
          className="absolute top-4 right-4"
        >
          <X className="size-4" aria-hidden />
        </AlertDialogCancel>
        <AlertDialogHeader>
          <AlertDialogTitle className="text-2xl font-bold text-foreground">
            Order Details
          </AlertDialogTitle>
        </AlertDialogHeader>

        <div className="grid min-h-0 gap-4 overflow-y-auto pr-1 text-sm">
          {open && orderNumber ? (
            <OrderDetailBody orderNumber={orderNumber} />
          ) : null}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel aria-label="Close order details">
            Close
          </AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/** The loaded order; mounted only while the modal is open. */
function OrderDetailBody({ orderNumber }: { orderNumber: string }) {
  const { order, isLoading, isError, errorMessage, refetch } =
    useOrderDetail(orderNumber)

  if (isLoading) return <Loading label="Loading order" />
  if (isError) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <p className="text-sm text-destructive" role="alert">
          {errorMessage?.trim() ? errorMessage : API_FALLBACK_ERRORS.ORDER_LOAD}
        </p>
        <Button
          type="button"
          size="sm"
          variant="destructive"
          onClick={() => void refetch()}
        >
          Retry
        </Button>
      </div>
    )
  }
  if (!order) return null

  const paymentStatus = getPaymentStatusPresentation(order.paymentStatus)

  return (
    <>
      <div className="grid gap-2 rounded-xl border p-4 md:grid-cols-2">
        <p>
          <span className="text-muted-foreground">Order ID: </span>
          <span className="font-semibold">#{order.orderNumber}</span>
        </p>
        <p>
          <span className="text-muted-foreground">Date: </span>
          <span className="font-semibold">
            {formatOrderListDate(order.createdAt)}
          </span>
        </p>
      </div>

      <div className="rounded-xl border p-4">
        <p className="mb-2 font-semibold">Items</p>
        <div className="space-y-2">
          {order.items.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between gap-2 border-b pb-2 last:border-b-0 last:pb-0"
            >
              <div className="flex min-w-0 items-center gap-3">
                <Image
                  src={item.productImage || EMPTY_IMAGE}
                  alt={item.productName}
                  width={40}
                  height={40}
                  className="size-10 shrink-0 rounded-md border object-cover"
                />
                <div className="min-w-0">
                  <p className="truncate font-medium">{item.productName}</p>
                  <p className="text-muted-foreground">
                    {item.variantName} x{item.quantity}
                  </p>
                </div>
              </div>
              <p className="font-semibold">{formatPrice(item.lineTotal)}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border p-4">
        <p className="mb-2 font-semibold">Shipping Address</p>
        <p className="text-muted-foreground">
          {[
            order.addressLine,
            order.ward,
            order.district,
            order.city,
            order.postalCode,
          ].join(', ')}
        </p>
        <p className="mt-2">
          {order.recipientName} · {order.recipientPhone}
        </p>
        <p className="mt-4 font-semibold">Shipping method</p>
        <p className="text-muted-foreground">{order.shippingMethodName}</p>
      </div>

      <div className="rounded-xl border p-4">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Subtotal</span>
          <span className="font-semibold">{formatPrice(order.subTotal)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Shipping fee</span>
          <span className="font-semibold">
            {formatPrice(order.shippingFee)}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Tax</span>
          <span className="font-semibold">{formatPrice(order.tax)}</span>
        </div>
        <div className="mt-2 flex items-center justify-between border-t pt-2">
          <span className="font-semibold">Total</span>
          <span className="text-base font-bold">
            {formatPrice(order.totalAmount)}
          </span>
        </div>
        <div className="mt-4 flex items-center justify-between">
          <span className="text-muted-foreground">Payment status</span>
          <span
            className={cn(
              'inline-flex rounded-full px-3 py-1 text-xs font-semibold',
              paymentStatus.badgeClassName,
            )}
          >
            {paymentStatus.label}
          </span>
        </div>
      </div>
    </>
  )
}
