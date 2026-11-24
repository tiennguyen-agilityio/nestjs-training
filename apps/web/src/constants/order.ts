import type { TableColumn } from '@/components/Table'
import { ORDER_STATUS, SHIPPING_STATUS } from '@/types/order'

export const OUT_OF_STOCK_LABEL = 'Out of stock'

export const CART_CHECKOUT_BLOCKED_MESSAGE =
  'Remove or update out-of-stock items before proceeding to checkout.'

export const CHECKOUT_PLACE_ORDER_BLOCKED_MESSAGE =
  'Remove out-of-stock items from your cart before placing your order.'

export const ALL_ORDER_STATUSES_VALUE = 'all'

export const ORDER_STATUS_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: ALL_ORDER_STATUSES_VALUE, label: 'All statuses' },
  { value: ORDER_STATUS.PENDING, label: 'Pending' },
  { value: ORDER_STATUS.CONFIRMED, label: 'Confirmed' },
  { value: ORDER_STATUS.COMPLETED, label: 'Completed' },
  { value: ORDER_STATUS.CANCELLED, label: 'Cancelled' },
]

export const ALL_SHIPPING_STATUS_VALUE = 'all'
export const SHIPPING_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: ALL_SHIPPING_STATUS_VALUE, label: 'All shipping statuses' },
  { value: SHIPPING_STATUS.PENDING, label: 'Pending' },
  { value: SHIPPING_STATUS.SHIPPING, label: 'Shipping' },
  { value: SHIPPING_STATUS.DELIVERED, label: 'Delivered' },
  { value: SHIPPING_STATUS.RETURNED, label: 'Returned' },
]

export const ORDER_TRANSITIONS: Readonly<
  Record<ORDER_STATUS, readonly ORDER_STATUS[]>
> = {
  [ORDER_STATUS.PENDING]: [ORDER_STATUS.CONFIRMED, ORDER_STATUS.CANCELLED],
  [ORDER_STATUS.CONFIRMED]: [ORDER_STATUS.COMPLETED, ORDER_STATUS.CANCELLED],
  [ORDER_STATUS.COMPLETED]: [],
  [ORDER_STATUS.CANCELLED]: [],
}

export const SHIPPING_TRANSITIONS: Readonly<
  Record<SHIPPING_STATUS, readonly SHIPPING_STATUS[]>
> = {
  [SHIPPING_STATUS.PENDING]: [SHIPPING_STATUS.SHIPPING],
  [SHIPPING_STATUS.SHIPPING]: [
    SHIPPING_STATUS.DELIVERED,
    SHIPPING_STATUS.RETURNED,
  ],
  [SHIPPING_STATUS.DELIVERED]: [],
  [SHIPPING_STATUS.RETURNED]: [],
}

export const ORDERS_TABLE_COLUMNS: TableColumn[] = [
  {
    key: 'orderId',
    label: 'Order ID',
    className: 'w-[23%] min-w-0 px-6 py-4',
  },
  {
    key: 'date',
    label: 'Date',
    className: 'w-[14%] min-w-0 px-6 py-4',
  },
  {
    key: 'customer',
    label: 'Customer',
    className: 'min-w-0 px-6 py-4',
  },
  {
    key: 'status',
    label: 'Status',
    className: 'w-[16%] min-w-[84px] text-center',
  },
  // {
  //   key: 'shippingStatus',
  //   label: 'Shipping status',
  //   className: 'w-[12%] px-6 py-4 text-center',
  // },
  {
    key: 'total',
    label: 'Total',
    className: 'w-[12%] text-center',
  },
  {
    key: 'actions',
    label: 'Actions',
    className: 'w-[12%] text-center',
  },
]

export const ORDERS_HISTORY_TABLE_COLUMNS: TableColumn[] = [
  {
    key: 'orderId',
    label: 'Order ID',
    className:
      'px-8 py-6 font-sans text-xs font-semibold uppercase tracking-wider text-on-surface-variant',
  },
  {
    key: 'date',
    label: 'Date',
    className:
      'px-8 py-6 font-sans text-xs font-semibold uppercase tracking-wider text-on-surface-variant',
  },
  {
    key: 'status',
    label: 'Status',
    className:
      'px-8 py-6 font-sans text-xs font-semibold uppercase tracking-wider text-on-surface-variant',
  },
  {
    key: 'total',
    label: 'Total',
    className:
      'px-8 py-6 font-sans text-xs font-semibold uppercase tracking-wider text-on-surface-variant',
  },
  {
    key: 'action',
    label: 'Action',
    className:
      'px-8 py-6 text-right font-sans text-xs font-semibold uppercase tracking-wider text-on-surface-variant',
  },
]
