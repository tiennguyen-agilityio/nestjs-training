'use client'

import { ChevronRight } from 'lucide-react'

// Types
import type { OrderSummary } from '@/types/order'

// Utils
import { formatPrice } from '@/utils/common'
import { formatOrderListDate, getOrderStatusPresentation } from '@/utils/order'
import { cn } from '@/utils/styles'

// Components
import { Button } from '@/components/ui/button'

export interface ProfileOrderTableRowProps {
  order: OrderSummary
  onRequestView?: (order: OrderSummary) => void
}

export function ProfileOrderTableRow({
  order,
  onRequestView,
}: ProfileOrderTableRowProps) {
  const orderLabel = order.orderNumber?.trim() || order.id
  const displayId = orderLabel.startsWith('#') ? orderLabel : `#${orderLabel}`
  const statusPresentation = getOrderStatusPresentation(order.status)

  return (
    <>
      <td
        title={displayId}
        className="min-w-0 truncate px-8 py-8 font-medium text-on-surface"
      >
        {displayId}
      </td>
      <td className="px-8 py-8 text-on-surface-variant">
        {formatOrderListDate(order.createdAt)}
      </td>
      <td className="px-8 py-8">
        <span
          className={cn(
            'inline-flex rounded-full px-3 py-1 text-xs font-semibold',
            statusPresentation.badgeClassName,
          )}
        >
          {statusPresentation.label}
        </span>
      </td>
      <td className="px-8 py-8 font-bold text-on-surface">
        {formatPrice(order.totalAmount)}
      </td>
      <td className="px-8 py-8 text-right">
        <Button
          type="button"
          variant="link"
          className="ms-auto inline-flex h-auto w-auto gap-1 p-0 font-semibold text-primary"
          onClick={() => onRequestView?.(order)}
          aria-label={`View order ${displayId}`}
        >
          View Details
          <ChevronRight className="size-4" aria-hidden />
        </Button>
      </td>
    </>
  )
}
