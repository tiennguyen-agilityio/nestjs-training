import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ShippingMethodStatus } from '@repo/constants'

import CheckoutShippingMethods, {
  type CheckoutShippingMethodsProps,
} from '@/components/CheckoutShippingMethods'
import { API_FALLBACK_ERRORS, NOTICE_MESSAGES } from '@/constants/messages'
import type { ShippingMethod } from '@/types/shippingMethod'

const standard: ShippingMethod = {
  id: 'standard-id',
  name: 'Artisanal Standard',
  description: '3-5 business days',
  price: 0,
  status: ShippingMethodStatus.ACTIVE,
  createdAt: '2026-11-24T00:00:00.000Z',
  updatedAt: '2026-11-24T00:00:00.000Z',
  deletedAt: null,
}

const express: ShippingMethod = {
  ...standard,
  id: 'express-id',
  name: 'Roast Express',
  description: '1-2 business days',
  price: 12,
}

const renderSection = (props: Partial<CheckoutShippingMethodsProps> = {}) => {
  const allProps: CheckoutShippingMethodsProps = {
    methods: [],
    selectedId: '',
    onSelect: jest.fn(),
    isLoading: false,
    isError: false,
    errorMessage: null,
    onRetry: jest.fn(),
    ...props,
  }
  render(<CheckoutShippingMethods {...allProps} />)
  return allProps
}

describe('CheckoutShippingMethods', () => {
  it('shows a skeleton while loading', () => {
    renderSection({ isLoading: true })

    expect(
      screen.getByRole('status', { name: 'Loading delivery options' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
  })

  it('shows the error and refetches on Retry', async () => {
    const user = userEvent.setup()
    const { onRetry } = renderSection({
      isError: true,
      errorMessage: API_FALLBACK_ERRORS.SHIPPING_METHODS_LOAD,
    })

    expect(
      screen.getByText(API_FALLBACK_ERRORS.SHIPPING_METHODS_LOAD),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Retry' }))

    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('keeps the list when a refetch fails', () => {
    renderSection({
      methods: [standard],
      isError: true,
      errorMessage: API_FALLBACK_ERRORS.SHIPPING_METHODS_LOAD,
    })

    expect(
      screen.getByRole('radio', { name: 'Artisanal Standard' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Retry' }),
    ).not.toBeInTheDocument()
  })

  it('shows the empty notice when no method is listed', () => {
    renderSection()

    expect(
      screen.getByText(NOTICE_MESSAGES.SHIPPING_METHODS_EMPTY.MESSAGE),
    ).toBeInTheDocument()
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
  })

  it('shows Free for 0 and the formatted fee otherwise', () => {
    const weekend: ShippingMethod = {
      ...standard,
      id: 'weekend-id',
      name: 'Weekend Drop',
      price: 4.5,
    }
    renderSection({ methods: [standard, express, weekend] })

    expect(screen.getByText('Free')).toBeInTheDocument()
    expect(screen.getByText('$12.00')).toBeInTheDocument()
    expect(screen.getByText('$4.50')).toBeInTheDocument()
  })

  it('checks the selected method and reports a pick', async () => {
    const user = userEvent.setup()
    const { onSelect } = renderSection({
      methods: [standard, express],
      selectedId: standard.id,
    })

    expect(
      screen.getByRole('radio', { name: 'Artisanal Standard' }),
    ).toBeChecked()
    await user.click(screen.getByRole('radio', { name: 'Roast Express' }))

    expect(onSelect).toHaveBeenCalledWith('express-id')
  })
})
