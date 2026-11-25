'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { InventoryMovementType } from '@repo/constants'

import ListBody from '@/components/ListBody'
import Loading from '@/components/Loading'
import PageHeader from '@/components/PageHeader'
import { PaginationBar } from '@/components/Pagination'
import Table, { type TableColumn } from '@/components/Table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  API_FALLBACK_ERRORS,
  ERROR_MESSAGES,
  NOTICE_MESSAGES,
} from '@/constants/messages'
import {
  ROUTES,
  dashboardInventoryHistoryPath,
  dashboardOrderPath,
} from '@/constants/routes'
import { useInventoryItem, useVariantMovements } from '@/hooks/useInventory'
import type { InventoryMovement } from '@/types/inventory'
import { cn } from '@/utils/styles'

const CELL = 'px-6 py-4'

const HISTORY_TABLE_COLUMNS: TableColumn[] = [
  { key: 'date', label: 'Date', className: `w-[18%] ${CELL}` },
  { key: 'type', label: 'Type', className: `w-[13%] ${CELL}` },
  { key: 'change', label: 'Change', className: `w-[13%] ${CELL}` },
  { key: 'reason', label: 'Reason', className: `min-w-0 ${CELL}` },
  { key: 'order', label: 'Order', className: `w-[14%] ${CELL}` },
  { key: 'by', label: 'By', className: `w-[15%] ${CELL}` },
]

const MOVEMENT_TYPES: Record<
  InventoryMovementType,
  { label: string; style: string }
> = {
  [InventoryMovementType.RESTOCK]: {
    label: 'Restock',
    style: 'bg-emerald-100 text-emerald-700',
  },
  [InventoryMovementType.ADJUSTMENT]: {
    label: 'Adjustment',
    style: 'bg-amber-100 text-amber-700',
  },
  [InventoryMovementType.RESERVE]: {
    label: 'Reserve',
    style: 'bg-sky-100 text-sky-700',
  },
  [InventoryMovementType.RELEASE]: {
    label: 'Release',
    style: 'bg-muted text-muted-foreground',
  },
  [InventoryMovementType.SALE]: {
    label: 'Sale',
    style: 'bg-foreground/10 text-foreground/70',
  },
}

// SALE is written by order fulfilment (#32); the filter offers what exists today.
const FILTER_TYPES = [
  InventoryMovementType.RESTOCK,
  InventoryMovementType.ADJUSTMENT,
  InventoryMovementType.RESERVE,
  InventoryMovementType.RELEASE,
]

const signed = (quantity: number) =>
  quantity > 0 ? `+${quantity}` : `−${Math.abs(quantity)}`

/** RESERVE and RELEASE change what orders hold; the others change the stock. */
const changeLabel = ({ type, quantity }: InventoryMovement) => {
  const { STOCK, RESERVED } = NOTICE_MESSAGES.STOCK_MOVEMENT
  switch (type) {
    case InventoryMovementType.RESERVE:
      return RESERVED(signed(quantity))
    case InventoryMovementType.RELEASE:
      return RESERVED(signed(-quantity))
    case InventoryMovementType.SALE:
      return STOCK(signed(-quantity))
    default:
      return STOCK(signed(quantity))
  }
}

const formatDate = (value: string) =>
  new Date(value).toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })

export default function InventoryHistoryPageContent() {
  const { variantId = '' } = useParams<{ variantId: string }>()
  const [page, setPage] = useState(1)
  const [type, setType] = useState<InventoryMovementType | undefined>()
  const variant = useInventoryItem(variantId || null)
  const {
    movements,
    meta,
    isLoading,
    isFetching,
    isError,
    errorMessage,
    refetch,
  } = useVariantMovements(variantId, { page, ...(type && { type }) })

  const title = variant.item
    ? `${variant.item.product.name} · ${variant.item.name}`
    : 'Stock history'
  const totalPages = Math.max(1, meta?.pageCount ?? 1)

  const header = (
    <PageHeader
      breadcrumbItems={[
        { label: 'Dashboard', href: ROUTES.DASHBOARD },
        { label: 'Inventory', href: ROUTES.DASHBOARD_INVENTORY },
        {
          label: variant.item?.name ?? 'Stock history',
          href: dashboardInventoryHistoryPath(variantId),
        },
      ]}
      title={title}
      description={
        variant.item
          ? `SKU ${variant.item.sku} · Stock ${variant.item.stockQuantity} · Reserved ${variant.item.reservedQuantity} · Available ${variant.item.availableQuantity}`
          : undefined
      }
    />
  )

  if (variant.isLoading) {
    return <Loading size="lg" label="Loading stock history" />
  }

  if (variant.isNotFound || (variant.isError && !variant.item)) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <div className="flex flex-col items-start gap-4">
          <p className="text-lg text-on-surface">
            {variant.isNotFound
              ? ERROR_MESSAGES.PRODUCT_VARIANT_NOT_FOUND
              : (variant.errorMessage ??
                API_FALLBACK_ERRORS.INVENTORY_ITEM_LOAD)}
          </p>
          <Link
            href={ROUTES.DASHBOARD_INVENTORY}
            className="text-sm font-semibold underline"
          >
            Back to inventory
          </Link>
        </div>
      </div>
    )
  }

  const selectType = (next: InventoryMovementType | undefined) => {
    setType(next)
    setPage(1)
  }

  return (
    <div className="flex flex-col gap-6">
      {header}

      <section className="overflow-hidden rounded-3xl border border-outline-variant/40 bg-card">
        <div
          role="group"
          aria-label="Movement type"
          className="flex flex-wrap gap-2 border-b border-outline-variant/30 p-4"
        >
          {[undefined, ...FILTER_TYPES].map((value) => (
            <Button
              key={value ?? 'all'}
              size="sm"
              variant={type === value ? 'default' : 'outline'}
              aria-pressed={type === value}
              className="w-auto rounded-full px-4"
              onClick={() => selectType(value)}
            >
              {value ? MOVEMENT_TYPES[value].label : 'All'}
            </Button>
          ))}
        </div>

        <ListBody
          isLoading={isLoading}
          isError={isError}
          errorMessage={errorMessage}
          isFetching={isFetching}
          onRetry={() => void refetch()}
        >
          <Table
            columns={HISTORY_TABLE_COLUMNS}
            data={movements}
            getRowKey={(movement) => movement.id}
            renderRow={(movement) => {
              const badge = MOVEMENT_TYPES[movement.type]
              return (
                <>
                  <td className={`${CELL} text-sm text-muted-foreground`}>
                    {formatDate(movement.createdAt)}
                  </td>
                  <td className={CELL}>
                    <Badge
                      className={cn('h-7 px-3 text-[0.65rem]', badge.style)}
                    >
                      {badge.label}
                    </Badge>
                  </td>
                  <td className={`${CELL} font-semibold`}>
                    {changeLabel(movement)}
                  </td>
                  <td className={`${CELL} text-sm`}>
                    {movement.reason ?? '—'}
                  </td>
                  <td className={`${CELL} text-sm`}>
                    {movement.orderNumber ? (
                      <Link
                        href={dashboardOrderPath(movement.orderNumber)}
                        className="font-medium underline"
                      >
                        {movement.orderNumber}
                      </Link>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className={`${CELL} text-sm`}>
                    {movement.createdBy
                      ? `${movement.createdBy.firstName} ${movement.createdBy.lastName}`.trim()
                      : NOTICE_MESSAGES.STOCK_MOVEMENT.SYSTEM}
                  </td>
                </>
              )
            }}
            emptyMessage="No stock movements yet."
          />
        </ListBody>

        <footer className="border-t border-outline-variant/30 px-6 py-4">
          <PaginationBar
            currentPage={Math.min(page, totalPages)}
            totalPages={totalPages}
            onPageChange={setPage}
            showingCount={movements.length}
            totalCount={meta?.totalCount ?? movements.length}
            entityLabel="movements"
          />
        </footer>
      </section>
    </div>
  )
}
