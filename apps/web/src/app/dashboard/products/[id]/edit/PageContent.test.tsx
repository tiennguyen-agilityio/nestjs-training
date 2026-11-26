import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  DiscountType,
  ProductStatus,
  ProductUnit,
  RoastLevel,
} from '@repo/constants'
import type { UpdateProductPayload } from '@repo/schemas'
import { toast } from 'sonner'

import PageContent from './PageContent'
import { FORM_MESSAGES, NOTICE_MESSAGES } from '@/constants/messages'
import { ROUTES } from '@/constants/routes'
import { useCategories } from '@/hooks/useCategory'
import { useProductById, useUpdateProduct } from '@/hooks/useProduct'
import type { Product, ProductVariantSummary } from '@/types/product'
import { ServiceError } from '@/utils/query'

const mockPush = jest.fn()
const mockMutate = jest.fn()

jest.mock('next/navigation', () => ({
  useParams: () => ({ id: 'product-1' }),
  usePathname: () => '/dashboard/products/product-1/edit',
  useRouter: () => ({ push: mockPush }),
}))

jest.mock('@/hooks/useProduct', () => ({
  useProductById: jest.fn(),
  useUpdateProduct: jest.fn(),
}))

jest.mock('@/hooks/useCategory', () => ({
  useCategories: jest.fn(),
}))

jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}))

interface MutateOptions {
  onSuccess?: () => void
  onError?: (error: unknown) => void
}

const variant = (
  overrides: Partial<ProductVariantSummary> = {},
): ProductVariantSummary => ({
  id: 'variant-a',
  sku: 'SKU-A',
  size: 250,
  unit: ProductUnit.G,
  name: '250g',
  price: 100,
  discountType: DiscountType.PERCENT,
  discountValue: 10,
  stockQuantity: 30,
  ...overrides,
})

const product = (
  variantOverrides: Partial<ProductVariantSummary> = {},
): Product => ({
  id: 'product-1',
  categoryId: 'category-1',
  name: 'Single Origin',
  description: 'Bright and floral',
  roastLevel: RoastLevel.LIGHT,
  isOrganic: false,
  isFairTrade: false,
  status: ProductStatus.ACTIVE,
  tastingNotes: '',
  origin: 'Ethiopia',
  processingMethod: 'Washed',
  variants: [
    variant(variantOverrides),
    variant({ id: 'variant-b', price: 999 }),
  ],
  images: [
    {
      id: 'image-1',
      url: 'https://example.com/1.jpg',
      isPrimary: true,
      sortOrder: 0,
    },
    {
      id: 'image-2',
      url: 'https://example.com/2.jpg',
      isPrimary: false,
      sortOrder: 1,
    },
  ],
  createdAt: null,
  updatedAt: null,
  deletedAt: null,
})

function renderPage(variantOverrides: Partial<ProductVariantSummary> = {}) {
  jest.mocked(useProductById).mockReturnValue({
    product: product(variantOverrides),
    isLoading: false,
    isError: false,
    errorMessage: null,
    refetch: jest.fn(),
  })
  return render(<PageContent />)
}

const sentBody = (): UpdateProductPayload =>
  (mockMutate.mock.calls[0][0] as { body: UpdateProductPayload }).body

const field = (label: string | RegExp) => screen.getByLabelText(label)

async function replaceValue(label: string | RegExp, value: string) {
  const input = field(label)
  await userEvent.clear(input)
  await userEvent.type(input, value)
}

const save = () =>
  userEvent.click(screen.getByRole('button', { name: /save changes/i }))

describe('EditProductForm pricing', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.mocked(useCategories).mockReturnValue({
      categories: [{ id: 'category-1', name: 'Coffee' }],
      isLoading: false,
    } as unknown as ReturnType<typeof useCategories>)
    jest.mocked(useUpdateProduct).mockReturnValue({
      mutate: mockMutate,
      isPending: false,
    } as unknown as ReturnType<typeof useUpdateProduct>)
  })

  it('opens a product whose tasting notes are null', () => {
    jest.mocked(useProductById).mockReturnValue({
      product: { ...product(), tastingNotes: null },
      isLoading: false,
      isError: false,
      errorMessage: null,
      refetch: jest.fn(),
    })

    render(<PageContent />)

    expect(field('Product Name')).toHaveValue('Single Origin')
    expect(
      screen.queryByRole('button', { name: /^Remove (?!image$)/ }),
    ).not.toBeInTheDocument()
  })

  it('prefills Base Price, Percent, Discount (%) and Quantity', () => {
    renderPage()

    expect(field('Base Price')).toHaveValue('100')
    expect(field('Discount (%)')).toHaveValue('10')
    expect(screen.getByRole('status', { name: 'Quantity' })).toHaveTextContent(
      '30',
    )
    expect(screen.getByRole('button', { name: 'Percent' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('sends the changed Base Price in updateVariants and returns to the list', async () => {
    mockMutate.mockImplementation((_input, options: MutateOptions) =>
      options.onSuccess?.(),
    )
    renderPage()

    await replaceValue('Base Price', '120')
    await save()

    await waitFor(() => expect(mockMutate).toHaveBeenCalledTimes(1))
    expect(sentBody().updateVariants).toEqual([
      {
        id: 'variant-a',
        size: 250,
        unit: ProductUnit.G,
        price: 120,
        discountType: DiscountType.PERCENT,
        discountValue: 10,
      },
    ])
    expect(mockPush).toHaveBeenCalledWith(ROUTES.DASHBOARD_PRODUCTS)
  })

  it('fills Size and Unit from the variant', () => {
    renderPage()

    expect(screen.getByRole('textbox', { name: 'Size' })).toHaveValue('250')
    expect(field('Unit')).toHaveTextContent('Grams')
  })

  it('sends size and unit in updateVariants, never stockQuantity', async () => {
    mockMutate.mockImplementation((_input, options: MutateOptions) =>
      options.onSuccess?.(),
    )
    renderPage()

    await replaceValue('Size', '500')
    await save()

    await waitFor(() => expect(mockMutate).toHaveBeenCalledTimes(1))
    expect(sentBody().updateVariants?.[0]).toEqual(
      expect.objectContaining({ size: 500, unit: 'G' }),
    )
    expect(sentBody().updateVariants?.[0]).not.toHaveProperty('stockQuantity')
  })

  it('sends PERCENT 0 when Discount (%) is 0', async () => {
    renderPage()

    await replaceValue('Discount (%)', '0')
    await save()

    await waitFor(() => expect(mockMutate).toHaveBeenCalledTimes(1))
    expect(sentBody().updateVariants?.[0]).toMatchObject({
      discountType: DiscountType.PERCENT,
      discountValue: 0,
    })
  })

  it('prefills Discount (%) 12.5 and sends it unchanged', async () => {
    renderPage({ discountValue: 12.5 })

    expect(field('Discount (%)')).toHaveValue('12.5')
    await replaceValue('Size', '251')
    await save()

    await waitFor(() => expect(mockMutate).toHaveBeenCalledTimes(1))
    expect(sentBody().updateVariants?.[0].discountValue).toBe(12.5)
  })

  it('truncates Discount (%) 12.345 to 12.34', async () => {
    renderPage()

    await replaceValue('Discount (%)', '12.345')

    expect(field('Discount (%)')).toHaveValue('12.34')
  })

  it('keeps a percent discount of 100 and blocks it without sending', async () => {
    renderPage()

    await replaceValue('Discount (%)', '100')
    await save()

    expect(field('Discount (%)')).toHaveValue('100')
    expect(
      await screen.findByText(FORM_MESSAGES.DISCOUNT_PERCENT),
    ).toBeInTheDocument()
    expect(mockMutate).not.toHaveBeenCalled()
  })

  it('blocks a fixed discount equal to the price without sending', async () => {
    renderPage()

    await replaceValue('Base Price', '120')
    await userEvent.click(screen.getByRole('button', { name: 'Fixed' }))
    await replaceValue('Discount Amount', '120')
    await save()

    expect(
      await screen.findByText('Discount must be less than the base price'),
    ).toBeInTheDocument()
    expect(mockMutate).not.toHaveBeenCalled()
  })

  it('shows an API discount error on the Discount field', async () => {
    mockMutate.mockImplementation((_input, options: MutateOptions) =>
      options.onError?.(
        new ServiceError('Fixed discount must be less than base price', [
          {
            errCode: 'maxFixedDiscountValue',
            field: 'updateVariants.0.discountValue',
            message: 'Fixed discount must be less than base price',
          },
        ]),
      ),
    )
    renderPage()

    await replaceValue('Size', '251')
    await save()

    expect(
      await screen.findByText('Fixed discount must be less than base price'),
    ).toBeInTheDocument()
    expect(field('Discount (%)')).toHaveAttribute('aria-invalid', 'true')
  })

  it('shows a variant error and a name error from the same response', async () => {
    mockMutate.mockImplementation((_input, options: MutateOptions) =>
      options.onError?.(
        new ServiceError('Fixed discount must be less than base price', [
          {
            errCode: 'maxFixedDiscountValue',
            field: 'updateVariants.0.discountValue',
            message: 'Fixed discount must be less than base price',
          },
          {
            errCode: 'productNameExists',
            field: 'name',
            message: 'Product name already exists',
          },
        ]),
      ),
    )
    renderPage()

    await replaceValue('Size', '251')
    await save()

    expect(
      await screen.findByText('Fixed discount must be less than base price'),
    ).toBeInTheDocument()
    expect(
      await screen.findByText('Product name already exists'),
    ).toBeInTheDocument()
    expect(field('Product Name')).toHaveAttribute('aria-invalid', 'true')
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('shows an unmatched API error as a toast next to the field errors', async () => {
    mockMutate.mockImplementation((_input, options: MutateOptions) =>
      options.onError?.(
        new ServiceError('Price must not be less than 1', [
          {
            errCode: 'min',
            field: 'updateVariants.0.price',
            message: 'Price must not be less than 1',
          },
          {
            errCode: 'tooManyImages',
            field: '',
            message: 'A product can have at most 10 images',
          },
        ]),
      ),
    )
    renderPage()

    await replaceValue('Size', '251')
    await save()

    expect(
      await screen.findByText('Price must not be less than 1'),
    ).toBeInTheDocument()
    expect(toast.error).toHaveBeenCalledWith(
      'A product can have at most 10 images',
    )
  })

  it('updates the Product Name error while typing after the first blur', async () => {
    renderPage()

    await userEvent.clear(field('Product Name'))
    await userEvent.tab()
    expect(
      await screen.findByText('This field is required'),
    ).toBeInTheDocument()

    await userEvent.type(field('Product Name'), 'a')

    expect(
      await screen.findByText('Product name must be at least 2 characters'),
    ).toBeInTheDocument()
    expect(screen.queryByText('This field is required')).not.toBeInTheDocument()
  })

  it('focuses Product Name after a server name error', async () => {
    // The response arrives after a render, while the form is still disabled.
    mockMutate.mockImplementation((_input, options: MutateOptions) => {
      setTimeout(() =>
        options.onError?.(
          new ServiceError('Product name already exists', [
            {
              errCode: 'productNameExists',
              field: 'name',
              message: 'Product name already exists',
            },
          ]),
        ),
      )
    })
    renderPage()

    await replaceValue('Product Name', 'coldbrew')
    await save()

    expect(
      await screen.findByText('Product name already exists'),
    ).toBeInTheDocument()
    await waitFor(() => expect(field('Product Name')).toHaveFocus())
  })

  it('keeps a base price above 99,999,999.99 and blocks it without sending', async () => {
    renderPage()

    await replaceValue('Base Price', '100000000')
    await save()

    expect(field('Base Price')).toHaveValue('100,000,000')
    expect(
      await screen.findByText(FORM_MESSAGES.max('Base price', '99,999,999.99')),
    ).toBeInTheDocument()
    expect(mockMutate).not.toHaveBeenCalled()
  })
})

describe('EditProductPage access and status', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.mocked(useCategories).mockReturnValue({
      categories: [{ id: 'category-1', name: 'Coffee' }],
      isLoading: false,
    } as unknown as ReturnType<typeof useCategories>)
    jest.mocked(useUpdateProduct).mockReturnValue({
      mutate: mockMutate,
      isPending: false,
    } as unknown as ReturnType<typeof useUpdateProduct>)
  })

  const renderProduct = (value: Product) => {
    jest.mocked(useProductById).mockReturnValue({
      product: value,
      isLoading: false,
      isError: false,
      errorMessage: null,
      refetch: jest.fn(),
    })
    return render(<PageContent />)
  }

  it('reads the product as admin', () => {
    renderProduct(product())

    expect(useProductById).toHaveBeenCalledWith('product-1', {
      asAdmin: true,
    })
  })

  it('renders the header with PageHeader', () => {
    renderProduct(product())

    const header = screen.getByRole('banner')
    expect(within(header).getByRole('navigation', { name: 'breadcrumb' })).toBe(
      header.firstElementChild,
    )
    const view = within(header)
    expect(view.getByRole('link', { name: 'Dashboard' })).toHaveAttribute(
      'href',
      ROUTES.DASHBOARD,
    )
    expect(view.getByRole('link', { name: 'Products' })).toHaveAttribute(
      'href',
      ROUTES.DASHBOARD_PRODUCTS,
    )
    const title = view.getByRole('heading', { level: 1, name: 'Edit Product' })
    expect(title).toHaveClass('text-4xl', 'font-semibold')
    expect(title).not.toHaveClass('text-5xl')
    expect(view.getByRole('paragraph')).toHaveTextContent(
      'Update this entry in your sensory collection.',
    )
    expect(
      view.getByRole('button', { name: /reset changes/i }),
    ).toBeInTheDocument()
    expect(
      view.getByRole('button', { name: /save changes/i }),
    ).toBeInTheDocument()
  })

  it('prefills the form for a DRAFT product', () => {
    renderProduct({
      ...product(),
      name: 'Draft Roast',
      status: ProductStatus.DRAFT,
    })

    expect(field('Product Name')).toHaveValue('Draft Roast')
    expect(field('Base Price')).toHaveValue('100')
  })

  it.each([ProductStatus.INACTIVE, ProductStatus.ARCHIVED])(
    'prefills the form for INACTIVE and ARCHIVED products (%s)',
    (status) => {
      renderProduct({ ...product(), name: `${status} Roast`, status })

      expect(field('Product Name')).toHaveValue(`${status} Roast`)
      expect(field('Base Price')).toHaveValue('100')
    },
  )

  it('keeps ARCHIVED when saving with Listed on Storefront off', async () => {
    renderProduct({ ...product(), status: ProductStatus.ARCHIVED })

    await replaceValue('Base Price', '120')
    await save()

    await waitFor(() => expect(mockMutate).toHaveBeenCalledTimes(1))
    expect(sentBody().status).toBe(ProductStatus.ARCHIVED)
  })

  it('shows a deleted notice instead of the form', () => {
    renderProduct({
      ...product(),
      status: ProductStatus.ARCHIVED,
      deletedAt: '2026-10-30T00:00:00.000Z',
    })

    expect(
      screen.getByText(NOTICE_MESSAGES.PRODUCT_DELETED.MESSAGE),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', {
        name: NOTICE_MESSAGES.PRODUCT_DELETED.ACTION,
      }),
    ).toHaveAttribute('href', ROUTES.DASHBOARD_PRODUCTS)
    expect(screen.queryByLabelText('Product Name')).not.toBeInTheDocument()
  })
})

describe('EditProductForm shared form', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    URL.createObjectURL = jest.fn(() => 'blob:new-primary')
    jest.mocked(useCategories).mockReturnValue({
      categories: [{ id: 'category-1', name: 'Coffee' }],
      isLoading: false,
    } as unknown as ReturnType<typeof useCategories>)
    jest.mocked(useUpdateProduct).mockReturnValue({
      mutate: mockMutate,
      isPending: false,
    } as unknown as ReturnType<typeof useUpdateProduct>)
  })

  it('focuses Base Price after a server price error', async () => {
    // The response arrives after a render, while the form is still disabled.
    mockMutate.mockImplementation((_input, options: MutateOptions) => {
      setTimeout(() =>
        options.onError?.(
          new ServiceError('Price too high', [
            {
              errCode: 'E',
              field: 'updateVariants.0.price',
              message: 'Price too high',
            },
          ]),
        ),
      )
    })
    renderPage()

    await replaceValue('Base Price', '120')
    await save()

    expect(await screen.findByText('Price too high')).toBeInTheDocument()
    await waitFor(() => expect(field('Base Price')).toHaveFocus())
  })

  it('does not show Weight', () => {
    renderPage()

    expect(screen.queryByLabelText('Weight')).not.toBeInTheDocument()
  })

  it('keeps typed changes when the page re-renders', async () => {
    const { rerender } = renderPage()

    await replaceValue('Product Name', 'Cold Brew')
    rerender(<PageContent />)

    expect(field('Product Name')).toHaveValue('Cold Brew')
  })

  it('restores the saved primary image when the new pick is removed', async () => {
    const { container } = renderPage()
    const avatarInput = container.querySelector('input[name="avatar"]')
    if (!(avatarInput instanceof HTMLInputElement)) throw new Error('avatar')

    await userEvent.upload(
      avatarInput,
      new File(['x'], 'new.png', { type: 'image/png' }),
    )
    expect(screen.getByRole('img', { name: 'new.png' })).toBeInTheDocument()

    // The primary image's button comes first; gallery items have their own.
    await userEvent.click(
      screen.getAllByRole('button', { name: 'Remove image' })[0],
    )

    expect(
      screen.getByRole('img', { name: 'Product image' }).getAttribute('src'),
    ).toContain(encodeURIComponent('https://example.com/1.jpg'))
  })

  it('shows the Edit Product heading', () => {
    renderPage()

    expect(
      screen.getByRole('heading', { level: 1, name: 'Edit Product' }),
    ).toBeInTheDocument()
  })
})
