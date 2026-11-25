'use client'

import * as React from 'react'

import { Label } from '@/components/ui/label'
import {
  Select as SelectRoot,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/utils/styles'
import { type OptionItem } from '@/types/common'

export interface SelectProps extends Omit<
  React.ComponentProps<typeof SelectRoot>,
  'children' | 'id' | 'value' | 'defaultValue'
> {
  errorMessage?: string
  label?: React.ReactNode
  ariaLabel?: string
  placeholder?: string
  selected?: string | number
  options: OptionItem[]
  classNameTrigger?: string
  /** `filter`: a list toolbar filter; `form`: a form field, as tall as an input. */
  variant?: SelectVariant
}

export type SelectVariant = 'default' | 'filter' | 'form'

export const SELECT_TRIGGER_VARIANT_CLASS: Record<SelectVariant, string> = {
  default: '',
  filter: 'rounded-full',
  form: 'h-14',
}

export const Select = ({
  label,
  ariaLabel,
  placeholder = '',
  selected,
  options,
  disabled = false,
  onValueChange,
  errorMessage,
  classNameTrigger = '',
  variant = 'default',
  ...rootProps
}: SelectProps) => {
  const controlId = React.useId()
  const selectedValue =
    selected === undefined || selected === null ? '' : String(selected)
  const [internalSelected, setInternalSelected] = React.useState(selectedValue)

  React.useEffect(() => {
    setInternalSelected(selectedValue)
  }, [selectedValue])

  const handleValueChange = React.useCallback(
    (value: unknown, eventDetails: unknown) => {
      const nextSelected =
        typeof value === 'string' || typeof value === 'number'
          ? String(value)
          : ''
      setInternalSelected(nextSelected)
      onValueChange?.(value, eventDetails as never)
    },
    [onValueChange],
  )

  const selectedLabel =
    internalSelected === ''
      ? undefined
      : options.find((option) => String(option.value) === internalSelected)
          ?.label

  return (
    <div className="w-full">
      {Boolean(label) && <Label htmlFor={controlId}>{label}</Label>}
      <SelectRoot
        value={internalSelected}
        onValueChange={handleValueChange}
        disabled={disabled}
        {...rootProps}
      >
        <SelectTrigger
          id={controlId}
          aria-label={ariaLabel}
          className={cn(
            'w-full',
            SELECT_TRIGGER_VARIANT_CLASS[variant],
            classNameTrigger,
            Boolean(errorMessage) ? 'border border-destructive' : undefined,
          )}
          disabled={disabled}
        >
          <SelectValue className="min-w-0" placeholder={placeholder}>
            <span className="truncate" title={selectedLabel}>
              {selectedLabel ?? placeholder}
            </span>
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {options.map((item) => (
            <SelectItem key={String(item.value)} value={String(item.value)}>
              <span className="truncate" title={item.label}>
                {item.label}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </SelectRoot>
      {Boolean(errorMessage) && (
        <p className="mt-2 text-xs font-medium text-destructive">
          {errorMessage}
        </p>
      )}
    </div>
  )
}
