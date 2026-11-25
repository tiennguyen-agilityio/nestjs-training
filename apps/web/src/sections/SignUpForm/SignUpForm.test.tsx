import React from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { useAuth } from '@clerk/nextjs'

import { ERROR_MESSAGES } from '@/constants/messages'

import SignUpForm from '@/sections/SignUpForm'
import { useCleanClerkUrl } from '@/hooks/useCleanClerkUrl'

const state = {
  globalLoading: false,
  submitLoading: false,
}

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
  usePathname: jest.fn(),
}))

jest.mock('@clerk/nextjs', () => ({
  useAuth: jest.fn(),
}))

jest.mock('@/hooks/useCleanClerkUrl', () => ({
  useCleanClerkUrl: jest.fn(),
}))

jest.mock('@/sections/SocialButtons', () => ({
  __esModule: true,
  default: ({ disabled }: { disabled?: boolean }) => (
    <div
      data-testid="social-buttons"
      data-disabled={disabled ? 'true' : 'false'}
    >
      Social buttons
    </div>
  ),
}))

jest.mock('@/components/ui/checkbox', () => ({
  Checkbox: ({ label, disabled }: { label: string; disabled?: boolean }) => (
    <label>
      <input type="checkbox" disabled={disabled} />
      {label}
    </label>
  ),
}))

jest.mock('@/sections/ClerkField', () => ({
  __esModule: true,
  default: ({
    label,
    placeholder,
    disabled,
    name,
    type,
    clientError,
    onChange,
  }: {
    label?: string
    placeholder?: string
    disabled?: boolean
    name?: string
    type?: string
    clientError?: string
    onChange?: () => void
  }) => (
    <label>
      {label}
      <input
        name={name}
        placeholder={placeholder}
        disabled={disabled}
        type={type ?? 'text'}
        onChange={onChange}
      />
      {clientError ? <span role="alert">{clientError}</span> : null}
    </label>
  ),
}))

jest.mock('@clerk/elements/sign-up', () => ({
  Root: ({
    fallback,
    children,
  }: {
    fallback: React.ReactNode
    children: React.ReactNode
  }) => <div data-testid="sign-up-root">{children ?? fallback}</div>,
  Step: ({
    children,
    name,
    ...rest
  }: {
    children: React.ReactNode
    name: string
  } & React.ComponentProps<'form'>) => (
    <form data-testid={`sign-up-step-${name}`} data-step={name} {...rest}>
      {children}
    </form>
  ),
  Captcha: () => <div data-testid="sign-up-captcha" />,
  Strategy: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="sign-up-strategy">{children}</div>
  ),
  Action: ({
    children,
    submit,
    navigate,
    resend,
    asChild,
    disabled,
    className,
    fallback,
  }: {
    children: React.ReactNode
    submit?: boolean
    navigate?: string
    resend?: boolean
    asChild?: boolean
    disabled?: boolean
    className?: string
    fallback?: (props: { resendableAfter: number }) => React.ReactNode
  }) => {
    if (resend) {
      return (
        <button type="button" className={className} disabled={disabled}>
          {children}
          {typeof fallback === 'function'
            ? fallback({ resendableAfter: 9 })
            : null}
        </button>
      )
    }

    if (asChild) {
      const onlyChild = children as React.ReactElement<{
        disabled?: boolean
        onClick?: React.MouseEventHandler<HTMLButtonElement>
        type?: string
      }>
      const { onClick: childOnClick, ...childRest } = onlyChild.props
      return (
        <>
          {React.cloneElement(onlyChild, {
            ...childRest,
            disabled,
            type: submit ? 'submit' : 'button',
            onClick: (e: React.MouseEvent<HTMLButtonElement>) => {
              childOnClick?.(e)
            },
          })}
        </>
      )
    }

    return (
      <button
        type={submit ? 'submit' : 'button'}
        data-navigate={navigate}
        className={className}
        disabled={disabled}
      >
        {children}
      </button>
    )
  },
}))

jest.mock('@clerk/elements/common', () => ({
  Loading: ({
    children,
  }: {
    children: (isLoading: boolean) => React.ReactNode
  }) => {
    if (state.globalLoading) {
      return <>{children(true)}</>
    }

    return <>{children(state.submitLoading)}</>
  },
  Link: ({
    children,
    className,
    navigate,
  }: {
    children: React.ReactNode
    className?: string
    navigate?: string
  }) => (
    <Link
      href={navigate === 'sign-in' ? '/sign-in' : '/'}
      className={className}
    >
      {children}
    </Link>
  ),
}))

describe('SignUpForm', () => {
  const useCleanClerkUrlMock = jest.mocked(useCleanClerkUrl)
  const useAuthMock = jest.mocked(useAuth)
  const useRouterMock = jest.mocked(useRouter)
  const usePathnameMock = jest.mocked(usePathname)
  const replaceMock = jest.fn()

  beforeEach(() => {
    state.globalLoading = false
    state.submitLoading = false
    useCleanClerkUrlMock.mockReturnValue({})
    useAuthMock.mockReturnValue({
      isLoaded: true,
      isSignedIn: false,
    } as ReturnType<typeof useAuth>)
    useRouterMock.mockReturnValue({
      replace: replaceMock,
    } as unknown as ReturnType<typeof useRouter>)
    usePathnameMock.mockReturnValue('/sign-up')
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  const getStartForm = () => screen.getByTestId('sign-up-step-start')
  const getContinueForm = () => screen.getByTestId('sign-up-step-continue')

  it('renders start step controls and auth actions', () => {
    render(<SignUpForm />)

    const start = getStartForm()
    expect(
      within(start).getByRole('heading', { name: 'Create your account' }),
    ).toBeInTheDocument()
    expect(screen.getByTestId('social-buttons')).toBeInTheDocument()
    expect(within(start).getByPlaceholderText('First name')).toBeInTheDocument()
    expect(within(start).getByPlaceholderText('Last name')).toBeInTheDocument()
    expect(
      within(start).getByPlaceholderText('example@gmail.com'),
    ).toBeInTheDocument()
    expect(
      within(start).getByPlaceholderText('Enter your password'),
    ).toBeInTheDocument()
    expect(screen.getByTestId('sign-up-captcha')).toBeInTheDocument()
    expect(
      within(start).getByRole('checkbox', { name: 'Keep me signed in' }),
    ).toBeInTheDocument()
    expect(
      within(start).getByRole('button', { name: 'Sign up' }),
    ).toBeInTheDocument()
    expect(
      within(start).getByRole('link', { name: 'Sign in' }),
    ).toBeInTheDocument()
  })

  it('shows the social buttons before the start form fields', () => {
    render(<SignUpForm />)

    expect(
      screen
        .getByText('Social buttons')
        .compareDocumentPosition(
          within(getStartForm()).getByPlaceholderText('First name'),
        ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('keeps Keep me signed in disabled', () => {
    render(<SignUpForm />)

    expect(
      within(getStartForm()).getByRole('checkbox', {
        name: 'Keep me signed in',
      }),
    ).toBeDisabled()
  })

  it('renders continue step when Clerk needs an extra step', () => {
    render(<SignUpForm />)

    const cont = getContinueForm()
    expect(
      within(cont).getByRole('heading', { name: 'Almost there' }),
    ).toBeInTheDocument()
    expect(
      within(cont).getByRole('button', { name: 'Back' }),
    ).toBeInTheDocument()
    expect(
      within(cont).getByRole('button', { name: /Continue/i }),
    ).toBeInTheDocument()
  })

  it('disables start submit when global loading is active', () => {
    state.globalLoading = true

    render(<SignUpForm />)

    const start = getStartForm()
    expect(
      within(start).getByRole('button', { name: 'Sign up' }),
    ).toBeDisabled()
  })

  it('renders submit spinner on start when submit loading is active', () => {
    state.submitLoading = true

    render(<SignUpForm />)

    const start = getStartForm()
    const signUpBtn = within(start).getByRole('button', { name: 'Sign up' })
    expect(within(signUpBtn).getByTestId('spinner-icon')).toBeInTheDocument()
  })

  it('disables start controls while submit is in progress', () => {
    state.submitLoading = true

    render(<SignUpForm />)

    const start = getStartForm()
    expect(within(start).getByPlaceholderText('First name')).toBeDisabled()
    expect(within(start).getByPlaceholderText('Last name')).toBeDisabled()
    expect(
      within(start).getByPlaceholderText('example@gmail.com'),
    ).toBeDisabled()
    expect(
      within(start).getByPlaceholderText('Enter your password'),
    ).toBeDisabled()
    expect(
      within(start).getByRole('checkbox', { name: 'Keep me signed in' }),
    ).toBeDisabled()
    expect(
      within(start).getByRole('button', { name: 'Sign up' }),
    ).toBeDisabled()
    expect(screen.getByTestId('social-buttons')).toHaveAttribute(
      'data-disabled',
      'true',
    )
  })

  it('calls useCleanClerkUrl on render', () => {
    render(<SignUpForm />)

    expect(useCleanClerkUrlMock).toHaveBeenCalledTimes(1)
  })

  it('redirects home once the user is signed in', () => {
    useAuthMock.mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
    } as ReturnType<typeof useAuth>)

    render(<SignUpForm />)

    expect(replaceMock).toHaveBeenCalledWith('/')
  })

  it('ignores redirect params from the URL and lets Clerk own the redirect', () => {
    useCleanClerkUrlMock.mockReturnValue({
      redirectUrl: 'https://evil.example/phish',
      afterSignUpUrl: '//evil.example',
    })
    useAuthMock.mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
    } as ReturnType<typeof useAuth>)

    render(<SignUpForm />)

    expect(replaceMock).toHaveBeenCalledTimes(1)
    expect(replaceMock).toHaveBeenCalledWith('/')
  })

  it('does not redirect when sign-up completes on this page', () => {
    const { rerender } = render(<SignUpForm />)

    // Clerk's setActive navigates to redirect_url / the fallback env itself.
    useAuthMock.mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
    } as ReturnType<typeof useAuth>)
    rerender(<SignUpForm />)

    expect(replaceMock).not.toHaveBeenCalled()
  })

  it('redirects home when auth finishes loading for an already signed-in user', () => {
    useAuthMock.mockReturnValue({
      isLoaded: false,
      isSignedIn: undefined,
    } as unknown as ReturnType<typeof useAuth>)
    const { rerender } = render(<SignUpForm />)
    expect(replaceMock).not.toHaveBeenCalled()

    useAuthMock.mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
    } as ReturnType<typeof useAuth>)
    rerender(<SignUpForm />)

    expect(replaceMock).toHaveBeenCalledWith('/')
  })

  it('shows client validation on start when required fields are empty', async () => {
    const user = userEvent.setup()

    render(<SignUpForm />)

    const start = getStartForm()
    await user.click(within(start).getByRole('button', { name: 'Sign up' }))

    expect(
      screen.getByText(ERROR_MESSAGES.FIRST_NAME_REQUIRED),
    ).toBeInTheDocument()
    expect(
      screen.getByText(ERROR_MESSAGES.LAST_NAME_REQUIRED),
    ).toBeInTheDocument()
    expect(
      screen.getByText(ERROR_MESSAGES.EMAIL_ADDRESS_REQUIRED),
    ).toBeInTheDocument()
    expect(
      screen.getByText(ERROR_MESSAGES.PASSWORD_REQUIRED),
    ).toBeInTheDocument()
  })

  it('shows client validation for an invalid email on start', async () => {
    const user = userEvent.setup()

    render(<SignUpForm />)

    const start = getStartForm()
    await user.type(within(start).getByPlaceholderText('First name'), 'Ada')
    await user.type(within(start).getByPlaceholderText('Last name'), 'Lovelace')
    await user.type(
      within(start).getByPlaceholderText('example@gmail.com'),
      'not-an-email',
    )
    await user.type(
      within(start).getByPlaceholderText('Enter your password'),
      'password1',
    )
    await user.click(within(start).getByRole('button', { name: 'Sign up' }))

    expect(
      screen.getByText(ERROR_MESSAGES.EMAIL_ADDRESS_INVALID),
    ).toBeInTheDocument()
  })
})
