import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'

import { CheckoutPaymentMethod } from '@/components/CheckoutPaymentMethod'
import { PAYMENT_METHOD, type PaymentMethod } from '@/types/checkout'

const Harness = () => {
  const [value, setValue] = useState<PaymentMethod>(PAYMENT_METHOD.STRIPE)
  return <CheckoutPaymentMethod value={value} onChange={setValue} />
}

const SELECTED_DARK = [
  'dark:border-primary',
  'dark:bg-surface-container-high',
  'dark:text-on-surface',
]
const UNSELECTED_DARK = [
  'dark:border-border',
  'dark:bg-surface-container',
  'dark:text-on-surface-variant',
]

const classesOf = (element: HTMLElement) => element.className.split(/\s+/)

describe('CheckoutPaymentMethod', () => {
  it('moves aria-checked to the clicked option', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(screen.getByRole('radio', { name: 'PayPal' }))

    expect(screen.getByRole('radio', { name: 'PayPal' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    expect(screen.getByRole('radio', { name: 'Stripe' })).toHaveAttribute(
      'aria-checked',
      'false',
    )
  })

  it('keeps the selected option distinct in dark mode', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(screen.getByRole('radio', { name: 'PayPal' }))

    const selected = classesOf(screen.getByRole('radio', { name: 'PayPal' }))
    expect(selected).toEqual(expect.arrayContaining(SELECTED_DARK))

    for (const name of ['Stripe', 'Cash on Delivery']) {
      const other = classesOf(screen.getByRole('radio', { name }))
      expect(other).toEqual(expect.arrayContaining(UNSELECTED_DARK))
      expect(other).not.toContain('dark:border-primary')
      expect(other).not.toContain('dark:bg-surface-container-high')
    }
  })
})
