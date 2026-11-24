'use client'

import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

import { SUCCESS_MESSAGES } from '@/constants/messages'
import { ROUTES } from '@/constants/routes'
import { useCreateShippingMethod } from '@/hooks/useShippingMethod'
import ShippingMethodForm from '@/sections/ShippingMethodForm'

const PageContent = () => {
  const router = useRouter()
  const { mutate, isPending } = useCreateShippingMethod()

  return (
    <ShippingMethodForm
      formId="create-shipping-method-form"
      title="Add Shipping Method"
      breadcrumbItems={[
        { label: 'Dashboard', href: ROUTES.DASHBOARD },
        { label: 'Shipping methods', href: ROUTES.DASHBOARD_SHIPPING_METHODS },
        { label: 'Add', href: ROUTES.DASHBOARD_SHIPPING_METHODS_ADD },
      ]}
      submitLabel="Create shipping method"
      isPending={isPending}
      onSubmit={(values, { handleServerError, reset }) =>
        mutate(values, {
          onSuccess: () => {
            toast.success(SUCCESS_MESSAGES.SHIPPING_METHOD_CREATED)
            reset()
            router.push(ROUTES.DASHBOARD_SHIPPING_METHODS)
          },
          onError: handleServerError,
        })
      }
    />
  )
}

export default PageContent
