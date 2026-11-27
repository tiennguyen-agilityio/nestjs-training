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
import { Button } from '@/components/ui/button'
import { SUCCESS_MESSAGES } from '@/constants/messages'
import {
  ALL_ORDER_STATUSES_VALUE,
  ALL_PAYMENT_STATUS_VALUE,
  ALL_SHIPPING_STATUS_VALUE,
  ORDER_STATUS_FILTER_OPTIONS,
  ORDERS_TABLE_COLUMNS,
  PAYMENT_STATUS_FILTER_OPTIONS,
  SHIPPING_STATUS_OPTIONS,
} from '@/constants/order'
import { ROUTES } from '@/constants/routes'
import {
  useDeleteOrder,
  useOrders,
  useUpdateOrderShippingStatus,
  useUpdateOrderStatus,
} from '@/hooks/useOrder'
import {
  OrderPaymentStatus,
  OrderStatus,
  ShippingStatus,
} from '@repo/constants'
import type { OrderSummary } from '@/types/order'
import { useUrlState } from '@/hooks/useUrlState'
import { useDebouncedUrlSearch } from '@/hooks/useDebouncedUrlSearch'
import { usePageClamp } from '@/hooks/usePageClamp'
import { OrderTableRow } from '@/sections/OrderTableRow'
import { ordersUrlSchema } from '@/utils/url'
import { getErrorMessage } from '@/utils/form'
import ListBody from '@/components/ListBody'

export default function OrdersPageContent() {
  const { state, update: updateUrl } = useUrlState(ordersUrlSchema)
  const { page, search, limit, status, shippingStatus, paymentStatus } = state
  const { searchInput, setSearchInput, searchInputRef } = useDebouncedUrlSearch(
    search,
    updateUrl,
  )
  const [pendingDelete, setPendingDelete] = useState<OrderSummary | null>(null)
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

  // A URL value that is not an option shows every order instead of an API 400.
  const normalizedStatus = Object.values(OrderStatus).find(
    (value) => value === status,
  )
  const normalizedShippingStatus = Object.values(ShippingStatus).find(
    (value) => value === shippingStatus,
  )
  const normalizedPaymentStatus = Object.values(OrderPaymentStatus).find(
    (value) => value === paymentStatus,
  )

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
    status: normalizedStatus,
    shippingStatus: normalizedShippingStatus,
    paymentStatus: normalizedPaymentStatus,
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

  const handleShippingStatusChange = (value: unknown) => {
    if (typeof value !== 'string') return
    updateUrl({
      shippingStatus: value === ALL_SHIPPING_STATUS_VALUE ? null : value,
      page: 1,
    })
  }

  const handlePaymentStatusChange = (value: unknown) => {
    if (typeof value !== 'string') return
    updateUrl({
      paymentStatus: value === ALL_PAYMENT_STATUS_VALUE ? null : value,
      page: 1,
    })
  }

  const handleQueryChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchInput(event.target.value)
  }

  // Status changes come with #32: the row keeps these controls disabled.
  const handleOrderStatusUpdate = (
    order: OrderSummary,
    nextStatus: OrderStatus,
  ) => {
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
    order: OrderSummary,
    nextShippingStatus: ShippingStatus,
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

      <section className="overflow-hidden rounded-3xl border border-outline-variant/40 bg-card">
        <div className="flex min-w-0 flex-col gap-3 border-b border-outline-variant/30 p-4 md:flex-row md:flex-wrap md:items-center md:gap-3 lg:justify-between">
          <SearchInput
            ref={searchInputRef}
            value={searchInput}
            onChange={handleQueryChange}
            placeholder="Search by order number, customer or email"
            aria-label="Search orders"
            containerClassName="h-12 bg-surface-container-high w-full md:w-auto md:min-w-0 md:max-w-sm md:flex-1"
          />
          <div className="flex min-w-0 flex-wrap items-center justify-end gap-3">
            <div className="flex w-full min-w-0 gap-4 md:w-72 md:max-w-80 md:shrink-0">
              <Select
                variant="filter"
                placeholder="All statuses"
                ariaLabel="Status filter"
                options={ORDER_STATUS_FILTER_OPTIONS}
                selected={normalizedStatus ?? ALL_ORDER_STATUSES_VALUE}
                onValueChange={handleStatusChange}
              />
            </div>
            <div className="flex w-full min-w-0 gap-4 md:w-60 md:max-w-60 md:shrink-0">
              <Select
                variant="filter"
                placeholder="All shipping statuses"
                ariaLabel="Shipping status filter"
                options={SHIPPING_STATUS_OPTIONS}
                selected={normalizedShippingStatus ?? ALL_SHIPPING_STATUS_VALUE}
                onValueChange={handleShippingStatusChange}
              />
            </div>
            <div className="flex w-full min-w-0 gap-4 md:w-60 md:max-w-60 md:shrink-0">
              <Select
                variant="filter"
                placeholder="All payment statuses"
                ariaLabel="Payment status filter"
                options={PAYMENT_STATUS_FILTER_OPTIONS}
                selected={normalizedPaymentStatus ?? ALL_PAYMENT_STATUS_VALUE}
                onValueChange={handlePaymentStatusChange}
              />
            </div>
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
            renderRow={(order) => (
              <OrderTableRow
                order={order}
                isDeleteDisabled={isDeletePending}
                isStatusDisabled={pendingStatusOrderId === order.id}
                isShippingStatusDisabled={
                  pendingShippingStatusOrderId === order.id
                }
                onRequestDelete={(nextOrder) => {
                  setPendingDelete(nextOrder)
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
