'use client'

import { useEffect } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { ShippingMethodStatus } from '@repo/constants'

import {
  shippingMethodFormSchema,
  type ShippingMethodFormInput,
  type ShippingMethodFormValues,
} from '@/schemas/shippingMethod'
import { type BreadcrumbNavItem } from '@/components/Breadcrumb'
import { Input } from '@/components/Input'
import Loading from '@/components/Loading'
import NumberInput from '@/components/NumberInput'
import { Select } from '@/components/Select'
import { SHIPPING_METHOD_STATUS_OPTIONS } from '@/constants/shippingMethod'
import PageHeader from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { mapServerErrors, setServerFieldErrors } from '@/utils/form'

type ShippingMethodField = keyof ShippingMethodFormInput

const API_FIELDS: Record<string, ShippingMethodField> = {
  name: 'name',
  description: 'description',
  price: 'price',
  status: 'status',
}

const EMPTY_VALUES: ShippingMethodFormInput = {
  name: '',
  description: '',
  price: '',
  status: ShippingMethodStatus.ACTIVE,
}

export interface ShippingMethodFormActions {
  handleServerError: (error: unknown) => void
  reset: (values?: ShippingMethodFormValues) => void
}

export interface ShippingMethodFormProps {
  formId: string
  title: string
  breadcrumbItems: BreadcrumbNavItem[]
  submitLabel: string
  defaultValues?: ShippingMethodFormValues
  isPending: boolean
  isLoading?: boolean
  requireChange?: boolean
  onSubmit: (
    values: ShippingMethodFormValues,
    actions: ShippingMethodFormActions,
  ) => void
}

const ShippingMethodForm = ({
  formId,
  title,
  breadcrumbItems,
  submitLabel,
  defaultValues,
  isPending,
  isLoading = false,
  requireChange = false,
  onSubmit,
}: ShippingMethodFormProps) => {
  const {
    control,
    register,
    handleSubmit,
    reset,
    setError,
    setFocus,
    clearErrors,
    formState: { errors, isDirty },
  } = useForm<ShippingMethodFormInput, unknown, ShippingMethodFormValues>({
    resolver: zodResolver(shippingMethodFormSchema),
    defaultValues: defaultValues ?? EMPTY_VALUES,
    mode: 'onBlur',
    reValidateMode: 'onChange',
  })

  useEffect(() => {
    if (defaultValues === undefined) return
    reset(defaultValues)
  }, [defaultValues, reset])

  const handleServerError = (error: unknown) => {
    const { fieldErrors, unmatched } = mapServerErrors(
      error,
      (field) => API_FIELDS[field],
    )
    setServerFieldErrors(setError, fieldErrors, setFocus)
    unmatched.forEach((message) => toast.error(message))
  }

  const formDisabled = isPending || isLoading
  const submitDisabled = formDisabled || (requireChange && !isDirty)

  return (
    <form
      id={formId}
      className="flex flex-col gap-6"
      noValidate
      onSubmit={handleSubmit((values) =>
        onSubmit(values, {
          handleServerError,
          reset: (next) => reset(next ?? EMPTY_VALUES),
        }),
      )}
    >
      <PageHeader
        breadcrumbItems={breadcrumbItems}
        title={title}
        actions={
          <Button
            type="submit"
            className="rounded-full px-8"
            disabled={submitDisabled}
            loading={isPending}
          >
            {submitLabel}
          </Button>
        }
      />

      <section className="overflow-hidden rounded-3xl border border-outline-variant/40 bg-card p-6 md:p-8">
        {isLoading ? (
          <Loading label="Loading shipping method" className="px-0 py-0" />
        ) : (
          <div className="flex flex-col gap-6">
            <Input
              id="shipping-method-name"
              label="Name"
              type="text"
              autoComplete="off"
              placeholder="Enter shipping method name"
              disabled={formDisabled}
              errorMessage={errors.name?.message}
              {...register('name', { onChange: () => clearErrors('name') })}
            />
            <Input
              id="shipping-method-description"
              label="Description"
              type="text"
              autoComplete="off"
              placeholder="e.g. 1-2 business days"
              disabled={formDisabled}
              errorMessage={errors.description?.message}
              {...register('description', {
                onChange: () => clearErrors('description'),
              })}
            />
            <Controller
              control={control}
              name="price"
              render={({ field }) => (
                <NumberInput
                  ref={field.ref}
                  id="shipping-method-price"
                  label="Fee"
                  type="text"
                  inputMode="decimal"
                  placeholder="e.g. 12.00"
                  maxDecimalPlaces={2}
                  disabled={formDisabled}
                  errorMessage={errors.price?.message}
                  name={field.name}
                  onBlur={field.onBlur}
                  value={field.value}
                  onValueChange={(value) => {
                    clearErrors('price')
                    field.onChange(value)
                  }}
                />
              )}
            />
            <Controller
              control={control}
              name="status"
              render={({ field }) => (
                <Select
                  label="Status"
                  ariaLabel="Status"
                  selected={field.value}
                  options={[...SHIPPING_METHOD_STATUS_OPTIONS]}
                  disabled={formDisabled}
                  errorMessage={errors.status?.message}
                  onValueChange={(value) => {
                    clearErrors('status')
                    field.onChange(value)
                  }}
                />
              )}
            />
          </div>
        )}
      </section>
    </form>
  )
}

export default ShippingMethodForm
