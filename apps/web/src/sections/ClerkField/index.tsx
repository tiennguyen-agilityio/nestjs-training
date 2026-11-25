'use client'

import {
  type ComponentProps,
  type HTMLInputTypeAttribute,
  type ReactNode,
  useState,
} from 'react'
import {
  Field,
  FieldError,
  FieldState,
  Input,
  Label,
} from '@clerk/elements/common'
import { Eye, EyeOff } from 'lucide-react'

import { cn } from '@/utils/styles'
import { Button } from '@/components/ui/button'

type ClerkFieldProps = Omit<ComponentProps<typeof Input>, 'type'> & {
  name: string
  label?: string
  type?: Exclude<HTMLInputTypeAttribute, 'otp'>
  className?: string
  wrapperClassName?: string
  icon?: ReactNode
  /** Client-side validation message (shown under the field, does not replace Clerk API errors). */
  clientError?: string
}

const ClerkField = ({
  name,
  type = 'text',
  label,
  placeholder = '',
  wrapperClassName = '',
  className = '',
  icon,
  clientError,
  disabled = false,
  autoComplete,
  'aria-invalid': ariaInvalidProp,
  ...props
}: ClerkFieldProps) => {
  const [isVisible, setIsVisible] = useState(false)
  const isPassword = type === 'password'
  // No browser autofill of saved values; browsers ignore "off" on a password.
  const resolvedAutoComplete =
    autoComplete ?? (isPassword ? 'new-password' : 'off')

  const handleToggleVisible = () => {
    setIsVisible((prevVisible) => !prevVisible)
  }

  return (
    <Field name={name} className={wrapperClassName}>
      {label && (
        <Label className="mb-2 block px-1 text-sm font-semibold text-on-surface-variant">
          {label}
        </Label>
      )}

      <FieldState>
        {({ state, message }) => {
          const hasFieldError = state === 'error' && Boolean(message)
          const hasClientError = Boolean(clientError)
          const hasError =
            hasFieldError ||
            hasClientError ||
            ariaInvalidProp === true ||
            ariaInvalidProp === 'true'

          return (
            <div className="relative">
              {icon && (
                <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-outline">
                  {icon}
                </span>
              )}

              <Input
                type={isPassword && isVisible ? 'text' : type}
                placeholder={placeholder}
                disabled={disabled}
                autoComplete={resolvedAutoComplete}
                aria-invalid={hasError ? true : ariaInvalidProp}
                className={cn(
                  'min-h-14 w-full min-w-0 rounded-xs border border-outline-variant/70 bg-surface-container-low px-4 py-4 text-sm leading-normal text-on-surface outline-none transition-[background-color,border-color,box-shadow,color] placeholder:text-outline/60 focus-visible:border-ring focus-visible:bg-surface-container-high focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:ring-offset-0 focus-visible:outline-none disabled:cursor-not-allowed disabled:bg-surface-container disabled:text-on-surface-variant/80 disabled:opacity-100',
                  '[&:-webkit-autofill]:[-webkit-text-fill-color:var(--on-surface)] [&:-webkit-autofill]:[box-shadow:0_0_0_1000px_var(--surface-container-low)_inset] [&:-webkit-autofill]:[-webkit-box-shadow:0_0_0_1000px_var(--surface-container-low)_inset]',
                  '[&:-webkit-autofill:focus]:[box-shadow:0_0_0_1000px_var(--surface-container-high)_inset] [&:-webkit-autofill:focus]:[-webkit-box-shadow:0_0_0_1000px_var(--surface-container-high)_inset]',
                  '[&:-webkit-autofill:focus-visible]:[box-shadow:0_0_0_1000px_var(--surface-container-high)_inset] [&:-webkit-autofill:focus-visible]:[-webkit-box-shadow:0_0_0_1000px_var(--surface-container-high)_inset]',
                  icon && 'pl-12',
                  isPassword && 'pr-12',
                  hasError
                    ? 'border-destructive ring-2 ring-destructive/30 dark:ring-destructive/40'
                    : '',
                  className,
                )}
                {...props}
              />

              {isPassword && (
                <Button
                  variant="ghost"
                  size="icon"
                  type="button"
                  className="absolute right-4 top-1/2 size-8 -translate-y-1/2 rounded-full text-outline transition-colors hover:bg-transparent hover:text-on-surface disabled:text-on-surface-variant/60"
                  onClick={handleToggleVisible}
                  aria-label={isVisible ? 'Hide password' : 'Show password'}
                  disabled={disabled}
                >
                  {isVisible ? (
                    <EyeOff className="size-4" aria-hidden />
                  ) : (
                    <Eye className="size-4" aria-hidden />
                  )}
                </Button>
              )}
            </div>
          )
        }}
      </FieldState>

      <FieldError className="mt-1 block px-1 text-sm text-error" />
      {clientError && (
        <p className="mt-1 block px-1 text-sm text-error" role="alert">
          {clientError}
        </p>
      )}
    </Field>
  )
}

export default ClerkField
