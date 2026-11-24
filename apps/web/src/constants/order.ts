import type { TableColumn } from '@/components/Table'
import { OrderStatus, PaymentMethod, ShippingStatus } from '@repo/constants'

import type { OptionItem } from '@/types/common'
import { SHIPPING_STATUS } from '@/types/order'

export const OUT_OF_STOCK_LABEL = 'Out of stock'

export const CART_CHECKOUT_BLOCKED_MESSAGE =
  'Remove or update out-of-stock items before proceeding to checkout.'

export const CHECKOUT_PLACE_ORDER_BLOCKED_MESSAGE =
  'Remove out-of-stock items from your cart before placing your order.'

export const ALL_ORDER_STATUSES_VALUE = 'all'

export const ORDER_STATUS_FILTER_OPTIONS: OptionItem[] = [
  { value: ALL_ORDER_STATUSES_VALUE, label: 'All statuses' },
  { value: OrderStatus.PENDING, label: 'Pending' },
  { value: OrderStatus.CONFIRMED, label: 'Confirmed' },
  { value: OrderStatus.COMPLETED, label: 'Completed' },
  { value: OrderStatus.CANCELLED, label: 'Cancelled' },
]

export const ALL_SHIPPING_STATUS_VALUE = 'all'
export const SHIPPING_STATUS_OPTIONS: OptionItem[] = [
  { value: ALL_SHIPPING_STATUS_VALUE, label: 'All shipping statuses' },
  { value: ShippingStatus.PENDING, label: 'Pending' },
  { value: ShippingStatus.SHIPPING, label: 'Shipping' },
  { value: ShippingStatus.DELIVERED, label: 'Delivered' },
  { value: ShippingStatus.RETURNED, label: 'Returned' },
]

export const ORDER_TRANSITIONS: Readonly<
  Record<OrderStatus, readonly OrderStatus[]>
> = {
  [OrderStatus.PENDING]: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
  [OrderStatus.CONFIRMED]: [OrderStatus.COMPLETED, OrderStatus.CANCELLED],
  [OrderStatus.COMPLETED]: [],
  [OrderStatus.CANCELLED]: [],
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
    className: 'w-[18%] min-w-0 px-6 py-4',
  },
  {
    key: 'date',
    label: 'Date',
    className: 'w-[11%] min-w-0 px-6 py-4',
  },
  {
    key: 'customer',
    label: 'Customer',
    className: 'min-w-0 px-6 py-4',
  },
  {
    key: 'status',
    label: 'Status',
    className: 'w-[12%] min-w-[84px] text-center',
  },
  {
    key: 'shippingStatus',
    label: 'Shipping status',
    className: 'w-[12%] px-6 py-4 text-center',
  },
  {
    key: 'total',
    label: 'Total',
    className: 'w-[10%] text-center',
  },
  {
    key: 'actions',
    label: 'Actions',
    className: 'w-[10%] text-center',
  },
]

export const ORDERS_HISTORY_TABLE_COLUMNS: TableColumn[] = [
  {
    key: 'order',
    label: 'Order',
    className:
      'px-6 py-5 font-sans text-xs font-semibold uppercase tracking-wider text-on-surface-variant',
  },
  {
    key: 'date',
    label: 'Date',
    className:
      'px-6 py-5 font-sans text-xs font-semibold uppercase tracking-wider text-on-surface-variant',
  },
  {
    key: 'items',
    label: 'Items',
    className:
      'px-6 py-5 font-sans text-xs font-semibold uppercase tracking-wider text-on-surface-variant',
  },
  {
    key: 'status',
    label: 'Status',
    className:
      'px-6 py-5 font-sans text-xs font-semibold uppercase tracking-wider text-on-surface-variant',
  },
  {
    key: 'shipping',
    label: 'Shipping',
    className:
      'px-6 py-5 font-sans text-xs font-semibold uppercase tracking-wider text-on-surface-variant',
  },
  {
    key: 'payment',
    label: 'Payment',
    className:
      'px-6 py-5 font-sans text-xs font-semibold uppercase tracking-wider text-on-surface-variant',
  },
  {
    key: 'total',
    label: 'Total',
    className:
      'px-6 py-5 text-right font-sans text-xs font-semibold uppercase tracking-wider text-on-surface-variant',
  },
]

export const PAYMENT_METHOD_LABELS: Readonly<Record<PaymentMethod, string>> = {
  [PaymentMethod.COD]: 'Cash on delivery',
  [PaymentMethod.CARD]: 'Card (Stripe)',
  [PaymentMethod.PAYPAL]: 'PayPal',
}
