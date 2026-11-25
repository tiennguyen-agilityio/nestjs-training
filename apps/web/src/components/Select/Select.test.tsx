import { render, screen } from '@testing-library/react'
import type { ButtonHTMLAttributes, PropsWithChildren } from 'react'

import { Select } from '@/components/Select'

jest.mock('@/components/ui/select', () => {
  return {
    Select: ({ children }: PropsWithChildren) => <div>{children}</div>,
    SelectContent: ({ children }: PropsWithChildren) => (
      <div data-testid="select-content">{children}</div>
    ),
    SelectItem: ({
      children,
      value,
    }: {
      children: PropsWithChildren['children']
      value: string
    }) => (
      <div data-testid="select-item" data-value={value}>
        {children}
      </div>
    ),
    SelectTrigger: ({
      children,
      ...props
    }: PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement>>) => (
      <button type="button" {...props}>
        {children}
      </button>
    ),
    SelectValue: ({ placeholder }: { placeholder?: string }) => (
      <span>{placeholder}</span>
    ),
  }
})

describe('Select', () => {
  it('renders a label connected to the trigger', () => {
    render(
      <Select
        label="Roast"
        options={[
          { value: 'light', label: 'Light' },
          { value: 'dark', label: 'Dark' },
        ]}
      />,
    )

    expect(screen.getByText('Roast').tagName).toBe('LABEL')
    expect(screen.getByLabelText('Roast')).toBeInTheDocument()
  })

  it('renders the placeholder', () => {
    render(
      <Select
        label="Category"
        placeholder="Choose a category"
        options={[{ value: 'beans', label: 'Beans' }]}
      />,
    )

    expect(screen.getByText('Choose a category')).toBeInTheDocument()
  })

  it('renders all provided options', () => {
    render(
      <Select
        label="Size"
        options={[
          { value: 'small', label: 'Small' },
          { value: 'medium', label: 'Medium' },
          { value: 'large', label: 'Large' },
        ]}
        placeholder="Pick one"
      />,
    )

    expect(screen.getAllByTestId('select-item')).toHaveLength(3)
    expect(screen.getByText('Small')).toBeInTheDocument()
    expect(screen.getByText('Medium')).toBeInTheDocument()
    expect(screen.getByText('Large')).toBeInTheDocument()
  })

  it('names the trigger with ariaLabel when there is no visible label', () => {
    render(
      <Select
        ariaLabel="Status filter"
        options={[{ value: 'active', label: 'Active' }]}
      />,
    )

    expect(
      screen.getByRole('button', { name: 'Status filter' }),
    ).toBeInTheDocument()
  })

  it('forwards disabled state to the trigger', () => {
    render(
      <Select
        label="Origin"
        options={[{ value: 'brazil', label: 'Brazil' }]}
        disabled
      />,
    )

    expect(screen.getByLabelText('Origin')).toBeDisabled()
  })

  it.each([
    ['filter', 'rounded-full'],
    ['form', 'h-14'],
  ] as const)('styles the %s variant trigger with %s', (variant, className) => {
    render(
      <Select
        variant={variant}
        ariaLabel="Status"
        options={[{ value: 'a', label: 'A' }]}
      />,
    )

    expect(screen.getByRole('button', { name: 'Status' })).toHaveClass(
      className,
    )
  })
})
