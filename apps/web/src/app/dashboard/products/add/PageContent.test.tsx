import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ProductUnit } from '@repo/constants'
import { toast } from 'sonner'

import PageContent from './PageContent'
import {
  DIALOG_MESSAGES,
  ERROR_MESSAGES,
  FORM_MESSAGES,
  SUCCESS_MESSAGES,
} from '@/constants/messages'
import { QUANTITY_MAX } from '@/constants/product'
import { useCategories } from '@/hooks/useCategory'
import { useCreateProduct } from '@/hooks/useProduct'
import { uploadImageToImgBB } from '@/services/image'
import type { Category } from '@/types/category'
import { ServiceError } from '@/utils/query'

const mockMutate = jest.fn()

jest.mock('next/navigation', () => ({
  usePathname: () => '/dashboard/products/add',
  useRouter: () => ({ push: jest.fn() }),
}))

jest.mock('@/hooks/useProduct', () => ({
  useCreateProduct: jest.fn(),
}))

jest.mock('@/hooks/useCategory', () => ({
  useCategories: jest.fn(),
}))

jest.mock('@/services/image', () => ({
  uploadImageToImgBB: jest.fn(),
}))

jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}))

jest.mock('@/components/Select', () => ({
  Select: ({
    label,
    selected,
    onValueChange,
    options,
  }: {
    label?: string
    selected?: string
    onValueChange?: (value: string) => void
    options: { value: string; label: string }[]
  }) => (
    <label>
      {label}
      <select
        aria-label={label}
        value={selected ?? ''}
        onChange={(event) => onValueChange?.(event.target.value)}
      >
        <option value="">-</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  ),
}))

interface MutateOptions {
  onError?: (error: unknown) => void
}

const category: Category = {
  id: 'cat-1',
  name: 'Espresso',
  slug: 'espresso',
  createdBy: null,
  updatedBy: null,
  deletedBy: null,
  createdAt: null,
  updatedAt: null,
  deletedAt: null,
}

const image = (name: string) => new File(['x'], name, { type: 'image/png' })

type User = ReturnType<typeof userEvent.setup>

// Renders the page, uploads both images and fills every field except the
// ones in skip.
const fillValidForm = async (skip: string[] = []) => {
  const user = userEvent.setup()
  const { container } = render(<PageContent />)

  const avatarInput = container.querySelector('input[name="avatar"]')
  const galleryInput = container.querySelector('input[name^="gallery"]')
  if (!(avatarInput instanceof HTMLInputElement)) throw new Error('avatar')
  if (!(galleryInput instanceof HTMLInputElement)) throw new Error('gallery')
  await user.upload(avatarInput, image('avatar.png'))
  await user.upload(galleryInput, image('gallery.png'))

  const fill = async (label: string, value: string) => {
    if (skip.includes(label)) return
    await user.click(screen.getByLabelText(label))
    await user.paste(value)
  }
  await fill('Product Name', 'Single Origin')
  await fill('Description', 'Bright and floral')
  await user.selectOptions(screen.getByLabelText('Category'), 'cat-1')
  await fill('Size', '250')
  await user.selectOptions(screen.getByLabelText('Unit'), ProductUnit.G)
  await fill('Base Price', '20')
  await fill('Quantity', '5')
  await fill('Origin', 'Ethiopia')
  await fill('Processing Method', 'Washed')
  return user
}

const clickPublish = (user: User) =>
  user.click(screen.getByRole('button', { name: /publish product/i }))

const submitValidForm = async (
  beforeSubmit?: (user: User) => Promise<void>,
) => {
  const user = await fillValidForm()
  await beforeSubmit?.(user)

  await clickPublish(user)
  await waitFor(() => expect(mockMutate).toHaveBeenCalledTimes(1))
}

const failWith = (field: string, message: string) => {
  const [, options] = mockMutate.mock.calls[0] as [unknown, MutateOptions]
  act(() =>
    options.onError?.(
      new ServiceError(message, [{ errCode: 'E', field, message }]),
    ),
  )
}

// Each test renders the whole Add form and submits it; under a parallel
// pre-push run that can pass Jest's 5 s default.
jest.setTimeout(15_000)

beforeAll(() => {
  URL.createObjectURL = jest.fn(() => 'blob:preview')
  URL.revokeObjectURL = jest.fn()
})

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(useCreateProduct).mockReturnValue({
    mutate: mockMutate,
    isPending: false,
  } as unknown as ReturnType<typeof useCreateProduct>)
  jest.mocked(useCategories).mockReturnValue({
    categories: [category],
    isLoading: false,
  } as unknown as ReturnType<typeof useCategories>)
  jest.mocked(uploadImageToImgBB).mockImplementation(async (file: File) => ({
    ok: true,
    url: `https://img.example.com/${file.name}`,
  }))
})

describe('Add product API errors', () => {
  it('shows a duplicate-name API error under Product name', async () => {
    await submitValidForm()

    failWith('name', 'Product name already exists')

    expect(
      await screen.findByText('Product name already exists'),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Product Name')).toHaveAttribute(
      'aria-invalid',
      'true',
    )
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('shows an API variant price error under Base Price', async () => {
    await submitValidForm()

    failWith('variants.0.price', 'Price must not be greater than 99999999.99')

    expect(
      await screen.findByText('Price must not be greater than 99999999.99'),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Base Price')).toHaveAttribute(
      'aria-invalid',
      'true',
    )
  })

  it('sends size and stockQuantity in the create payload', async () => {
    await submitValidForm()

    const [payload] = mockMutate.mock.calls[0] as [
      { variants: Record<string, unknown>[] },
    ]
    expect(payload.variants[0]).toMatchObject({
      size: 250,
      unit: ProductUnit.G,
      stockQuantity: 5,
    })
    expect(payload.variants[0]).not.toHaveProperty('weight')
    expect(payload.variants[0]).not.toHaveProperty('quantity')
  })

  it('shows a duplicate-SKU API error under Size', async () => {
    await submitValidForm()

    failWith(
      'sku',
      'A variant with this SKU already exists. Please choose a different SKU.',
    )

    expect(
      await screen.findByText(
        'A variant with this SKU already exists. Please choose a different SKU.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Size')).toHaveAttribute(
      'aria-invalid',
      'true',
    )
  })

  it('shows an API images error in the Gallery box', async () => {
    await submitValidForm()

    failWith('images', 'Too big: expected array to have <=10 items')

    expect(
      await screen.findByText('Too big: expected array to have <=10 items'),
    ).toBeInTheDocument()
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('shows an unmatched API error as a toast', async () => {
    await submitValidForm()

    failWith('', 'Product must have exactly one primary image')

    expect(toast.error).toHaveBeenCalledWith(
      'Product must have exactly one primary image',
    )
  })

  it('accepts a 12.5 percent discount', async () => {
    await submitValidForm(async (user) => {
      await user.clear(screen.getByLabelText('Discount (%)'))
      await user.type(screen.getByLabelText('Discount (%)'), '12.5')
    })

    const [payload] = mockMutate.mock.calls[0] as [
      { variants: { discountValue: number }[] },
    ]
    expect(payload.variants[0]?.discountValue).toBe(12.5)
  })

  it('keeps a stock above 500 and shows the limit without sending', async () => {
    const user = await fillValidForm(['Quantity'])

    await user.type(screen.getByLabelText('Quantity'), '501')
    await clickPublish(user)

    expect(screen.getByLabelText('Quantity')).toHaveValue('501')
    expect(
      await screen.findByText(FORM_MESSAGES.max('Quantity', QUANTITY_MAX)),
    ).toBeInTheDocument()
    expect(mockMutate).not.toHaveBeenCalled()
  })
})

describe('Add product shared form', () => {
  const isBefore = (first: HTMLElement, second: HTMLElement) =>
    Boolean(
      first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING,
    )

  it('starts Size and Base Price empty and Discount (%) at 0', () => {
    render(<PageContent />)

    expect(screen.getByLabelText('Size')).toHaveValue('')
    expect(screen.getByLabelText('Base Price')).toHaveValue('')
    expect(screen.getByLabelText('Discount (%)')).toHaveValue('0')
  })

  it('shows required under Size and Base Price when left empty', async () => {
    const user = await fillValidForm(['Size', 'Base Price'])

    await clickPublish(user)

    expect(
      await screen.findAllByText(ERROR_MESSAGES.FIELD_REQUIRED),
    ).toHaveLength(2)
    expect(screen.getByLabelText('Size')).toHaveAttribute(
      'aria-invalid',
      'true',
    )
    expect(screen.getByLabelText('Base Price')).toHaveAttribute(
      'aria-invalid',
      'true',
    )
    expect(mockMutate).not.toHaveBeenCalled()
  })

  it('focuses Size after a duplicate-SKU error', async () => {
    await submitValidForm()

    failWith(
      'sku',
      'A variant with this SKU already exists. Please choose a different SKU.',
    )

    await waitFor(() => expect(screen.getByLabelText('Size')).toHaveFocus())
  })

  it('sends the primary image first and the gallery image after it', async () => {
    jest.mocked(uploadImageToImgBB).mockImplementation(async (file: File) => ({
      ok: true,
      url: `https://img/${file.name}`,
    }))

    await submitValidForm()

    const [payload] = mockMutate.mock.calls[0] as [{ images: unknown[] }]
    expect(payload.images).toEqual([
      { url: 'https://img/avatar.png', isPrimary: true, sortOrder: 0 },
      { url: 'https://img/gallery.png', isPrimary: false, sortOrder: 1 },
    ])
  })

  it('shows Size and Unit before Base Price', () => {
    render(<PageContent />)

    const size = screen.getByLabelText('Size')
    const unit = screen.getByLabelText('Unit')
    const price = screen.getByLabelText('Base Price')
    const stock = screen.getByLabelText('Quantity')
    expect(isBefore(size, unit)).toBe(true)
    expect(isBefore(unit, price)).toBe(true)
    expect(isBefore(price, stock)).toBe(true)
  })

  it('marks the selected Discount Type with aria-pressed', async () => {
    const user = userEvent.setup()
    render(<PageContent />)

    const percent = screen.getByRole('button', { name: 'Percent' })
    const fixed = screen.getByRole('button', { name: 'Fixed' })
    expect(percent).toHaveAttribute('aria-pressed', 'true')
    expect(fixed).toHaveAttribute('aria-pressed', 'false')

    await user.click(fixed)

    expect(percent).toHaveAttribute('aria-pressed', 'false')
    expect(fixed).toHaveAttribute('aria-pressed', 'true')
  })

  it('starts with no tasting notes', () => {
    render(<PageContent />)

    expect(
      screen.queryAllByRole('button', { name: /^Remove (?!image$)/ }),
    ).toHaveLength(0)
  })

  it('clears the form and tasting notes on Discard Draft', async () => {
    const user = userEvent.setup()
    render(<PageContent />)

    await user.type(screen.getByLabelText('Product Name'), 'Single Origin')
    await user.type(
      screen.getByPlaceholderText(/add a new flavor note/i),
      'Cocoa',
    )
    await user.click(screen.getByRole('button', { name: /add note/i }))
    expect(
      screen.getByRole('button', { name: 'Remove Cocoa' }),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /discard draft/i }))
    await user.click(
      within(
        screen.getByRole('alertdialog', {
          name: DIALOG_MESSAGES.PRODUCT.DISCARD_CHANGES.TITLE,
        }),
      ).getByRole('button', { name: /discard draft/i }),
    )

    expect(screen.getByLabelText('Product Name')).toHaveValue('')
    expect(
      screen.queryByRole('button', { name: 'Remove Cocoa' }),
    ).not.toBeInTheDocument()
    expect(toast.success).toHaveBeenCalledWith(SUCCESS_MESSAGES.DRAFT_DISCARDED)
  })

  it('clears text that is not a number from Base Price on Discard Draft', async () => {
    const user = userEvent.setup()
    render(<PageContent />)

    await user.type(screen.getByLabelText('Base Price'), '.')
    expect(screen.getByLabelText('Base Price')).toHaveValue('.')

    await user.click(screen.getByRole('button', { name: /discard draft/i }))

    expect(screen.getByLabelText('Base Price')).toHaveValue('')
  })

  it('shows an upload error as a toast and enables Publish again', async () => {
    jest.mocked(uploadImageToImgBB).mockResolvedValue({
      ok: false,
      error: 'Upload failed',
    })
    const user = await fillValidForm()

    await clickPublish(user)

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Upload failed'),
    )
    expect(
      screen.getByRole('button', { name: /publish product/i }),
    ).toBeEnabled()
    expect(mockMutate).not.toHaveBeenCalled()
  })

  it('shows the Add New Product heading', () => {
    render(<PageContent />)

    expect(
      screen.getByRole('heading', { level: 1, name: 'Add New Product' }),
    ).toBeInTheDocument()
  })
})
