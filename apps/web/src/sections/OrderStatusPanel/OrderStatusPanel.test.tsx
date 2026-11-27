import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAuth } from '@clerk/nextjs'
import { toast } from 'sonner'
import {
  OrderPaymentStatus,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  PaymentType,
  ShippingStatus,
} from '@repo/constants'

import OrderStatusPanel from '@/sections/OrderStatusPanel'
import { DIALOG_MESSAGES, SUCCESS_MESSAGES } from '@/constants/messages'
import { updateOrderShippingStatus, updateOrderStatus } from '@/services/order'
import type { OrderDetail } from '@/types/order'

jest.mock('@clerk/nextjs', () => ({ useAuth: jest.fn() }))
jest.mock('sonner', () => ({ toast: { success: jest.fn() } }))
jest.mock('@/services/order', () => ({
  updateOrderStatus: jest.fn(),
  updateOrderShippingStatus: jest.fn(),
}))

const mockUseAuth = jest.mocked(useAuth)
const mockUpdateOrderStatus = jest.mocked(updateOrderStatus)
const mockUpdateOrderShippingStatus = jest.mocked(updateOrderShippingStatus)

const baseOrder = {
  id: 'o-1',
  orderNumber: 'CH-1',
  status: OrderStatus.PENDING,
  shippingStatus: ShippingStatus.PENDING,
  paymentStatus: OrderPaymentStatus.UNPAID,
  payments: [] as OrderDetail['payments'],
  allowedStatuses: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
  allowedShippingStatuses: [] as ShippingStatus[],
} as OrderDetail

const conflict = {
  ok: false as const,
  status: 409,
  error: 'Cannot move order from CONFIRMED to CONFIRMED',
  errorResponse: {
    statusCode: 409,
    message: 'Conflict',
    errors: [
      {
        errCode: 'statusNotAllowed',
        field: 'status',
        message: 'Cannot move order from CONFIRMED to CONFIRMED',
        description: 'Not allowed. Pick one of the next statuses.',
      },
    ],
  },
}

const renderPanel = (overrides: Partial<OrderDetail> = {}) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const user = userEvent.setup()
  render(
    <QueryClientProvider client={client}>
      <OrderStatusPanel order={{ ...baseOrder, ...overrides }} />
    </QueryClientProvider>,
  )
  return { client, user }
}

const openSelect = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('combobox', { name: 'Next status' }))
  return screen.findByRole('listbox')
}

const choose = async (
  user: ReturnType<typeof userEvent.setup>,
  label: string,
) => {
  await openSelect(user)
  await user.click(screen.getByRole('option', { name: label }))
}

const updateButton = () => screen.getByRole('button', { name: 'Update status' })

const optionsOf = (group: string) =>
  within(screen.getByRole('group', { name: group }))
    .getAllByRole('option')
    .map((option) => ({
      label: option.textContent,
      disabled: option.getAttribute('aria-disabled') === 'true',
    }))

const shippingOrder = {
  status: OrderStatus.CONFIRMED,
  shippingStatus: ShippingStatus.SHIPPING,
  allowedStatuses: [],
  allowedShippingStatuses: [ShippingStatus.DELIVERED, ShippingStatus.RETURNED],
}

describe('OrderStatusPanel', () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue({
      getToken: jest.fn().mockResolvedValue('tok'),
    } as unknown as ReturnType<typeof useAuth>)
    mockUpdateOrderStatus.mockResolvedValue({ ok: true })
    mockUpdateOrderShippingStatus.mockResolvedValue({ ok: true })
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('OrderStatusPanel lists every other status and disables the ones not allowed (AC8)', async () => {
    const { user } = renderPanel(shippingOrder)

    await openSelect(user)

    expect(optionsOf('Order')).toEqual([
      { label: 'Order → Pending', disabled: true },
      { label: 'Order → Completed', disabled: true },
      { label: 'Order → Cancelled', disabled: true },
    ])
    expect(optionsOf('Shipping')).toEqual([
      { label: 'Shipping → Pending', disabled: true },
      { label: 'Shipping → Delivered', disabled: false },
      { label: 'Shipping → Returned', disabled: false },
    ])
  })

  it('OrderStatusPanel enables the allowed order steps', async () => {
    const { user } = renderPanel()

    await openSelect(user)

    expect(optionsOf('Order')).toEqual([
      { label: 'Order → Confirmed', disabled: false },
      { label: 'Order → Completed', disabled: true },
      { label: 'Order → Cancelled', disabled: false },
    ])
    expect(optionsOf('Shipping').every((option) => option.disabled)).toBe(true)
  })

  it('OrderStatusPanel shows no further changes when nothing is allowed', () => {
    renderPanel({
      status: OrderStatus.CANCELLED,
      shippingStatus: ShippingStatus.SHIPPING,
      allowedStatuses: [],
      allowedShippingStatuses: [],
    })

    expect(
      screen.getByText('This order is closed. No further changes.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Next status' })).toBeNull()
  })

  it('OrderStatusPanel keeps an open order with no allowed move out of the closed state', async () => {
    const { user } = renderPanel({
      allowedStatuses: [],
      allowedShippingStatuses: [],
    })

    expect(
      screen.queryByText('This order is closed. No further changes.'),
    ).toBeNull()
    await openSelect(user)
    expect(
      [...optionsOf('Order'), ...optionsOf('Shipping')].every(
        (option) => option.disabled,
      ),
    ).toBe(true)
  })

  it('OrderStatusPanel asks before marking the order returned', async () => {
    const { user } = renderPanel(shippingOrder)

    await choose(user, 'Shipping → Returned')
    await user.click(updateButton())

    const dialog = await screen.findByRole('alertdialog')
    expect(
      within(dialog).getByText(DIALOG_MESSAGES.ORDER.RETURN.TITLE),
    ).toBeInTheDocument()
    expect(
      within(dialog).getByText(
        DIALOG_MESSAGES.ORDER.RETURN.DESCRIPTION('CH-1'),
      ),
    ).toBeInTheDocument()
    expect(mockUpdateOrderShippingStatus).not.toHaveBeenCalled()

    await user.click(
      within(dialog).getByRole('button', {
        name: DIALOG_MESSAGES.ORDER.RETURN.ACTION,
      }),
    )

    await waitFor(() =>
      expect(mockUpdateOrderShippingStatus).toHaveBeenCalledWith(
        'o-1',
        ShippingStatus.RETURNED,
        { getToken: expect.any(Function) },
      ),
    )
  })

  it('OrderStatusPanel disables Update status until a step is chosen', async () => {
    const { user } = renderPanel()

    expect(updateButton()).toBeDisabled()
    await choose(user, 'Order → Confirmed')
    expect(updateButton()).toBeEnabled()
  })

  it('OrderStatusPanel confirms an order and invalidates the orders queries (AC4)', async () => {
    const { client, user } = renderPanel()
    const listKey = ['orders', 'all', 'admin-1', 1]
    client.setQueryData(listKey, { orders: [] })

    await choose(user, 'Order → Confirmed')
    await user.click(updateButton())

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        SUCCESS_MESSAGES.ORDER_STATUS_UPDATED,
      ),
    )
    expect(mockUpdateOrderStatus).toHaveBeenCalledWith(
      'o-1',
      OrderStatus.CONFIRMED,
      { getToken: expect.any(Function) },
    )
    expect(client.getQueryState(listKey)?.isInvalidated).toBe(true)
  })

  it('OrderStatusPanel moves the shipping to SHIPPING', async () => {
    const { user } = renderPanel({
      status: OrderStatus.CONFIRMED,
      allowedStatuses: [OrderStatus.CANCELLED],
      allowedShippingStatuses: [ShippingStatus.SHIPPING],
    })

    await choose(user, 'Shipping → Shipping')
    await user.click(updateButton())

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        SUCCESS_MESSAGES.ORDER_SHIPPING_STATUS_UPDATED,
      ),
    )
    expect(mockUpdateOrderShippingStatus).toHaveBeenCalledWith(
      'o-1',
      ShippingStatus.SHIPPING,
      { getToken: expect.any(Function) },
    )
    expect(mockUpdateOrderStatus).not.toHaveBeenCalled()
  })

  it('OrderStatusPanel shows the API error under the select', async () => {
    mockUpdateOrderStatus.mockResolvedValueOnce(conflict)
    const { user } = renderPanel()

    await choose(user, 'Order → Confirmed')
    await user.click(updateButton())

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Cannot move order from CONFIRMED to CONFIRMED',
    )
    expect(toast.success).not.toHaveBeenCalled()
    expect(updateButton()).toBeDisabled()
    expect(
      screen.getByRole('combobox', { name: 'Next status' }),
    ).toHaveTextContent('Choose the next status…')
  })

  it('OrderStatusPanel asks before cancelling', async () => {
    const { user } = renderPanel()

    await choose(user, 'Order → Cancelled')
    await user.click(updateButton())

    const dialog = await screen.findByRole('alertdialog')
    expect(
      within(dialog).getByText(DIALOG_MESSAGES.ORDER.CANCEL.TITLE),
    ).toBeInTheDocument()
    expect(
      within(dialog).getByText(
        DIALOG_MESSAGES.ORDER.CANCEL.DESCRIPTION('CH-1'),
      ),
    ).toBeInTheDocument()
    expect(mockUpdateOrderStatus).not.toHaveBeenCalled()

    await user.click(
      within(dialog).getByRole('button', {
        name: DIALOG_MESSAGES.ORDER.CANCEL.ACTION,
      }),
    )

    await waitFor(() =>
      expect(mockUpdateOrderStatus).toHaveBeenCalledWith(
        'o-1',
        OrderStatus.CANCELLED,
        { getToken: expect.any(Function) },
      ),
    )
  })

  const paidCard = {
    paymentStatus: OrderPaymentStatus.PAID,
    payments: [
      {
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
      },
    ],
  }

  it('the cancel dialog of a paid online order says the refund is the next step (AC9)', async () => {
    const { user } = renderPanel({
      ...paidCard,
      status: OrderStatus.CONFIRMED,
      allowedStatuses: [OrderStatus.CANCELLED],
    })

    await choose(user, 'Order → Cancelled')
    await user.click(updateButton())

    const dialog = await screen.findByRole('alertdialog')
    expect(
      within(dialog).getByText(DIALOG_MESSAGES.ORDER.CANCEL.ADMIN_REFUND_NEXT),
    ).toBeInTheDocument()
    expect(
      within(dialog).queryByText(
        DIALOG_MESSAGES.ORDER.CANCEL.WILL_BE_REFUNDED,
        { exact: false },
      ),
    ).toBeNull()
    expect(
      within(dialog).queryByText(
        DIALOG_MESSAGES.ORDER.CANCEL.DESCRIPTION('CH-1'),
      ),
    ).toBeNull()
  })

  it('the cancel dialog of a COD order keeps the cancel description', async () => {
    const { user } = renderPanel()

    await choose(user, 'Order → Cancelled')
    await user.click(updateButton())

    const dialog = await screen.findByRole('alertdialog')
    expect(
      within(dialog).getByText(
        DIALOG_MESSAGES.ORDER.CANCEL.DESCRIPTION('CH-1'),
      ),
    ).toBeInTheDocument()
    expect(
      within(dialog).queryByText(
        DIALOG_MESSAGES.ORDER.CANCEL.ADMIN_REFUND_NEXT,
      ),
    ).toBeNull()
    expect(
      within(dialog).queryByText(
        DIALOG_MESSAGES.ORDER.CANCEL.WILL_BE_REFUNDED,
        { exact: false },
      ),
    ).toBeNull()
  })

  it('the return dialog of a paid order adds the refund-next sentence', async () => {
    const { user } = renderPanel({ ...paidCard, ...shippingOrder })

    await choose(user, 'Shipping → Returned')
    await user.click(updateButton())

    const dialog = await screen.findByRole('alertdialog')
    expect(
      within(dialog).getByText(
        DIALOG_MESSAGES.ORDER.RETURN.DESCRIPTION('CH-1'),
      ),
    ).toBeInTheDocument()
    expect(
      within(dialog).getByText(DIALOG_MESSAGES.ORDER.RETURN.REFUND_NEXT),
    ).toBeInTheDocument()
    expect(
      within(dialog).queryByText(
        DIALOG_MESSAGES.ORDER.CANCEL.WILL_BE_REFUNDED,
        { exact: false },
      ),
    ).toBeNull()
  })
})
