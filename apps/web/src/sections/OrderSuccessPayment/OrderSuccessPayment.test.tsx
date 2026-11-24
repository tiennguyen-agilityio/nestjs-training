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
import { useStartPayment } from '@/hooks/usePayment'
import OrderSuccessPayment, {
  type OrderSuccessPaymentProps,
} from '@/sections/OrderSuccessPayment'
import type { OrderDetail } from '@/types/order'
import { ServiceError } from '@/utils/query'

jest.mock('next/navigation', () => ({ useRouter: jest.fn() }))
jest.mock('@/hooks/usePayment', () => ({ useStartPayment: jest.fn() }))

const replace = jest.fn()
const mutateAsync = jest.fn()

const orderOf = (paymentStatus: OrderPaymentStatus): OrderDetail =>
  ({
    id: 'o-1',
    orderNumber: 'NB-000123',
    status: OrderStatus.PENDING,
    paymentStatus,
    payments: [
      {
        id: 'pay-1',
        orderId: 'o-1',
        type: PaymentType.CHARGE,
        method: PaymentMethod.CARD,
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
const payNowButton = () => screen.queryByRole('button', { name: 'Pay now' })

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

  it('shows Paid and Payment received for a PAID order', () => {
    renderPayment({ order: orderOf(OrderPaymentStatus.PAID) })

    expect(within(paymentRegion()).getByText('Paid')).toBeInTheDocument()
    expect(
      within(paymentRegion()).getByText(NOTICE_MESSAGES.ORDER_PAYMENT.PAID),
    ).toBeInTheDocument()
    expect(payNowButton()).not.toBeInTheDocument()
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
    expect(payNowButton()).not.toBeInTheDocument()
  })

  it('shows the start failure reason next to Pay now', () => {
    renderPayment({ paymentError: 'paymentOrderExpired' })

    expect(
      within(paymentRegion()).getByText(ERROR_MESSAGES.PAYMENT_ORDER_EXPIRED),
    ).toBeInTheDocument()
    expect(payNowButton()).toBeInTheDocument()
  })

  it('Pay now starts the payment and replaces the location', async () => {
    const user = userEvent.setup()
    mutateAsync.mockResolvedValue({
      paymentId: 'p-1',
      checkoutUrl: 'https://checkout.stripe.com/c/s',
      expiresAt: '2026-11-25T00:00:00.000Z',
    })
    renderPayment()

    await user.click(screen.getByRole('button', { name: 'Pay now' }))

    expect(mutateAsync).toHaveBeenCalledWith('o-1')
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith('https://checkout.stripe.com/c/s'),
    )
  })

  it('the URL error stays hidden while a second Pay now runs', async () => {
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

    await user.click(screen.getByRole('button', { name: 'Pay now' }))
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
    await user.click(screen.getByRole('button', { name: 'Pay now' }))

    expect(
      screen.queryByText(ERROR_MESSAGES.PAYMENT_GATEWAY_UNAVAILABLE),
    ).not.toBeInTheDocument()
  })

  it('Pay now is disabled while the payment starts', async () => {
    const user = userEvent.setup()
    hookState(true)
    renderPayment()

    const button = screen.getByRole('button', { name: 'Pay now' })
    expect(button).toBeDisabled()
    await user.click(button)

    expect(mutateAsync).not.toHaveBeenCalled()
  })

  it('a failed Pay now shows the mapped error and keeps the button', async () => {
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

    await user.click(screen.getByRole('button', { name: 'Pay now' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      ERROR_MESSAGES.PAYMENT_NOT_PAYABLE,
    )
    expect(
      screen.queryByText(ERROR_MESSAGES.PAYMENT_GATEWAY_UNAVAILABLE),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pay now' })).toBeEnabled()
    expect(replace).not.toHaveBeenCalled()
  })
})
