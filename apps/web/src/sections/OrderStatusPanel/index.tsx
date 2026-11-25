'use client'

import { useId, useState } from 'react'
import { toast } from 'sonner'
import {
  OrderPaymentStatus,
  OrderStatus,
  type ShippingStatus,
} from '@repo/constants'

import type { OrderDetail } from '@/types/order'
import { ORDER_TRANSITIONS, SHIPPING_TRANSITIONS } from '@/constants/order'
import { DIALOG_MESSAGES, SUCCESS_MESSAGES } from '@/constants/messages'
import {
  useUpdateOrderShippingStatus,
  useUpdateOrderStatus,
} from '@/hooks/useOrder'
import {
  getOrderStatusPresentation,
  getShippingStatusPresentation,
} from '@/utils/order'
import { getErrorMessage } from '@/utils/form'
import { cn } from '@/utils/styles'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import ConfirmActionDialog from '@/components/ConfirmActionDialog'
import { SELECT_TRIGGER_VARIANT_CLASS } from '@/components/Select'

export interface OrderStatusPanelProps {
  order: OrderDetail
  className?: string
}

const ORDER_PREFIX = 'order:'
const SHIPPING_PREFIX = 'shipping:'

/**
 * The admin's "Update status" panel: picks one allowed next step of the
 * order status or of the shipping status and applies it. Cancelling asks
 * first; every other step applies at once.
 */
export default function OrderStatusPanel({
  order,
  className,
}: OrderStatusPanelProps) {
  const headingId = useId()
  const [choice, setChoice] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<OrderDetail | null>(null)
  const orderStatus = useUpdateOrderStatus()
  const shippingStatus = useUpdateOrderShippingStatus()
  const isPending = orderStatus.isPending || shippingStatus.isPending

  const orderSteps = ORDER_TRANSITIONS[order.status]
  const shippingSteps = SHIPPING_TRANSITIONS[order.shippingStatus]
  const labelOf = (value: string): string =>
    value.startsWith(ORDER_PREFIX)
      ? `Order → ${getOrderStatusPresentation(value.slice(ORDER_PREFIX.length) as OrderStatus).label}`
      : `Shipping → ${getShippingStatusPresentation(value.slice(SHIPPING_PREFIX.length) as ShippingStatus).label}`

  const handlers = {
    onSuccess: (message: string) => () => {
      toast.success(message)
      setChoice('')
    },
    // The order refetches after a failure, so the chosen step may no longer
    // be allowed: clear it and let the admin pick again.
    onError: (error: unknown) => {
      setErrorMessage(getErrorMessage(error))
      setChoice('')
    },
  }

  const update = () => {
    setErrorMessage(null)
    if (choice === `${ORDER_PREFIX}${OrderStatus.CANCELLED}`) {
      setConfirming(order)
      return
    }
    if (choice.startsWith(ORDER_PREFIX)) {
      orderStatus.mutate(
        {
          id: order.id,
          status: choice.slice(ORDER_PREFIX.length) as OrderStatus,
        },
        {
          onSuccess: handlers.onSuccess(SUCCESS_MESSAGES.ORDER_STATUS_UPDATED),
          onError: handlers.onError,
        },
      )
      return
    }
    shippingStatus.mutate(
      {
        id: order.id,
        shippingStatus: choice.slice(SHIPPING_PREFIX.length) as ShippingStatus,
      },
      {
        onSuccess: handlers.onSuccess(
          SUCCESS_MESSAGES.ORDER_SHIPPING_STATUS_UPDATED,
        ),
        onError: handlers.onError,
      },
    )
  }

  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        'flex min-w-0 flex-col gap-4 rounded-xl bg-surface-container-low p-6',
        className,
      )}
    >
      <h2 id={headingId} className="font-semibold text-on-surface">
        Update status
      </h2>
      {orderSteps.length === 0 && shippingSteps.length === 0 ? (
        <p className="text-sm text-on-surface-variant">
          This order is closed. No further changes.
        </p>
      ) : (
        <>
          <Select
            value={choice}
            onValueChange={(value) => {
              setChoice(typeof value === 'string' ? value : '')
              setErrorMessage(null)
            }}
            disabled={isPending}
          >
            <SelectTrigger
              aria-label="Next status"
              className={cn('w-full', SELECT_TRIGGER_VARIANT_CLASS.form)}
            >
              <SelectValue placeholder="Choose the next status…">
                {choice ? labelOf(choice) : 'Choose the next status…'}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {orderSteps.length > 0 && (
                <SelectGroup>
                  <SelectLabel>Order</SelectLabel>
                  {orderSteps.map((status) => (
                    <SelectItem key={status} value={`${ORDER_PREFIX}${status}`}>
                      {labelOf(`${ORDER_PREFIX}${status}`)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              )}
              {shippingSteps.length > 0 && (
                <SelectGroup>
                  <SelectLabel>Shipping</SelectLabel>
                  {shippingSteps.map((status) => (
                    <SelectItem
                      key={status}
                      value={`${SHIPPING_PREFIX}${status}`}
                    >
                      {labelOf(`${SHIPPING_PREFIX}${status}`)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              )}
            </SelectContent>
          </Select>
          {errorMessage && (
            <p className="text-sm text-destructive" role="alert">
              {errorMessage}
            </p>
          )}
          <Button
            type="button"
            className="w-full"
            disabled={!choice || isPending}
            onClick={update}
          >
            Update status
          </Button>
        </>
      )}
      <ConfirmActionDialog
        item={confirming}
        onClose={() => {
          setConfirming(null)
          setChoice('')
        }}
        mutate={(id, options) =>
          orderStatus.mutate({ id, status: OrderStatus.CANCELLED }, options)
        }
        isPending={orderStatus.isPending}
        successMessage={SUCCESS_MESSAGES.ORDER_STATUS_UPDATED}
        title={DIALOG_MESSAGES.ORDER.CANCEL.TITLE}
        renderDescription={(current) => (
          <>
            <span>
              {DIALOG_MESSAGES.ORDER.CANCEL.DESCRIPTION(
                current?.orderNumber ?? order.orderNumber,
              )}
            </span>
            {order.paymentStatus === OrderPaymentStatus.PAID && (
              <>
                {' '}
                <span>{DIALOG_MESSAGES.ORDER.CANCEL.NOT_REFUNDED}</span>
              </>
            )}
          </>
        )}
        textAction={DIALOG_MESSAGES.ORDER.CANCEL.ACTION}
        textCancel={DIALOG_MESSAGES.ORDER.CANCEL.KEEP}
        actionVariant="destructive"
      />
    </section>
  )
}
