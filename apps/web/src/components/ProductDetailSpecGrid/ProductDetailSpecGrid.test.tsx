import { render, screen } from '@testing-library/react'

import { ProductDetailSpecGrid } from '@/components/ProductDetailSpecGrid'
import {
  DiscountType,
  ProductStatus,
  ProductUnit,
  RoastLevel,
} from '@repo/constants'
import { type Product } from '@/types/product'

const fixture: Product = {
  id: 'p-1',
  categoryId: 'cat',
  name: 'Ethiopian Yirgacheffe',
  description: 'Floral',
  roastLevel: RoastLevel.LIGHT,
  isOrganic: true,
  isFairTrade: true,
  status: ProductStatus.ACTIVE,
  tastingNotes: 'Jasmine, Bergamot',
  origin: 'Yirgacheffe, Ethiopia',
  processingMethod: 'Washed',
  variants: [
    {
      sku: 's',
      size: 250,
      unit: ProductUnit.G,
      name: '250g',
      price: 24,
      discountType: DiscountType.PERCENT,
      discountValue: 0,
      stockQuantity: 40,
    },
  ],
  images: [],
  createdAt: null,
  updatedAt: null,
  deletedAt: null,
}

describe('ProductDetailSpecGrid', () => {
  it('renders origin and processing from product', () => {
    render(<ProductDetailSpecGrid product={fixture} />)

    expect(screen.getByText('Yirgacheffe, Ethiopia')).toBeInTheDocument()
    expect(screen.getByText('Washed')).toBeInTheDocument()
  })

  it('renders tasting notes in Notes card', () => {
    render(<ProductDetailSpecGrid product={fixture} />)

    expect(screen.getByText('Jasmine, Bergamot')).toBeInTheDocument()
  })

  it('exposes data-testid for integration tests', () => {
    render(<ProductDetailSpecGrid product={fixture} />)
    expect(screen.getByTestId('product-detail-spec-grid')).toBeInTheDocument()
  })
})
