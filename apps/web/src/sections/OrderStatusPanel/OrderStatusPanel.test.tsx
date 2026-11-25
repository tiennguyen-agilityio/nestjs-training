import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAuth } from '@clerk/nextjs'
import { toast } from 'sonner'
import {
  OrderPaymentStatus,
  OrderStatus,
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

  it('OrderStatusPanel offers only the next steps', async () => {
    const { user } = renderPanel()

    await openSelect(user)

    expect(
      screen.getAllByRole('option').map((option) => option.textContent),
    ).toEqual(['Order → Confirmed', 'Order → Cancelled', 'Shipping → Shipping'])
    expect(
      within(screen.getByRole('group', { name: 'Order' }))
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Order → Confirmed', 'Order → Cancelled'])
    expect(
      within(screen.getByRole('group', { name: 'Shipping' }))
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Shipping → Shipping'])
  })

  it('OrderStatusPanel offers shipping steps on a cancelled order', async () => {
    const { user } = renderPanel({ status: OrderStatus.CANCELLED })

    await openSelect(user)

    expect(
      screen.getAllByRole('option').map((option) => option.textContent),
    ).toEqual(['Shipping → Shipping'])
    expect(screen.queryByRole('group', { name: 'Order' })).toBeNull()
  })

  it('OrderStatusPanel shows no further changes on a closed order', () => {
    renderPanel({
      status: OrderStatus.COMPLETED,
      shippingStatus: ShippingStatus.DELIVERED,
    })

    expect(
      screen.getByText('This order is closed. No further changes.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Next status' })).toBeNull()
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
    const { user } = renderPanel()

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

  it('OrderStatusPanel says the payment is not refunded for a paid order', async () => {
    const { user } = renderPanel({
      status: OrderStatus.CONFIRMED,
      paymentStatus: OrderPaymentStatus.PAID,
    })

    await choose(user, 'Order → Cancelled')
    await user.click(updateButton())

    const dialog = await screen.findByRole('alertdialog')
    expect(
      within(dialog).getByText(DIALOG_MESSAGES.ORDER.CANCEL.NOT_REFUNDED, {
        exact: false,
      }),
    ).toBeInTheDocument()
  })

  it('OrderStatusPanel says nothing about refunds for an unpaid order', async () => {
    const { user } = renderPanel()

    await choose(user, 'Order → Cancelled')
    await user.click(updateButton())

    const dialog = await screen.findByRole('alertdialog')
    expect(
      within(dialog).queryByText(DIALOG_MESSAGES.ORDER.CANCEL.NOT_REFUNDED, {
        exact: false,
      }),
    ).toBeNull()
  })
})
