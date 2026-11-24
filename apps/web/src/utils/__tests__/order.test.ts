import { OrderPaymentStatus } from '@repo/constants'

import {
  formatOrderCustomerName,
  getPaymentStatusPresentation,
} from '@/utils/order'
import type { Order } from '@/types/order'

describe('getPaymentStatusPresentation', () => {
  it('labels every OrderPaymentStatus', () => {
    expect(
      Object.values(OrderPaymentStatus).map(
        (status) => getPaymentStatusPresentation(status).label,
      ),
    ).toEqual([
      'Unpaid',
      'Pending',
      'Paid',
      'Failed',
      'Partially refunded',
      'Refunded',
    ])
  })

  it('gives each status a badge class', () => {
    for (const status of Object.values(OrderPaymentStatus)) {
      expect(getPaymentStatusPresentation(status).badgeClassName).not.toBe('')
    }
  })
})

describe('formatOrderCustomerName', () => {
  it('returns a dash for a list row without addressSnapshot', () => {
    expect(formatOrderCustomerName({ id: 'order-1' } as Order)).toBe('—')
  })
})
