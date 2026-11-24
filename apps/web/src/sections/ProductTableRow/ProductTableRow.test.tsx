import { fireEvent, render, screen } from '@testing-library/react'

import { ProductTableRow } from '@/sections/ProductTableRow'
import {
  DiscountType,
  ProductStatus,
  ProductUnit,
  RoastLevel,
} from '@repo/constants'

const baseProduct = {
  id: 'p-1',
  categoryId: 'cat-1',
  name: 'Test Product',
  description: '',
  roastLevel: RoastLevel.LIGHT,
  isOrganic: true,
  isFairTrade: true,
  status: ProductStatus.ACTIVE,
  tastingNotes: '',
  origin: 'Ethiopia',
  processingMethod: 'Washed',
  variants: [
    {
      sku: 'S1',
      size: 250,
      unit: ProductUnit.G,
      name: '250g',
      price: 12,
      discountType: DiscountType.PERCENT,
      discountValue: 0,
      stockQuantity: 1,
    },
  ],
  images: [],
  createdAt: null,
  updatedAt: null,
  deletedAt: null as string | null,
}

const renderRow = (
  product: typeof baseProduct,
  onRequestDelete = jest.fn(),
) => {
  render(
    <table>
      <tbody>
        <tr>
          <ProductTableRow
            product={product}
            categoryOptions={[{ value: 'cat-1', label: 'Cat' }]}
            onRequestDelete={onRequestDelete}
          />
        </tr>
      </tbody>
    </table>,
  )
  return onRequestDelete
}

describe('ProductTableRow', () => {
  it('sums stockQuantity', () => {
    const [first] = baseProduct.variants
    renderRow({
      ...baseProduct,
      variants: [
        { ...first, stockQuantity: 7 },
        { ...first, sku: 'S2', stockQuantity: 5 },
      ],
    })

    expect(screen.getByRole('cell', { name: '12' })).toBeInTheDocument()
  })

  it('greys a deleted row and disables Edit and Delete', () => {
    const onRequestDelete = renderRow({
      ...baseProduct,
      status: ProductStatus.ARCHIVED,
      deletedAt: '2026-10-30T00:00:00.000Z',
    })

    expect(
      screen.getByRole('link', { name: /edit test product/i }),
    ).toHaveAttribute('aria-disabled', 'true')
    const deleteButton = screen.getByRole('button', {
      name: /delete test product/i,
    })
    expect(deleteButton).toBeDisabled()
    fireEvent.click(deleteButton)
    expect(onRequestDelete).not.toHaveBeenCalled()
  })

  it('keeps Edit and Delete on for a live Archived product', () => {
    renderRow({ ...baseProduct, status: ProductStatus.ARCHIVED })

    expect(
      screen.getByRole('link', { name: /edit test product/i }),
    ).toHaveAttribute('aria-disabled', 'false')
    expect(
      screen.getByRole('button', { name: /delete test product/i }),
    ).toBeEnabled()
  })

  it('calls onRequestDelete when delete is clicked', () => {
    const onRequestDelete = jest.fn()
    render(
      <table>
        <tbody>
          <tr>
            <ProductTableRow
              product={baseProduct}
              categoryOptions={[{ value: 'cat-1', label: 'Cat' }]}
              onRequestDelete={onRequestDelete}
            />
          </tr>
        </tbody>
      </table>,
    )
    fireEvent.click(
      screen.getByRole('button', { name: /delete test product/i }),
    )
    expect(onRequestDelete).toHaveBeenCalledTimes(1)
    expect(onRequestDelete).toHaveBeenCalledWith(baseProduct)
  })

  it('disables delete when onRequestDelete is not provided', () => {
    render(
      <table>
        <tbody>
          <tr>
            <ProductTableRow
              product={baseProduct}
              categoryOptions={[{ value: 'cat-1', label: 'Cat' }]}
            />
          </tr>
        </tbody>
      </table>,
    )
    expect(
      screen.getByRole('button', { name: /delete test product/i }),
    ).toBeDisabled()
  })

  it('shows full category label in badge (wraps instead of clipping)', () => {
    const categoryName = 'Ground Coffee'

    render(
      <table>
        <tbody>
          <tr>
            <ProductTableRow
              product={baseProduct}
              categoryOptions={[{ value: 'cat-1', label: categoryName }]}
            />
          </tr>
        </tbody>
      </table>,
    )

    expect(screen.getByText(categoryName)).toBeVisible()
  })

  it('sets title on product name for long labels', () => {
    const longName = 'A'.repeat(120)

    render(
      <table>
        <tbody>
          <tr>
            <ProductTableRow
              product={{ ...baseProduct, name: longName }}
              categoryOptions={[{ value: 'cat-1', label: 'Cat' }]}
            />
          </tr>
        </tbody>
      </table>,
    )

    const nameEl = screen.getByText(longName)
    expect(nameEl).toHaveAttribute('title', longName)
  })
})
