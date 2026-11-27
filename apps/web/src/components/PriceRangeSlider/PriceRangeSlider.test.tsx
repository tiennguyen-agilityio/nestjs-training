import { fireEvent, render, screen } from '@testing-library/react'

import { PriceRangeSlider } from '@/components/PriceRangeSlider'

jest.mock('@/components/ui/slider', () => ({
  Slider: ({
    min,
    max,
    step,
    value,
    onValueChange,
  }: {
    min?: number
    max?: number
    step?: number
    value?: readonly number[]
    onValueChange?: (next: number | readonly number[]) => void
  }) => (
    <button
      type="button"
      data-testid="slider"
      data-min={min}
      data-max={max}
      data-step={step}
      data-value={JSON.stringify(value)}
      onClick={() => onValueChange?.([80, 20])}
      onDoubleClick={() => onValueChange?.([40])}
    >
      mock slider
    </button>
  ),
}))

describe('PriceRangeSlider', () => {
  it('renders the default title and formatted values', () => {
    render(
      <PriceRangeSlider
        value={[10, 50]}
        onValueChange={jest.fn()}
        currency="USD"
        locale="en-US"
      />,
    )

    expect(
      screen.getByRole('heading', { name: 'PRICE RANGE' }),
    ).toBeInTheDocument()
    expect(screen.getByText('$10.00')).toBeInTheDocument()
    expect(screen.getByText('$50.00')).toBeInTheDocument()
  })

  it('renders a custom title', () => {
    render(
      <PriceRangeSlider
        value={[5, 25]}
        onValueChange={jest.fn()}
        title="Budget"
      />,
    )

    expect(screen.getByRole('heading', { name: 'Budget' })).toBeInTheDocument()
  })

  it('normalizes the next value before calling onValueChange', () => {
    const handleValueChange = jest.fn()

    render(
      <PriceRangeSlider value={[10, 90]} onValueChange={handleValueChange} />,
    )

    fireEvent.click(screen.getByTestId('slider'))

    expect(handleValueChange).toHaveBeenCalledWith([20, 80])
  })

  it('ignores malformed slider payloads with fewer than two values', () => {
    const handleValueChange = jest.fn()

    render(
      <PriceRangeSlider value={[10, 90]} onValueChange={handleValueChange} />,
    )

    fireEvent.doubleClick(screen.getByTestId('slider'))

    expect(handleValueChange).not.toHaveBeenCalled()
  })

  it('marks the top value as open-ended when it sits at the max', () => {
    render(
      <PriceRangeSlider
        min={1}
        max={500}
        value={[1, 500]}
        isMaxOpenEnded
        onValueChange={jest.fn()}
      />,
    )

    expect(screen.getByText('$500.00+')).toBeInTheDocument()
  })

  it('shows the top value without a plus below the max', () => {
    render(
      <PriceRangeSlider
        min={1}
        max={500}
        value={[1, 200]}
        isMaxOpenEnded
        onValueChange={jest.fn()}
      />,
    )

    expect(screen.getByText('$200.00')).toBeInTheDocument()
  })
})
