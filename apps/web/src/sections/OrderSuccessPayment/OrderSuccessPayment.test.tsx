import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRouter } from 'next/navigation'
import {
  OrderPaymentStatus,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  PaymentType,
} from '@repo/constants'

import { ERROR_MESSAGES, NOTICE_MESSAGES } from '@/constants/messages'
import { PAYMENT_METHOD_LABELS } from '@/constants/order'
import { useStartPayment } from '@/hooks/usePayment'
import OrderSuccessPayment, {
  type OrderSuccessPaymentProps,
} from '@/sections/OrderSuccessPayment'
import type { OrderDetail } from '@/types/order'
import { formatPrice } from '@/utils/common'
import { getPaymentStatusPresentation } from '@/utils/order'
import { ServiceError } from '@/utils/query'

jest.mock('next/navigation', () => ({ useRouter: jest.fn() }))
jest.mock('@/hooks/usePayment', () => ({ useStartPayment: jest.fn() }))

const replace = jest.fn()
const mutateAsync = jest.fn()

const minutesFromNow = (minutes: number) =>
  new Date(Date.now() + minutes * 60_000).toISOString()

const orderOf = (
  paymentStatus: OrderPaymentStatus,
  method: PaymentMethod = PaymentMethod.CARD,
  overrides: Partial<OrderDetail> = {},
): OrderDetail =>
  ({
    id: 'o-1',
    orderNumber: 'NB-000123',
    status: OrderStatus.PENDING,
    paymentStatus,
    totalAmount: 1775.3,
    expiresAt: null,
    ...overrides,
    payments: [
      {
        id: 'pay-1',
        orderId: 'o-1',
        type: PaymentType.CHARGE,
        method,
        status: PaymentStatus.PENDING,
        amount: 20,
        currency: 'usd',
        transactionId: null,
        completedAt: null,
        failureReason: null,
        createdAt: '2026-11-24T00:00:00.000Z',
        updatedAt: '2026-11-24T00:00:00.000Z',
      },
    ],
  }) as OrderDetail

const renderPayment = (props: Partial<OrderSuccessPaymentProps> = {}) =>
  render(
    <OrderSuccessPayment
      order={orderOf(OrderPaymentStatus.UNPAID)}
      hasSessionId={false}
      paymentError={null}
      isPollExhausted={false}
      {...props}
    />,
  )

const paymentRegion = () => screen.getByRole('region', { name: 'Payment' })
const retryButton = () =>
  screen.queryByRole('button', { name: 'Complete payment' })

const hookState = (isPending = false) =>
  jest.mocked(useStartPayment).mockReturnValue({
    mutateAsync,
    isPending,
  } as unknown as ReturnType<typeof useStartPayment>)

describe('OrderSuccessPayment', () => {
  beforeEach(() => {
    replace.mockClear()
    mutateAsync.mockReset()
    jest.mocked(useRouter).mockReturnValue({
      replace,
    } as unknown as ReturnType<typeof useRouter>)
    hookState()
  })

  it('an unfinished payment reads Unpaid with Complete payment, not Pending and Retry', () => {
    renderPayment({ order: orderOf(OrderPaymentStatus.PENDING) })

    expect(within(paymentRegion()).getByText('Unpaid')).toBeInTheDocument()
    expect(
      within(paymentRegion()).queryByText('Pending'),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Complete payment' }),
    ).toBeEnabled()
    expect(
      screen.queryByRole('button', { name: 'Retry payment' }),
    ).not.toBeInTheDocument()
  })

  it('a failed payment reads Failed with Retry payment', () => {
    renderPayment({ order: orderOf(OrderPaymentStatus.FAILED) })

    expect(within(paymentRegion()).getByText('Failed')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry payment' })).toBeEnabled()
    expect(
      screen.queryByRole('button', { name: 'Complete payment' }),
    ).not.toBeInTheDocument()
  })

  it('shows Paid and Payment received for a PAID order', () => {
    renderPayment({ order: orderOf(OrderPaymentStatus.PAID) })

    expect(within(paymentRegion()).getByText('Paid')).toBeInTheDocument()
    expect(
      within(paymentRegion()).getByText(NOTICE_MESSAGES.ORDER_PAYMENT.PAID),
    ).toBeInTheDocument()
    expect(retryButton()).not.toBeInTheDocument()
  })

  it('shows Confirming your payment for a PENDING order back with a session', () => {
    renderPayment({
      order: orderOf(OrderPaymentStatus.PENDING),
      hasSessionId: true,
    })

    expect(
      within(paymentRegion()).getByText(
        NOTICE_MESSAGES.ORDER_PAYMENT.CONFIRMING,
      ),
    ).toBeInTheDocument()
    expect(retryButton()).not.toBeInTheDocument()
  })

  it('shows the start failure reason next to Complete payment', () => {
    renderPayment({ paymentError: 'paymentOrderExpired' })

    expect(
      within(paymentRegion()).getByText(ERROR_MESSAGES.PAYMENT_ORDER_EXPIRED),
    ).toBeInTheDocument()
    expect(retryButton()).toBeInTheDocument()
  })

  it('Complete payment starts the payment and replaces the location', async () => {
    const user = userEvent.setup()
    mutateAsync.mockResolvedValue({
      paymentId: 'p-1',
      checkoutUrl: 'https://checkout.stripe.com/c/s',
      expiresAt: '2026-11-25T00:00:00.000Z',
    })
    renderPayment()

    await user.click(screen.getByRole('button', { name: 'Complete payment' }))

    expect(mutateAsync).toHaveBeenCalledWith('o-1')
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith('https://checkout.stripe.com/c/s'),
    )
  })

  it('the URL error stays hidden while a second Complete payment runs', async () => {
    const user = userEvent.setup()
    let rejectFirst: (error: unknown) => void = () => undefined
    mutateAsync
      .mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            rejectFirst = reject
          }),
      )
      .mockImplementationOnce(() => new Promise(() => undefined))
    renderPayment({ paymentError: 'paymentGatewayUnavailable' })
    expect(
      screen.getByText(ERROR_MESSAGES.PAYMENT_GATEWAY_UNAVAILABLE),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Complete payment' }))
    rejectFirst(
      new ServiceError('x', [
        {
          errCode: 'paymentNotPayable',
          field: 'id',
          message: 'x',
          description: 'y',
        },
      ]),
    )
    await screen.findByRole('alert')
    await user.click(screen.getByRole('button', { name: 'Complete payment' }))

    expect(
      screen.queryByText(ERROR_MESSAGES.PAYMENT_GATEWAY_UNAVAILABLE),
    ).not.toBeInTheDocument()
  })

  it('Complete payment is disabled while the payment starts', async () => {
    const user = userEvent.setup()
    hookState(true)
    renderPayment()

    const button = screen.getByRole('button', { name: 'Complete payment' })
    expect(button).toBeDisabled()
    await user.click(button)

    expect(mutateAsync).not.toHaveBeenCalled()
  })

  it('a failed Complete payment shows the mapped error and keeps the button', async () => {
    const user = userEvent.setup()
    mutateAsync.mockRejectedValue(
      new ServiceError('x', [
        {
          errCode: 'paymentNotPayable',
          field: 'id',
          message: 'x',
          description: 'y',
        },
      ]),
    )
    renderPayment({ paymentError: 'paymentGatewayUnavailable' })
    expect(
      screen.getByText(ERROR_MESSAGES.PAYMENT_GATEWAY_UNAVAILABLE),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Complete payment' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      ERROR_MESSAGES.PAYMENT_NOT_PAYABLE,
    )
    expect(
      screen.queryByText(ERROR_MESSAGES.PAYMENT_GATEWAY_UNAVAILABLE),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Complete payment' }),
    ).toBeEnabled()
    expect(replace).not.toHaveBeenCalled()
  })

  it('shows method, badge, message and total', () => {
    renderPayment({ order: orderOf(OrderPaymentStatus.PAID) })

    const card = within(paymentRegion())
    expect(
      card.getByText(PAYMENT_METHOD_LABELS[PaymentMethod.CARD]),
    ).toBeInTheDocument()
    expect(
      card.getByText(
        getPaymentStatusPresentation(OrderPaymentStatus.PAID).label,
      ),
    ).toBeInTheDocument()
    expect(
      card.getByText(NOTICE_MESSAGES.ORDER_PAYMENT.PAID),
    ).toBeInTheDocument()
    expect(card.getByText(formatPrice(1775.3))).toBeInTheDocument()
    expect(
      card.queryByRole('combobox', { name: 'Pay with' }),
    ).not.toBeInTheDocument()
  })

  it('shows the pay-by banner, Pay with and Complete payment for an unpaid card order', () => {
    renderPayment({
      order: orderOf(OrderPaymentStatus.UNPAID, PaymentMethod.CARD, {
        expiresAt: minutesFromNow(17.9),
      }),
    })

    const card = within(paymentRegion())
    expect(card.getByText(/^Pay by /)).toBeInTheDocument()
    expect(
      card.getByText(NOTICE_MESSAGES.ORDER_PAYMENT.PAY_BY_HINT(18)),
    ).toBeInTheDocument()
    expect(card.getByRole('combobox', { name: 'Pay with' })).toHaveTextContent(
      PAYMENT_METHOD_LABELS[PaymentMethod.CARD],
    )
    expect(retryButton()).toBeEnabled()
    expect(
      card.queryByText(NOTICE_MESSAGES.ORDER_PAYMENT.RETRY_COMING_SOON),
    ).not.toBeInTheDocument()
  })

  it("retries a PayPal payment on PayPal's page, as a card", async () => {
    const user = userEvent.setup()
    mutateAsync.mockResolvedValue({
      checkoutUrl: 'https://www.sandbox.paypal.com/pay?token=PAYPAL-ORDER-2',
    })
    renderPayment({
      order: orderOf(OrderPaymentStatus.FAILED, PaymentMethod.PAYPAL),
    })

    expect(
      screen.getByRole('combobox', { name: 'Pay with' }),
    ).toHaveTextContent(PAYMENT_METHOD_LABELS[PaymentMethod.PAYPAL])
    expect(
      screen.queryByText(NOTICE_MESSAGES.ORDER_PAYMENT.RETRY_COMING_SOON),
    ).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Retry payment' }))
    expect(replace).toHaveBeenCalledWith(
      'https://www.sandbox.paypal.com/pay?token=PAYPAL-ORDER-2',
    )
  })

  it('disables Complete payment with Coming soon when another method is selected', async () => {
    const user = userEvent.setup()
    renderPayment()

    await user.click(screen.getByRole('combobox', { name: 'Pay with' }))
    await user.click(
      await screen.findByRole('option', {
        name: PAYMENT_METHOD_LABELS[PaymentMethod.PAYPAL],
      }),
    )

    expect(retryButton()).toBeDisabled()
    expect(
      screen.getByText(NOTICE_MESSAGES.ORDER_PAYMENT.RETRY_COMING_SOON),
    ).toBeInTheDocument()
    expect(mutateAsync).not.toHaveBeenCalled()
  })

  it('shows Payment window closed past expiresAt', () => {
    renderPayment({
      order: orderOf(OrderPaymentStatus.UNPAID, PaymentMethod.CARD, {
        expiresAt: minutesFromNow(-1),
      }),
    })

    expect(
      within(paymentRegion()).getByText(
        NOTICE_MESSAGES.ORDER_PAYMENT.WINDOW_CLOSED,
      ),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('combobox', { name: 'Pay with' }),
    ).not.toBeInTheDocument()
    expect(retryButton()).not.toBeInTheDocument()
  })

  it('shows no banner without expiresAt and keeps Complete payment enabled', () => {
    renderPayment()

    expect(screen.queryByText(/^Pay by /)).not.toBeInTheDocument()
    expect(retryButton()).toBeEnabled()
  })

  it('shows no retry block for a COD order', () => {
    renderPayment({
      order: orderOf(OrderPaymentStatus.UNPAID, PaymentMethod.COD),
    })

    const card = within(paymentRegion())
    expect(
      card.getByText(PAYMENT_METHOD_LABELS[PaymentMethod.COD]),
    ).toBeInTheDocument()
    expect(
      card.getByText(NOTICE_MESSAGES.ORDER_PAYMENT.COD),
    ).toBeInTheDocument()
    expect(
      card.queryByText(NOTICE_MESSAGES.ORDER_PAYMENT.NOT_COMPLETED),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('combobox', { name: 'Pay with' }),
    ).not.toBeInTheDocument()
    expect(retryButton()).not.toBeInTheDocument()
  })

  it('follows the charge method a later poll brings', () => {
    const { rerender } = renderPayment({
      order: orderOf(OrderPaymentStatus.FAILED, PaymentMethod.CARD, {
        payments: [],
      }),
    })

    rerender(
      <OrderSuccessPayment
        order={orderOf(OrderPaymentStatus.FAILED)}
        hasSessionId={false}
        paymentError={null}
        isPollExhausted={false}
      />,
    )

    expect(
      screen.getByRole('combobox', { name: 'Pay with' }),
    ).toHaveTextContent(PAYMENT_METHOD_LABELS[PaymentMethod.CARD])
    expect(screen.getByRole('button', { name: 'Retry payment' })).toBeEnabled()
  })
})
