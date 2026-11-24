import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { ShippingMethodStatus } from '@repo/constants'

import EditShippingMethod from '.'
import { NOTICE_MESSAGES, SUCCESS_MESSAGES } from '@/constants/messages'
import { ROUTES } from '@/constants/routes'
import {
  useShippingMethodById,
  useUpdateShippingMethod,
} from '@/hooks/useShippingMethod'
import type { ShippingMethod } from '@/types/shippingMethod'
import { ServiceError } from '@/utils/query'

const mockPush = jest.fn()

jest.mock('next/navigation', () => ({
  useParams: () => ({ id: 'sm-1' }),
  usePathname: () => '/dashboard/shipping-methods/sm-1/edit',
  useRouter: () => ({ push: mockPush }),
}))

jest.mock('@/hooks/useShippingMethod', () => ({
  useShippingMethodById: jest.fn(),
  useUpdateShippingMethod: jest.fn(),
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
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  ),
}))

jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}))

interface MutateOptions {
  onSuccess?: () => void
  onError?: (error: unknown) => void
}

const method: ShippingMethod = {
  id: 'sm-1',
  name: 'Roast Express',
  description: '1-2 business days',
  price: 12,
  status: ShippingMethodStatus.ACTIVE,
  createdAt: '2026-11-24T00:00:00.000Z',
  updatedAt: '2026-11-24T00:00:00.000Z',
  deletedAt: null,
}

const mockMutate = jest.fn()
const mockUseShippingMethodById = jest.mocked(useShippingMethodById)
const mockUseUpdateShippingMethod = jest.mocked(useUpdateShippingMethod)

const mockLoaded = (
  overrides: Partial<ReturnType<typeof useShippingMethodById>> = {},
) =>
  mockUseShippingMethodById.mockReturnValue({
    shippingMethod: method,
    isLoading: false,
    isError: false,
    errorMessage: null,
    refetch: jest.fn(),
    ...overrides,
  })

const feeInput = () => screen.getByRole('textbox', { name: 'Fee' })
const saveButton = () => screen.getByRole('button', { name: 'Save changes' })

describe('EditShippingMethod', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockLoaded()
    mockUseUpdateShippingMethod.mockReturnValue({
      mutate: mockMutate,
      isPending: false,
    } as unknown as ReturnType<typeof useUpdateShippingMethod>)
  })

  it('fills the form with the loaded method', () => {
    render(<EditShippingMethod />)

    expect(mockUseShippingMethodById).toHaveBeenCalledWith('sm-1')
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue(
      'Roast Express',
    )
    expect(screen.getByRole('textbox', { name: 'Description' })).toHaveValue(
      '1-2 business days',
    )
    expect(feeInput()).toHaveValue('12')
    expect(screen.getByRole('combobox', { name: 'Status' })).toHaveValue(
      ShippingMethodStatus.ACTIVE,
    )
    expect(
      screen.getByRole('link', { name: 'Shipping methods' }),
    ).toHaveAttribute('href', ROUTES.DASHBOARD_SHIPPING_METHODS)
  })

  it('keeps Save disabled until a field changes', async () => {
    const user = userEvent.setup()
    mockMutate.mockImplementation((_input: unknown, options: MutateOptions) =>
      options.onSuccess?.(),
    )
    render(<EditShippingMethod />)

    expect(saveButton()).toBeDisabled()

    await user.clear(feeInput())
    await user.type(feeInput(), '15')
    await user.click(saveButton())

    await waitFor(() => expect(mockMutate).toHaveBeenCalledTimes(1))
    expect(mockMutate.mock.calls[0]?.[0]).toEqual({
      id: 'sm-1',
      body: {
        name: 'Roast Express',
        description: '1-2 business days',
        price: 15,
        status: ShippingMethodStatus.ACTIVE,
      },
    })
    expect(toast.success).toHaveBeenCalledWith(
      SUCCESS_MESSAGES.SHIPPING_METHOD_UPDATED,
    )
    expect(mockPush).toHaveBeenCalledWith(ROUTES.DASHBOARD_SHIPPING_METHODS)
  })

  it('saves a status change on its own', async () => {
    const user = userEvent.setup()
    render(<EditShippingMethod />)

    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Status' }),
      ShippingMethodStatus.INACTIVE,
    )
    expect(saveButton()).toBeEnabled()
    await user.click(saveButton())

    await waitFor(() => expect(mockMutate).toHaveBeenCalledTimes(1))
    expect(mockMutate.mock.calls[0]?.[0]).toEqual({
      id: 'sm-1',
      body: {
        name: 'Roast Express',
        description: '1-2 business days',
        price: 12,
        status: ShippingMethodStatus.INACTIVE,
      },
    })
  })

  it('shows an API field error under the field', async () => {
    const user = userEvent.setup()
    mockMutate.mockImplementation((_input: unknown, options: MutateOptions) =>
      options.onError?.(
        new ServiceError('Bad Request', [
          { errCode: 'X', field: 'price', message: 'Fee is too high' },
        ]),
      ),
    )
    render(<EditShippingMethod />)

    await user.clear(feeInput())
    await user.type(feeInput(), '15')
    await user.click(saveButton())

    await waitFor(() =>
      expect(feeInput()).toHaveAccessibleDescription('Fee is too high'),
    )
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('shows the locked notice instead of the form for a deleted method', () => {
    mockLoaded({
      shippingMethod: { ...method, deletedAt: '2026-11-24T01:00:00.000Z' },
    })

    render(<EditShippingMethod />)

    expect(
      screen.getByText(NOTICE_MESSAGES.SHIPPING_METHOD_DELETED_LOCKED),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('textbox', { name: 'Name' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Save changes' }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Back to shipping methods' }),
    ).toHaveAttribute('href', ROUTES.DASHBOARD_SHIPPING_METHODS)
  })

  it('shows the load error with a link back', () => {
    mockLoaded({
      shippingMethod: null,
      isError: true,
      errorMessage: 'Shipping method not found',
    })

    render(<EditShippingMethod />)

    expect(screen.getByText('Shipping method not found')).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Back to shipping methods' }),
    ).toHaveAttribute('href', ROUTES.DASHBOARD_SHIPPING_METHODS)
  })
})
