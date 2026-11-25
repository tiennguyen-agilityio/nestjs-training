import { render, screen, waitFor, within } from '@testing-library/react'
import { toast } from 'sonner'
import userEvent from '@testing-library/user-event'
import { useParams } from 'next/navigation'
import {
  OrderPaymentStatus,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  PaymentType,
  ShippingStatus,
} from '@repo/constants'

import OrderDetailPageContent from '@/sections/OrderDetailPageContent'
import {
  useCancelOrder,
  useOrderDetail,
  useRetryRefund,
} from '@/hooks/useOrder'
import {
  API_FALLBACK_ERRORS,
  DIALOG_MESSAGES,
  ERROR_MESSAGES,
  SUCCESS_MESSAGES,
} from '@/constants/messages'
import { ServiceError } from '@/utils/query'
import { ROUTES } from '@/constants/routes'
import { formatPrice } from '@/utils/common'
import { formatOrderDateTime } from '@/utils/order'
import type { OrderDetail, OrderPayment } from '@/types/order'

jest.mock('next/navigation', () => ({
  useParams: jest.fn(),
  usePathname: jest.fn(() => '/dashboard/orders/CH-261117-0001'),
}))

jest.mock('@/hooks/useOrder', () => ({
  useOrderDetail: jest.fn(),
  useCancelOrder: jest.fn(),
  useUpdateOrderStatus: jest.fn(() => ({
    mutate: jest.fn(),
    isPending: false,
  })),
  useUpdateOrderShippingStatus: jest.fn(() => ({
    mutate: jest.fn(),
    isPending: false,
  })),
  useCreateRefund: jest.fn(() => ({ mutate: jest.fn(), isPending: false })),
  useRetryRefund: jest.fn(),
}))
jest.mock('sonner', () => ({ toast: { success: jest.fn() } }))
jest.mock('@/sections/OrderRetryPayment', () => ({
  __esModule: true,
  default: () => <button type="button">Retry payment</button>,
}))

jest.mock('next/image', () => ({
  __esModule: true,
  default: ({ src, alt }: { src: string; alt: string }) => (
    <img src={src} alt={alt} />
  ),
}))

const mockUseParams = jest.mocked(useParams)
const mockUseOrderDetail = jest.mocked(useOrderDetail)
const mockUseCancelOrder = jest.mocked(useCancelOrder)
const mutate = jest.fn()

const charge: OrderPayment = {
  id: 'pay-1',
  orderId: 'order-1',
  type: PaymentType.CHARGE,
  method: PaymentMethod.COD,
  status: PaymentStatus.PENDING,
  amount: 24.8,
  currency: 'USD',
  transactionId: null,
  completedAt: null,
  failureReason: null,
  createdAt: '2026-11-17T09:00:00.000Z',
  updatedAt: '2026-11-17T09:00:00.000Z',
}

const order: OrderDetail = {
  id: 'order-1',
  orderNumber: 'CH-261117-0001',
  userId: 'user-1',
  shippingMethodId: 'method-1',
  status: OrderStatus.PENDING,
  shippingStatus: ShippingStatus.PENDING,
  paymentStatus: OrderPaymentStatus.UNPAID,
  recipientName: 'Tien Nguyen',
  recipientPhone: '0901234567',
  addressLine: '12 Nguyen Hue',
  ward: 'Ben Nghe',
  district: 'District 1',
  city: 'Ho Chi Minh City',
  postalCode: '700000',
  shippingMethodName: 'Express',
  shippingFee: 5,
  tax: 1.8,
  subTotal: 18,
  totalAmount: 24.8,
  note: 'Ring twice',
  expiresAt: null,
  items: [
    {
      id: 'item-1',
      productVariantId: 'variant-1',
      productName: 'Buon Ma Thuot Robusta',
      productImage: 'https://example.com/robusta.jpg',
      variantName: '500g',
      unitPrice: 11,
      discountAmount: 2,
      quantity: 2,
      lineTotal: 18,
    },
  ],
  payments: [charge],
  customer: {
    firstName: 'Lan',
    lastName: 'Nguyen',
    email: 'lan@example.com',
  },
  createdAt: '2026-11-17T09:00:00.000Z',
  updatedAt: '2026-11-17T09:00:00.000Z',
}

const state = (
  overrides: Partial<ReturnType<typeof useOrderDetail>> = {},
): ReturnType<typeof useOrderDetail> => ({
  order,
  isLoading: false,
  isError: false,
  isNotFound: false,
  errorMessage: null,
  refetch: jest.fn().mockResolvedValue(undefined),
  ...overrides,
})

const section = (name: string) => screen.getByRole('region', { name })

describe('OrderDetailPageContent', () => {
  beforeEach(() => {
    mockUseParams.mockReturnValue({ orderNumber: order.orderNumber })
    mockUseOrderDetail.mockReturnValue(state())
    mockUseCancelOrder.mockReturnValue({
      mutate,
      isPending: false,
    } as unknown as ReturnType<typeof useCancelOrder>)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('OrderDetailPageContent dashboard variant shows the customer and links back to Orders', () => {
    render(<OrderDetailPageContent variant="dashboard" />)

    const customer = section('Customer')
    expect(within(customer).getByText('Lan Nguyen')).toBeInTheDocument()
    expect(within(customer).getByText('lan@example.com')).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Back to orders' }),
    ).toHaveAttribute('href', ROUTES.DASHBOARD_ORDERS)
    expect(screen.getByRole('link', { name: 'Orders' })).toHaveAttribute(
      'href',
      ROUTES.DASHBOARD_ORDERS,
    )
    expect(
      screen.getByRole('heading', { level: 1, name: /CH-261117-0001/ }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Cancel order' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Cancel order' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Profile' })).toBeNull()
  })

  it('OrderDetailPageContent dashboard variant shows not found with a link back to Orders', () => {
    mockUseOrderDetail.mockReturnValue(
      state({ order: null, isError: true, isNotFound: true }),
    )

    render(<OrderDetailPageContent variant="dashboard" />)

    expect(screen.getByText(ERROR_MESSAGES.ORDER_NOT_FOUND)).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Back to orders' }),
    ).toHaveAttribute('href', ROUTES.DASHBOARD_ORDERS)
    expect(screen.queryByRole('link', { name: 'Profile' })).toBeNull()
  })

  it('OrderDetailPageContent shows Update status only on the dashboard', () => {
    const { unmount } = render(<OrderDetailPageContent variant="dashboard" />)
    expect(section('Update status')).toBeInTheDocument()
    expect(section('Progress').nextElementSibling).toBe(
      section('Update status'),
    )
    unmount()

    render(<OrderDetailPageContent variant="profile" />)
    expect(screen.queryByRole('region', { name: 'Update status' })).toBeNull()
    expect(section('Cancel order')).toBeInTheDocument()
  })

  it('the profile variant shows no Customer panel', () => {
    render(<OrderDetailPageContent />)

    expect(screen.queryByRole('region', { name: 'Customer' })).toBeNull()
  })

  it('shows the header with a Profile link, the order number and the placed time', () => {
    render(<OrderDetailPageContent />)

    expect(mockUseOrderDetail).toHaveBeenCalledWith(order.orderNumber)
    expect(screen.getByRole('link', { name: 'Profile' })).toHaveAttribute(
      'href',
      ROUTES.USER_PROFILE,
    )
    expect(
      screen.getByRole('heading', { level: 1, name: /CH-261117-0001/ }),
    ).toHaveTextContent('Order CH-261117-0001')
    expect(
      screen.getByText(`Placed ${formatOrderDateTime(order.createdAt)}`),
    ).toBeInTheDocument()
  })

  it('shows each item with its sale price, the struck unit price when discounted, the quantity and the line total', () => {
    render(<OrderDetailPageContent />)

    const items = section('Items')
    expect(within(items).getByText('Buon Ma Thuot Robusta')).toBeInTheDocument()
    expect(within(items).getByText(/500g · \$9\.00/)).toBeInTheDocument()
    expect(within(items).getByText(formatPrice(11)).tagName).toBe('S')
    expect(within(items).getByText(/× 2/)).toBeInTheDocument()
    expect(
      within(items).getByText(
        'Names and prices copied when the order was placed',
      ),
    ).toBeInTheDocument()
  })

  it('shows Subtotal, Shipping · <method>, VAT (10%) and Total amount', () => {
    render(<OrderDetailPageContent />)

    const items = section('Items')
    for (const [label, amount] of [
      ['Subtotal', order.subTotal],
      ['Shipping · Express', order.shippingFee],
      ['VAT (10%)', order.tax],
      ['Total amount', order.totalAmount],
    ] as const) {
      const row = within(items).getByText(label).parentElement ?? items
      expect(within(row).getByText(formatPrice(amount))).toBeInTheDocument()
    }
  })

  it('shows the order and shipping progress, and Cancelled for a cancelled order', () => {
    const { rerender } = render(<OrderDetailPageContent />)

    const progress = section('Progress')
    expect(within(progress).getAllByText('Pending')).toHaveLength(2)
    expect(within(progress).getByText('Confirmed')).toBeInTheDocument()
    expect(within(progress).getByText('Completed')).toBeInTheDocument()
    // the row label and the step
    expect(within(progress).getAllByText('Shipping')).toHaveLength(2)
    expect(within(progress).getByText('Delivered')).toBeInTheDocument()
    expect(within(progress).getAllByText('Pending')[0]).toHaveAttribute(
      'aria-current',
      'step',
    )

    mockUseOrderDetail.mockReturnValue(
      state({ order: { ...order, status: OrderStatus.CANCELLED } }),
    )
    rerender(<OrderDetailPageContent />)

    const cancelled = section('Progress')
    expect(within(cancelled).getByText('Cancelled')).toBeInTheDocument()
    expect(within(cancelled).queryByText('Confirmed')).not.toBeInTheDocument()
    expect(within(cancelled).getByText('—')).toBeInTheDocument()
  })

  it('shows the payment method, status badge, amount, transaction, paid at and the transactions table', () => {
    render(<OrderDetailPageContent />)

    const payment = section('Payment')
    expect(
      within(payment).getByText('Method', { selector: 'dt' }).nextSibling,
    ).toHaveTextContent('Cash on delivery')
    expect(
      within(payment).getByText('Status', { selector: 'dt' }).nextSibling,
    ).toHaveTextContent('Unpaid')
    expect(
      within(payment).getByText('Amount', { selector: 'dt' }).nextSibling,
    ).toHaveTextContent(formatPrice(order.totalAmount))
    expect(
      within(payment).getByText('Transaction', { selector: 'dt' }).nextSibling,
    ).toHaveTextContent('—')
    expect(
      within(payment).getByText('Paid at', { selector: 'dt' }).nextSibling,
    ).toHaveTextContent('—')
    const table = within(payment).getByRole('table')
    const [, row] = within(table).getAllByRole('row')
    expect(row).toHaveTextContent('Charge · Cash on delivery')
    expect(row).toHaveTextContent(formatOrderDateTime(charge.createdAt))
    expect(row).toHaveTextContent('Pending')
    expect(row).toHaveTextContent(formatPrice(charge.amount))
  })

  it('shows the recipient, phone, address and note', () => {
    render(<OrderDetailPageContent />)

    const shipTo = section('Ship to')
    expect(
      within(shipTo).getByText('Tien Nguyen · 0901234567'),
    ).toBeInTheDocument()
    expect(
      within(shipTo).getByText(
        '12 Nguyen Hue, Ben Nghe, District 1, Ho Chi Minh City, 700000',
      ),
    ).toBeInTheDocument()
    expect(within(shipTo).getByText(/Ring twice/)).toBeInTheDocument()
  })

  it('shows an enabled Cancel order button only for a PENDING order (AC3)', () => {
    const { rerender } = render(<OrderDetailPageContent />)

    const cancel = section('Cancel order')
    expect(
      within(cancel).getByText(
        'You can cancel while the order is still pending. Its items go back into stock.',
      ),
    ).toBeInTheDocument()
    expect(
      within(cancel).getByRole('button', { name: 'Cancel order' }),
    ).toBeEnabled()

    mockUseOrderDetail.mockReturnValue(
      state({ order: { ...order, status: OrderStatus.CONFIRMED } }),
    )
    rerender(<OrderDetailPageContent />)
    expect(
      within(section('Cancel order')).getByText(
        'Cannot be cancelled: the order is confirmed.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancel order' })).toBeNull()

    mockUseOrderDetail.mockReturnValue(
      state({ order: { ...order, status: OrderStatus.CANCELLED } }),
    )
    rerender(<OrderDetailPageContent />)
    expect(
      within(section('Cancel order')).getByText(
        'This order has been cancelled.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancel order' })).toBeNull()
  })

  it('cancels a PENDING order after the confirm and toasts Order cancelled', async () => {
    const user = userEvent.setup()
    mutate.mockImplementation(
      (_id: string, { onSuccess }: { onSuccess: () => void }) => onSuccess(),
    )
    render(<OrderDetailPageContent />)

    await user.click(
      within(section('Cancel order')).getByRole('button', {
        name: DIALOG_MESSAGES.ORDER.CANCEL.ACTION,
      }),
    )
    const dialog = await screen.findByRole('alertdialog')
    expect(
      within(dialog).getByText(DIALOG_MESSAGES.ORDER.CANCEL.TITLE),
    ).toBeInTheDocument()
    expect(
      within(dialog).getByText(
        DIALOG_MESSAGES.ORDER.CANCEL.DESCRIPTION(order.orderNumber),
      ),
    ).toBeInTheDocument()

    await user.click(
      within(dialog).getByRole('button', {
        name: DIALOG_MESSAGES.ORDER.CANCEL.KEEP,
      }),
    )
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(mutate).not.toHaveBeenCalled()

    await user.click(
      within(section('Cancel order')).getByRole('button', {
        name: DIALOG_MESSAGES.ORDER.CANCEL.ACTION,
      }),
    )
    const reopened = await screen.findByRole('alertdialog')
    await user.click(
      within(reopened).getByRole('button', {
        name: DIALOG_MESSAGES.ORDER.CANCEL.ACTION,
      }),
    )

    expect(mutate).toHaveBeenCalledWith(order.id, expect.any(Object))
    expect(toast.success).toHaveBeenCalledWith(SUCCESS_MESSAGES.ORDER_CANCELLED)
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
  })

  it('shows ORDER_NOT_CANCELLABLE in the dialog when the cancel answers statusNotAllowed', async () => {
    const user = userEvent.setup()
    mutate.mockImplementation(
      (_id: string, { onError }: { onError: (error: unknown) => void }) =>
        onError(
          new ServiceError('Order cannot be cancelled: it is confirmed', [
            {
              errCode: 'statusNotAllowed',
              field: 'status',
              message: 'Order cannot be cancelled: it is confirmed',
              description: 'Contact the shop to cancel a confirmed order.',
            },
          ]),
        ),
    )
    render(<OrderDetailPageContent />)

    await user.click(
      within(section('Cancel order')).getByRole('button', {
        name: DIALOG_MESSAGES.ORDER.CANCEL.ACTION,
      }),
    )
    const dialog = await screen.findByRole('alertdialog')
    await user.click(
      within(dialog).getByRole('button', {
        name: DIALOG_MESSAGES.ORDER.CANCEL.ACTION,
      }),
    )

    expect(
      await within(dialog).findByText(ERROR_MESSAGES.ORDER_NOT_CANCELLABLE),
    ).toBeInTheDocument()
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('keeps the dialog and its message when the refetch after a 409 shows the order confirmed', async () => {
    const user = userEvent.setup()
    mutate.mockImplementation(
      (_id: string, { onError }: { onError: (error: unknown) => void }) =>
        onError(
          new ServiceError('Order cannot be cancelled: it is confirmed', [
            {
              errCode: 'statusNotAllowed',
              field: 'status',
              message: 'Order cannot be cancelled: it is confirmed',
              description: 'Contact the shop to cancel a confirmed order.',
            },
          ]),
        ),
    )
    const { rerender } = render(<OrderDetailPageContent />)

    await user.click(
      within(section('Cancel order')).getByRole('button', {
        name: DIALOG_MESSAGES.ORDER.CANCEL.ACTION,
      }),
    )
    const dialog = await screen.findByRole('alertdialog')
    await user.click(
      within(dialog).getByRole('button', {
        name: DIALOG_MESSAGES.ORDER.CANCEL.ACTION,
      }),
    )
    mockUseOrderDetail.mockReturnValue(
      state({ order: { ...order, status: OrderStatus.CONFIRMED } }),
    )
    rerender(<OrderDetailPageContent />)

    expect(
      within(screen.getByRole('alertdialog')).getByText(
        ERROR_MESSAGES.ORDER_NOT_CANCELLABLE,
      ),
    ).toBeInTheDocument()
    await user.click(
      screen.getByRole('button', { name: DIALOG_MESSAGES.ORDER.CANCEL.KEEP }),
    )
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(
      within(section('Cancel order')).getByText(
        'Cannot be cancelled: the order is confirmed.',
      ),
    ).toBeInTheDocument()
  })

  it('shows Order not found with a link to Profile for a 404', () => {
    mockUseOrderDetail.mockReturnValue(
      state({ order: null, isError: true, isNotFound: true }),
    )

    render(<OrderDetailPageContent />)

    expect(screen.getByText(ERROR_MESSAGES.ORDER_NOT_FOUND)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Profile' })).toHaveAttribute(
      'href',
      ROUTES.USER_PROFILE,
    )
    expect(screen.queryByRole('region', { name: 'Items' })).toBeNull()
  })

  it('shows other errors with Retry', async () => {
    const user = userEvent.setup()
    const refetch = jest.fn().mockResolvedValue(undefined)
    mockUseOrderDetail.mockReturnValue(
      state({
        order: null,
        isError: true,
        errorMessage: null,
        refetch,
      }),
    )

    render(<OrderDetailPageContent />)

    expect(screen.getByRole('alert')).toHaveTextContent(
      API_FALLBACK_ERRORS.ORDER_LOAD,
    )
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(refetch).toHaveBeenCalled()
  })

  it('shows Loading while the order loads', () => {
    mockUseOrderDetail.mockReturnValue(state({ order: null, isLoading: true }))

    render(<OrderDetailPageContent />)

    expect(screen.getByRole('status')).toHaveTextContent('Loading order')
  })

  describe('retry payment', () => {
    const failedCharge: OrderPayment = {
      ...charge,
      method: PaymentMethod.CARD,
      status: PaymentStatus.FAILED,
      failureReason: 'Your card was declined.',
    }
    const failedOrder: OrderDetail = {
      ...order,
      paymentStatus: OrderPaymentStatus.FAILED,
      payments: [failedCharge],
    }
    const lastFailure = () =>
      within(section('Payment')).queryByText('Last failure', {
        selector: 'dt',
      })

    it('OrderDetailPageContent shows Retry payment for the owner of a FAILED order (AC4)', () => {
      mockUseOrderDetail.mockReturnValue(state({ order: failedOrder }))
      render(<OrderDetailPageContent />)

      expect(
        within(section('Payment')).getByRole('button', {
          name: 'Retry payment',
        }),
      ).toBeInTheDocument()
    })

    it('OrderDetailPageContent shows the last failure reason on both variants', () => {
      mockUseOrderDetail.mockReturnValue(state({ order: failedOrder }))
      const { unmount } = render(<OrderDetailPageContent />)
      expect(lastFailure()?.nextSibling).toHaveTextContent(
        'Your card was declined.',
      )
      unmount()

      render(<OrderDetailPageContent variant="dashboard" />)
      expect(lastFailure()?.nextSibling).toHaveTextContent(
        'Your card was declined.',
      )
    })

    it('OrderDetailPageContent shows no Retry payment on the dashboard', () => {
      mockUseOrderDetail.mockReturnValue(state({ order: failedOrder }))
      render(<OrderDetailPageContent variant="dashboard" />)

      expect(
        screen.queryByRole('button', { name: 'Retry payment' }),
      ).not.toBeInTheDocument()
    })

    it('OrderDetailPageContent shows no Last failure row without a reason', () => {
      mockUseOrderDetail.mockReturnValue(
        state({
          order: {
            ...order,
            paymentStatus: OrderPaymentStatus.PAID,
            payments: [{ ...charge, status: PaymentStatus.PAID }],
          },
        }),
      )
      render(<OrderDetailPageContent />)

      expect(lastFailure()).not.toBeInTheDocument()
    })
  })

  describe('refund lines', () => {
    const retry = jest.fn()
    const refundLine = (
      id: string,
      status: PaymentStatus,
      amount: number,
      failureReason: string | null = null,
    ): OrderPayment => ({
      ...charge,
      id,
      type: PaymentType.REFUND,
      method: PaymentMethod.CARD,
      status,
      amount,
      failureReason,
    })
    const refundedOrder: OrderDetail = {
      ...order,
      status: OrderStatus.CANCELLED,
      paymentStatus: OrderPaymentStatus.PAID,
      payments: [
        {
          ...charge,
          method: PaymentMethod.CARD,
          status: PaymentStatus.PAID,
          transactionId: 'pi_1',
        },
        refundLine('refund-pending', PaymentStatus.PENDING, 5),
        refundLine(
          'refund-failed',
          PaymentStatus.FAILED,
          3,
          'lost_or_stolen_card',
        ),
      ],
    }

    beforeEach(() => {
      mockUseOrderDetail.mockReturnValue(state({ order: refundedOrder }))
      jest.mocked(useRetryRefund).mockReturnValue({
        mutate: retry,
        isPending: false,
      } as unknown as ReturnType<typeof useRetryRefund>)
    })

    it('PaymentPanel labels a pending refund and shows a failed one only to the admin', () => {
      const { unmount } = render(<OrderDetailPageContent />)

      const shopperPayments = section('Payment')
      expect(
        within(shopperPayments).getByText('Refund pending'),
      ).toBeInTheDocument()
      expect(
        within(shopperPayments).queryByText(/lost_or_stolen_card/),
      ).not.toBeInTheDocument()
      unmount()

      render(<OrderDetailPageContent variant="dashboard" />)
      const adminPayments = section('Payment')
      expect(
        within(adminPayments).getByText(/lost_or_stolen_card/),
      ).toBeInTheDocument()
      expect(
        within(adminPayments).getByText('Refund pending'),
      ).toBeInTheDocument()
    })

    it('PaymentPanel retries a failed refund', async () => {
      const user = userEvent.setup()
      render(<OrderDetailPageContent variant="dashboard" />)

      await user.click(
        within(section('Payment')).getByRole('button', {
          name: 'Retry refund',
        }),
      )

      expect(retry).toHaveBeenCalledWith(
        { paymentId: 'refund-failed' },
        expect.any(Object),
      )
    })

    it('PaymentPanel offers no Retry refund on a refund already retried', () => {
      mockUseOrderDetail.mockReturnValue(
        state({
          order: {
            ...refundedOrder,
            payments: refundedOrder.payments.map((payment) =>
              payment.id === 'refund-failed'
                ? { ...payment, retriedAt: '2026-11-25T10:00:00.000Z' }
                : payment,
            ),
          },
        }),
      )
      render(<OrderDetailPageContent variant="dashboard" />)

      expect(
        within(section('Payment')).queryByRole('button', {
          name: 'Retry refund',
        }),
      ).not.toBeInTheDocument()
    })
  })
})
