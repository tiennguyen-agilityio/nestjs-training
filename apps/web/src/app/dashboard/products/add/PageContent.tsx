'use client'

import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

import type { CreateProductPayload } from '@repo/schemas'
import { DiscountType, ProductStatus, RoastLevel } from '@repo/constants'

import { SUCCESS_MESSAGES } from '@/constants/messages'
import { ROUTES } from '@/constants/routes'

import { useCreateProduct } from '@/hooks/useProduct'

import ProductForm, {
  type ProductFormActions,
  type ProductFormState,
  type ProductFormSubmission,
} from '@/sections/ProductForm'

import { renderProductSku } from '@/utils/common'
import {
  buildProductImagesPayload,
  createProductErrorTarget,
  toCreateVariantPayload,
} from '@/utils/product'

const INITIAL_STATE: ProductFormState = {
  values: {
    categoryId: '',
    name: '',
    description: '',
    roastLevel: RoastLevel.LIGHT,
    isOrganic: true,
    isFairTrade: false,
    size: '',
    unit: '',
    price: '',
    discountType: DiscountType.PERCENT,
    discountValue: 0,
    stockQuantity: '',
    origin: '',
    processingMethod: '',
  },
  tastingNotes: [],
  isListedOnStorefront: false,
  primaryUrl: null,
  galleryItems: [],
}

const PageContent = () => {
  const router = useRouter()
  const { mutate, isPending } = useCreateProduct()

  const handleSubmit = (
    {
      values,
      tastingNotes,
      isListedOnStorefront,
      primaryUrl,
      galleryUrls,
    }: ProductFormSubmission,
    { handleServerError, finish, reset }: ProductFormActions,
  ) => {
    const { size, unit, price, stockQuantity } = values
    if (size === '' || unit === '' || price === '' || stockQuantity === '') {
      return finish()
    }

    const payload: CreateProductPayload = {
      categoryId: values.categoryId,
      name: values.name.trim(),
      description: values.description.trim(),
      roastLevel: values.roastLevel,
      isOrganic: values.isOrganic,
      isFairTrade: values.isFairTrade,
      status: isListedOnStorefront ? ProductStatus.ACTIVE : ProductStatus.DRAFT,
      tastingNotes,
      origin: values.origin.trim(),
      processingMethod: values.processingMethod.trim(),
      variants: [
        toCreateVariantPayload(
          { ...values, size, unit, price, stockQuantity },
          renderProductSku({ size, unit }),
        ),
      ],
      images: buildProductImagesPayload({ avatarUrl: primaryUrl, galleryUrls }),
    }

    mutate(payload, {
      onSuccess: () => {
        toast.success(SUCCESS_MESSAGES.PRODUCT_CREATED)
        reset()
        finish()
        router.push(ROUTES.DASHBOARD_PRODUCTS)
      },
      onError: (error) =>
        handleServerError(error, (field) =>
          createProductErrorTarget(field, payload),
        ),
    })
  }

  return (
    <ProductForm
      mode="create"
      formId="create-product-form"
      title="Add New Product"
      description="Create a new entry in your sensory collection."
      breadcrumbItems={[
        { label: 'Dashboard', href: ROUTES.DASHBOARD },
        { label: 'Products', href: ROUTES.DASHBOARD_PRODUCTS },
        { label: 'Add New Product', href: ROUTES.DASHBOARD_PRODUCTS_ADD },
      ]}
      submitLabel="Publish Product"
      resetLabel="Discard Draft"
      initialState={INITIAL_STATE}
      isPending={isPending}
      onSubmit={handleSubmit}
    />
  )
}

export default PageContent
