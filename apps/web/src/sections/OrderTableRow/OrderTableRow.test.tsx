import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import {
  OrderPaymentStatus,
  OrderStatus,
  PaymentMethod,
  ShippingStatus,
} from '@repo/constants'

import { dashboardOrderPath } from '@/constants/routes'
import type { OrderSummary } from '@/types/order'

import { OrderTableRow } from './index'

function makeOrder(overrides: Partial<OrderSummary> = {}): OrderSummary {
  return {
    id: 'ord-1',
    userId: 'user-1',
    orderNumber: 'SB-9281',
    customer: {
      firstName: 'Elena',
      lastName: 'Vance',
      email: 'elena@example.com',
    },
    status: OrderStatus.PENDING,
    shippingStatus: ShippingStatus.SHIPPING,
    paymentStatus: OrderPaymentStatus.UNPAID,
    paymentMethod: PaymentMethod.COD,
    itemCount: 2,
    totalAmount: 115,
    createdAt: '2023-10-24T12:00:00.000Z',
    ...overrides,
  }
}

describe('OrderTableRow', () => {
  it('renders order id, customer, and distinct status badges', () => {
    const order = makeOrder()
    render(
      <table>
        <tbody>
          <tr>
            <OrderTableRow order={order} />
          </tr>
        </tbody>
      </table>,
    )

    expect(screen.getByText('#SB-9281')).toBeInTheDocument()
    expect(screen.getByText('Elena Vance')).toBeInTheDocument()
    const row = screen.getByRole('row')
    expect(within(row).getByText('Pending')).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /View order #SB-9281/i }),
    ).toHaveAttribute('href', dashboardOrderPath('SB-9281'))
    expect(
      screen.getByRole('button', { name: /Delete order #SB-9281/i }),
    ).toBeDisabled()
  })

  it("OrderTableRow links View to the order's details page", () => {
    render(
      <table>
        <tbody>
          <tr>
            <OrderTableRow order={makeOrder()} />
          </tr>
        </tbody>
      </table>,
    )

    expect(
      screen.getByRole('link', { name: 'View order #SB-9281' }),
    ).toHaveAttribute('href', dashboardOrderPath('SB-9281'))
  })

  it('does not call onRequestDelete when delete is clicked (disabled: order feature not implemented yet)', async () => {
    const user = userEvent.setup()
    const order = makeOrder()
    const onRequestDelete = jest.fn()

    render(
      <table>
        <tbody>
          <tr>
            <OrderTableRow order={order} onRequestDelete={onRequestDelete} />
          </tr>
        </tbody>
      </table>,
    )

    await user.click(
      screen.getByRole('button', { name: /Delete order #SB-9281/i }),
    )

    expect(onRequestDelete).not.toHaveBeenCalled()
  })

  it('disables delete action when isDeleteDisabled is true', () => {
    const order = makeOrder()
    render(
      <table>
        <tbody>
          <tr>
            <OrderTableRow order={order} isDeleteDisabled />
          </tr>
        </tbody>
      </table>,
    )

    expect(
      screen.getByRole('button', { name: /Delete order #SB-9281/i }),
    ).toBeDisabled()
  })

  it('renders number with its date, customer name and email, status, shipping status and total', () => {
    render(
      <table>
        <tbody>
          <tr>
            <OrderTableRow order={makeOrder()} />
          </tr>
        </tbody>
      </table>,
    )

    const row = within(screen.getByRole('row'))
    expect(row.getByRole('cell', { name: /^#SB-9281/ })).toHaveTextContent(
      'Oct 24, 2023',
    )
    expect(row.getByRole('cell', { name: /Elena Vance/ })).toHaveTextContent(
      'elena@example.com',
    )
    expect(row.getByRole('cell', { name: /Pending/ })).toBeInTheDocument()
    expect(row.getByRole('cell', { name: 'Shipping' })).toBeInTheDocument()
    expect(row.getByRole('cell', { name: '$115.00' })).toBeInTheDocument()
  })

  it('keeps Delete and the status dropdown disabled', () => {
    render(
      <table>
        <tbody>
          <tr>
            <OrderTableRow order={makeOrder()} />
          </tr>
        </tbody>
      </table>,
    )

    expect(
      screen.getByRole('button', { name: 'Delete order #SB-9281' }),
    ).toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'Change order status for #SB-9281' }),
    ).toBeDisabled()
  })

  it('sets title on truncated order id display', () => {
    const longNumber = `SB-${'9'.repeat(40)}`
    const order = makeOrder({ orderNumber: longNumber })

    render(
      <table>
        <tbody>
          <tr>
            <OrderTableRow order={order} />
          </tr>
        </tbody>
      </table>,
    )

    const idCell = screen.getByText(`#${longNumber}`)
    expect(idCell).toHaveAttribute('title', `#${longNumber}`)
  })
})
