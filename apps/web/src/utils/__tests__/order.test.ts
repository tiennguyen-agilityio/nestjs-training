import { OrderPaymentStatus } from '@repo/constants'

import {
  formatOrderCustomerName,
  formatOrderDateTime,
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

describe('formatOrderDateTime', () => {
  it('formats day, month and time', () => {
    const iso = '2026-11-17T09:05:00.000Z'
    const d = new Date(iso)
    const pad = (n: number) => String(n).padStart(2, '0')
    const month = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ][d.getMonth()]

    expect(formatOrderDateTime(iso)).toBe(
      `${pad(d.getDate())} ${month}, ${pad(d.getHours())}:${pad(d.getMinutes())}`,
    )
    expect(formatOrderDateTime('not a date')).toBe('—')
  })
})
