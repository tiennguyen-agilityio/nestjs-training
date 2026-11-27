'use client'

import { useEffect, useId, useState } from 'react'

import { Text } from '@/components/Text'
import { Slider } from '@/components/ui/slider'
import { formatPrice } from '@/utils/common'
import { cn } from '@/utils/styles'

const DEFAULT_TITLE = 'PRICE RANGE'

export interface PriceRangeSliderProps {
  min?: number
  max?: number
  step?: number
  value: [number, number]
  onValueChange?: (next: [number, number]) => void
  onValueCommit?: (next: [number, number]) => void
  title?: string
  isMaxOpenEnded?: boolean
  currency?: string
  locale?: string
  className?: string
}

export const PriceRangeSlider = ({
  min = 0,
  max = 100,
  step = 1,
  value,
  onValueChange,
  onValueCommit,
  title = DEFAULT_TITLE,
  isMaxOpenEnded = false,
  currency = 'USD',
  locale = 'en-US',
  className,
}: PriceRangeSliderProps) => {
  const titleId = useId()
  const [draftValue, setDraftValue] = useState<[number, number]>(value)

  useEffect(() => {
    setDraftValue(value)
  }, [value])

  const normalizeValue = (
    next: number | readonly number[],
  ): [number, number] => {
    const arr = typeof next === 'number' ? [next] : [...next]
    const [a, b] = arr
    return [Math.min(a, b), Math.max(a, b)]
  }

  const handleValueChange = (next: number | readonly number[]) => {
    const arr = typeof next === 'number' ? [next] : [...next]
    if (arr.length < 2) return
    const normalized = normalizeValue(arr)
    setDraftValue(normalized)
    onValueChange?.(normalized)
  }

  const handleValueCommit = () => {
    onValueCommit?.(draftValue)
  }

  return (
    <div
      className={cn('w-full max-w-md space-y-3', className)}
      aria-labelledby={titleId}
      onPointerUp={handleValueCommit}
    >
      <Text
        as="h6"
        className="font-bold tracking-wide text-on-surface-variant uppercase"
        id={titleId}
      >
        {title}
      </Text>
      <Slider
        min={min}
        max={max}
        step={step}
        value={draftValue}
        onValueChange={handleValueChange}
      />
      <div className="flex justify-between text-sm font-medium text-on-surface-variant">
        <span>{formatPrice(draftValue[0], locale, currency)}</span>
        <span>
          {formatPrice(draftValue[1], locale, currency)}
          {isMaxOpenEnded && draftValue[1] >= max ? '+' : ''}
        </span>
      </div>
    </div>
  )
}
