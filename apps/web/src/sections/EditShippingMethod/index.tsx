'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { toast } from 'sonner'

import {
  ERROR_MESSAGES,
  NOTICE_MESSAGES,
  SUCCESS_MESSAGES,
} from '@/constants/messages'
import { ROUTES, dashboardEditPath } from '@/constants/routes'
import {
  useShippingMethodById,
  useUpdateShippingMethod,
} from '@/hooks/useShippingMethod'
import ShippingMethodForm from '@/sections/ShippingMethodForm'
import type { ShippingMethodFormValues } from '@/schemas/shippingMethod'
import { cn } from '@/utils/styles'

const EditShippingMethod = () => {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const rawId = params?.id
  const shippingMethodId = Array.isArray(rawId)
    ? (rawId[0] ?? '')
    : (rawId ?? '')
  const trimmedId = shippingMethodId.trim()

  const { shippingMethod, isLoading, isError, errorMessage } =
    useShippingMethodById(shippingMethodId)
  const { mutate, isPending } = useUpdateShippingMethod()

  const defaultValues = useMemo<ShippingMethodFormValues | undefined>(
    () =>
      shippingMethod
        ? {
            name: shippingMethod.name,
            description: shippingMethod.description,
            price: shippingMethod.price,
            status: shippingMethod.status,
          }
        : undefined,
    [shippingMethod],
  )

  const isDeleted = Boolean(shippingMethod?.deletedAt)

  if (!trimmedId || isError || isDeleted) {
    return (
      <div className="flex flex-col gap-4 px-6 py-12">
        <p
          className={cn(
            isDeleted ? 'text-muted-foreground' : 'text-destructive',
          )}
        >
          {!trimmedId
            ? ERROR_MESSAGES.SHIPPING_METHOD_ID_MISSING
            : isDeleted
              ? NOTICE_MESSAGES.SHIPPING_METHOD_DELETED_LOCKED
              : (errorMessage ?? ERROR_MESSAGES.NETWORK_ERROR)}
        </p>
        <Link
          href={ROUTES.DASHBOARD_SHIPPING_METHODS}
          className="w-fit text-primary underline"
        >
          Back to shipping methods
        </Link>
      </div>
    )
  }

  return (
    <ShippingMethodForm
      formId="edit-shipping-method-form"
      title="Edit Shipping Method"
      breadcrumbItems={[
        { label: 'Dashboard', href: ROUTES.DASHBOARD },
        { label: 'Shipping methods', href: ROUTES.DASHBOARD_SHIPPING_METHODS },
        {
          label: 'Edit',
          href: dashboardEditPath(ROUTES.DASHBOARD_SHIPPING_METHODS, trimmedId),
        },
      ]}
      submitLabel="Save changes"
      defaultValues={defaultValues}
      isPending={isPending}
      isLoading={isLoading}
      requireChange
      onSubmit={(values, { handleServerError }) =>
        mutate(
          { id: trimmedId, body: values },
          {
            onSuccess: () => {
              toast.success(SUCCESS_MESSAGES.SHIPPING_METHOD_UPDATED)
              router.push(ROUTES.DASHBOARD_SHIPPING_METHODS)
            },
            onError: handleServerError,
          },
        )
      }
    />
  )
}

export default EditShippingMethod
