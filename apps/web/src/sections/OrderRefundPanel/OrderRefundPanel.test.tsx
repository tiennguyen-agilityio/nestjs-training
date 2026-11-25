import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import {
  OrderPaymentStatus,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  PaymentType,
} from '@repo/constants'

import OrderRefundPanel from '@/sections/OrderRefundPanel'
import { useCreateRefund } from '@/hooks/useOrder'
import {
  DIALOG_MESSAGES,
  ERROR_MESSAGES,
  SUCCESS_MESSAGES,
} from '@/constants/messages'
import { ServiceError } from '@/utils/query'
import type { OrderDetail, OrderPayment } from '@/types/order'

jest.mock('sonner', () => ({ toast: { success: jest.fn() } }))
jest.mock('@/hooks/useOrder', () => ({ useCreateRefund: jest.fn() }))

const mutate = jest.fn()

const payment = (overrides: Partial<OrderPayment>): OrderPayment => ({
  id: 'pay-1',
  orderId: 'o-1',
  type: PaymentType.CHARGE,
  method: PaymentMethod.CARD,
  status: PaymentStatus.PAID,
  amount: 34,
  currency: 'USD',
  transactionId: 'pi_1',
  completedAt: null,
  failureReason: null,
  createdAt: '2026-11-25T09:00:00.000Z',
  updatedAt: '2026-11-25T09:00:00.000Z',
  ...overrides,
})

const orderWith = (...payments: OrderPayment[]) =>
  ({
    id: 'o-1',
    orderNumber: 'CH-1',
    status: OrderStatus.CANCELLED,
    paymentStatus: OrderPaymentStatus.PARTIALLY_REFUNDED,
    payments,
  }) as OrderDetail

describe('OrderRefundPanel', () => {
  beforeEach(() => {
    jest.mocked(useCreateRefund).mockReturnValue({
      mutate,
      isPending: false,
    } as unknown as ReturnType<typeof useCreateRefund>)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('OrderRefundPanel refunds the amount entered and refreshes the order', async () => {
    mutate.mockImplementation((_input, options: { onSuccess: () => void }) =>
      options.onSuccess(),
    )
    const user = userEvent.setup()
    render(
      <OrderRefundPanel
        order={orderWith(
          payment({}),
          payment({
            id: 'refund-1',
            type: PaymentType.REFUND,
            status: PaymentStatus.FAILED,
            amount: 10,
          }),
        )}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Refund' }))
    const dialog = await screen.findByRole('alertdialog')
    expect(
      within(dialog).getByText(
        DIALOG_MESSAGES.ORDER.REFUND.DESCRIPTION('CH-1'),
      ),
    ).toBeInTheDocument()
    const amount = within(dialog).getByRole('spinbutton', {
      name: 'Refund amount',
    })
    expect(amount).toHaveValue(34)

    await user.clear(amount)
    await user.type(amount, '12.5')
    await user.click(
      within(dialog).getByRole('button', {
        name: DIALOG_MESSAGES.ORDER.REFUND.ACTION,
      }),
    )

    expect(mutate).toHaveBeenCalledWith(
      { orderId: 'o-1', amount: 12.5 },
      expect.any(Object),
    )
    expect(toast.success).toHaveBeenCalledWith(SUCCESS_MESSAGES.REFUND_STARTED)
    await waitFor(() =>
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument(),
    )
  })

  it('OrderRefundPanel is hidden once the order has a refund', () => {
    const { container } = render(
      <OrderRefundPanel
        order={orderWith(
          payment({}),
          payment({ id: 'refund-1', type: PaymentType.REFUND, amount: 5 }),
        )}
      />,
    )

    expect(container).toBeEmptyDOMElement()
  })

  it('OrderRefundPanel is hidden when nothing is refundable', () => {
    const { container } = render(
      <OrderRefundPanel
        order={orderWith(payment({ method: PaymentMethod.COD }))}
      />,
    )

    expect(container).toBeEmptyDOMElement()
  })

  it('OrderRefundPanel refuses more than the refundable amount', async () => {
    const user = userEvent.setup()
    render(<OrderRefundPanel order={orderWith(payment({}))} />)

    await user.click(screen.getByRole('button', { name: 'Refund' }))
    const dialog = await screen.findByRole('alertdialog')
    const amount = within(dialog).getByRole('spinbutton', {
      name: 'Refund amount',
    })
    await user.clear(amount)
    await user.type(amount, '40')
    await user.click(
      within(dialog).getByRole('button', {
        name: DIALOG_MESSAGES.ORDER.REFUND.ACTION,
      }),
    )

    expect(
      within(dialog).getByText(ERROR_MESSAGES.REFUND_AMOUNT_MAX('34.00')),
    ).toBeInTheDocument()
    expect(mutate).not.toHaveBeenCalled()
  })

  it('OrderRefundPanel shows the API error', async () => {
    mutate.mockImplementation(
      (_input, options: { onError: (error: unknown) => void }) =>
        options.onError(
          new ServiceError('Refunds cannot exceed the amount paid'),
        ),
    )
    const user = userEvent.setup()
    render(<OrderRefundPanel order={orderWith(payment({}))} />)

    await user.click(screen.getByRole('button', { name: 'Refund' }))
    const dialog = await screen.findByRole('alertdialog')
    await user.click(
      within(dialog).getByRole('button', {
        name: DIALOG_MESSAGES.ORDER.REFUND.ACTION,
      }),
    )

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Refunds cannot exceed the amount paid',
    )
    expect(toast.success).not.toHaveBeenCalled()
  })
})
