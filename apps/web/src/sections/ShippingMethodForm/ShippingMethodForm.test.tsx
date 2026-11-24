import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'

import ShippingMethodForm, { type ShippingMethodFormProps } from '.'
import { ShippingMethodStatus } from '@repo/constants'

import { ERROR_MESSAGES } from '@/constants/messages'
import { ROUTES } from '@/constants/routes'
import { ServiceError } from '@/utils/query'

jest.mock('next/navigation', () => ({
  usePathname: () => ROUTES.DASHBOARD_SHIPPING_METHODS_ADD,
}))

jest.mock('@/components/Select', () => ({
  Select: ({
    label,
    selected,
    onValueChange,
    options,
    errorMessage,
  }: {
    label?: string
    selected?: string
    onValueChange?: (value: string | null) => void
    options: { value: string; label: string }[]
    errorMessage?: string
  }) => (
    <div>
      <button type="button" onClick={() => onValueChange?.(null)}>
        {`Clear ${label ?? ''}`}
      </button>
      <label>
        {label}
        <select
          aria-label={label}
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
      {errorMessage}
    </div>
  ),
}))

jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}))

const baseProps: ShippingMethodFormProps = {
  formId: 'shipping-method-test-form',
  title: 'Add Shipping Method',
  breadcrumbItems: [
    { label: 'Dashboard', href: ROUTES.DASHBOARD },
    { label: 'Shipping methods', href: ROUTES.DASHBOARD_SHIPPING_METHODS },
  ],
  submitLabel: 'Create shipping method',
  isPending: false,
  onSubmit: jest.fn(),
}

const renderForm = (props: Partial<ShippingMethodFormProps> = {}) =>
  render(<ShippingMethodForm {...baseProps} {...props} />)

const nameInput = () => screen.getByRole('textbox', { name: 'Name' })
const descriptionInput = () =>
  screen.getByRole('textbox', { name: 'Description' })
const feeInput = () => screen.getByRole('textbox', { name: 'Fee' })
const submitButton = (name = 'Create shipping method') =>
  screen.getByRole('button', { name })

const fillForm = async (
  user: ReturnType<typeof userEvent.setup>,
  values: { name: string; description: string; fee: string },
) => {
  await user.type(nameInput(), values.name)
  await user.type(descriptionInput(), values.description)
  await user.type(feeInput(), values.fee)
}

describe('ShippingMethodForm', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('submits the trimmed values', async () => {
    const user = userEvent.setup()
    const onSubmit = jest.fn()
    renderForm({ onSubmit })

    await fillForm(user, {
      name: '  Same day ',
      description: 'Today',
      fee: '25',
    })
    await user.click(submitButton())

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit.mock.calls[0]?.[0]).toEqual({
      name: 'Same day',
      description: 'Today',
      price: 25,
      status: ShippingMethodStatus.ACTIVE,
    })
  })

  it('shows a Status select defaulting to Active and submits the chosen status', async () => {
    const user = userEvent.setup()
    const onSubmit = jest.fn()
    renderForm({ onSubmit })

    const status = screen.getByRole('combobox', { name: 'Status' })
    expect(status).toHaveValue(ShippingMethodStatus.ACTIVE)

    await fillForm(user, { name: 'Same day', description: 'Today', fee: '25' })
    await user.selectOptions(status, ShippingMethodStatus.INACTIVE)
    await user.click(submitButton())

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit.mock.calls[0]?.[0]).toEqual({
      name: 'Same day',
      description: 'Today',
      price: 25,
      status: ShippingMethodStatus.INACTIVE,
    })
  })

  it('shows the required error when the Status select is cleared', async () => {
    const user = userEvent.setup()
    const onSubmit = jest.fn()
    renderForm({ onSubmit })

    await fillForm(user, { name: 'Same day', description: 'Today', fee: '25' })
    await user.click(screen.getByRole('button', { name: 'Clear Status' }))
    await user.click(submitButton())

    expect(
      await screen.findByText(ERROR_MESSAGES.FIELD_REQUIRED),
    ).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('shows the Status from defaultValues', () => {
    renderForm({
      defaultValues: {
        name: 'Roast Express',
        description: '1-2 business days',
        price: 12,
        status: ShippingMethodStatus.INACTIVE,
      },
    })

    expect(screen.getByRole('combobox', { name: 'Status' })).toHaveValue(
      ShippingMethodStatus.INACTIVE,
    )
  })

  it('shows client errors and does not submit', async () => {
    const user = userEvent.setup()
    const onSubmit = jest.fn()
    renderForm({ onSubmit })

    await user.click(submitButton())

    expect(
      await screen.findAllByText(ERROR_MESSAGES.FIELD_REQUIRED),
    ).toHaveLength(3)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('AC3 shows "Shipping method name already exists" under the name field', async () => {
    const user = userEvent.setup()
    const conflict = new ServiceError('Conflict', [
      {
        errCode: 'SHIPPING_METHOD_NAME_EXISTS',
        field: 'name',
        message: 'Shipping method name already exists',
      },
    ])
    renderForm({
      onSubmit: (_values, actions) => actions.handleServerError(conflict),
    })

    await fillForm(user, {
      name: 'Roast Express',
      description: '1-2 business days',
      fee: '12',
    })
    await user.click(submitButton())

    expect(
      await screen.findByText('Shipping method name already exists'),
    ).toBeInTheDocument()
    await waitFor(() => expect(nameInput()).toHaveFocus())
    expect(toast.error).not.toHaveBeenCalled()
  })

  it("shows the API's name, description and price errors under their fields", async () => {
    const user = userEvent.setup()
    const error = new ServiceError('Bad Request', [
      { errCode: 'A', field: 'name', message: 'Name is not allowed' },
      { errCode: 'B', field: 'description', message: 'Description is odd' },
      { errCode: 'C', field: 'price', message: 'Fee is too high' },
      { errCode: 'D', field: 'id', message: 'Something else went wrong' },
    ])
    renderForm({
      onSubmit: (_values, actions) => actions.handleServerError(error),
    })

    await fillForm(user, { name: 'Same day', description: 'Today', fee: '25' })
    await user.click(submitButton())

    await waitFor(() =>
      expect(nameInput()).toHaveAccessibleDescription('Name is not allowed'),
    )
    expect(descriptionInput()).toHaveAccessibleDescription('Description is odd')
    expect(feeInput()).toHaveAccessibleDescription('Fee is too high')
    expect(toast.error).toHaveBeenCalledWith('Something else went wrong')
  })

  it('keeps submit disabled until a field changes with requireChange', async () => {
    const user = userEvent.setup()
    renderForm({
      submitLabel: 'Save changes',
      requireChange: true,
      defaultValues: {
        name: 'Roast Express',
        description: '1-2 business days',
        price: 12,
        status: ShippingMethodStatus.ACTIVE,
      },
    })

    expect(submitButton('Save changes')).toBeDisabled()
    expect(nameInput()).toHaveValue('Roast Express')
    expect(feeInput()).toHaveValue('12')

    await user.clear(feeInput())
    await user.type(feeInput(), '15')

    expect(submitButton('Save changes')).toBeEnabled()
  })

  it('shows the loading state instead of the inputs', () => {
    renderForm({ isLoading: true })

    expect(
      screen.queryByRole('textbox', { name: 'Name' }),
    ).not.toBeInTheDocument()
  })
})
