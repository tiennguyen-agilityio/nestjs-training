import { render, screen } from '@testing-library/react'

import SalePrice from '@/components/SalePrice'

describe('SalePrice', () => {
  it('shows the list price struck through when it is higher', () => {
    render(<SalePrice price={15} listPrice={20} />)

    expect(screen.getByText('$15.00')).toBeInTheDocument()
    expect(screen.getByRole('deletion')).toHaveTextContent('$20.00')
  })

  it('shows only the price when there is no discount', () => {
    const { rerender } = render(<SalePrice price={15} listPrice={15} />)
    expect(screen.queryByRole('deletion')).not.toBeInTheDocument()

    rerender(<SalePrice price={15} />)
    expect(screen.getByText('$15.00')).toBeInTheDocument()
    expect(screen.queryByRole('deletion')).not.toBeInTheDocument()
  })
})
