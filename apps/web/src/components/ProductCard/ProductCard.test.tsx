import { render, screen } from '@testing-library/react'
import { RoastLevel } from '@repo/constants'

import ProductCard from '@/components/ProductCard'
import { type RoastCollection } from '@/constants/roast'

jest.mock('next/image', () => ({
  __esModule: true,
  default: ({ src, alt }: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} />
  ),
}))

const item: RoastCollection = {
  id: 'p-1',
  name: 'Huila Bean',
  price: 20,
  salePrice: 20,
  flavorNotes: 'Chocolate',
  roastMeta: '250g · Medium roast',
  roastLevel: RoastLevel.MEDIUM,
  imageUrl: 'https://example.com/bean.jpg',
}

describe('ProductCard', () => {
  it('shows the sale price and the list price struck through when discounted', () => {
    render(<ProductCard item={{ ...item, salePrice: 15 }} />)

    expect(screen.getByText('$15.00')).toBeInTheDocument()
    expect(screen.getByRole('deletion')).toHaveTextContent('$20.00')
  })

  it('shows one price when the product has no discount', () => {
    render(<ProductCard item={item} />)

    expect(screen.getByText('$20.00')).toBeInTheDocument()
    expect(screen.queryByRole('deletion')).not.toBeInTheDocument()
  })
})
