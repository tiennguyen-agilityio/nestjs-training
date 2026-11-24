'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Truck } from 'lucide-react'
import { toast } from 'sonner'
import { ShippingMethodStatus } from '@repo/constants'

import { DIALOG_MESSAGES, SUCCESS_MESSAGES } from '@/constants/messages'
import { ROUTES } from '@/constants/routes'
import {
  SHIPPING_METHOD_STATUS_FILTER_ALL,
  SHIPPING_METHOD_STATUS_FILTER_OPTIONS,
  SHIPPING_METHODS_TABLE_COLUMNS,
} from '@/constants/shippingMethod'
import {
  useDeleteShippingMethod,
  useShippingMethods,
  useUpdateShippingMethod,
} from '@/hooks/useShippingMethod'
import { useUrlState } from '@/hooks/useUrlState'
import { useDebouncedUrlSearch } from '@/hooks/useDebouncedUrlSearch'
import { usePageClamp } from '@/hooks/usePageClamp'
import ConfirmActionDialog from '@/components/ConfirmActionDialog'
import ListBody from '@/components/ListBody'
import PageHeader from '@/components/PageHeader'
import Table from '@/components/Table'
import { PaginationBar } from '@/components/Pagination'
import { SearchInput } from '@/components/SearchInput'
import { Select } from '@/components/Select'
import { buttonVariants } from '@/components/ui/button'
import ShippingMethodTableRow from '@/sections/ShippingMethodTableRow'
import type { ShippingMethod } from '@/types/shippingMethod'
import { getErrorMessage } from '@/utils/form'
import { cn } from '@/utils/styles'
import { shippingMethodUrlSchema } from '@/utils/url'

const STATUS_FILTER_VALUES = new Set<string>(
  Object.values(ShippingMethodStatus),
)

const toStatusFilter = (
  value: string | null,
): ShippingMethodStatus | undefined =>
  value && STATUS_FILTER_VALUES.has(value)
    ? (value as ShippingMethodStatus)
    : undefined

export const PageContent = () => {
  const { state, update: updateUrl } = useUrlState(shippingMethodUrlSchema)
  const { page, search, limit, status } = state
  const statusFilter = toStatusFilter(status)
  const { searchInput, setSearchInput, searchInputRef } = useDebouncedUrlSearch(
    search,
    updateUrl,
  )
  const [pendingDelete, setPendingDelete] = useState<ShippingMethod | null>(
    null,
  )
  const [pendingStatusIds, setPendingStatusIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  )
  const { mutateAsync: updateShippingMethodAsync } = useUpdateShippingMethod()
  const { mutate: deleteShippingMethod, isPending: isDeletePending } =
    useDeleteShippingMethod()

  const {
    shippingMethods,
    meta,
    isLoading,
    isFetching,
    isError,
    errorMessage,
  } = useShippingMethods({
    page,
    limit,
    search: search.trim(),
    status: statusFilter,
  })

  const totalPages = Math.max(1, meta?.pageCount ?? 1)
  const totalCount = meta?.totalCount ?? shippingMethods.length

  usePageClamp({ meta, page, totalPages, updateUrl })

  const handleStatusFilterChange = (value: unknown) => {
    if (typeof value !== 'string') return
    updateUrl({
      status: value === SHIPPING_METHOD_STATUS_FILTER_ALL ? null : value,
      page: 1,
    })
  }

  const handleStatusChange = (
    method: ShippingMethod,
    nextStatus: ShippingMethodStatus,
  ) => {
    if (nextStatus === method.status) return
    setPendingStatusIds((current) => new Set(current).add(method.id))
    updateShippingMethodAsync({ id: method.id, body: { status: nextStatus } })
      .then(() => {
        toast.success(
          nextStatus === ShippingMethodStatus.ACTIVE
            ? SUCCESS_MESSAGES.SHIPPING_METHOD_ACTIVATED
            : SUCCESS_MESSAGES.SHIPPING_METHOD_DEACTIVATED,
        )
      })
      .catch((error: unknown) => {
        toast.error(getErrorMessage(error))
      })
      .finally(() => {
        setPendingStatusIds((current) => {
          const next = new Set(current)
          next.delete(method.id)
          return next
        })
      })
  }

  return (
    <div className="flex flex-col gap-6">
      <ConfirmActionDialog
        data-testid="modal-confirm-delete-shipping-method"
        item={pendingDelete}
        onClose={() => setPendingDelete(null)}
        mutate={deleteShippingMethod}
        isPending={isDeletePending}
        successMessage={SUCCESS_MESSAGES.SHIPPING_METHOD_DELETED}
        title={DIALOG_MESSAGES.SHIPPING_METHOD.DELETE.TITLE}
        renderDescription={(method) => (
          <p>
            This will remove <b>{method?.name}</b>.
          </p>
        )}
        textAction={DIALOG_MESSAGES.SHIPPING_METHOD.DELETE.ACTION}
      />

      <PageHeader
        breadcrumbItems={[
          { label: 'Dashboard', href: ROUTES.DASHBOARD },
          {
            label: 'Shipping methods',
            href: ROUTES.DASHBOARD_SHIPPING_METHODS,
          },
        ]}
        title="Manage Shipping Methods"
        description="Set the delivery options and fees shoppers can choose at checkout."
        actions={
          <Link
            href={ROUTES.DASHBOARD_SHIPPING_METHODS_ADD}
            className={cn(
              buttonVariants({ variant: 'default', size: 'default' }),
              'inline-flex gap-2 px-8',
            )}
          >
            <Truck className="size-4" aria-hidden />
            Add shipping method
          </Link>
        }
      />

      <section className="overflow-hidden rounded-3xl border border-outline-variant/40 bg-card">
        <div className="flex min-w-0 flex-col gap-3 border-b border-outline-variant/30 p-4 md:flex-row md:flex-wrap md:items-center md:gap-3 lg:justify-between">
          <SearchInput
            ref={searchInputRef}
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Filter by name or description..."
            aria-label="Filter shipping methods by name or description"
            containerClassName="h-12 bg-surface-container-high w-full md:w-auto md:min-w-0 md:max-w-md md:flex-1"
          />
          <div className="min-w-40">
            <Select
              classNameTrigger="rounded-full"
              selected={statusFilter ?? SHIPPING_METHOD_STATUS_FILTER_ALL}
              onValueChange={handleStatusFilterChange}
              options={[...SHIPPING_METHOD_STATUS_FILTER_OPTIONS]}
              placeholder="All statuses"
              ariaLabel="Status filter"
            />
          </div>
        </div>

        <ListBody
          isLoading={isLoading}
          isError={isError}
          errorMessage={errorMessage}
          isFetching={isFetching}
        >
          <Table
            columns={SHIPPING_METHODS_TABLE_COLUMNS}
            isStackedOnMobile
            data={shippingMethods}
            getRowKey={(row, index) => row.id ?? `shipping-method-${index}`}
            resolveRowClassName={(row) =>
              row.deletedAt
                ? 'border-b border-border bg-muted-foreground/20'
                : ''
            }
            renderRow={(row) => (
              <ShippingMethodTableRow
                shippingMethod={row}
                isStatusPending={pendingStatusIds.has(row.id)}
                onRequestStatusChange={handleStatusChange}
                onRequestDelete={setPendingDelete}
              />
            )}
            emptyMessage="No shipping methods match your filters."
          />
        </ListBody>

        <footer className="border-t border-outline-variant/30 px-6 py-4">
          <PaginationBar
            currentPage={page}
            totalPages={totalPages}
            onPageChange={(next) => updateUrl({ page: next })}
            showingCount={shippingMethods.length}
            totalCount={totalCount}
            entityLabel="shipping methods"
          />
        </footer>
      </section>
    </div>
  )
}
