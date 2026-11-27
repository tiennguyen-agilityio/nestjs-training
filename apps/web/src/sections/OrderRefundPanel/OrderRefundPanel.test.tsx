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

const orderWith = (refundableAmount?: number) =>
  ({
    id: 'o-1',
    orderNumber: 'CH-1',
    status: OrderStatus.CANCELLED,
    paymentStatus: OrderPaymentStatus.PAID,
    payments: [payment({})],
    refundableAmount,
  }) as OrderDetail

const openDialog = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: 'Refund' }))
  return screen.findByRole('alertdialog')
}

const send = (user: ReturnType<typeof userEvent.setup>, dialog: HTMLElement) =>
  user.click(
    within(dialog).getByRole('button', {
      name: DIALOG_MESSAGES.ORDER.REFUND.ACTION,
    }),
  )

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

  it('renders nothing when refundableAmount is 0', () => {
    for (const refundable of [0, undefined]) {
      const { container, unmount } = render(
        <OrderRefundPanel order={orderWith(refundable)} />,
      )
      expect(container).toBeEmptyDOMElement()
      unmount()
    }
  })

  it('prefills the paid amount and shows a Reason field (AC9)', async () => {
    const user = userEvent.setup()
    render(<OrderRefundPanel order={orderWith(34)} />)

    const dialog = await openDialog(user)

    expect(
      within(dialog).getByText(
        DIALOG_MESSAGES.ORDER.REFUND.DESCRIPTION('CH-1'),
      ),
    ).toBeInTheDocument()
    expect(
      within(dialog).getByRole('spinbutton', { name: 'Refund amount' }),
    ).toHaveValue(34)
    expect(within(dialog).getByRole('textbox', { name: 'Reason' })).toHaveValue(
      '',
    )
    expect(
      within(dialog).getByText(DIALOG_MESSAGES.ORDER.REFUND.REASON_HINT),
    ).toBeInTheDocument()
  })

  it('sends the full amount without a reason and refreshes the order', async () => {
    mutate.mockImplementation((_input, options: { onSuccess: () => void }) =>
      options.onSuccess(),
    )
    const user = userEvent.setup()
    render(<OrderRefundPanel order={orderWith(34)} />)

    const dialog = await openDialog(user)
    await send(user, dialog)

    expect(mutate).toHaveBeenCalledWith(
      { orderId: 'o-1', amount: 34 },
      expect.any(Object),
    )
    expect(toast.success).toHaveBeenCalledWith(SUCCESS_MESSAGES.REFUND_STARTED)
    await waitFor(() =>
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument(),
    )
  })

  it('requires a reason when the amount is lowered', async () => {
    const user = userEvent.setup()
    render(<OrderRefundPanel order={orderWith(34)} />)

    const dialog = await openDialog(user)
    const amount = within(dialog).getByRole('spinbutton', {
      name: 'Refund amount',
    })
    await user.clear(amount)
    await user.type(amount, '30')
    await user.type(
      within(dialog).getByRole('textbox', { name: 'Reason' }),
      '   ',
    )
    await send(user, dialog)

    expect(
      within(dialog).getByText(ERROR_MESSAGES.REFUND_REASON_REQUIRED),
    ).toBeInTheDocument()
    expect(mutate).not.toHaveBeenCalled()
  })

  it('sends amount and reason', async () => {
    const user = userEvent.setup()
    render(<OrderRefundPanel order={orderWith(34)} />)

    const dialog = await openDialog(user)
    const amount = within(dialog).getByRole('spinbutton', {
      name: 'Refund amount',
    })
    await user.clear(amount)
    await user.type(amount, '30')
    await user.type(
      within(dialog).getByRole('textbox', { name: 'Reason' }),
      ' Cancellation fee ',
    )
    await send(user, dialog)

    expect(mutate).toHaveBeenCalledWith(
      { orderId: 'o-1', amount: 30, reason: 'Cancellation fee' },
      expect.any(Object),
    )
  })

  it('refuses more than the refundable amount', async () => {
    const user = userEvent.setup()
    render(<OrderRefundPanel order={orderWith(34)} />)

    const dialog = await openDialog(user)
    const amount = within(dialog).getByRole('spinbutton', {
      name: 'Refund amount',
    })
    await user.clear(amount)
    await user.type(amount, '40')
    await send(user, dialog)

    expect(
      within(dialog).getByText(ERROR_MESSAGES.REFUND_AMOUNT_MAX('34.00')),
    ).toBeInTheDocument()
    expect(mutate).not.toHaveBeenCalled()
  })

  it('shows the API error', async () => {
    mutate.mockImplementation(
      (_input, options: { onError: (error: unknown) => void }) =>
        options.onError(
          new ServiceError('Refunds cannot exceed the amount paid'),
        ),
    )
    const user = userEvent.setup()
    render(<OrderRefundPanel order={orderWith(34)} />)

    const dialog = await openDialog(user)
    await send(user, dialog)

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Refunds cannot exceed the amount paid',
    )
    expect(toast.success).not.toHaveBeenCalled()
  })
})
