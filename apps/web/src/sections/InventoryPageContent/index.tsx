'use client'

import { useState } from 'react'
import Link from 'next/link'
import { History, PackagePlus, SlidersHorizontal } from 'lucide-react'
import { ProductStatus, StockLevel } from '@repo/constants'

import PageHeader from '@/components/PageHeader'
import ListBody from '@/components/ListBody'
import Table, { type TableColumn } from '@/components/Table'
import { PaginationBar } from '@/components/Pagination'
import { SearchInput } from '@/components/SearchInput'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { PRODUCT_STATUS_OPTIONS } from '@/constants/product'
import { ROUTES, dashboardInventoryHistoryPath } from '@/constants/routes'
import { useInventory } from '@/hooks/useInventory'
import { useUrlState } from '@/hooks/useUrlState'
import { useDebouncedUrlSearch } from '@/hooks/useDebouncedUrlSearch'
import { usePageClamp } from '@/hooks/usePageClamp'
import AdjustStockForm from '@/sections/AdjustStockForm'
import RestockStockForm from '@/sections/RestockStockForm'
import type { InventoryItem } from '@/types/inventory'
import { inventoryUrlSchema } from '@/utils/url'
import { cn } from '@/utils/styles'

const CELL = 'px-6 py-4 align-middle'
// The number and level columns: a fixed width that fits the header and badge.
const NARROW_CELL = 'px-3 py-4 align-middle text-center'
const HEADER = 'whitespace-nowrap'

const INVENTORY_TABLE_COLUMNS: TableColumn[] = [
  { key: 'product', label: 'Product', className: `min-w-0 ${CELL} ${HEADER}` },
  { key: 'variant', label: 'Variant', className: `w-44 ${CELL} ${HEADER}` },
  { key: 'stock', label: 'Stock', className: `w-24 ${NARROW_CELL} ${HEADER}` },
  {
    key: 'reserved',
    label: 'Reserved',
    className: `w-28 ${NARROW_CELL} ${HEADER}`,
  },
  {
    key: 'available',
    label: 'Available',
    className: `w-28 ${NARROW_CELL} ${HEADER}`,
  },
  { key: 'level', label: 'Level', className: `w-36 ${NARROW_CELL} ${HEADER}` },
  {
    key: 'actions',
    label: 'Actions',
    className: `w-36 ${CELL} ${HEADER} text-right`,
  },
]

const STOCK_LEVEL_BADGES: Record<StockLevel, { label: string; style: string }> =
  {
    [StockLevel.OUT]: { label: 'Out', style: 'bg-red-100 text-red-700' },
    [StockLevel.LOW]: { label: 'Low', style: 'bg-amber-100 text-amber-700' },
    [StockLevel.OK]: { label: 'OK', style: 'bg-emerald-100 text-emerald-700' },
  }

const productStatusLabel = (status: ProductStatus) =>
  PRODUCT_STATUS_OPTIONS.find((option) => option.value === status)?.label ??
  status

type Dialog = { kind: 'restock' | 'adjust'; item: InventoryItem } | null

export default function InventoryPageContent() {
  const { state, update: updateUrl } = useUrlState(inventoryUrlSchema)
  const { page, search, limit, lowStock } = state
  const isLowStockOnly = lowStock === 'true'
  const { searchInput, setSearchInput, searchInputRef } = useDebouncedUrlSearch(
    search,
    updateUrl,
  )
  const [dialog, setDialog] = useState<Dialog>(null)

  const { items, meta, isLoading, isFetching, isError, errorMessage, refetch } =
    useInventory({
      page,
      limit,
      search: search.trim(),
      lowStock: isLowStockOnly,
    })

  const totalPages = Math.max(1, meta?.pageCount ?? 1)
  usePageClamp({ meta, page, totalPages, updateUrl })

  const closeDialog = (open: boolean) => {
    if (!open) setDialog(null)
  }

  return (
    <div className="flex flex-col gap-6">
      <RestockStockForm
        open={dialog?.kind === 'restock'}
        item={dialog?.kind === 'restock' ? dialog.item : null}
        onOpenChange={closeDialog}
      />
      <AdjustStockForm
        open={dialog?.kind === 'adjust'}
        item={dialog?.kind === 'adjust' ? dialog.item : null}
        onOpenChange={closeDialog}
      />

      <PageHeader
        breadcrumbItems={[
          { label: 'Dashboard', href: ROUTES.DASHBOARD },
          { label: 'Inventory', href: ROUTES.DASHBOARD_INVENTORY },
        ]}
        title="Inventory"
        description="Stock per variant: restock deliveries, adjust after a count, and see the history."
      />

      <section className="overflow-hidden rounded-3xl border border-outline-variant/40 bg-card">
        <div className="flex min-w-0 flex-col gap-3 border-b border-outline-variant/30 p-4 md:flex-row md:items-center md:justify-between">
          <SearchInput
            ref={searchInputRef}
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search by product or SKU"
            aria-label="Search inventory"
            containerClassName="h-12 bg-surface-container-high w-full md:w-auto md:min-w-0 md:max-w-sm md:flex-1"
          />
          <Button
            variant={isLowStockOnly ? 'default' : 'outline'}
            aria-pressed={isLowStockOnly}
            className="h-11 w-auto rounded-full px-5"
            onClick={() =>
              updateUrl({ lowStock: isLowStockOnly ? null : 'true', page: 1 })
            }
          >
            Low stock only
          </Button>
        </div>

        <ListBody
          isLoading={isLoading}
          isError={isError}
          errorMessage={errorMessage}
          isFetching={isFetching}
          onRetry={() => void refetch()}
        >
          <div className="md:overflow-x-auto">
            <Table
              columns={INVENTORY_TABLE_COLUMNS}
              data={items}
              isStackedOnMobile
              // From md up the table keeps its columns and scrolls sideways
              // instead of squeezing them.
              tableClassName="w-full table-fixed text-left md:min-w-[60rem]"
              getRowKey={(item) => item.id}
              renderRow={(item) => {
                const level = STOCK_LEVEL_BADGES[item.stockLevel]
                return (
                  <>
                    <td className={CELL}>
                      <div className="flex min-w-0 items-center gap-3">
                        <Avatar className="size-12 shrink-0 rounded-sm after:rounded-sm after:border-transparent">
                          <AvatarImage
                            src={item.product.primaryImageUrl ?? ''}
                            alt={item.product.name}
                            className="rounded-sm"
                          />
                          <AvatarFallback className="rounded-sm text-xs font-semibold">
                            {item.product.name.slice(0, 1).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-foreground">
                            {item.product.name}
                          </p>
                          {item.product.status !== ProductStatus.ACTIVE && (
                            <Badge className="mt-1 h-6 bg-muted px-2 text-[0.65rem] uppercase text-muted-foreground">
                              {productStatusLabel(item.product.status)}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </td>
                    <td data-label="Variant" className={CELL}>
                      <p className="text-sm font-medium text-foreground">
                        {item.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {item.sku}
                      </p>
                    </td>
                    <td
                      data-label="Stock"
                      className={`${NARROW_CELL} font-semibold`}
                    >
                      {item.stockQuantity}
                    </td>
                    <td data-label="Reserved" className={NARROW_CELL}>
                      {item.reservedQuantity}
                    </td>
                    <td
                      data-label="Available"
                      className={`${NARROW_CELL} font-semibold`}
                    >
                      {item.availableQuantity}
                    </td>
                    <td data-label="Level" className={NARROW_CELL}>
                      <Badge
                        className={cn('h-7 px-3 text-[0.65rem]', level.style)}
                      >
                        {level.label}
                      </Badge>
                    </td>
                    <td data-label="Actions" className={CELL}>
                      <div className="flex justify-end gap-1">
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                className="w-auto"
                                aria-label={`Restock ${item.sku}`}
                                onClick={() =>
                                  setDialog({ kind: 'restock', item })
                                }
                              />
                            }
                          >
                            <PackagePlus className="size-4" aria-hidden />
                          </TooltipTrigger>
                          <TooltipContent>Restock</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                className="w-auto"
                                aria-label={`Adjust ${item.sku}`}
                                onClick={() =>
                                  setDialog({ kind: 'adjust', item })
                                }
                              />
                            }
                          >
                            <SlidersHorizontal className="size-4" aria-hidden />
                          </TooltipTrigger>
                          <TooltipContent>Adjust stock</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <Link
                                href={dashboardInventoryHistoryPath(item.id)}
                                aria-label={`History of ${item.sku}`}
                                className={cn(
                                  buttonVariants({
                                    variant: 'ghost',
                                    size: 'icon-sm',
                                  }),
                                  'w-auto',
                                )}
                              />
                            }
                          >
                            <History className="size-4" aria-hidden />
                          </TooltipTrigger>
                          <TooltipContent>View history</TooltipContent>
                        </Tooltip>
                      </div>
                    </td>
                  </>
                )
              }}
              emptyMessage={
                isLowStockOnly
                  ? 'No variants are running low.'
                  : 'No variants found.'
              }
            />
          </div>
        </ListBody>

        <footer className="border-t border-outline-variant/30 px-6 py-4">
          <PaginationBar
            currentPage={Math.min(page, totalPages)}
            totalPages={totalPages}
            onPageChange={(next) => updateUrl({ page: next })}
            showingCount={items.length}
            totalCount={meta?.totalCount ?? items.length}
            entityLabel="variants"
          />
        </footer>
      </section>
    </div>
  )
}
