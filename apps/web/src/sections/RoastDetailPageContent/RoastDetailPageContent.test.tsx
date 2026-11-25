import { render, screen } from '@testing-library/react'
import type React from 'react'
import { useParams, useRouter } from 'next/navigation'

import RoastDetailPageContent from '@/sections/RoastDetailPageContent'
import { useProductById } from '@/hooks/useProduct'
import {
  DiscountType,
  ProductStatus,
  ProductUnit,
  RoastLevel,
} from '@repo/constants'
import { LOW_STOCK_LABEL, OUT_OF_STOCK_LABEL } from '@/constants/order'
import { type Product } from '@/types/product'

jest.mock('next/navigation', () => ({
  useParams: jest.fn(),
  useRouter: jest.fn(),
}))

jest.mock('@/hooks/useProduct', () => ({
  useProductById: jest.fn(),
}))

// ProductPurchasePanel adds to the cart through useCart (Clerk + the API).
jest.mock('@/hooks/useCart', () => ({
  useCart: () => ({ addItem: jest.fn(async () => ({ ok: true })) }),
}))

jest.mock('next/image', () => ({
  __esModule: true,
  default: ({
    alt,
    src,
    fill: _f,
    priority: _p,
    ...rest
  }: React.ImgHTMLAttributes<HTMLImageElement> & {
    src: string
    fill?: boolean
    priority?: boolean
  }) => <img alt={alt ?? ''} src={src} {...rest} />,
}))

beforeAll(() => {
  globalThis.IntersectionObserver = class {
    readonly root = null
    readonly rootMargin = ''
    readonly scrollMargin = ''
    readonly thresholds = []
    observe = jest.fn()
    unobserve = jest.fn()
    disconnect = jest.fn()
    takeRecords = () => []
  }

  globalThis.ResizeObserver = class {
    observe = jest.fn()
    unobserve = jest.fn()
    disconnect = jest.fn()
  }
})

const mockUseParams = jest.mocked(useParams)
const mockUseRouter = jest.mocked(useRouter)
const mockUseProductById = jest.mocked(useProductById)

const productFixture: Product = {
  id: 'product-1',
  categoryId: 'whole-bean',
  name: 'Ethiopian Yirgacheffe',
  description: 'Floral and citrus profile for pour-over.',
  roastLevel: RoastLevel.LIGHT,
  isOrganic: true,
  isFairTrade: true,
  status: ProductStatus.ACTIVE,
  tastingNotes: 'Jasmine, Bergamot',
  origin: 'Yirgacheffe, Ethiopia',
  processingMethod: 'Washed',
  variants: [
    {
      sku: 'SKU-1',
      size: 250,
      unit: ProductUnit.G,
      name: '250g',
      price: 24,
      discountType: DiscountType.PERCENT,
      discountValue: 0,
      stockQuantity: 40,
    },
  ],
  images: [
    {
      url: 'https://lh3.googleusercontent.com/aida-public/AB6AXuA0ngZCuIkhGMVirQTIbqtvfqarQ6-b4am3esJOzM2TSdTr84lLHbLlhkT5ZBHMGQgfls4_95hLTBZb464-5Qcamdz4bdtNWwv85SUsugdUY0fTAn12kPSPUQBxQZwlp8zcAnISquJWCjCmrKHUhV4gks0swGFcTLKbGVFVyJLeBy6XtWOjROa2ylkENkFS22a59JgxpfkzOpu3jDAutGavF13QKQp9vKb6vCZVdyYUMzDYQuf5tnefPSj4RN3DcZjuBQFbR5yrCvE',
      isPrimary: true,
      sortOrder: 0,
    },
  ],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  deletedAt: null,
}

describe('RoastDetailPageContent', () => {
  beforeEach(() => {
    mockUseParams.mockReturnValue({ id: 'product-1' })
    mockUseRouter.mockReturnValue({
      push: jest.fn(),
    } as unknown as ReturnType<typeof useRouter>)
  })

  it('shows loading skeleton when loading', () => {
    mockUseProductById.mockReturnValue({
      product: null,
      isLoading: true,
      isError: false,
      errorMessage: null,
      refetch: jest.fn(),
    })

    render(<RoastDetailPageContent />)
    expect(screen.getByTestId('roast-detail-loading')).toBeInTheDocument()
  })

  it('shows error message and retry when error', () => {
    mockUseProductById.mockReturnValue({
      product: null,
      isLoading: false,
      isError: true,
      errorMessage: 'Network down',
      refetch: jest.fn(),
    })

    render(<RoastDetailPageContent />)
    expect(screen.getByText('Network down')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Retry/i })).toBeInTheDocument()
  })

  it('shows Product not found for a product the API does not return', () => {
    mockUseProductById.mockReturnValue({
      product: null,
      isLoading: false,
      isError: true,
      errorMessage: 'Product not found',
      refetch: jest.fn(),
    })

    render(<RoastDetailPageContent />)
    expect(screen.getByText('Product not found')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Retry/i })).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Back to roasts' }),
    ).toHaveAttribute('href', '/roasts')
  })

  it('reads the product without asAdmin', () => {
    mockUseProductById.mockReturnValue({
      product: productFixture,
      isLoading: false,
      isError: false,
      errorMessage: null,
      refetch: jest.fn(),
    })

    render(<RoastDetailPageContent />)
    expect(mockUseProductById).toHaveBeenCalled()
    for (const args of mockUseProductById.mock.calls) {
      expect(args).toEqual(['product-1'])
    }
  })

  it('renders product title and spec grid when loaded', () => {
    mockUseProductById.mockReturnValue({
      product: productFixture,
      isLoading: false,
      isError: false,
      errorMessage: null,
      refetch: jest.fn(),
    })

    render(<RoastDetailPageContent />)

    expect(
      screen.getByRole('heading', { name: 'Ethiopian Yirgacheffe' }),
    ).toBeInTheDocument()
    expect(screen.getByTestId('product-detail-spec-grid')).toBeInTheDocument()
    expect(screen.getByTestId('product-purchase-panel')).toBeInTheDocument()
    expect(screen.getByTestId('product-reviews-section')).toBeInTheDocument()
  })

  it('shows the variant name', () => {
    mockUseProductById.mockReturnValue({
      product: productFixture,
      isLoading: false,
      isError: false,
      errorMessage: null,
      refetch: jest.fn(),
    })

    render(<RoastDetailPageContent />)

    expect(screen.getByText('250g')).toBeInTheDocument()
  })

  it('shows the sale price with the list price struck through', () => {
    mockUseProductById.mockReturnValue({
      product: {
        ...productFixture,
        variants: [{ ...productFixture.variants[0], discountValue: 25 }],
      },
      isLoading: false,
      isError: false,
      errorMessage: null,
      refetch: jest.fn(),
    })

    render(<RoastDetailPageContent />)

    expect(screen.getByText('$18.00')).toBeInTheDocument()
    expect(screen.getByRole('deletion')).toHaveTextContent('$24.00')
  })

  it('shows the Low Stock badge on the image when stock is below the threshold', () => {
    mockUseProductById.mockReturnValue({
      product: {
        ...productFixture,
        variants: [{ ...productFixture.variants[0], stockQuantity: 3 }],
      },
      isLoading: false,
      isError: false,
      errorMessage: null,
      refetch: jest.fn(),
    })

    render(<RoastDetailPageContent />)

    expect(screen.getByText(LOW_STOCK_LABEL)).toBeInTheDocument()
  })

  it('shows no stock badge when stock is plentiful', () => {
    mockUseProductById.mockReturnValue({
      product: productFixture,
      isLoading: false,
      isError: false,
      errorMessage: null,
      refetch: jest.fn(),
    })

    render(<RoastDetailPageContent />)

    expect(screen.queryByText(LOW_STOCK_LABEL)).not.toBeInTheDocument()
    expect(screen.queryByText(OUT_OF_STOCK_LABEL)).not.toBeInTheDocument()
  })
})
