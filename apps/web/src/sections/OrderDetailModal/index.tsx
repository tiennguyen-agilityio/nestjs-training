'use client'

import Image from 'next/image'
import { X } from 'lucide-react'

// Types
import type { Order } from '@/types/order'

// Constants
import { EMPTY_IMAGE } from '@/constants/images'

// Utils
import { cn } from '@/utils/styles'
import { formatPrice } from '@/utils/common'
import {
  formatOrderCustomerName,
  formatOrderListDate,
  getOrderStatusPresentation,
  getShippingStatusPresentation,
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
import { Badge } from '@/components/ui/badge'

interface OrderDetailModalProps {
  order: Order | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function OrderDetailModal({
  order,
  open,
  onOpenChange,
}: OrderDetailModalProps) {
  if (!order) return null

  const orderStatus = getOrderStatusPresentation(order.status)
  const shippingStatus = getShippingStatusPresentation(order.shippingStatus)

  const {
    firstName = '',
    lastName = '',
    phoneNumber = '',
  } = order.addressSnapshot ?? {}

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
          <div className="grid gap-2 rounded-xl border p-4 md:grid-cols-2">
            <p>
              <span className="text-muted-foreground">Order ID: </span>
              <span className="font-semibold">
                {order.orderNumber || order.id}
              </span>
            </p>
            <p>
              <span className="text-muted-foreground">Date: </span>
              <span className="font-semibold">
                {formatOrderListDate(order.createdAt)}
              </span>
            </p>
            <p>
              <span className="text-muted-foreground">Customer: </span>
              <span className="font-semibold">
                {formatOrderCustomerName(order)}
              </span>
            </p>
            <p>
              <span className="text-muted-foreground">Payment: </span>
              <span className="font-semibold">{order.paymentMethod}</span>
            </p>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Status:</span>
              <Badge
                className={cn(
                  'h-7 px-3 text-[0.65rem] font-semibold uppercase',
                  orderStatus.badgeClassName,
                )}
              >
                {orderStatus.label}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Shipping:</span>
              <Badge
                className={cn(
                  'h-7 px-3 text-[0.65rem] font-semibold uppercase',
                  shippingStatus.badgeClassName,
                )}
              >
                {shippingStatus.label}
              </Badge>
            </div>
          </div>

          <div className="rounded-xl border p-4">
            <p className="mb-2 font-semibold">Shipping Address</p>
            <p className="text-muted-foreground">
              {order.addressSnapshot.addressLine}, {order.addressSnapshot.ward},{' '}
              {order.addressSnapshot.district}, {order.addressSnapshot.city}-{' '}
              {order.addressSnapshot.postalCode}
            </p>
            <p className="mt-4 font-semibold">Order recipient</p>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Name</span>
              <span>
                {firstName} {lastName}{' '}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Phone Number</span>
              <span>{phoneNumber}</span>
            </div>
          </div>

          <div className="rounded-xl border p-4">
            <p className="mb-2 font-semibold">Items</p>
            {order.items.length === 0 ? (
              <p className="text-muted-foreground">No items in this order.</p>
            ) : (
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
                      <p className="truncate font-medium">
                        {item.productName} x{item.quantity}
                      </p>
                    </div>
                    <p className="font-semibold">
                      {formatPrice(item.subTotal)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border p-4">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-semibold">
                {formatPrice(order.subTotal)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Tax</span>
              <span className="font-semibold">{formatPrice(order.tax)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Shipping fee</span>
              <span className="font-semibold">
                {formatPrice(order.shippingFee)}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between border-t pt-2">
              <span className="font-semibold">Total</span>
              <span className="text-base font-bold">
                {formatPrice(order.totalAmount)}
              </span>
            </div>
          </div>
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
