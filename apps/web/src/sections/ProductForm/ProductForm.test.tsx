import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DiscountType, ProductUnit, RoastLevel } from '@repo/constants'
import { toast } from 'sonner'

import ProductForm, { type ProductFormProps, type ProductFormState } from '.'
import {
  DIALOG_MESSAGES,
  ERROR_MESSAGES,
  FORM_MESSAGES,
  SUCCESS_MESSAGES,
} from '@/constants/messages'
import { QUANTITY_MAX } from '@/constants/product'
import { ROUTES } from '@/constants/routes'
import { useCategories } from '@/hooks/useCategory'
import { uploadImageToImgBB } from '@/services/image'

const mockPush = jest.fn()

jest.mock('next/navigation', () => ({
  usePathname: () => ROUTES.DASHBOARD_PRODUCTS,
  useRouter: () => ({ push: mockPush }),
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

const SAVED_PRIMARY_URL = 'https://example.com/primary.jpg'
const SAVED_GALLERY_URL = 'https://example.com/gallery.jpg'

const savedState: ProductFormState = {
  values: {
    categoryId: 'category-1',
    name: 'House Blend',
    description: 'A balanced everyday coffee',
    roastLevel: RoastLevel.MEDIUM,
    isOrganic: false,
    isFairTrade: true,
    size: 250,
    unit: ProductUnit.G,
    price: 20,
    discountType: DiscountType.PERCENT,
    discountValue: 0,
    stockQuantity: 5,
    origin: 'Colombia',
    processingMethod: 'Washed',
  },
  tastingNotes: ['Cocoa', 'Plum'],
  isListedOnStorefront: true,
  primaryUrl: SAVED_PRIMARY_URL,
  galleryItems: [{ id: 'image-2', url: SAVED_GALLERY_URL, name: 'Gallery' }],
}

const emptyState: ProductFormState = {
  ...savedState,
  values: { ...savedState.values, size: '', unit: '', price: '' },
  tastingNotes: [],
  primaryUrl: null,
  galleryItems: [],
}

const baseProps: ProductFormProps = {
  mode: 'edit',
  formId: 'product-form',
  title: 'Product',
  description: 'Product form',
  breadcrumbItems: [{ label: 'Products', href: ROUTES.DASHBOARD_PRODUCTS }],
  submitLabel: 'Submit',
  resetLabel: 'Reset',
  initialState: savedState,
  isPending: false,
  onSubmit: jest.fn(),
}

const renderForm = (props: Partial<ProductFormProps> = {}) =>
  render(<ProductForm {...baseProps} {...props} />)

const submitButton = () => screen.getByRole('button', { name: /submit/i })
const resetButton = () => screen.getByRole('button', { name: /^reset$/i })

const discardDialog = () =>
  screen.getByRole('alertdialog', {
    name: DIALOG_MESSAGES.PRODUCT.DISCARD_CHANGES.TITLE,
  })

const confirmDiscard = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(resetButton())
  await user.click(
    within(discardDialog()).getByRole('button', { name: /^reset$/i }),
  )
}

const image = (name: string) => new File(['x'], name, { type: 'image/png' })

describe('ProductForm', () => {
  beforeAll(() => {
    URL.createObjectURL = jest.fn(() => 'blob:preview')
    URL.revokeObjectURL = jest.fn()
  })

  beforeEach(() => {
    jest.clearAllMocks()
    jest.mocked(useCategories).mockReturnValue({
      categories: [{ id: 'category-1', name: 'Coffee' }],
      isLoading: false,
    } as unknown as ReturnType<typeof useCategories>)
  })

  it('lays out the header actions like every PageHeader page', () => {
    renderForm()

    const header = screen.getByRole('banner')
    expect(within(header).getByRole('navigation', { name: 'breadcrumb' })).toBe(
      header.firstElementChild,
    )
    expect(submitButton().parentElement).toHaveClass(
      'w-full',
      'justify-end',
      'sm:w-auto',
    )
  })

  it('keeps Reset and Submit disabled until something changes', async () => {
    const user = userEvent.setup()
    renderForm({ requireChange: true })

    expect(resetButton()).toBeDisabled()
    expect(submitButton()).toBeDisabled()

    await user.type(screen.getByLabelText('Product Name'), ' Two')

    expect(resetButton()).toBeEnabled()
    expect(submitButton()).toBeEnabled()
  })

  it('counts tasting notes, the storefront switch and images as changes', async () => {
    const user = userEvent.setup()
    renderForm({ requireChange: true })

    await user.click(screen.getByRole('button', { name: 'Remove Cocoa' }))
    expect(submitButton()).toBeEnabled()
    await confirmDiscard(user)
    expect(submitButton()).toBeDisabled()

    const storefront = screen.getByRole('switch', { name: 'Active Status' })
    await user.click(storefront)
    expect(submitButton()).toBeEnabled()
    await user.click(storefront)
    expect(submitButton()).toBeDisabled()

    const [, removeGalleryImage] = screen.getAllByRole('button', {
      name: 'Remove image',
    })
    if (!removeGalleryImage) throw new Error('gallery image')
    await user.click(removeGalleryImage)
    expect(submitButton()).toBeEnabled()
  })

  it('counts a new primary image or gallery file as a change until it is removed', async () => {
    const user = userEvent.setup()
    const { container } = renderForm({ requireChange: true })
    const fileInput = (selector: string) => {
      const input = container.querySelector(selector)
      if (!(input instanceof HTMLInputElement)) throw new Error(selector)
      return input
    }
    const removeImageButtons = () =>
      screen.getAllByRole('button', { name: 'Remove image' })

    await user.upload(
      fileInput('input[name="avatar"]'),
      image('new-primary.png'),
    )
    expect(submitButton()).toBeEnabled()
    const [removePrimary] = removeImageButtons()
    if (!removePrimary) throw new Error('primary image')
    await user.click(removePrimary)
    expect(submitButton()).toBeDisabled()

    await user.upload(
      fileInput('input[name="gallery[]"]'),
      image('new-gallery.png'),
    )
    expect(submitButton()).toBeEnabled()
    const removeNewGalleryFile = removeImageButtons().at(-1)
    if (!removeNewGalleryFile) throw new Error('gallery file')
    await user.click(removeNewGalleryFile)
    expect(submitButton()).toBeDisabled()
  })

  it('goes back to the initial state on reset', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.type(screen.getByLabelText('Product Name'), ' Two')
    await user.click(screen.getByRole('button', { name: 'Remove Cocoa' }))
    expect(
      screen.queryByRole('button', { name: 'Remove Cocoa' }),
    ).not.toBeInTheDocument()

    await confirmDiscard(user)

    expect(screen.getByLabelText('Product Name')).toHaveValue('House Blend')
    expect(
      screen.getByRole('button', { name: 'Remove Cocoa' }),
    ).toBeInTheDocument()
    expect(toast.success).toHaveBeenCalledWith(SUCCESS_MESSAGES.DRAFT_DISCARDED)
  })

  it('asks before discarding changes and keeps them on Keep editing', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.type(screen.getByLabelText('Product Name'), ' Two')
    await user.click(resetButton())

    expect(
      within(discardDialog()).getByText(
        DIALOG_MESSAGES.PRODUCT.DISCARD_CHANGES.DESCRIPTION,
      ),
    ).toBeInTheDocument()
    await user.click(
      within(discardDialog()).getByRole('button', {
        name: DIALOG_MESSAGES.PRODUCT.DISCARD_CHANGES.KEEP,
      }),
    )

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Product Name')).toHaveValue('House Blend Two')
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('asks before following a link away from unsaved changes', async () => {
    const user = userEvent.setup()
    renderForm()
    const inventoryLink = () =>
      screen.getByRole('link', { name: 'Change stock in Inventory' })

    await user.type(screen.getByLabelText('Product Name'), ' Two')
    await user.click(inventoryLink())

    const leaveDialog = screen.getByRole('alertdialog', {
      name: DIALOG_MESSAGES.PRODUCT.LEAVE_UNSAVED.TITLE,
    })
    await user.click(
      within(leaveDialog).getByRole('button', {
        name: DIALOG_MESSAGES.PRODUCT.LEAVE_UNSAVED.KEEP,
      }),
    )
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Product Name')).toHaveValue('House Blend Two')
    expect(mockPush).not.toHaveBeenCalled()

    await user.click(inventoryLink())
    await user.click(
      within(
        screen.getByRole('alertdialog', {
          name: DIALOG_MESSAGES.PRODUCT.LEAVE_UNSAVED.TITLE,
        }),
      ).getByRole('button', {
        name: DIALOG_MESSAGES.PRODUCT.LEAVE_UNSAVED.ACTION,
      }),
    )
    expect(mockPush).toHaveBeenCalledWith(ROUTES.DASHBOARD_INVENTORY)
  })

  it('follows links without asking when nothing changed', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.click(
      screen.getByRole('link', { name: 'Change stock in Inventory' }),
    )

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('shows both image-required errors and does not submit without images', async () => {
    const user = userEvent.setup()
    const onSubmit = jest.fn()
    renderForm({ mode: 'create', initialState: emptyState, onSubmit })

    await user.click(submitButton())

    expect(
      await screen.findByText(ERROR_MESSAGES.PRODUCT_AVATAR_REQUIRED),
    ).toBeInTheDocument()
    expect(
      screen.getByText(ERROR_MESSAGES.PRODUCT_GALLERY_REQUIRED),
    ).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('submits the kept images and the joined tasting notes', async () => {
    const user = userEvent.setup()
    const onSubmit = jest.fn()
    renderForm({ onSubmit })

    await user.type(screen.getByLabelText('Product Name'), ' Two')
    await user.click(submitButton())

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    const [submission] = onSubmit.mock.calls[0] as Parameters<
      ProductFormProps['onSubmit']
    >
    expect(submission).toMatchObject({
      tastingNotes: 'Cocoa, Plum',
      isListedOnStorefront: true,
      primaryUrl: SAVED_PRIMARY_URL,
      galleryUrls: [SAVED_GALLERY_URL],
    })
    expect(submission.values.name).toBe('House Blend Two')
    expect(uploadImageToImgBB).not.toHaveBeenCalled()
  })

  it('labels Size and Quantity', () => {
    const { unmount } = renderForm({ mode: 'create', initialState: emptyState })

    expect(screen.getByRole('textbox', { name: 'Size' })).toBeInTheDocument()
    expect(
      screen.getByRole('textbox', { name: 'Quantity' }),
    ).toBeInTheDocument()
    expect(screen.queryByLabelText('Weight')).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/initial|stock/i)).not.toBeInTheDocument()

    unmount()
    renderForm()

    expect(screen.getByRole('textbox', { name: 'Size' })).toBeInTheDocument()
    expect(screen.getByLabelText('Unit')).toBeInTheDocument()
    expect(screen.queryByLabelText('Weight')).not.toBeInTheDocument()
  })

  it('ProductForm in edit mode shows stock read-only with a link to Inventory', () => {
    renderForm()

    expect(
      screen.queryByRole('textbox', { name: 'Quantity' }),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('status', { name: 'Quantity' })).toHaveTextContent(
      '5',
    )
    expect(
      screen.getByRole('link', { name: 'Change stock in Inventory' }),
    ).toHaveAttribute('href', ROUTES.DASHBOARD_INVENTORY)
  })

  it('keeps a stock quantity above the limit and says so on submit', async () => {
    const user = userEvent.setup()
    const onSubmit = jest.fn()
    renderForm({ mode: 'create', initialState: emptyState, onSubmit })
    const quantity = screen.getByRole('textbox', { name: 'Quantity' })

    await user.clear(quantity)
    await user.type(quantity, '600')
    await user.click(submitButton())

    expect(quantity).toHaveValue('600')
    expect(
      await screen.findByText(FORM_MESSAGES.max('Quantity', QUANTITY_MAX)),
    ).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('keeps a percent discount of 100 and says it must stay below 100%', async () => {
    const user = userEvent.setup()
    const onSubmit = jest.fn()
    renderForm({ onSubmit })
    const discount = screen.getByRole('textbox', { name: 'Discount (%)' })

    await user.clear(discount)
    await user.type(discount, '100')
    await user.click(submitButton())

    expect(discount).toHaveValue('100')
    expect(
      await screen.findByText(FORM_MESSAGES.DISCOUNT_PERCENT),
    ).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('keeps a base price above the limit and says so on submit', async () => {
    const user = userEvent.setup()
    const onSubmit = jest.fn()
    renderForm({ onSubmit })
    const price = screen.getByRole('textbox', { name: 'Base Price' })

    await user.clear(price)
    await user.type(price, '100000000')
    await user.click(submitButton())

    expect(price).toHaveValue('100,000,000')
    expect(
      await screen.findByText(FORM_MESSAGES.max('Base price', '99,999,999.99')),
    ).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('ProductForm in add mode keeps the stock field', () => {
    renderForm({ mode: 'create', initialState: emptyState })

    expect(
      screen.getByRole('textbox', { name: 'Quantity' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: 'Change stock in Inventory' }),
    ).not.toBeInTheDocument()
  })
})
