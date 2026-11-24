import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { PageContent } from '@/app/dashboard/products/PageContent'
import { PAGE_SIZE } from '@/constants/common'
import { API_FALLBACK_ERRORS } from '@/constants/messages'
import { ROUTES } from '@/constants/routes'
import { useCategories } from '@/hooks/useCategory'
import { useDeleteProduct, useProducts } from '@/hooks/useProduct'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { type ProductOptions } from '@/services/product'
import {
  DiscountType,
  ProductStatus,
  ProductUnit,
  RoastLevel,
} from '@repo/constants'
import { type Product } from '@/types/product'

let navQueryString = ''

const mockReplace = jest.fn((href: string) => {
  navQueryString = href.includes('?') ? href.split('?')[1] : ''
})

jest.mock('next/navigation', () => ({
  usePathname: jest.fn(),
  useRouter: jest.fn(),
  useSearchParams: jest.fn(),
}))

jest.mock('@/hooks/useProduct', () => ({
  useProducts: jest.fn(),
  useCreateProduct: jest.fn(),
  useDeleteProduct: jest.fn(),
}))

jest.mock('sonner', () => ({
  toast: { success: jest.fn() },
}))

jest.mock('@/hooks/useCategory', () => ({
  useCategories: jest.fn(),
}))

jest.mock('@/components/Select', () => ({
  Select: ({
    selected,
    onValueChange,
    options,
    placeholder = '',
  }: {
    selected?: string
    onValueChange?: (value: string) => void
    options: { value: string; label: string }[]
    placeholder?: string
  }) => {
    const ariaLabel =
      placeholder === 'All statuses' ? 'Status filter' : 'Category filter'
    return (
      <label>
        <span className="sr-only">{ariaLabel}</span>
        <select
          aria-label={ariaLabel}
          value={selected ?? ''}
          onChange={(event) => onValueChange?.(event.target.value)}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    )
  },
}))

const mockUsePathname = jest.mocked(usePathname)
const mockUseRouter = jest.mocked(useRouter)
const mockUseSearchParams = jest.mocked(useSearchParams)
const mockUseProducts = jest.mocked(useProducts)
const mockUseCategories = jest.mocked(useCategories)
const mockUseDeleteProduct = jest.mocked(useDeleteProduct)
const mutateDeleteProduct = jest.fn()
const refetchMock = jest.fn()

const MOCK_PRODUCTS_PAGE_SIZE = 2

const productsFixture: Product[] = [
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
    images: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
  },
  {
    id: 'product-2',
    categoryId: 'brew-gear',
    name: 'The Chemist Brewer',
    description: 'Manual dripper',
    roastLevel: RoastLevel.MEDIUM,
    isOrganic: false,
    isFairTrade: false,
    status: ProductStatus.DRAFT,
    tastingNotes: 'Chocolate, caramel',
    origin: 'Colombia',
    processingMethod: 'Honey',
    variants: [
      {
        sku: 'SKU-2',
        size: 1,
        unit: ProductUnit.KG,
        name: '1kg',
        price: 85,
        discountType: null,
        discountValue: null,
        stockQuantity: 4,
      },
    ],
    images: [],
    createdAt: '2026-01-02T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    deletedAt: null,
  },
  {
    id: 'product-3',
    categoryId: 'whole-bean',
    name: 'Midnight Blend',
    description: 'House blend',
    roastLevel: RoastLevel.DARK,
    isOrganic: false,
    isFairTrade: true,
    status: ProductStatus.ACTIVE,
    tastingNotes: 'Dark chocolate, molasses',
    origin: 'Brazil',
    processingMethod: 'Natural',
    variants: [
      {
        sku: 'SKU-3',
        size: 500,
        unit: ProductUnit.G,
        name: '500g',
        price: 18.5,
        discountType: DiscountType.FIXED,
        discountValue: 2,
        stockQuantity: 128,
      },
    ],
    images: [],
    createdAt: '2026-01-03T00:00:00.000Z',
    updatedAt: '2026-01-03T00:00:00.000Z',
    deletedAt: null,
  },
]

function mockProductsByApiParams(params: ProductOptions = {}) {
  const page = params.page ?? 1
  const search = params.search?.trim().toLowerCase() ?? ''

  let list = [...productsFixture]
  if (search.length > 0) {
    list = list.filter((product) => product.name.toLowerCase().includes(search))
  }

  const pageSize = MOCK_PRODUCTS_PAGE_SIZE
  const totalCount = list.length
  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize) || 1)
  const start = (page - 1) * pageSize
  const slice = list.slice(start, start + pageSize)

  return {
    products: slice,
    meta: {
      limit: pageSize,
      currentPage: page,
      pageCount,
      totalCount,
    },
    isLoading: false,
    isFetching: false,
    isError: false,
    errorMessage: null,
    refetch: refetchMock,
  }
}

function renderProductsPage() {
  mockUseSearchParams.mockImplementation(
    () =>
      new URLSearchParams(navQueryString) as ReturnType<typeof useSearchParams>,
  )
  return render(<PageContent />)
}

describe('Dashboard products page', () => {
  beforeEach(() => {
    navQueryString = ''
    mockReplace.mockClear()
    refetchMock.mockReset()
    mockUsePathname.mockReturnValue(ROUTES.DASHBOARD_PRODUCTS)
    mockUseRouter.mockReturnValue({
      replace: mockReplace,
    } as unknown as ReturnType<typeof useRouter>)
    mockUseSearchParams.mockImplementation(
      () =>
        new URLSearchParams(navQueryString) as ReturnType<
          typeof useSearchParams
        >,
    )
    mockUseCategories.mockReturnValue({
      categories: [
        {
          id: 'whole-bean',
          name: 'Whole Bean',
          slug: 'whole-bean',
          createdBy: null,
          updatedBy: null,
          deletedBy: null,
          createdAt: null,
          updatedAt: null,
          deletedAt: null,
        },
        {
          id: 'brew-gear',
          name: 'Brew Gear',
          slug: 'brew-gear',
          createdBy: null,
          updatedBy: null,
          deletedBy: null,
          createdAt: null,
          updatedAt: null,
          deletedAt: null,
        },
      ],
      meta: null,
      isLoading: false,
      isFetching: false,
      isError: false,
      errorMessage: null,
      refetch: jest.fn(),
    })
    mockUseProducts.mockImplementation((params) =>
      mockProductsByApiParams(params),
    )
    mockUseDeleteProduct.mockReturnValue({
      mutate: mutateDeleteProduct,
      isPending: false,
    } as unknown as ReturnType<typeof useDeleteProduct>)
    mutateDeleteProduct.mockReset()
  })

  it('renders heading, add product action and first page rows', () => {
    renderProductsPage()

    expect(
      screen.getByRole('heading', { name: 'Manage Products' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /add product/i })).toHaveAttribute(
      'href',
      ROUTES.DASHBOARD_PRODUCTS_ADD,
    )
    expect(screen.getByText('Ethiopian Yirgacheffe')).toBeInTheDocument()
    expect(screen.getByText('The Chemist Brewer')).toBeInTheDocument()
    expect(screen.queryByText('Midnight Blend')).not.toBeInTheDocument()
  })

  it('renders the header with PageHeader', () => {
    renderProductsPage()

    const header = screen.getByRole('banner')
    expect(within(header).getByRole('navigation', { name: 'breadcrumb' })).toBe(
      header.firstElementChild,
    )
    const view = within(header)
    expect(view.getByRole('link', { name: 'Dashboard' })).toHaveAttribute(
      'href',
      ROUTES.DASHBOARD,
    )
    const title = view.getByRole('heading', {
      level: 1,
      name: 'Manage Products',
    })
    expect(title).toHaveClass('text-4xl', 'font-semibold')
    expect(title).not.toHaveClass('text-5xl')
    expect(view.getByRole('paragraph')).toHaveTextContent(
      'Oversee your products and inventory',
    )
    const action = view.getByRole('link', { name: /add product/i })
    expect(action).toHaveAttribute('href', ROUTES.DASHBOARD_PRODUCTS_ADD)
    expect(action.parentElement).toHaveClass(
      'flex-wrap',
      'gap-3',
      'w-full',
      'justify-end',
      'sm:w-auto',
    )
  })

  it('requests products as admin', () => {
    mockUseProducts.mockClear()

    renderProductsPage()

    expect(mockUseProducts).toHaveBeenCalled()
    for (const [params] of mockUseProducts.mock.calls) {
      expect(params?.asAdmin).toBe(true)
    }
  })

  it('greys deleted rows', () => {
    const deleted: Product = {
      ...productsFixture[0],
      status: ProductStatus.ARCHIVED,
      deletedAt: '2026-10-30T00:00:00.000Z',
    }
    const liveArchived: Product = {
      ...productsFixture[1],
      status: ProductStatus.ARCHIVED,
    }
    mockUseProducts.mockImplementation((params) => ({
      ...mockProductsByApiParams(params),
      products: [deleted, liveArchived],
    }))

    renderProductsPage()

    expect(screen.getByText('Ethiopian Yirgacheffe').closest('tr')).toHaveClass(
      'bg-muted-foreground/20',
    )
    expect(
      screen.getByText('The Chemist Brewer').closest('tr'),
    ).not.toHaveClass('bg-muted-foreground/20')
  })

  it('requests categories without deleted rows', () => {
    mockUseCategories.mockClear()

    renderProductsPage()

    expect(mockUseCategories).toHaveBeenCalled()
    for (const [params] of mockUseCategories.mock.calls) {
      expect(params?.includeDeleted).toBeFalsy()
    }
  })

  it('filters products by keyword via URL params and API params', async () => {
    const view = renderProductsPage()

    fireEvent.change(
      screen.getByRole('searchbox', { name: 'Filter products by name' }),
      { target: { value: 'midnight' } },
    )

    await waitFor(() => {
      expect(navQueryString).toContain('search=midnight')
    })

    view.rerender(<PageContent />)

    await waitFor(() => {
      expect(mockUseProducts).toHaveBeenLastCalledWith(
        expect.objectContaining({
          search: 'midnight',
          page: 1,
          limit: PAGE_SIZE,
        }),
      )
    })
    expect(screen.getByText('Midnight Blend')).toBeInTheDocument()
    expect(screen.queryByText('The Chemist Brewer')).not.toBeInTheDocument()
  })

  it('moves to next page', async () => {
    const user = userEvent.setup()
    const view = renderProductsPage()

    await user.click(screen.getByLabelText('Go to next page'))
    view.rerender(<PageContent />)

    expect(mockUseProducts).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 2, limit: PAGE_SIZE }),
    )
    expect(screen.getByText('Midnight Blend')).toBeInTheDocument()
    expect(screen.queryByText('Ethiopian Yirgacheffe')).not.toBeInTheDocument()
  })

  it('moves a page past the last page back to the last page', () => {
    navQueryString = 'page=5'

    renderProductsPage()

    expect(mockReplace).toHaveBeenCalledWith(
      `${ROUTES.DASHBOARD_PRODUCTS}?page=2`,
      { scroll: false },
    )
  })

  it('filters products by category via URL params and API params', async () => {
    const view = renderProductsPage()

    fireEvent.change(screen.getByLabelText('Category filter'), {
      target: { value: 'whole-bean' },
    })

    await waitFor(() => {
      expect(navQueryString).toContain('categoryId=whole-bean')
    })

    view.rerender(<PageContent />)

    await waitFor(() => {
      expect(mockUseProducts).toHaveBeenLastCalledWith(
        expect.objectContaining({
          categoryId: 'whole-bean',
          page: 1,
          limit: PAGE_SIZE,
        }),
      )
    })
  })

  it('renders loading state', () => {
    mockUseProducts.mockReturnValue({
      products: [],
      meta: null,
      isLoading: true,
      isFetching: true,
      isError: false,
      errorMessage: null,
      refetch: refetchMock,
    })

    renderProductsPage()

    expect(screen.getByTestId('spinner-icon')).toBeInTheDocument()
  })

  it('renders empty state when list has no data', () => {
    mockUseProducts.mockImplementation(() => ({
      products: [],
      meta: {
        limit: PAGE_SIZE,
        currentPage: 1,
        pageCount: 1,
        totalCount: 0,
      },
      isLoading: false,
      isFetching: false,
      isError: false,
      errorMessage: null,
      refetch: refetchMock,
    }))

    renderProductsPage()

    expect(screen.getByText('No products found.')).toBeInTheDocument()
  })

  it('opens remove dialog and calls delete mutate on confirm', async () => {
    const user = userEvent.setup()
    renderProductsPage()

    await user.click(
      screen.getByRole('button', { name: /delete ethiopian yirgacheffe/i }),
    )
    expect(await screen.findByText('Delete Product?')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /^delete$/i }))
    expect(mutateDeleteProduct).toHaveBeenCalledWith(
      'product-1',
      expect.any(Object),
    )
  })

  it('closes remove dialog without calling delete when Cancel', async () => {
    const user = userEvent.setup()
    renderProductsPage()

    await user.click(
      screen.getByRole('button', { name: /delete ethiopian yirgacheffe/i }),
    )
    await screen.findByText('Delete Product?')
    await user.click(screen.getByTestId('btn-cancel'))
    expect(mutateDeleteProduct).not.toHaveBeenCalled()
  })

  it('renders error state and retries', async () => {
    const user = userEvent.setup()
    mockUseProducts.mockImplementation(() => ({
      products: [],
      meta: null,
      isLoading: false,
      isFetching: false,
      isError: true,
      errorMessage: API_FALLBACK_ERRORS.PRODUCTS_LOAD,
      refetch: refetchMock,
    }))

    renderProductsPage()

    expect(
      screen.getByText(API_FALLBACK_ERRORS.PRODUCTS_LOAD),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(refetchMock).toHaveBeenCalledTimes(1)
  })
})
