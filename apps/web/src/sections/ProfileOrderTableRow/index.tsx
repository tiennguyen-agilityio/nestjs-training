'use client'

import Link from 'next/link'
import { Eye } from 'lucide-react'

// Types
import type { OrderSummary } from '@/types/order'

// Constants
import { profileOrderPath } from '@/constants/routes'

// Components
import { buttonVariants } from '@/components/ui/button'

// Utils
import { formatPrice } from '@/utils/common'
import {
  formatOrderListDate,
  getOrderStatusPresentation,
  getPaymentStatusPresentation,
  getShippingStatusPresentation,
} from '@/utils/order'
import { cn } from '@/utils/styles'

export interface ProfileOrderTableRowProps {
  order: OrderSummary
  /** Opens the order's details page; every cell but the actions calls it, the number and the eye are links. */
  onOpen?: (order: OrderSummary) => void
}

const PILL_CLASS = 'inline-flex rounded-full px-3 py-1 text-xs font-semibold'

export function ProfileOrderTableRow({
  order,
  onOpen,
}: ProfileOrderTableRowProps) {
  const badges = [
    getOrderStatusPresentation(order.status),
    getShippingStatusPresentation(order.shippingStatus),
    getPaymentStatusPresentation(order.paymentStatus),
  ]
  const open = () => onOpen?.(order)

  return (
    <>
      <td
        className="px-6 py-6 font-mono text-sm text-on-surface"
        onClick={open}
      >
        <Link
          href={profileOrderPath(order.orderNumber)}
          className="hover:underline"
          onClick={(event) => event.stopPropagation()}
        >
          #{order.orderNumber}
        </Link>
      </td>
      <td className="px-6 py-6 text-on-surface-variant" onClick={open}>
        {formatOrderListDate(order.createdAt)}
      </td>
      <td className="px-6 py-6 text-on-surface-variant" onClick={open}>
        {order.itemCount}
      </td>
      {badges.map((badge, index) => (
        <td key={index} className="px-6 py-6" onClick={open}>
          <span className={cn(PILL_CLASS, badge.badgeClassName)}>
            {badge.label}
          </span>
        </td>
      ))}
      <td
        className="px-6 py-6 text-right font-bold text-on-surface"
        onClick={open}
      >
        {formatPrice(order.totalAmount)}
      </td>
      <td className="px-6 py-6 text-center">
        <Link
          href={profileOrderPath(order.orderNumber)}
          className={cn(
            buttonVariants({ variant: 'ghost', size: 'icon' }),
            'inline-flex size-9',
          )}
          title="View order details"
          aria-label={`View order #${order.orderNumber}`}
          onClick={(event) => event.stopPropagation()}
        >
          <Eye className="size-4" aria-hidden />
        </Link>
      </td>
    </>
  )
}
