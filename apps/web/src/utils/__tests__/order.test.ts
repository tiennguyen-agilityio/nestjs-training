import { OrderPaymentStatus, PaymentMethod } from '@repo/constants'

import { ERROR_MESSAGES } from '@/constants/messages'
import type { ErrorDetail } from '@/types/api'
import { PAYMENT_METHOD, type CheckoutFormValues } from '@/types/checkout'
import {
  buildPlaceOrderPayload,
  isPlacedOrder,
  mapItemFieldErrorsToLineIdMessages,
  tagItemErrorsWithLineRefs,
} from '@/utils/order'
import {
  formatOrderCustomerName,
  formatOrderDateTime,
  getPaymentStatusPresentation,
} from '@/utils/order'
import type { Order } from '@/types/order'

const values = (
  overrides: Partial<CheckoutFormValues> = {},
): CheckoutFormValues => ({
  firstName: ' Ada ',
  lastName: 'Lovelace',
  phoneNumber: '0912345678',
  addressLine: '1 Analytical St',
  city: 'London',
  district: 'Marylebone',
  ward: 'Ward 1',
  postalCode: 'NW1',
  paymentMethod: PAYMENT_METHOD.STRIPE,
  cardNumber: '',
  expiryDate: '',
  cvc: '',
  ...overrides,
})

const lines = [
  { id: 'line-a', productId: 'p-a' },
  { id: 'line-b', productId: 'p-b' },
]

const lineError = (
  index: number,
  overrides: Partial<ErrorDetail> = {},
): ErrorDetail => ({
  errCode: 'outOfStock',
  field: `items.${index}.productVariantId`,
  message: 'Only 1 left for COL-HUI-250G',
  description: 'Update your cart and try again.',
  ...overrides,
})

describe('buildPlaceOrderPayload', () => {
  it('maps the form to the API body', () => {
    expect(buildPlaceOrderPayload(values(), 'method-1')).toEqual({
      shippingMethodId: 'method-1',
      paymentMethod: PaymentMethod.CARD,
      recipientName: 'Ada Lovelace',
      recipientPhone: '0912345678',
      addressLine: '1 Analytical St',
      ward: 'Ward 1',
      district: 'Marylebone',
      city: 'London',
      postalCode: 'NW1',
    })
  })

  it('passes PayPal and Cash on Delivery through', () => {
    expect(
      buildPlaceOrderPayload(
        values({ paymentMethod: PAYMENT_METHOD.PAYPAL }),
        'm',
      ).paymentMethod,
    ).toBe(PaymentMethod.PAYPAL)
    expect(
      buildPlaceOrderPayload(values({ paymentMethod: PAYMENT_METHOD.COD }), 'm')
        .paymentMethod,
    ).toBe(PaymentMethod.COD)
  })

  it('sends no items', () => {
    expect(buildPlaceOrderPayload(values(), 'm')).not.toHaveProperty('items')
  })
})

describe('line errors', () => {
  it('matches items.<i> fields and shows description', () => {
    const tagged = tagItemErrorsWithLineRefs([lineError(1)], lines)
    expect(mapItemFieldErrorsToLineIdMessages(tagged, lines)).toEqual({
      'line-b': 'Update your cart and try again.',
    })
  })

  it('still matches items[<i>]', () => {
    const tagged = tagItemErrorsWithLineRefs(
      [lineError(0, { field: 'items[0].quantity' })],
      lines,
    )
    expect(mapItemFieldErrorsToLineIdMessages(tagged, lines)).toEqual({
      'line-a': 'Update your cart and try again.',
    })
  })

  it('never shows the developer message', () => {
    const tagged = tagItemErrorsWithLineRefs(
      [lineError(0, { description: undefined })],
      lines,
    )
    expect(mapItemFieldErrorsToLineIdMessages(tagged, lines)).toEqual({
      'line-a': ERROR_MESSAGES.ORDER_LINE_ERROR,
    })
  })

  it('maps several line errors to their lines', () => {
    const tagged = tagItemErrorsWithLineRefs(
      [
        lineError(0),
        lineError(1, {
          errCode: 'itemUnavailable',
          description: 'Remove it from the cart and try again.',
        }),
      ],
      lines,
    )
    expect(mapItemFieldErrorsToLineIdMessages(tagged, lines)).toEqual({
      'line-a': 'Update your cart and try again.',
      'line-b': 'Remove it from the cart and try again.',
    })
  })

  it('ignores a line index outside the shown lines', () => {
    const tagged = tagItemErrorsWithLineRefs([lineError(5)], lines)
    expect(mapItemFieldErrorsToLineIdMessages(tagged, lines)).toEqual({})
  })
})

describe('isPlacedOrder', () => {
  it('accepts the API order shape', () => {
    expect(
      isPlacedOrder({
        orderNumber: 'NB-000123',
        recipientName: 'Ada Lovelace',
        items: [{ id: 'item-1', lineTotal: 24 }],
      }),
    ).toBe(true)
  })

  it('rejects the old browser snapshot and empty values', () => {
    expect(
      isPlacedOrder({
        orderNumber: '#NB-216979',
        addressSnapshot: {},
        items: [{ id: 'line-1', subTotal: 24 }],
      }),
    ).toBe(false)
    expect(isPlacedOrder(null)).toBe(false)
    expect(isPlacedOrder('order')).toBe(false)
  })
})

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
