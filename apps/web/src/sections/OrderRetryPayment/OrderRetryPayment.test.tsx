import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRouter } from 'next/navigation'
import {
  OrderPaymentStatus,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  PaymentType,
} from '@repo/constants'

import { ERROR_MESSAGES } from '@/constants/messages'
import { useStartPayment } from '@/hooks/usePayment'
import OrderRetryPayment from '@/sections/OrderRetryPayment'
import type { OrderDetail } from '@/types/order'
import { ServiceError } from '@/utils/query'

jest.mock('next/navigation', () => ({ useRouter: jest.fn() }))
jest.mock('@/hooks/usePayment', () => ({ useStartPayment: jest.fn() }))

const replace = jest.fn()
const mutateAsync = jest.fn()

const orderOf = (
  method: PaymentMethod,
  paymentStatus = OrderPaymentStatus.FAILED,
): OrderDetail =>
  ({
    id: 'o-1',
    orderNumber: 'NB-000123',
    status: OrderStatus.PENDING,
    paymentStatus,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    payments: [
      {
        id: 'pay-1',
        orderId: 'o-1',
        type: PaymentType.CHARGE,
        method,
        status: PaymentStatus.FAILED,
        amount: 20,
        currency: 'usd',
        transactionId: null,
        completedAt: null,
        failureReason: 'Your card was declined.',
        createdAt: '2026-11-24T00:00:00.000Z',
        updatedAt: '2026-11-24T00:00:00.000Z',
      },
    ],
  }) as OrderDetail

const hookState = (isPending = false) =>
  jest.mocked(useStartPayment).mockReturnValue({
    mutateAsync,
    isPending,
  } as unknown as ReturnType<typeof useStartPayment>)

const retryButton = () => screen.getByRole('button', { name: 'Retry payment' })

describe('OrderRetryPayment', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.mocked(useRouter).mockReturnValue({
      replace,
    } as unknown as ReturnType<typeof useRouter>)
    hookState()
  })

  it('OrderRetryPayment redirects a FAILED CARD order to Stripe Checkout', async () => {
    const user = userEvent.setup()
    mutateAsync.mockResolvedValue({
      checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_new',
    })
    render(<OrderRetryPayment order={orderOf(PaymentMethod.CARD)} />)

    await user.click(retryButton())

    expect(mutateAsync).toHaveBeenCalledWith('o-1')
    expect(replace).toHaveBeenCalledWith(
      'https://checkout.stripe.com/c/pay/cs_new',
    )
  })

  it('OrderRetryPayment disables Retry payment while starting and redirecting', async () => {
    hookState(true)
    const { unmount } = render(
      <OrderRetryPayment order={orderOf(PaymentMethod.CARD)} />,
    )
    expect(retryButton()).toBeDisabled()
    unmount()

    const user = userEvent.setup()
    hookState(false)
    mutateAsync.mockResolvedValue({ checkoutUrl: 'https://stripe.test/c' })
    render(<OrderRetryPayment order={orderOf(PaymentMethod.CARD)} />)
    await user.click(retryButton())

    expect(retryButton()).toBeDisabled()
  })

  it('OrderRetryPayment shows the start error inline', async () => {
    const user = userEvent.setup()
    mutateAsync.mockRejectedValue(
      new ServiceError('expired', [
        {
          errCode: 'paymentOrderExpired',
          field: 'id',
          message: 'expired',
          description: 'expired',
        },
      ]),
    )
    render(<OrderRetryPayment order={orderOf(PaymentMethod.CARD)} />)

    await user.click(retryButton())

    expect(await screen.findByRole('alert')).toHaveTextContent(
      ERROR_MESSAGES.PAYMENT_ORDER_EXPIRED,
    )
    expect(replace).not.toHaveBeenCalled()
    expect(retryButton()).toBeEnabled()
  })

  it('OrderRetryPayment redirects a FAILED PAYPAL order to PayPal, as a card', async () => {
    const user = userEvent.setup()
    mutateAsync.mockResolvedValue({
      checkoutUrl: 'https://www.sandbox.paypal.com/pay?token=PAYPAL-ORDER-2',
    })
    render(<OrderRetryPayment order={orderOf(PaymentMethod.PAYPAL)} />)

    await user.click(retryButton())

    expect(mutateAsync).toHaveBeenCalledWith('o-1')
    expect(replace).toHaveBeenCalledWith(
      'https://www.sandbox.paypal.com/pay?token=PAYPAL-ORDER-2',
    )
  })

  it('OrderRetryPayment renders nothing when the order cannot be retried', () => {
    render(
      <OrderRetryPayment
        order={orderOf(PaymentMethod.CARD, OrderPaymentStatus.PAID)}
      />,
    )

    expect(
      screen.queryByRole('button', { name: 'Retry payment' }),
    ).not.toBeInTheDocument()
  })
})
