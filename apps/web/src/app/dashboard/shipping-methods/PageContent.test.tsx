import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { ShippingMethodStatus } from '@repo/constants'

import { PageContent } from '@/app/dashboard/shipping-methods/PageContent'
import {
  API_FALLBACK_ERRORS,
  DIALOG_MESSAGES,
  SUCCESS_MESSAGES,
} from '@/constants/messages'
import { ROUTES } from '@/constants/routes'
import {
  useDeleteShippingMethod,
  useShippingMethods,
  useUpdateShippingMethod,
} from '@/hooks/useShippingMethod'
import type { ShippingMethod } from '@/types/shippingMethod'
import type * as ShippingMethodHooks from '@/hooks/useShippingMethod'
import { formatPrice } from '@/utils/common'

let navQueryString = ''
const originalFetch = globalThis.fetch

const mockReplace = jest.fn((href: string) => {
  navQueryString = href.includes('?') ? (href.split('?')[1] ?? '') : ''
})

jest.mock('next/navigation', () => ({
  usePathname: jest.fn(),
  useRouter: jest.fn(),
  useSearchParams: jest.fn(),
}))

jest.mock('@clerk/nextjs', () => ({ useAuth: jest.fn() }))

jest.mock('@/hooks/useShippingMethod', () => ({
  useShippingMethods: jest.fn(),
  useUpdateShippingMethod: jest.fn(),
  useDeleteShippingMethod: jest.fn(),
}))

jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}))

jest.mock('@/components/Select', () => ({
  Select: ({
    selected,
    onValueChange,
    options,
    ariaLabel,
  }: {
    selected?: string
    onValueChange?: (value: string) => void
    options: { value: string; label: string }[]
    ariaLabel?: string
  }) => (
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
  ),
}))

const mockUseShippingMethods = jest.mocked(useShippingMethods)
const mockUseUpdateShippingMethod = jest.mocked(useUpdateShippingMethod)
const mockUseDeleteShippingMethod = jest.mocked(useDeleteShippingMethod)
const mutateUpdate = jest.fn()
const mutateDelete = jest.fn()

const method = (
  id: string,
  status: ShippingMethodStatus,
  deletedAt: string | null = null,
): ShippingMethod => ({
  id,
  name: id,
  description: `${id} delivery`,
  price: 12,
  status,
  createdAt: '2026-11-24T00:00:00.000Z',
  updatedAt: '2026-11-24T00:00:00.000Z',
  deletedAt,
})

const S1 = method('S1', ShippingMethodStatus.ACTIVE)
const S2 = method('S2', ShippingMethodStatus.INACTIVE)
const S3 = method('S3', ShippingMethodStatus.ACTIVE, '2026-11-24T01:00:00.000Z')

const listResult = (
  overrides: Partial<ReturnType<typeof useShippingMethods>> = {},
) => ({
  shippingMethods: [S1, S2, S3],
  meta: { limit: 10, currentPage: 1, pageCount: 1, totalCount: 3 },
  isLoading: false,
  isFetching: false,
  isError: false,
  errorMessage: null,
  refetch: jest.fn(),
  ...overrides,
})

const rowOf = (name: string) =>
  screen.getByRole('button', { name: `Delete ${name}` }).closest('tr')

const chooseStatus = async (
  user: ReturnType<typeof userEvent.setup>,
  name: string,
  label: 'Active' | 'Inactive',
) => {
  await user.click(
    screen.getByRole('button', { name: `Change status for ${name}` }),
  )
  const menu = await screen.findByRole('menu')
  await user.click(within(menu).getByRole('menuitem', { name: label }))
}

describe('Shipping methods PageContent', () => {
  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  beforeEach(() => {
    jest.clearAllMocks()
    navQueryString = ''
    jest.mocked(usePathname).mockReturnValue(ROUTES.DASHBOARD_SHIPPING_METHODS)
    jest.mocked(useRouter).mockReturnValue({
      replace: mockReplace,
    } as unknown as ReturnType<typeof useRouter>)
    jest
      .mocked(useSearchParams)
      .mockImplementation(
        () =>
          new URLSearchParams(navQueryString) as unknown as ReturnType<
            typeof useSearchParams
          >,
      )
    mockUseShippingMethods.mockReturnValue(listResult())
    mockUseUpdateShippingMethod.mockReturnValue({
      mutateAsync: mutateUpdate,
      isPending: false,
    } as unknown as ReturnType<typeof useUpdateShippingMethod>)
    mockUseDeleteShippingMethod.mockReturnValue({
      mutate: mutateDelete,
      isPending: false,
    } as unknown as ReturnType<typeof useDeleteShippingMethod>)
  })

  it('links the Add button to the add page', () => {
    render(<PageContent />)

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Manage Shipping Methods',
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /add shipping method/i }),
    ).toHaveAttribute('href', ROUTES.DASHBOARD_SHIPPING_METHODS_ADD)
  })

  it('renders the name, description, fee and status of each method', () => {
    render(<PageContent />)

    expect(
      screen.getByRole('columnheader', { name: 'Fee' }),
    ).toBeInTheDocument()
    expect(screen.getByText('S1 delivery')).toBeInTheDocument()
    expect(screen.getAllByText(formatPrice(12))).toHaveLength(3)
    expect(screen.getByText(ShippingMethodStatus.INACTIVE)).toBeInTheDocument()
  })

  it('AC1 lists S1, S2 and S3 and greys S3 out with Edit and Delete disabled', () => {
    render(<PageContent />)

    expect(rowOf('S1')).not.toHaveClass('bg-muted-foreground/20')
    expect(rowOf('S2')).not.toHaveClass('bg-muted-foreground/20')
    expect(rowOf('S3')).toHaveClass('bg-muted-foreground/20')
    expect(screen.getByRole('button', { name: 'Edit S3' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Delete S3' })).toBeDisabled()
    expect(screen.getByRole('link', { name: 'Edit S1' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete S1' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Delete S2' })).toBeEnabled()
  })

  it('AC4 sets S1 to Inactive from its status menu without a confirm', async () => {
    const user = userEvent.setup()
    mutateUpdate.mockResolvedValue(S1)
    render(<PageContent />)

    await chooseStatus(user, 'S1', 'Inactive')

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(mutateUpdate).toHaveBeenCalledWith({
      id: 'S1',
      body: { status: ShippingMethodStatus.INACTIVE },
    })
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        SUCCESS_MESSAGES.SHIPPING_METHOD_DEACTIVATED,
      ),
    )
  })

  it('sets an inactive method to Active', async () => {
    const user = userEvent.setup()
    mutateUpdate.mockResolvedValue(S2)
    render(<PageContent />)

    await chooseStatus(user, 'S2', 'Active')

    expect(mutateUpdate).toHaveBeenCalledWith({
      id: 'S2',
      body: { status: ShippingMethodStatus.ACTIVE },
    })
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        SUCCESS_MESSAGES.SHIPPING_METHOD_ACTIVATED,
      ),
    )
  })

  it('keeps each running status menu disabled until its own request settles', async () => {
    const user = userEvent.setup()
    const actualHooks = jest.requireActual<typeof ShippingMethodHooks>(
      '@/hooks/useShippingMethod',
    )
    mockUseUpdateShippingMethod.mockImplementation(
      actualHooks.useUpdateShippingMethod,
    )
    const responses: Record<string, (body: ShippingMethod) => void> = {}
    globalThis.fetch = jest.fn(
      (url: string) =>
        new Promise((resolve) => {
          const id = url.split('/').pop() ?? ''
          responses[id] = (body) =>
            resolve({
              ok: true,
              status: 200,
              json: async () => ({ data: body }),
            })
        }),
    ) as unknown as typeof fetch
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
    render(
      <QueryClientProvider client={client}>
        <PageContent />
      </QueryClientProvider>,
    )

    await chooseStatus(user, 'S1', 'Inactive')
    await chooseStatus(user, 'S2', 'Active')

    expect(
      screen.getByRole('button', { name: 'Change status for S1' }),
    ).toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'Change status for S2' }),
    ).toBeDisabled()

    await act(async () => {
      responses.S1?.({ ...S1, status: ShippingMethodStatus.INACTIVE })
    })

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Change status for S1' }),
      ).toBeEnabled(),
    )
    expect(toast.success).toHaveBeenCalledWith(
      SUCCESS_MESSAGES.SHIPPING_METHOD_DEACTIVATED,
    )
    expect(
      screen.getByRole('button', { name: 'Change status for S2' }),
    ).toBeDisabled()

    await act(async () => {
      responses.S2?.({ ...S2, status: ShippingMethodStatus.ACTIVE })
    })

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Change status for S2' }),
      ).toBeEnabled(),
    )
    expect(toast.success).toHaveBeenCalledWith(
      SUCCESS_MESSAGES.SHIPPING_METHOD_ACTIVATED,
    )
  })

  it('toasts the API error when the status change fails', async () => {
    const user = userEvent.setup()
    mutateUpdate.mockRejectedValue(new Error('Shipping method not found'))
    render(<PageContent />)

    await chooseStatus(user, 'S1', 'Inactive')

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Shipping method not found'),
    )
    expect(
      screen.getByRole('button', { name: 'Change status for S1' }),
    ).toBeEnabled()
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('asks for a confirm before deleting and deletes on confirm', async () => {
    const user = userEvent.setup()
    render(<PageContent />)

    await user.click(screen.getByRole('button', { name: 'Delete S1' }))

    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent(
      DIALOG_MESSAGES.SHIPPING_METHOD.DELETE.TITLE,
    )
    expect(mutateDelete).not.toHaveBeenCalled()

    await user.click(
      screen.getByRole('button', {
        name: DIALOG_MESSAGES.SHIPPING_METHOD.DELETE.ACTION,
      }),
    )

    expect(mutateDelete).toHaveBeenCalledWith('S1', expect.any(Object))
  })

  it('goes back to page 1 when the status filter changes', async () => {
    const user = userEvent.setup()
    navQueryString = 'page=3'
    const view = render(<PageContent />)

    const filter = screen.getByRole('combobox', { name: 'Status filter' })
    expect(
      Array.from((filter as HTMLSelectElement).options).map((o) => o.text),
    ).toEqual(['All statuses', 'Active', 'Inactive'])

    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Status filter' }),
      ShippingMethodStatus.INACTIVE,
    )
    view.rerender(<PageContent />)

    expect(mockReplace).toHaveBeenCalled()
    const params = new URLSearchParams(navQueryString)
    expect(params.get('status')).toBe(ShippingMethodStatus.INACTIVE)
    expect(params.get('page')).not.toBe('3')
    await waitFor(() =>
      expect(mockUseShippingMethods).toHaveBeenLastCalledWith(
        expect.objectContaining({
          status: ShippingMethodStatus.INACTIVE,
          page: 1,
        }),
      ),
    )
  })

  it('shows the error state', () => {
    mockUseShippingMethods.mockReturnValue(
      listResult({
        shippingMethods: [],
        isError: true,
        errorMessage: API_FALLBACK_ERRORS.SHIPPING_METHODS_LOAD,
      }),
    )

    render(<PageContent />)

    expect(
      screen.getByText(API_FALLBACK_ERRORS.SHIPPING_METHODS_LOAD),
    ).toBeInTheDocument()
  })
})
