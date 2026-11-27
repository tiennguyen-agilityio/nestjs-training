import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type React from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

import RoastsPage from '@/app/(shop)/roasts/page'
import { PAGE_SIZE } from '@/constants/common'
import { ROAST_LEVEL_OPTIONS } from '@/constants/roast'
import { useProducts } from '@/hooks/useProduct'
import {
  DiscountType,
  ProductStatus,
  ProductUnit,
  RoastLevel,
} from '@repo/constants'
import { type Product } from '@/types/product'

jest.mock('next/navigation', () => ({
  usePathname: jest.fn(),
  useRouter: jest.fn(),
  useSearchParams: jest.fn(),
}))

jest.mock('@/hooks/useProduct', () => ({
  useProducts: jest.fn(),
}))

jest.mock('next/image', () => ({
  __esModule: true,
  default: ({
    alt,
    src,
    ...rest
  }: React.ImgHTMLAttributes<HTMLImageElement> & { src: string }) => (
    <img alt={alt ?? ''} src={src} {...rest} />
  ),
}))

const mockUsePathname = jest.mocked(usePathname)
const mockUseRouter = jest.mocked(useRouter)
const mockUseSearchParams = jest.mocked(useSearchParams)
const mockUseProducts = jest.mocked(useProducts)

const shopProductFixture: Product[] = [
  {
    id: 'product-1',
    categoryId: 'whole-bean',
    name: 'Ethiopian Yirgacheffe',
    description: 'Floral and citrus profile',
    roastLevel: RoastLevel.LIGHT,
    isOrganic: true,
    isFairTrade: true,
    status: ProductStatus.ACTIVE,
    tastingNotes: 'Lemon, bergamot, jasmine',
    origin: 'Ethiopia',
    processingMethod: 'Washed',
    variants: [
      {
        sku: 'SKU-1',
        size: 250,
        unit: ProductUnit.G,
        name: '250g',
        price: 24,
        discountType: DiscountType.PERCENT,
        discountValue: 10,
        stockQuantity: 42,
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
  },
]

describe('Roasts route page', () => {
  beforeEach(() => {
    mockUsePathname.mockReturnValue('/roasts')
    mockUseRouter.mockReturnValue({
      replace: jest.fn(),
    } as unknown as ReturnType<typeof useRouter>)
    mockUseSearchParams.mockReturnValue(
      new URLSearchParams('') as ReturnType<typeof useSearchParams>,
    )
    mockUseProducts.mockReturnValue({
      products: shopProductFixture,
      meta: {
        limit: PAGE_SIZE,
        currentPage: 1,
        pageCount: 1,
        totalCount: 1,
      },
      isLoading: false,
      isFetching: false,
      isError: false,
      errorMessage: null,
      refetch: jest.fn(),
    })
  })

  it('renders roast page content from products API', () => {
    render(<RoastsPage />)

    expect(
      screen.getByRole('heading', { name: 'The Sensory Brew Shop' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Ethiopian Yirgacheffe')).toBeInTheDocument()
  })

  it('checks every roast level again when the shopper unchecks the last one', async () => {
    const user = userEvent.setup()
    const replace = jest.fn()
    mockUseRouter.mockReturnValue({
      replace,
    } as unknown as ReturnType<typeof useRouter>)
    mockUseSearchParams.mockReturnValue(
      new URLSearchParams(`roastLevel=${RoastLevel.DARK}`) as ReturnType<
        typeof useSearchParams
      >,
    )
    const { rerender } = render(<RoastsPage />)

    await user.click(screen.getByRole('checkbox', { name: 'Dark Roast' }))

    const [nextUrl] = replace.mock.calls.at(-1) as [string]
    expect(nextUrl).not.toContain('roastLevel')
    mockUseSearchParams.mockReturnValue(
      new URLSearchParams(nextUrl.split('?')[1] ?? '') as ReturnType<
        typeof useSearchParams
      >,
    )
    rerender(<RoastsPage />)

    for (const { label } of ROAST_LEVEL_OPTIONS) {
      expect(screen.getByRole('checkbox', { name: label })).toBeChecked()
    }
  })

  it('lists products without asAdmin', () => {
    mockUseProducts.mockClear()

    render(<RoastsPage />)

    expect(mockUseProducts).toHaveBeenCalled()
    for (const [params] of mockUseProducts.mock.calls) {
      expect(params).not.toHaveProperty('asAdmin')
      expect(params?.status).toBe(ProductStatus.ACTIVE)
    }
  })
})
