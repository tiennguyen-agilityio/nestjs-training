import { ShippingMethodStatus } from '@repo/constants'

import type { TableColumn } from '@/components/Table'

export const SHIPPING_METHODS_TABLE_COLUMNS: TableColumn[] = [
  {
    key: 'name',
    label: 'Name',
    className: 'w-auto min-w-0 px-6 py-4',
  },
  {
    key: 'description',
    label: 'Description',
    className: 'w-[28%] px-6 py-4',
  },
  {
    key: 'fee',
    label: 'Fee',
    className: 'w-[12%] px-6 py-4 text-center',
  },
  {
    key: 'status',
    label: 'Status',
    className: 'w-[14%] px-6 py-4 text-center',
  },
  {
    key: 'actions',
    label: 'Actions',
    className: 'w-32 px-6 py-4 text-center',
  },
]

export const SHIPPING_METHOD_STATUS_FILTER_ALL = 'all-status'

export const SHIPPING_METHOD_STATUS_FILTER_OPTIONS: readonly {
  value: string
  label: string
}[] = [
  { value: SHIPPING_METHOD_STATUS_FILTER_ALL, label: 'All statuses' },
  { value: ShippingMethodStatus.ACTIVE, label: 'Active' },
  { value: ShippingMethodStatus.INACTIVE, label: 'Inactive' },
]

export const SHIPPING_METHOD_STATUS_OPTIONS: readonly {
  value: ShippingMethodStatus
  label: string
}[] = [
  { value: ShippingMethodStatus.ACTIVE, label: 'Active' },
  { value: ShippingMethodStatus.INACTIVE, label: 'Inactive' },
]
