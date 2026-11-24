'use client'

import { useState } from 'react'
import { Download, Printer } from 'lucide-react'
import { toast } from 'sonner'

import ConfirmActionDialog from '@/components/ConfirmActionDialog'
import PageHeader from '@/components/PageHeader'
import Table from '@/components/Table'
import { PaginationBar } from '@/components/Pagination'
import { SearchInput } from '@/components/SearchInput'
import { Select } from '@/components/Select'
import StatsCards from '@/components/StatsCards'
import { Button } from '@/components/ui/button'
import { SUCCESS_MESSAGES } from '@/constants/messages'
import {
  ALL_ORDER_STATUSES_VALUE,
  // ALL_SHIPPING_STATUS_VALUE,
  ORDER_STATUS_FILTER_OPTIONS,
  ORDERS_TABLE_COLUMNS,
  // SHIPPING_STATUS_OPTIONS,
} from '@/constants/order'
import { ROUTES } from '@/constants/routes'
import {
  useDeleteOrder,
  useOrders,
  useUpdateOrderShippingStatus,
  useUpdateOrderStatus,
} from '@/hooks/useOrder'
import type { ORDER_STATUS, Order, SHIPPING_STATUS } from '@/types/order'
import { useUrlState } from '@/hooks/useUrlState'
import { useDebouncedUrlSearch } from '@/hooks/useDebouncedUrlSearch'
import { usePageClamp } from '@/hooks/usePageClamp'
import { OrderDetailModal } from '@/sections/OrderDetailModal'
import { OrderTableRow } from '@/sections/OrderTableRow'
import { buildOrderDashboardStats } from '@/utils/order'
import { ordersUrlSchema } from '@/utils/url'
import { getErrorMessage } from '@/utils/form'
import ListBody from '@/components/ListBody'

export default function OrdersPageContent() {
  const { state, update: updateUrl } = useUrlState(ordersUrlSchema)
  const { page, search, limit, status, shippingStatus } = state
  const { searchInput, setSearchInput, searchInputRef } = useDebouncedUrlSearch(
    search,
    updateUrl,
  )
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Order | null>(null)
  const [pendingStatusOrderId, setPendingStatusOrderId] = useState<
    string | null
  >(null)
  const [pendingShippingStatusOrderId, setPendingShippingStatusOrderId] =
    useState<string | null>(null)
  const { mutate: deleteOrderMutate, isPending: isDeletePending } =
    useDeleteOrder()
  const { mutate: updateOrderStatusMutate } = useUpdateOrderStatus()
  const { mutate: updateOrderShippingStatusMutate } =
    useUpdateOrderShippingStatus()

  const {
    orders,
    meta,
    isLoading,
    isFetching,
    isError,
    errorMessage,
    refetch,
  } = useOrders({
    page,
    limit,
    search: search.trim(),
    status: status ?? undefined,
    shippingStatus: shippingStatus ?? undefined,
  })

  const totalPages = Math.max(1, meta?.pageCount ?? 1)
  const totalCount = meta?.totalCount ?? orders.length
  const showingCount = orders.length

  usePageClamp({ meta, page, totalPages, updateUrl })

  const handleStatusChange = (value: unknown) => {
    if (typeof value !== 'string') return
    updateUrl({
      status: value === ALL_ORDER_STATUSES_VALUE ? null : value,
      page: 1,
    })
  }

  // const handleShippingStatusChange = (value: unknown) => {
  //   if (typeof value !== 'string') return
  //   updateUrl({
  //     shippingStatus: value === ALL_SHIPPING_STATUS_VALUE ? null : value,
  //     page: 1,
  //   })
  // }

  const handleQueryChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchInput(event.target.value)
  }

  const handleOrderStatusUpdate = (order: Order, nextStatus: ORDER_STATUS) => {
    const orderId = order.id
    setPendingStatusOrderId(orderId)
    updateOrderStatusMutate(
      { id: orderId, status: nextStatus },
      {
        onSuccess: () => {
          toast.success(SUCCESS_MESSAGES.ORDER_STATUS_UPDATED)
        },
        onError: (error) => {
          toast.error(getErrorMessage(error))
        },
        onSettled: () => {
          setPendingStatusOrderId((current) =>
            current === orderId ? null : current,
          )
        },
      },
    )
  }

  const handleOrderShippingStatusUpdate = (
    order: Order,
    nextShippingStatus: SHIPPING_STATUS,
  ) => {
    const orderId = order.id
    setPendingShippingStatusOrderId(orderId)
    updateOrderShippingStatusMutate(
      { id: orderId, shippingStatus: nextShippingStatus },
      {
        onSuccess: () => {
          toast.success(SUCCESS_MESSAGES.ORDER_SHIPPING_STATUS_UPDATED)
        },
        onError: (error) => {
          toast.error(getErrorMessage(error))
        },
        onSettled: () => {
          setPendingShippingStatusOrderId((current) =>
            current === orderId ? null : current,
          )
        },
      },
    )
  }

  const statsItems = buildOrderDashboardStats(orders, meta)
  const pendingOrderNumber = pendingDelete?.orderNumber?.trim()
  const pendingOrderLabelRaw =
    pendingOrderNumber && pendingOrderNumber.length > 0
      ? pendingOrderNumber
      : (pendingDelete?.id ?? '')
  const pendingOrderLabel = pendingOrderLabelRaw
    ? pendingOrderLabelRaw.startsWith('#')
      ? pendingOrderLabelRaw
      : `#${pendingOrderLabelRaw}`
    : '#unknown'

  return (
    <div className="flex flex-col gap-6">
      <OrderDetailModal
        order={selectedOrder}
        open={selectedOrder !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedOrder(null)
          }
        }}
      />

      <ConfirmActionDialog
        data-testid="modal-confirm-delete-order"
        item={pendingDelete}
        onClose={() => setPendingDelete(null)}
        mutate={deleteOrderMutate}
        isPending={isDeletePending}
        successMessage={SUCCESS_MESSAGES.ORDER_DELETED}
        title="Delete order?"
        renderDescription={() => (
          <p>
            Are you sure you want to delete <b>{pendingOrderLabel}</b>?. This
            action cannot be undone.
          </p>
        )}
        textAction="Delete"
      />

      <PageHeader
        breadcrumbItems={[
          { label: 'Dashboard', href: ROUTES.DASHBOARD },
          { label: 'Orders', href: ROUTES.DASHBOARD_ORDERS },
        ]}
        title="Orders"
        description="Track fulfillment, payments, and customer deliveries."
      />

      <StatsCards items={statsItems} />

      <section className="overflow-hidden rounded-3xl border border-outline-variant/40 bg-card">
        <div className="flex min-w-0 flex-col gap-3 border-b border-outline-variant/30 p-4 md:flex-row md:flex-wrap md:items-center md:gap-3 lg:justify-between">
          <SearchInput
            ref={searchInputRef}
            value={searchInput}
            onChange={handleQueryChange}
            placeholder="Search orders..."
            aria-label="Search orders"
            containerClassName="h-12 bg-surface-container-high w-full md:w-auto md:min-w-0 md:max-w-sm md:flex-1"
          />
          <div className="flex min-w-0 flex-wrap items-center justify-end gap-3">
            <div className="flex w-full min-w-0 gap-4 md:w-72 md:max-w-80 md:shrink-0">
              <Select
                classNameTrigger="h-12 rounded-full"
                placeholder="All statuses"
                options={ORDER_STATUS_FILTER_OPTIONS}
                selected={status ?? ALL_ORDER_STATUSES_VALUE}
                onValueChange={handleStatusChange}
              />
            </div>
            {/* <div className="w-full flex gap-4 md:w-60 md:max-w-60">
              <Select
                classNameTrigger="h-12 rounded-full"
                placeholder="All shipping statuses"
                options={SHIPPING_STATUS_OPTIONS}
                selected={shippingStatus ?? ALL_SHIPPING_STATUS_VALUE}
                onValueChange={handleShippingStatusChange}
              />
            </div> */}
            <Button
              disabled
              variant="outline"
              size="icon"
              aria-label="Export orders"
              className="size-11"
            >
              <Download className="size-4" aria-hidden />
            </Button>
            <Button
              disabled
              variant="outline"
              size="icon"
              aria-label="Print orders"
              className="size-11"
            >
              <Printer className="size-4" aria-hidden />
            </Button>
          </div>
        </div>

        <ListBody
          isLoading={isLoading}
          isError={isError}
          errorMessage={errorMessage}
          isFetching={isFetching}
          onRetry={() => void refetch()}
        >
          <Table
            columns={ORDERS_TABLE_COLUMNS}
            data={orders}
            getRowKey={(order, index) => order.id ?? `order-${index}`}
            resolveRowClassName={(order) =>
              order.deletedAt
                ? 'border-b border-border bg-muted-foreground/20'
                : ''
            }
            renderRow={(order) => (
              <OrderTableRow
                order={order}
                isDeleteDisabled={isDeletePending || Boolean(order.deletedAt)}
                isStatusDisabled={
                  pendingStatusOrderId === order.id || Boolean(order.deletedAt)
                }
                isShippingStatusDisabled={
                  pendingShippingStatusOrderId === order.id
                }
                onRequestDelete={(nextOrder) => {
                  setPendingDelete(nextOrder)
                }}
                onRequestView={(nextOrder) => {
                  setSelectedOrder(nextOrder)
                }}
                onRequestStatusChange={handleOrderStatusUpdate}
                onRequestShippingStatusChange={handleOrderShippingStatusUpdate}
              />
            )}
            emptyMessage="No orders found."
          />
        </ListBody>

        <footer className="border-t border-outline-variant/30 px-6 py-4">
          <PaginationBar
            currentPage={Math.min(page, totalPages)}
            totalPages={totalPages}
            onPageChange={(next) => updateUrl({ page: next })}
            showingCount={showingCount}
            totalCount={totalCount}
            entityLabel="orders"
          />
        </footer>
      </section>
    </div>
  )
}
