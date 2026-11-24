import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { ShippingMethodStatus } from '@repo/constants'

import AddShippingMethodPage from './page'
import { SUCCESS_MESSAGES } from '@/constants/messages'
import { ROUTES } from '@/constants/routes'
import { useCreateShippingMethod } from '@/hooks/useShippingMethod'
import { ServiceError } from '@/utils/query'

const mockPush = jest.fn()

jest.mock('next/navigation', () => ({
  usePathname: () => ROUTES.DASHBOARD_SHIPPING_METHODS_ADD,
  useRouter: () => ({ push: mockPush }),
}))

jest.mock('@/hooks/useShippingMethod', () => ({
  useCreateShippingMethod: jest.fn(),
}))

jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}))

interface MutateOptions {
  onSuccess?: () => void
  onError?: (error: unknown) => void
}

const mockMutate = jest.fn()
const mockUseCreateShippingMethod = jest.mocked(useCreateShippingMethod)

const fillAndSubmit = async (
  name: string,
  description: string,
  fee: string,
) => {
  const user = userEvent.setup()
  render(<AddShippingMethodPage />)
  await user.type(screen.getByRole('textbox', { name: 'Name' }), name)
  await user.type(
    screen.getByRole('textbox', { name: 'Description' }),
    description,
  )
  await user.type(screen.getByRole('textbox', { name: 'Fee' }), fee)
  await user.click(
    screen.getByRole('button', { name: 'Create shipping method' }),
  )
}

describe('AddShippingMethodPage', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockUseCreateShippingMethod.mockReturnValue({
      mutate: mockMutate,
      isPending: false,
    } as unknown as ReturnType<typeof useCreateShippingMethod>)
  })

  it('renders the heading and the breadcrumb back to the list', () => {
    render(<AddShippingMethodPage />)

    expect(
      screen.getByRole('heading', { level: 1, name: 'Add Shipping Method' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Shipping methods' }),
    ).toHaveAttribute('href', ROUTES.DASHBOARD_SHIPPING_METHODS)
  })

  it('AC2 creates "Same day" with fee 25 and goes back to the list', async () => {
    mockMutate.mockImplementation((_body: unknown, options: MutateOptions) =>
      options.onSuccess?.(),
    )

    await fillAndSubmit('Same day', 'Today', '25')

    await waitFor(() => expect(mockMutate).toHaveBeenCalledTimes(1))
    expect(mockMutate.mock.calls[0]?.[0]).toEqual({
      name: 'Same day',
      description: 'Today',
      price: 25,
      status: ShippingMethodStatus.ACTIVE,
    })
    expect(toast.success).toHaveBeenCalledWith(
      SUCCESS_MESSAGES.SHIPPING_METHOD_CREATED,
    )
    expect(mockPush).toHaveBeenCalledWith(ROUTES.DASHBOARD_SHIPPING_METHODS)
  })

  it('AC3 shows the duplicate-name error under the name field', async () => {
    mockMutate.mockImplementation((_body: unknown, options: MutateOptions) =>
      options.onError?.(
        new ServiceError('Conflict', [
          {
            errCode: 'SHIPPING_METHOD_NAME_EXISTS',
            field: 'name',
            message: 'Shipping method name already exists',
          },
        ]),
      ),
    )

    await fillAndSubmit('Roast Express', '1-2 business days', '12')

    await waitFor(() =>
      expect(
        screen.getByRole('textbox', { name: 'Name' }),
      ).toHaveAccessibleDescription('Shipping method name already exists'),
    )
    expect(mockPush).not.toHaveBeenCalled()
    expect(toast.error).not.toHaveBeenCalled()
  })
})
