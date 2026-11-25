import type { ComponentProps, ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import ClerkField from '@/sections/ClerkField'

const mockedFieldState = {
  state: 'idle' as 'idle' | 'error',
  message: '',
}

jest.mock('@clerk/elements/common', () => {
  return {
    FieldState: ({
      children,
    }: {
      children: (field: {
        state: 'idle' | 'error'
        message?: string
      }) => ReactNode
    }) => <>{children(mockedFieldState)}</>,
    Field: ({ children, className }: ComponentProps<'div'>) => (
      <div className={className}>{children}</div>
    ),
    Label: ({ children, className }: ComponentProps<'label'>) => (
      <label className={className}>{children}</label>
    ),
    Input: (props: ComponentProps<'input'>) => (
      <input {...props} data-testid="clerk-input" />
    ),
    FieldError: ({ className }: ComponentProps<'span'>) => (
      <span className={className}>Error</span>
    ),
  }
})

describe('ClerkField', () => {
  afterEach(() => {
    mockedFieldState.state = 'idle'
    mockedFieldState.message = ''
  })

  it('renders with label and placeholder', () => {
    render(
      <ClerkField name="email" label="Email" placeholder="Enter your email" />,
    )

    expect(screen.getByPlaceholderText('Enter your email')).toBeInTheDocument()
    expect(screen.getByTestId('clerk-input')).toHaveAttribute('type', 'text')
    expect(screen.getByTestId('clerk-input')).toHaveClass(
      'border',
      'border-outline-variant/70',
      'focus-visible:border-ring',
    )
    expect(screen.getByTestId('clerk-input').getAttribute('class')).toContain(
      '-webkit-autofill',
    )
  })

  it('turns browser autofill off by default', () => {
    const { rerender } = render(
      <ClerkField name="identifier" type="email" placeholder="Email" />,
    )
    expect(screen.getByPlaceholderText('Email')).toHaveAttribute(
      'autocomplete',
      'off',
    )

    // Browsers ignore "off" on a password; "new-password" stops the saved fill.
    rerender(<ClerkField name="password" type="password" placeholder="Email" />)
    expect(screen.getByPlaceholderText('Email')).toHaveAttribute(
      'autocomplete',
      'new-password',
    )

    rerender(
      <ClerkField
        name="code"
        autoComplete="one-time-code"
        placeholder="Email"
      />,
    )
    expect(screen.getByPlaceholderText('Email')).toHaveAttribute(
      'autocomplete',
      'one-time-code',
    )
  })

  it('shows toggle button for password field', async () => {
    const user = userEvent.setup()

    render(<ClerkField name="password" type="password" />)

    const toggleButton = screen.getByRole('button', { name: /show password/i })
    expect(toggleButton).toBeInTheDocument()

    await user.click(toggleButton)

    expect(
      screen.getByRole('button', { name: /hide password/i }),
    ).toBeInTheDocument()
    expect(screen.getByTestId('clerk-input')).toHaveAttribute('type', 'text')
  })

  it('disables the password input and visibility toggle when disabled', () => {
    render(
      <ClerkField
        name="password"
        type="password"
        placeholder="Enter your password"
        disabled
      />,
    )

    expect(screen.getByPlaceholderText('Enter your password')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Show password' })).toBeDisabled()
  })

  it('adds destructive border styling when the field has an error', () => {
    mockedFieldState.state = 'error'
    mockedFieldState.message = 'Email is required'

    render(<ClerkField name="email" placeholder="Enter your email" />)

    expect(screen.getByTestId('clerk-input')).toHaveAttribute(
      'aria-invalid',
      'true',
    )
    expect(screen.getByTestId('clerk-input')).toHaveClass(
      'border',
      'border-destructive',
      'ring-2',
      'ring-destructive/30',
    )
  })

  it('shows client error and sets aria-invalid when clientError is provided', () => {
    render(
      <ClerkField
        name="email"
        placeholder="Enter your email"
        clientError="Invalid email"
      />,
    )

    expect(screen.getByText('Invalid email')).toBeInTheDocument()
    expect(screen.getByTestId('clerk-input')).toHaveAttribute(
      'aria-invalid',
      'true',
    )
  })
})
