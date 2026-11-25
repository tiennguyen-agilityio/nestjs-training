import {
  OrderPaymentStatus,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  PaymentType,
} from '@repo/constants'

import { API_FALLBACK_ERRORS, ERROR_MESSAGES } from '@/constants/messages'
import type { ErrorDetail } from '@/types/api'
import { PAYMENT_METHOD, type CheckoutFormValues } from '@/types/checkout'
import {
  buildPlaceOrderPayload,
  isPlacedOrder,
  mapItemFieldErrorsToLineIdMessages,
  tagItemErrorsWithLineRefs,
} from '@/utils/order'
import {
  buildOrderDashboardStats,
  canRetryPayment,
  formatOrderCustomerName,
  formatOrderDateTime,
  getCancelOrderErrorMessage,
  chargeMethodOf,
  getOrderSuccessHeadingKind,
  getOrderSuccessPaymentView,
  getPayByCountdown,
  getPaymentStatusPresentation,
  PAYMENT_ERR_CODES,
  paymentErrorMessage,
} from '@/utils/order'
import type { OrderDetail, OrderSummary, PlacedOrder } from '@/types/order'
import { ShippingStatus } from '@repo/constants'
import { ServiceError } from '@/utils/query'
import { placedOrderToCartItems, placedOrderTotals } from '@/utils/order'

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

const summaryOf = (overrides: Partial<OrderSummary> = {}): OrderSummary =>
  ({
    id: 'order-1',
    orderNumber: 'CH-1',
    customer: { firstName: 'Lan', lastName: 'Nguyen', email: 'lan@x.com' },
    status: OrderStatus.PENDING,
    shippingStatus: ShippingStatus.PENDING,
    totalAmount: 10,
    ...overrides,
  }) as OrderSummary

describe('formatOrderCustomerName', () => {
  it('formatOrderCustomerName uses the customer', () => {
    expect(formatOrderCustomerName(summaryOf())).toBe('Lan Nguyen')
    expect(
      formatOrderCustomerName(
        summaryOf({ customer: { firstName: ' ', lastName: '', email: 'a' } }),
      ),
    ).toBe('—')
  })
})

describe('buildOrderDashboardStats', () => {
  it('buildOrderDashboardStats counts OrderSummary rows', () => {
    const stats = buildOrderDashboardStats(
      [
        summaryOf({ totalAmount: 10 }),
        summaryOf({
          status: OrderStatus.CONFIRMED,
          shippingStatus: ShippingStatus.SHIPPING,
          totalAmount: 5.5,
        }),
      ],
      { limit: 10, currentPage: 1, pageCount: 1, totalCount: 2 },
    )

    expect(stats.map(({ id, value }) => [id, value])).toEqual([
      ['total-orders', 2],
      ['processing', 1],
      ['shipped', 1],
      ['revenue', expect.stringContaining('15.50')],
    ])
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

const charge = (method: PaymentMethod, status: PaymentStatus) => ({
  id: 'pay-1',
  orderId: 'o-1',
  type: PaymentType.CHARGE,
  method,
  status,
  amount: 20,
  currency: 'usd',
  transactionId: null,
  completedAt: null,
  failureReason: null,
  createdAt: '2026-11-24T00:00:00.000Z',
  updatedAt: '2026-11-24T00:00:00.000Z',
})

const orderOf = (
  paymentStatus: OrderPaymentStatus,
  overrides: Partial<OrderDetail> = {},
): OrderDetail =>
  ({
    id: 'o-1',
    orderNumber: 'NB-000123',
    status: OrderStatus.PENDING,
    paymentStatus,
    payments: [charge(PaymentMethod.CARD, PaymentStatus.PENDING)],
    ...overrides,
  }) as OrderDetail

const viewOf = (
  order: OrderDetail,
  input: Partial<{
    hasSessionId: boolean
    paymentError: string | null
    isPollExhausted: boolean
  }> = {},
) =>
  getOrderSuccessPaymentView({
    order,
    hasSessionId: false,
    paymentError: null,
    isPollExhausted: false,
    ...input,
  })

describe('paymentErrorMessage', () => {
  it('paymentErrorMessage maps each PAYMENT_ERR_CODES value', () => {
    expect(paymentErrorMessage(PAYMENT_ERR_CODES.ORDER_EXPIRED)).toBe(
      ERROR_MESSAGES.PAYMENT_ORDER_EXPIRED,
    )
    expect(paymentErrorMessage(PAYMENT_ERR_CODES.NOT_PAYABLE)).toBe(
      ERROR_MESSAGES.PAYMENT_NOT_PAYABLE,
    )
    expect(paymentErrorMessage(PAYMENT_ERR_CODES.GATEWAY_UNAVAILABLE)).toBe(
      ERROR_MESSAGES.PAYMENT_GATEWAY_UNAVAILABLE,
    )
    expect(paymentErrorMessage(PAYMENT_ERR_CODES.GATEWAY_REJECTED)).toBe(
      ERROR_MESSAGES.PAYMENT_GATEWAY_REJECTED,
    )
    expect(paymentErrorMessage(PAYMENT_ERR_CODES.METHOD_UNAVAILABLE)).toBe(
      ERROR_MESSAGES.PAYMENT_METHOD_UNAVAILABLE,
    )
  })

  it('an unknown code gives the given fallback', () => {
    expect(
      paymentErrorMessage('nope', API_FALLBACK_ERRORS.PAYMENT_CAPTURE),
    ).toBe(API_FALLBACK_ERRORS.PAYMENT_CAPTURE)
  })

  it('an unknown code gives the generic message', () => {
    for (const code of ['<b>hi</b>', '', null, undefined]) {
      expect(paymentErrorMessage(code)).toBe(API_FALLBACK_ERRORS.PAYMENT_START)
    }
  })
})

describe('getOrderSuccessPaymentView', () => {
  it('PAID is paid', () => {
    for (const hasSessionId of [true, false]) {
      expect(
        viewOf(orderOf(OrderPaymentStatus.PAID), { hasSessionId }),
      ).toEqual({
        kind: 'paid',
        badgeStatus: OrderPaymentStatus.PAID,
        canPayNow: false,
        errorMessage: null,
        chargeMethod: PaymentMethod.CARD,
        showRetry: false,
      })
    }
  })

  it('a PAID order ignores paymentError', () => {
    expect(
      viewOf(orderOf(OrderPaymentStatus.PAID), {
        paymentError: PAYMENT_ERR_CODES.GATEWAY_UNAVAILABLE,
      }).errorMessage,
    ).toBeNull()
  })

  it('PENDING or FAILED with a session is confirming', () => {
    for (const status of [
      OrderPaymentStatus.PENDING,
      OrderPaymentStatus.FAILED,
    ]) {
      expect(viewOf(orderOf(status), { hasSessionId: true })).toEqual(
        expect.objectContaining({
          kind: 'confirming',
          badgeStatus: OrderPaymentStatus.PENDING,
          canPayNow: false,
        }),
      )
    }
  })

  it('PENDING with a session after the last poll is stillConfirming without Pay now', () => {
    expect(
      viewOf(orderOf(OrderPaymentStatus.PENDING), {
        hasSessionId: true,
        isPollExhausted: true,
      }),
    ).toEqual(
      expect.objectContaining({
        kind: 'stillConfirming',
        badgeStatus: OrderPaymentStatus.PENDING,
        canPayNow: false,
      }),
    )
  })

  it('FAILED with a session after the last poll is failed with Pay now', () => {
    expect(
      viewOf(orderOf(OrderPaymentStatus.FAILED), {
        hasSessionId: true,
        isPollExhausted: true,
      }),
    ).toEqual(
      expect.objectContaining({
        kind: 'failed',
        badgeStatus: OrderPaymentStatus.FAILED,
        canPayNow: true,
      }),
    )
  })

  it('PENDING or UNPAID without a session is not completed with Pay now', () => {
    for (const status of [
      OrderPaymentStatus.PENDING,
      OrderPaymentStatus.UNPAID,
    ]) {
      expect(viewOf(orderOf(status))).toEqual({
        kind: 'notCompleted',
        badgeStatus: status,
        canPayNow: true,
        errorMessage: null,
        chargeMethod: PaymentMethod.CARD,
        showRetry: true,
      })
    }
  })

  it('unpaid with a paymentError shows its reason and Pay now', () => {
    expect(
      viewOf(orderOf(OrderPaymentStatus.UNPAID), {
        paymentError: PAYMENT_ERR_CODES.GATEWAY_UNAVAILABLE,
      }),
    ).toEqual({
      kind: 'notCompleted',
      badgeStatus: OrderPaymentStatus.UNPAID,
      canPayNow: true,
      errorMessage: ERROR_MESSAGES.PAYMENT_GATEWAY_UNAVAILABLE,
      chargeMethod: PaymentMethod.CARD,
      showRetry: true,
    })
  })

  it('FAILED without a session is failed with Pay now', () => {
    expect(viewOf(orderOf(OrderPaymentStatus.FAILED))).toEqual(
      expect.objectContaining({
        kind: 'failed',
        badgeStatus: OrderPaymentStatus.FAILED,
        canPayNow: true,
      }),
    )
  })

  it('a non-CARD order never offers Pay now', () => {
    for (const method of [PaymentMethod.COD, PaymentMethod.PAYPAL]) {
      const order = orderOf(OrderPaymentStatus.UNPAID, {
        payments: [charge(method, PaymentStatus.PENDING)],
      })
      expect(viewOf(order).canPayNow).toBe(false)
    }
  })

  it('an order no longer PENDING never offers Pay now', () => {
    const order = orderOf(OrderPaymentStatus.FAILED, {
      status: OrderStatus.CONFIRMED,
    })
    expect(viewOf(order).canPayNow).toBe(false)
  })

  it('a refund status is badgeOnly', () => {
    expect(viewOf(orderOf(OrderPaymentStatus.REFUNDED))).toEqual(
      expect.objectContaining({ kind: 'badgeOnly', canPayNow: false }),
    )
  })
})

describe('getOrderSuccessPaymentView showRetry', () => {
  it('an unpaid PENDING CARD or PAYPAL order offers a retry', () => {
    for (const method of [PaymentMethod.CARD, PaymentMethod.PAYPAL]) {
      const order = orderOf(OrderPaymentStatus.UNPAID, {
        payments: [charge(method, PaymentStatus.PENDING)],
      })
      expect(viewOf(order)).toEqual(
        expect.objectContaining({ showRetry: true, chargeMethod: method }),
      )
    }
  })

  it('a COD order never offers a retry', () => {
    const order = orderOf(OrderPaymentStatus.UNPAID, {
      payments: [charge(PaymentMethod.COD, PaymentStatus.PENDING)],
    })
    expect(viewOf(order).showRetry).toBe(false)
  })

  it('a PAID order or one no longer PENDING never offers a retry', () => {
    expect(viewOf(orderOf(OrderPaymentStatus.PAID)).showRetry).toBe(false)
    expect(
      viewOf(
        orderOf(OrderPaymentStatus.FAILED, { status: OrderStatus.CONFIRMED }),
      ).showRetry,
    ).toBe(false)
  })

  it('chargeMethodOf reads the latest charge', () => {
    const order = orderOf(OrderPaymentStatus.UNPAID, {
      payments: [
        charge(PaymentMethod.CARD, PaymentStatus.FAILED),
        {
          ...charge(PaymentMethod.PAYPAL, PaymentStatus.PENDING),
          id: 'pay-2',
          createdAt: '2026-11-25T00:00:00.000Z',
        },
      ],
    })
    expect(chargeMethodOf(order)).toBe(PaymentMethod.PAYPAL)
    expect(
      chargeMethodOf(orderOf(OrderPaymentStatus.UNPAID, { payments: [] })),
    ).toBeNull()
  })
})

describe('getOrderSuccessHeadingKind', () => {
  const headingOf = (order: OrderDetail, isExpired = false) =>
    getOrderSuccessHeadingKind(viewOf(order), isExpired)
  const withMethod = (status: OrderPaymentStatus, method: PaymentMethod) =>
    orderOf(status, { payments: [charge(method, PaymentStatus.PENDING)] })

  it('maps each payment kind', () => {
    expect(headingOf(orderOf(OrderPaymentStatus.PAID))).toBe('confirmed')
    expect(
      getOrderSuccessHeadingKind(
        viewOf(orderOf(OrderPaymentStatus.PENDING), { hasSessionId: true }),
      ),
    ).toBe('confirming')
    expect(headingOf(orderOf(OrderPaymentStatus.UNPAID))).toBe('actionNeeded')
    expect(
      headingOf(withMethod(OrderPaymentStatus.FAILED, PaymentMethod.PAYPAL)),
    ).toBe('actionNeeded')
    expect(headingOf(orderOf(OrderPaymentStatus.REFUNDED))).toBe('placed')
  })

  it('an unpaid COD order, or one with no charge, is placed, not action needed', () => {
    expect(
      headingOf(withMethod(OrderPaymentStatus.UNPAID, PaymentMethod.COD)),
    ).toBe('placed')
    expect(
      headingOf(orderOf(OrderPaymentStatus.UNPAID, { payments: [] })),
    ).toBe('placed')
  })

  it('an unpaid online order no longer PENDING is closed', () => {
    expect(
      headingOf(
        orderOf(OrderPaymentStatus.UNPAID, { status: OrderStatus.CANCELLED }),
      ),
    ).toBe('closed')
  })

  it('an unpaid online order past its deadline is closed', () => {
    expect(headingOf(orderOf(OrderPaymentStatus.UNPAID), true)).toBe('closed')
  })
})

describe('getPayByCountdown', () => {
  const now = Date.parse('2026-11-25T04:35:00.000Z')
  const inMs = (ms: number) => new Date(now + ms).toISOString()

  it('is null without a valid expiresAt', () => {
    expect(getPayByCountdown(null, now)).toBeNull()
    expect(getPayByCountdown('not-a-date', now)).toBeNull()
  })

  it('rounds the minutes left up', () => {
    const expiresAt = inMs(18.2 * 60_000)
    expect(getPayByCountdown(expiresAt, now)).toEqual({
      deadlineLabel: formatOrderDateTime(expiresAt),
      minutesLeft: 19,
      isExpired: false,
    })
  })

  it('shows 1 min, never 0, in the last minute', () => {
    expect(getPayByCountdown(inMs(20_000), now)?.minutesLeft).toBe(1)
  })

  it('is expired at and after the deadline', () => {
    expect(getPayByCountdown(inMs(0), now)?.isExpired).toBe(true)
    expect(getPayByCountdown(inMs(-60_000), now)?.isExpired).toBe(true)
  })
})

describe('getCancelOrderErrorMessage', () => {
  it('getCancelOrderErrorMessage maps statusNotAllowed to ORDER_NOT_CANCELLABLE and falls back to the error message', () => {
    const conflict = new ServiceError('Order cannot be cancelled: it is paid', [
      {
        errCode: 'statusNotAllowed',
        field: 'paymentStatus',
        message: 'Order cannot be cancelled: it is paid',
        description:
          'The order is already paid. Contact the shop to cancel it.',
      },
    ])

    expect(getCancelOrderErrorMessage(conflict)).toBe(
      ERROR_MESSAGES.ORDER_NOT_CANCELLABLE,
    )
    expect(
      getCancelOrderErrorMessage(new Error('Could not cancel order')),
    ).toBe('Could not cancel order')
    expect(getCancelOrderErrorMessage('boom')).toBe(
      ERROR_MESSAGES.NETWORK_ERROR,
    )
  })
})

describe('placed order summary', () => {
  const placed = {
    subTotal: 418,
    shippingFee: 12,
    tax: 41.8,
    totalAmount: 471.8,
    items: [
      {
        id: 'item-1',
        productVariantId: 'variant-1',
        productName: 'Las Hermanas',
        productImage: 'https://img.example/las.png',
        variantName: '200g',
        unitPrice: 240,
        discountAmount: 12,
        quantity: 1,
        lineTotal: 228,
      },
    ],
  } as unknown as PlacedOrder

  it('placedOrderToCartItems maps lines (name, meta = variant, image, unitPrice, quantity)', () => {
    expect(placedOrderToCartItems(placed)).toEqual([
      {
        id: 'item-1',
        variantId: 'variant-1',
        productId: '',
        name: 'Las Hermanas',
        meta: '200g',
        imageUrl: 'https://img.example/las.png',
        unitPrice: 228,
        listPrice: 240,
        quantity: 1,
        lineTotal: 228,
      },
    ])
  })

  it('placedOrderTotals maps subTotal, shippingFee, tax, totalAmount', () => {
    expect(placedOrderTotals(placed)).toEqual({
      subtotal: 418,
      shipping: 12,
      tax: 41.8,
      total: 471.8,
    })
  })
})

describe('canRetryPayment', () => {
  const NOW = new Date('2026-11-25T10:00:00.000Z')
  const failedOrder = (
    method: PaymentMethod,
    overrides: Partial<OrderDetail> = {},
  ): OrderDetail =>
    orderOf(OrderPaymentStatus.FAILED, {
      payments: [charge(method, PaymentStatus.FAILED)],
      expiresAt: '2026-11-25T22:00:00.000Z',
      ...overrides,
    })

  it('canRetryPayment is true only for a FAILED online charge on a PENDING order before its deadline', () => {
    expect(canRetryPayment(failedOrder(PaymentMethod.CARD), NOW)).toBe(true)
    expect(canRetryPayment(failedOrder(PaymentMethod.PAYPAL), NOW)).toBe(true)
    expect(
      canRetryPayment(
        failedOrder(PaymentMethod.PAYPAL, { expiresAt: null }),
        NOW,
      ),
    ).toBe(true)

    for (const paymentStatus of [
      OrderPaymentStatus.PAID,
      OrderPaymentStatus.PENDING,
      OrderPaymentStatus.UNPAID,
    ]) {
      expect(
        canRetryPayment(
          failedOrder(PaymentMethod.CARD, { paymentStatus }),
          NOW,
        ),
      ).toBe(false)
    }
    expect(
      canRetryPayment(
        failedOrder(PaymentMethod.CARD, { status: OrderStatus.CANCELLED }),
        NOW,
      ),
    ).toBe(false)
    expect(canRetryPayment(failedOrder(PaymentMethod.COD), NOW)).toBe(false)
    expect(
      canRetryPayment(
        failedOrder(PaymentMethod.CARD, {
          expiresAt: '2026-11-25T09:59:59.000Z',
        }),
        NOW,
      ),
    ).toBe(false)
  })
})
