import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  OrderPaymentStatus,
  OrderStatus,
  PaymentMethod,
  ShippingStatus,
} from '@repo/constants'

import { ROUTES, dashboardOrderPath } from '@/constants/routes'
import OrdersPageContent from '@/sections/OrdersPageContent'
import type { OrderSummary } from '@/types/order'

const mockUseOrders = jest.fn()
const mockUseDeleteOrder = jest.fn()
const mockUseUpdateOrderStatus = jest.fn()
const mockUseUpdateOrderShippingStatus = jest.fn()
const mockUpdate = jest.fn()
let mockUrlState: Record<string, unknown>

jest.mock('@/hooks/useOrder', () => ({
  useOrders: (...args: unknown[]) => mockUseOrders(...args),
  useDeleteOrder: (...args: unknown[]) => mockUseDeleteOrder(...args),
  useUpdateOrderStatus: (...args: unknown[]) =>
    mockUseUpdateOrderStatus(...args),
  useUpdateOrderShippingStatus: (...args: unknown[]) =>
    mockUseUpdateOrderShippingStatus(...args),
}))

jest.mock('@/hooks/useUrlState', () => ({
  useUrlState: () => ({ state: mockUrlState, update: mockUpdate }),
}))

jest.mock('@/components/Select', () => ({
  Select: ({
    selected,
    onValueChange,
    options,
    ariaLabel,
  }: {
    selected?: string
    onValueChange?: (value: string) => void
    options: { value: string; label: string }[]
    ariaLabel?: string
  }) => (
    <select
      aria-label={ariaLabel}
      value={selected ?? ''}
      onChange={(event) => onValueChange?.(event.target.value)}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
}))

jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}))

describe('OrdersPageContent', () => {
  const orderFixture: OrderSummary = {
    id: 'order-1',
    userId: 'user-1',
    orderNumber: 'OD-1001',
    customer: { firstName: 'John', lastName: 'Doe', email: 'john@example.com' },
    status: OrderStatus.PENDING,
    shippingStatus: ShippingStatus.SHIPPING,
    paymentStatus: OrderPaymentStatus.UNPAID,
    paymentMethod: PaymentMethod.COD,
    itemCount: 1,
    totalAmount: 115,
    createdAt: '2026-04-27T00:00:00.000Z',
  }

  beforeEach(() => {
    jest.clearAllMocks()
    mockUrlState = {
      page: 1,
      search: '',
      limit: 10,
      status: null,
      shippingStatus: null,
    }
    mockUseOrders.mockReturnValue({
      orders: [orderFixture],
      meta: { currentPage: 1, pageCount: 1, limit: 10, totalCount: 1 },
      isLoading: false,
      isError: false,
      errorMessage: null,
      refetch: jest.fn(),
    })
    mockUseDeleteOrder.mockReturnValue({ mutate: jest.fn(), isPending: false })
    mockUseUpdateOrderStatus.mockReturnValue({ mutate: jest.fn() })
    mockUseUpdateOrderShippingStatus.mockReturnValue({ mutate: jest.fn() })
  })

  it("links the view button to the order's details page", () => {
    render(<OrdersPageContent />)

    expect(
      screen.getByRole('link', { name: /View order #OD-1001/i }),
    ).toHaveAttribute('href', dashboardOrderPath('OD-1001'))
  })

  it('OrdersPageContent lists number with its date, customer, total, status and shipping status', () => {
    render(<OrdersPageContent />)

    for (const label of [
      'Order',
      'Customer',
      'Status',
      'Shipping status',
      'Total',
    ]) {
      expect(
        screen.getByRole('columnheader', { name: label }),
      ).toBeInTheDocument()
    }
    const row = within(screen.getAllByRole('row')[1])
    expect(row.getByRole('cell', { name: /^#OD-1001/ })).toHaveTextContent(
      'Apr 27, 2026',
    )
    expect(row.getByRole('cell', { name: /John Doe/ })).toHaveTextContent(
      'john@example.com',
    )
    expect(row.getByRole('cell', { name: '$115.00' })).toBeInTheDocument()
    expect(row.getByRole('cell', { name: /Pending/ })).toBeInTheDocument()
    expect(row.getByRole('cell', { name: 'Shipping' })).toBeInTheDocument()
    expect(
      screen.getByRole('searchbox', { name: 'Search orders' }),
    ).toHaveAttribute(
      'placeholder',
      'Search by order number, customer or email',
    )
  })

  it('OrdersPageContent writes shippingStatus to the URL', async () => {
    const user = userEvent.setup()
    render(<OrdersPageContent />)

    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Shipping status filter' }),
      ShippingStatus.SHIPPING,
    )

    expect(mockUpdate).toHaveBeenCalledWith({
      shippingStatus: ShippingStatus.SHIPPING,
      page: 1,
    })
    expect(
      screen.getByRole('combobox', { name: 'Status filter' }),
    ).toBeInTheDocument()
  })

  it('OrdersPageContent ignores an unknown status in the URL', () => {
    mockUrlState = { ...mockUrlState, status: 'foo', shippingStatus: 'bar' }

    render(<OrdersPageContent />)

    expect(mockUseOrders).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: undefined, shippingStatus: undefined }),
    )
  })

  it('renders the header with PageHeader', () => {
    render(<OrdersPageContent />)

    const header = screen.getByRole('banner')
    const view = within(header)
    expect(view.getByRole('link', { name: 'Dashboard' })).toHaveAttribute(
      'href',
      ROUTES.DASHBOARD,
    )
    const title = view.getByRole('heading', { level: 1, name: 'Orders' })
    expect(title).toHaveClass('text-4xl', 'font-semibold')
    expect(title).not.toHaveClass('text-5xl')
    expect(view.getByRole('paragraph')).toHaveTextContent(
      'Track fulfillment, payments, and customer deliveries.',
    )
    expect(view.queryByRole('button')).toBeNull()
  })
})
