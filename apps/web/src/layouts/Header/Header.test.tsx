import React from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRouter, usePathname } from 'next/navigation'
import { useAuth as useClerkAuth } from '@clerk/nextjs'

import { UserRole } from '@repo/constants'

import { ROUTES } from '@/constants/routes'
import Header from '@/layouts/Header'
import { useAuth } from '@/hooks/useAuth'
import { useCart, type UseCartResult } from '@/hooks/useCart'

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
  usePathname: jest.fn(),
}))

jest.mock('@clerk/nextjs', () => ({
  SignedIn: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SignedOut: () => null,
  useAuth: jest.fn(),
  useUser: () => ({
    user: {
      firstName: 'Ada',
      lastName: 'Admin',
      fullName: 'Ada Admin',
      imageUrl: '',
      emailAddresses: [],
    },
  }),
  useClerk: () => ({ signOut: jest.fn() }),
}))

jest.mock('@/hooks/useAuth', () => ({
  useAuth: jest.fn(),
}))

jest.mock('@/hooks/useCart', () => ({
  useCart: jest.fn(),
}))

const DASHBOARD = 'Go to Dashboard'
// The menu trigger is named by the avatar fallback: the user's initials
const USER_INITIALS = 'AA'
const push = jest.fn()

const mockSession = (sessionClaims: unknown) => {
  jest
    .mocked(useClerkAuth)
    .mockReturnValue({ sessionClaims } as unknown as ReturnType<
      typeof useClerkAuth
    >)
}

const mockProfile = (profile: Partial<ReturnType<typeof useAuth>>) => {
  jest.mocked(useAuth).mockReturnValue({
    user: null,
    isLoading: false,
    error: null,
    ...profile,
  } as ReturnType<typeof useAuth>)
}

const openUserMenu = async () => {
  const user = userEvent.setup()
  await user.click(
    within(screen.getByRole('banner')).getByRole('button', {
      name: USER_INITIALS,
    }),
  )
  return { user, menu: await screen.findByRole('menu') }
}

const expectBaseItems = (menu: HTMLElement) => {
  expect(
    within(menu).getByRole('menuitem', { name: 'Profile' }),
  ).toBeInTheDocument()
  expect(
    within(menu).getByRole('menuitem', { name: 'Sign out' }),
  ).toBeInTheDocument()
}

describe('Header', () => {
  beforeEach(() => {
    push.mockClear()
    jest.mocked(useRouter).mockReturnValue({
      push,
    } as unknown as ReturnType<typeof useRouter>)
    jest.mocked(usePathname).mockReturnValue('/')
    mockProfile({})
    jest
      .mocked(useCart)
      .mockReturnValue({ itemCount: 0 } as unknown as UseCartResult)
  })

  it('shows the total quantity of the available lines', () => {
    mockSession({ role: UserRole.USER })
    jest
      .mocked(useCart)
      .mockReturnValue({ itemCount: 5 } as unknown as UseCartResult)

    render(<Header />)

    const cartLink = screen.getByRole('link', {
      name: 'Shopping cart, 5 items',
    })
    expect(cartLink).toHaveAttribute('href', ROUTES.CART)
    expect(within(cartLink).getByText('5')).toBeInTheDocument()
  })

  it('shows Go to Dashboard for an admin session', async () => {
    mockSession({ role: UserRole.ADMIN })
    render(<Header />)

    const { user, menu } = await openUserMenu()

    expectBaseItems(menu)
    await user.click(within(menu).getByRole('menuitem', { name: DASHBOARD }))
    expect(push).toHaveBeenCalledWith(ROUTES.DASHBOARD)
  })

  it('hides Go to Dashboard for a USER session', async () => {
    mockSession({ role: UserRole.USER })
    render(<Header />)

    const { menu } = await openUserMenu()

    expect(
      within(menu).queryByRole('menuitem', { name: DASHBOARD }),
    ).not.toBeInTheDocument()
    expectBaseItems(menu)
  })

  it.each([
    ['null', null],
    ['empty', {}],
  ])(
    'hides Go to Dashboard when the session has no role (%s claims)',
    async (_label, claims) => {
      mockSession(claims)
      render(<Header />)

      const { menu } = await openUserMenu()

      expect(
        within(menu).queryByRole('menuitem', { name: DASHBOARD }),
      ).not.toBeInTheDocument()
      expectBaseItems(menu)
    },
  )

  it('shows Go to Dashboard for an admin while the profile is loading', async () => {
    mockSession({ role: UserRole.ADMIN })
    mockProfile({ user: null, isLoading: true })
    render(<Header />)

    const { menu } = await openUserMenu()

    expect(
      within(menu).getByRole('menuitem', { name: DASHBOARD }),
    ).toBeInTheDocument()
    expectBaseItems(menu)
  })

  it('shows Go to Dashboard for an admin when the profile failed to load', async () => {
    mockSession({ role: UserRole.ADMIN })
    mockProfile({ user: null, error: 'Request failed' })
    render(<Header />)

    const { menu } = await openUserMenu()

    expect(
      within(menu).getByRole('menuitem', { name: DASHBOARD }),
    ).toBeInTheDocument()
    expectBaseItems(menu)
  })

  it('ignores the profile role when the session role is USER', async () => {
    mockSession({ role: UserRole.USER })
    mockProfile({
      user: { role: UserRole.ADMIN } as ReturnType<typeof useAuth>['user'],
    })
    render(<Header />)

    const { menu } = await openUserMenu()

    expect(
      within(menu).queryByRole('menuitem', { name: DASHBOARD }),
    ).not.toBeInTheDocument()
    expectBaseItems(menu)
  })

  it('reads the role from the session metadata claim', async () => {
    mockSession({ metadata: { role: UserRole.ADMIN } })
    render(<Header />)

    const { menu } = await openUserMenu()

    expect(
      within(menu).getByRole('menuitem', { name: DASHBOARD }),
    ).toBeInTheDocument()
  })

  it('keeps loading the profile through useAuth', () => {
    mockSession({ role: UserRole.ADMIN })
    render(<Header />)

    expect(jest.mocked(useAuth)).toHaveBeenCalled()
  })
})
