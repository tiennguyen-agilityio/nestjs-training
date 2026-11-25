'use client'

import { ChevronDown, Pencil, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { ShippingMethodStatus } from '@repo/constants'

import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { NOTICE_MESSAGES } from '@/constants/messages'
import { ROUTES, dashboardEditPath } from '@/constants/routes'
import { SHIPPING_METHOD_STATUS_OPTIONS } from '@/constants/shippingMethod'
import type { ShippingMethod } from '@/types/shippingMethod'
import { formatPrice } from '@/utils/common'
import { cn } from '@/utils/styles'
import { TABLE_CELL_BADGE_CLASS } from '@/constants/common'

export interface ShippingMethodTableRowProps {
  shippingMethod: ShippingMethod
  isStatusPending?: boolean
  onRequestStatusChange?: (
    method: ShippingMethod,
    status: ShippingMethodStatus,
  ) => void
  onRequestDelete?: (method: ShippingMethod) => void
}

const ShippingMethodTableRow = ({
  shippingMethod,
  isStatusPending = false,
  onRequestStatusChange,
  onRequestDelete,
}: ShippingMethodTableRowProps) => {
  const { id, name, description, price, status } = shippingMethod
  const isDeleted = Boolean(shippingMethod.deletedAt)
  const isActive = status === ShippingMethodStatus.ACTIVE
  const lockedTitle = isDeleted
    ? NOTICE_MESSAGES.SHIPPING_METHOD_DELETED_LOCKED
    : undefined

  return (
    <>
      <td className="min-w-0 px-6 py-4 align-middle">
        <p title={name} className="truncate font-semibold text-foreground">
          {name || '—'}
        </p>
      </td>
      <td
        data-label="Description"
        className="min-w-0 px-6 py-4 align-middle text-sm text-muted-foreground"
      >
        <p title={description} className="truncate">
          {description || '—'}
        </p>
      </td>
      <td
        data-label="Fee"
        className="px-6 py-4 align-middle text-center text-sm font-medium text-foreground"
      >
        {formatPrice(price)}
      </td>
      <td data-label="Status" className="px-6 py-4 align-middle text-center">
        <DropdownMenu>
          <DropdownMenuTrigger
            disabled={isDeleted || isStatusPending}
            aria-label={`Change status for ${name}`}
            title={lockedTitle}
            className="inline-flex"
          >
            <Badge
              className={cn(
                TABLE_CELL_BADGE_CLASS,
                'transition',
                isDeleted || isStatusPending
                  ? 'cursor-not-allowed opacity-70'
                  : 'cursor-pointer hover:opacity-90',
                isActive
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200'
                  : 'bg-muted text-muted-foreground',
              )}
            >
              {status}
              <ChevronDown className="ml-1 size-3" aria-hidden />
            </Badge>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" className="min-w-32">
            {SHIPPING_METHOD_STATUS_OPTIONS.map((option) => (
              <DropdownMenuItem
                key={option.value}
                disabled={option.value === status}
                onClick={() =>
                  onRequestStatusChange?.(shippingMethod, option.value)
                }
              >
                {option.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </td>
      <td data-label="Actions" className="min-w-0 px-6 py-4 align-middle">
        <div className="flex justify-center gap-1">
          {isDeleted ? (
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              aria-label={`Edit ${name}`}
              title={lockedTitle}
              disabled
            >
              <Pencil className="size-4" aria-hidden />
            </Button>
          ) : (
            <Link
              href={dashboardEditPath(ROUTES.DASHBOARD_SHIPPING_METHODS, id)}
              className={cn(
                buttonVariants({ variant: 'ghost', size: 'icon-xs' }),
                'inline-flex',
              )}
              aria-label={`Edit ${name}`}
            >
              <Pencil className="size-4" aria-hidden />
            </Link>
          )}
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            aria-label={`Delete ${name}`}
            title={lockedTitle}
            disabled={isDeleted}
            onClick={() => onRequestDelete?.(shippingMethod)}
          >
            <Trash2 className="size-4" aria-hidden />
          </Button>
        </div>
      </td>
    </>
  )
}

export default ShippingMethodTableRow
