'use client'

import Link from 'next/link'
import { ChevronDown, Eye, Trash2 } from 'lucide-react'
import type { OrderStatus, ShippingStatus } from '@repo/constants'

import {
  ALL_ORDER_STATUSES_VALUE,
  // ALL_SHIPPING_STATUS_VALUE,
  ORDER_STATUS_FILTER_OPTIONS,
  ORDER_TRANSITIONS,
  // SHIPPING_STATUS_OPTIONS,
  // SHIPPING_TRANSITIONS,
} from '@/constants/order'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { EMPTY_IMAGE } from '@/constants/images'
import { dashboardOrderPath } from '@/constants/routes'
import { type OrderSummary } from '@/types/order'
import { formatPrice } from '@/utils/common'
import {
  formatOrderCustomerName,
  formatOrderListDate,
  getOrderStatusPresentation,
  getShippingStatusPresentation,
} from '@/utils/order'
import { cn } from '@/utils/styles'
import { TABLE_CELL_BADGE_CLASS } from '@/constants/common'

export interface OrderTableRowProps {
  order: OrderSummary
  onRequestDelete?: (order: OrderSummary) => void
  onRequestStatusChange?: (order: OrderSummary, nextStatus: OrderStatus) => void
  onRequestShippingStatusChange?: (
    order: OrderSummary,
    nextShippingStatus: ShippingStatus,
  ) => void
  isDeleteDisabled?: boolean
  isStatusDisabled?: boolean
  isShippingStatusDisabled?: boolean
}

export function OrderTableRow({
  order,
  onRequestDelete,
  onRequestStatusChange,
  // onRequestShippingStatusChange,
  isDeleteDisabled = false,
  // isStatusDisabled = false,
  // isShippingStatusDisabled = false,
}: OrderTableRowProps) {
  const orderLabel = order.orderNumber?.trim() || order.id
  const displayId = orderLabel.startsWith('#') ? orderLabel : `#${orderLabel}`
  const customerName = formatOrderCustomerName(order)
  const { firstName = '', lastName = '', email = '' } = order.customer || {}
  const initials =
    `${firstName?.trim().charAt(0) ?? ''}${lastName?.trim().charAt(0) ?? ''}`
      .toUpperCase()
      .trim()
  const avatarFallback = initials || '?'
  const statusP = getOrderStatusPresentation(order.status)
  const isDeleteActionDisabled = isDeleteDisabled
  const shipping = getShippingStatusPresentation(order.shippingStatus)
  const nextOrderStatuses = ORDER_TRANSITIONS[order.status]
  // const nextShippingStatuses = SHIPPING_TRANSITIONS[order.shippingStatus]
  // const isOrderTerminal =
  //   order.status === ORDER_STATUS.COMPLETED ||
  //   order.status === ORDER_STATUS.CANCELLED
  // const canUpdateShippingStatus =
  //   !isOrderTerminal && nextShippingStatuses.length > 0

  const getOrderStatusLabel = (status: OrderStatus) =>
    ORDER_STATUS_FILTER_OPTIONS.find(
      (option) =>
        option.value !== ALL_ORDER_STATUSES_VALUE && option.value === status,
    )?.label ?? statusP.label

  // const getShippingStatusLabel = (status: SHIPPING_STATUS) =>
  //   SHIPPING_STATUS_OPTIONS.find(
  //     (option) =>
  //       option.value !== ALL_SHIPPING_STATUS_VALUE && option.value === status,
  //   )?.label ?? shipping.label

  return (
    <>
      <td className="min-w-0 px-6 py-4 align-middle">
        <p
          title={displayId}
          className="truncate font-mono text-sm text-muted-foreground"
        >
          {displayId}
        </p>
      </td>
      <td className="min-w-0 px-6 py-4 align-middle">
        <p
          title={formatOrderListDate(order.createdAt)}
          className="truncate text-sm font-medium text-foreground"
        >
          {formatOrderListDate(order.createdAt)}
        </p>
      </td>
      <td className="min-w-0 px-6 py-4 align-middle">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar className="size-10 shrink-0">
            <AvatarImage src={EMPTY_IMAGE} alt="" />
            <AvatarFallback className="text-xs font-semibold">
              {avatarFallback}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate font-semibold text-foreground">
              {customerName}
            </p>
            <p title={email} className="truncate text-xs text-muted-foreground">
              {email}
            </p>
          </div>
        </div>
      </td>
      <td className="min-w-0 px-6 py-4 align-middle text-center">
        {/* Order status update disabled: order feature not implemented on backend yet */}
        {nextOrderStatuses.length > 0 ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              disabled
              aria-label={`Change order status for ${displayId}`}
              className="inline-flex"
            >
              <Badge
                className={cn(
                  TABLE_CELL_BADGE_CLASS,
                  'cursor-not-allowed opacity-70',
                  statusP.badgeClassName,
                )}
              >
                {statusP.label}
                <ChevronDown className="ml-1 size-3" aria-hidden />
              </Badge>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" className="min-w-36">
              {nextOrderStatuses.map((nextStatus) => (
                <DropdownMenuItem
                  key={nextStatus}
                  disabled
                  onClick={() => onRequestStatusChange?.(order, nextStatus)}
                >
                  {getOrderStatusLabel(nextStatus)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Badge className={cn(TABLE_CELL_BADGE_CLASS, statusP.badgeClassName)}>
            {statusP.label}
          </Badge>
        )}
      </td>
      {/* <td className="px-6 py-4 text-center">
        {canUpdateShippingStatus ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              disabled={isShippingStatusDisabled}
              aria-label={`Change shipping status for ${displayId}`}
              className="inline-flex"
            >
              <Badge
                className={cn(
                  'h-7 cursor-pointer px-3 text-[0.65rem] font-semibold uppercase transition hover:opacity-90',
                  shipping.badgeClassName,
                )}
              >
                {shipping.label}
                <ChevronDown className="ml-1 size-3" aria-hidden />
              </Badge>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" className="min-w-36">
              {nextShippingStatuses.map((nextStatus) => (
                <DropdownMenuItem
                  key={nextStatus}
                  disabled={isShippingStatusDisabled}
                  onClick={() =>
                    onRequestShippingStatusChange?.(order, nextStatus)
                  }
                >
                  {getShippingStatusLabel(nextStatus)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Badge
            className={cn(
              'h-7 px-3 text-[0.65rem] font-semibold uppercase',
              isOrderTerminal && 'opacity-70',
              shipping.badgeClassName,
            )}
          >
            {shipping.label}
          </Badge>
        )}
      </td> */}
      <td className="px-6 py-4 align-middle text-center">
        <Badge className={cn(TABLE_CELL_BADGE_CLASS, shipping.badgeClassName)}>
          {shipping.label}
        </Badge>
      </td>
      <td className="px-6 py-4 align-middle text-center">
        <p className="text-sm font-bold text-foreground">
          {formatPrice(order.totalAmount)}
        </p>
      </td>
      <td className="px-6 py-4 align-middle">
        <div className="flex justify-center gap-1">
          {/* Delete disabled: order feature not implemented on backend yet */}
          <Link
            href={dashboardOrderPath(order.orderNumber)}
            className={cn(
              buttonVariants({ variant: 'ghost', size: 'icon' }),
              'inline-flex size-9',
            )}
            title="View order details"
            aria-label={`View order ${displayId}`}
          >
            <Eye className="size-4" aria-hidden />
          </Link>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-9"
            disabled
            onClick={() => onRequestDelete?.(order)}
            title={
              isDeleteActionDisabled
                ? 'Delete order in progress'
                : 'Delete this order'
            }
            aria-label={`Delete order ${displayId}`}
          >
            <Trash2 className="size-4" aria-hidden />
          </Button>
        </div>
      </td>
    </>
  )
}
