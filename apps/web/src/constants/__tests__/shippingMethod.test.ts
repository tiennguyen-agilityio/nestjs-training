import { ShippingMethodStatus } from '@repo/constants'

import {
  SHIPPING_METHOD_STATUS_FILTER_ALL,
  SHIPPING_METHOD_STATUS_FILTER_OPTIONS,
  SHIPPING_METHODS_TABLE_COLUMNS,
} from '@/constants/shippingMethod'
import { FORM_MESSAGES } from '@/constants/messages'
import { shippingMethodUrlSchema } from '@/utils/url'

describe('shipping method constants', () => {
  it('offers All, Active and Inactive filters, the ERD statuses', () => {
    expect(SHIPPING_METHOD_STATUS_FILTER_ALL).toBe('all-status')
    expect(SHIPPING_METHOD_STATUS_FILTER_OPTIONS.map((o) => o.value)).toEqual([
      'all-status',
      ShippingMethodStatus.ACTIVE,
      ShippingMethodStatus.INACTIVE,
    ])
    expect(SHIPPING_METHOD_STATUS_FILTER_OPTIONS.map((o) => o.label)).toEqual([
      'All statuses',
      'Active',
      'Inactive',
    ])
  })

  it('has the Name, Description, Fee, Status and Actions columns', () => {
    expect(SHIPPING_METHODS_TABLE_COLUMNS.map((c) => c.label)).toEqual([
      'Name',
      'Description',
      'Fee',
      'Status',
      'Actions',
    ])
  })

  it('reads the status filter from the URL', () => {
    expect(shippingMethodUrlSchema.status('INACTIVE')).toBe('INACTIVE')
    expect(shippingMethodUrlSchema.status('  ')).toBeNull()
    expect(shippingMethodUrlSchema.status(null)).toBeNull()
  })

  it('words the decimal places message', () => {
    expect(FORM_MESSAGES.maxDecimals('Fee', 2)).toBe(
      'Fee must have at most 2 decimal places',
    )
  })
})
