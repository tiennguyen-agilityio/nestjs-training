import React from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Link from 'next/link'

import { ERROR_MESSAGES } from '@/constants/messages'

import SignInForm from '@/sections/SignInForm'
import { useCleanClerkUrl } from '@/hooks/useCleanClerkUrl'

const state = {
  globalLoading: false,
  submitLoading: false,
}

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

jest.mock('@/sections/ClerkField', () => ({
  __esModule: true,
  default: ({
    label,
    placeholder,
    disabled,
    name,
    clientError,
    onChange,
  }: {
    label?: string
    placeholder: string
    disabled?: boolean
    name?: string
    clientError?: string
    onChange?: () => void
  }) => (
    <label>
      {label}
      <input
        name={name}
        placeholder={placeholder}
        disabled={disabled}
        onChange={onChange}
      />
      {clientError ? <span role="alert">{clientError}</span> : null}
    </label>
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

jest.mock('@clerk/elements/sign-in', () => ({
  Root: ({
    fallback,
    children,
  }: {
    fallback: React.ReactNode
    children: React.ReactNode
  }) => <div data-testid="sign-in-root">{children ?? fallback}</div>,
  Step: ({
    children,
    ...rest
  }: {
    children: React.ReactNode
  } & React.ComponentProps<'form'>) => (
    <form data-testid="sign-in-step" {...rest}>
      {children}
    </form>
  ),
  Action: ({
    children,
    submit,
    navigate,
    asChild,
    disabled,
    className,
  }: {
    children: React.ReactNode
    submit?: boolean
    navigate?: string
    asChild?: boolean
    disabled?: boolean
    className?: string
  }) => {
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
            type: 'submit',
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
  }: {
    children: React.ReactNode
    className?: string
  }) => (
    <Link href="/sign-up" className={className}>
      {children}
    </Link>
  ),
  GlobalError: ({ className }: { className?: string }) => (
    <div data-testid="clerk-global-error" className={className} />
  ),
}))

describe('SignInForm', () => {
  const useCleanClerkUrlMock = jest.mocked(useCleanClerkUrl)

  beforeEach(() => {
    state.globalLoading = false
    state.submitLoading = false
    useCleanClerkUrlMock.mockClear()
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('renders credential controls and auth actions', () => {
    render(<SignInForm />)

    expect(
      screen.getByRole('heading', { name: 'Welcome Back' }),
    ).toBeInTheDocument()
    expect(screen.getByTestId('social-buttons')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('example@gmail.com')).toBeInTheDocument()
    expect(
      screen.getByPlaceholderText('Enter your password'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('checkbox', { name: 'Keep me signed in' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Forgot Password?' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign In' })).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Create an account' }),
    ).toBeInTheDocument()
  })

  it('shows the social buttons before the email form', () => {
    render(<SignInForm />)

    expect(
      screen
        .getByText('Social buttons')
        .compareDocumentPosition(
          screen.getByPlaceholderText('example@gmail.com'),
        ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('keeps Keep me signed in disabled', () => {
    render(<SignInForm />)

    expect(
      screen.getByRole('checkbox', { name: 'Keep me signed in' }),
    ).toBeDisabled()
  })

  it('disables submit action when global loading is active', () => {
    state.globalLoading = true

    render(<SignInForm />)

    expect(screen.getByRole('button', { name: 'Sign In' })).toBeDisabled()
  })

  it('renders submit spinner when submit loading is active', () => {
    state.submitLoading = true

    render(<SignInForm />)

    const signInButton = screen.getByRole('button', { name: 'Sign In' })
    expect(within(signInButton).getByTestId('spinner-icon')).toBeInTheDocument()
  })

  it('disables form controls while submit is in progress', () => {
    state.submitLoading = true

    render(<SignInForm />)

    expect(screen.getByPlaceholderText('example@gmail.com')).toBeDisabled()
    expect(screen.getByPlaceholderText('Enter your password')).toBeDisabled()
    expect(
      screen.getByRole('checkbox', { name: 'Keep me signed in' }),
    ).toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'Forgot Password?' }),
    ).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Sign In' })).toBeDisabled()
    expect(screen.getByTestId('social-buttons')).toHaveAttribute(
      'data-disabled',
      'true',
    )
  })

  it('calls useCleanClerkUrl on render', () => {
    render(<SignInForm />)

    expect(useCleanClerkUrlMock).toHaveBeenCalledTimes(1)
  })

  it('shows client validation messages when email and password are empty', async () => {
    const user = userEvent.setup()

    render(<SignInForm />)

    await user.click(screen.getByRole('button', { name: 'Sign In' }))

    expect(
      screen.getByText(ERROR_MESSAGES.IDENTIFIER_REQUIRED),
    ).toBeInTheDocument()
    expect(
      screen.getByText(ERROR_MESSAGES.PASSWORD_REQUIRED),
    ).toBeInTheDocument()
  })

  it('shows a client validation message for an invalid email', async () => {
    const user = userEvent.setup()

    render(<SignInForm />)

    await user.type(
      screen.getByPlaceholderText('example@gmail.com'),
      'not-an-email',
    )
    await user.type(
      screen.getByPlaceholderText('Enter your password'),
      'secret',
    )
    await user.click(screen.getByRole('button', { name: 'Sign In' }))

    expect(
      screen.getByText(ERROR_MESSAGES.IDENTIFIER_EMAIL_INVALID),
    ).toBeInTheDocument()
  })
})
