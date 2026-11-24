import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ShippingMethodStatus } from '@repo/constants'

import ShippingMethodTableRow, { type ShippingMethodTableRowProps } from '.'
import { NOTICE_MESSAGES } from '@/constants/messages'
import { ROUTES, dashboardEditPath } from '@/constants/routes'
import type { ShippingMethod } from '@/types/shippingMethod'
import { formatPrice } from '@/utils/common'

const method: ShippingMethod = {
  id: 'sm-1',
  name: 'Roast Express',
  description: '1-2 business days',
  price: 12,
  status: ShippingMethodStatus.ACTIVE,
  createdAt: '2026-11-24T00:00:00.000Z',
  updatedAt: '2026-11-24T00:00:00.000Z',
  deletedAt: null,
}

const renderRow = (props: Partial<ShippingMethodTableRowProps> = {}) =>
  render(
    <table>
      <tbody>
        <tr>
          <ShippingMethodTableRow shippingMethod={method} {...props} />
        </tr>
      </tbody>
    </table>,
  )

describe('ShippingMethodTableRow', () => {
  it('shows the name, description, fee and status', () => {
    renderRow()

    expect(screen.getByText('Roast Express')).toBeInTheDocument()
    expect(screen.getByText('1-2 business days')).toBeInTheDocument()
    expect(screen.getByText(formatPrice(12))).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Change status for Roast Express' }),
    ).toHaveTextContent(ShippingMethodStatus.ACTIVE)
    expect(
      screen.getByRole('link', { name: 'Edit Roast Express' }),
    ).toHaveAttribute(
      'href',
      dashboardEditPath(ROUTES.DASHBOARD_SHIPPING_METHODS, 'sm-1'),
    )
  })

  it('changes the status from the status menu', async () => {
    const user = userEvent.setup()
    const onRequestStatusChange = jest.fn()
    renderRow({ onRequestStatusChange })

    expect(
      screen.queryByRole('button', { name: /^(Activate|Deactivate) / }),
    ).not.toBeInTheDocument()

    await user.click(
      screen.getByRole('button', { name: 'Change status for Roast Express' }),
    )
    const menu = await screen.findByRole('menu')
    expect(
      within(menu).getByRole('menuitem', { name: 'Active' }),
    ).toHaveAttribute('aria-disabled', 'true')
    await user.click(within(menu).getByRole('menuitem', { name: 'Inactive' }))

    expect(onRequestStatusChange).toHaveBeenCalledWith(
      method,
      ShippingMethodStatus.INACTIVE,
    )
  })

  it('disables the status menu while its request runs', () => {
    renderRow({ isStatusPending: true })

    expect(
      screen.getByRole('button', { name: 'Change status for Roast Express' }),
    ).toBeDisabled()
  })

  it('asks to delete through onRequestDelete', async () => {
    const user = userEvent.setup()
    const onRequestDelete = jest.fn()
    renderRow({ onRequestDelete })

    await user.click(
      screen.getByRole('button', { name: 'Delete Roast Express' }),
    )

    expect(onRequestDelete).toHaveBeenCalledWith(method)
  })

  it('greys out a deleted method and disables Edit, the status menu and Delete', () => {
    renderRow({
      shippingMethod: { ...method, deletedAt: '2026-11-24T01:00:00.000Z' },
    })

    const controls = [
      screen.getByRole('button', { name: 'Edit Roast Express' }),
      screen.getByRole('button', { name: 'Change status for Roast Express' }),
      screen.getByRole('button', { name: 'Delete Roast Express' }),
    ]
    controls.forEach((control) => {
      expect(control).toBeDisabled()
      expect(control).toHaveAttribute(
        'title',
        NOTICE_MESSAGES.SHIPPING_METHOD_DELETED_LOCKED,
      )
    })
    expect(
      screen.queryByRole('link', { name: 'Edit Roast Express' }),
    ).not.toBeInTheDocument()
  })
})
