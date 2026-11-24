'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { toast } from 'sonner'

import type { Product } from '@/types/product'
import type { UpdateProductPayload } from '@repo/schemas'
import { ProductStatus } from '@repo/constants'

import { NOTICE_MESSAGES, SUCCESS_MESSAGES } from '@/constants/messages'
import { ROUTES, dashboardEditPath } from '@/constants/routes'

import { useProductById, useUpdateProduct } from '@/hooks/useProduct'

import ProductForm, {
  type ProductFormActions,
  type ProductFormState,
  type ProductFormSubmission,
} from '@/sections/ProductForm'

import { Button, buttonVariants } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'

import { cn } from '@/utils/styles'
import {
  buildProductImagesPayload,
  buildProductUpdateImageDiff,
  buildVariantUpdates,
  mapProductToEditFormValues,
  parseTastingNotesString,
  resolveEditedProductStatus,
  splitProductImagesForGallery,
  updateProductErrorTarget,
} from '@/utils/product'

interface EditProductFormProps {
  product: Product
  productId: string
}

const EditProductForm = ({ product, productId }: EditProductFormProps) => {
  const router = useRouter()
  const { mutate: updateMutate, isPending: isUpdatePending } =
    useUpdateProduct()

  // Built once per product object, so a re-render keeps what was typed.
  const initialState = useMemo<ProductFormState>(
    () => ({
      values: mapProductToEditFormValues(product),
      tastingNotes: parseTastingNotesString(product.tastingNotes),
      isListedOnStorefront: product.status === ProductStatus.ACTIVE,
      ...splitProductImagesForGallery(product),
    }),
    [product],
  )

  const handleSubmit = (
    {
      values,
      tastingNotes,
      isListedOnStorefront,
      primaryUrl,
      galleryUrls,
    }: ProductFormSubmission,
    { handleServerError, finish }: ProductFormActions,
  ) => {
    if (values.price === '') return finish()

    const finalImages = buildProductImagesPayload({
      avatarUrl: primaryUrl,
      galleryUrls,
    })

    const { addImages, removeImageIds, updateImages } =
      buildProductUpdateImageDiff(product.images, finalImages)

    const updatePayload: UpdateProductPayload = {
      categoryId: values.categoryId,
      name: values.name.trim(),
      description: values.description.trim(),
      roastLevel: values.roastLevel,
      isOrganic: values.isOrganic,
      isFairTrade: values.isFairTrade,
      status: resolveEditedProductStatus(product.status, isListedOnStorefront),
      tastingNotes,
      origin: values.origin.trim(),
      processingMethod: values.processingMethod.trim(),
      ...(Boolean(addImages?.length) && { addImages }),
      ...(Boolean(removeImageIds?.length) && { removeImageIds }),
      ...(Boolean(updateImages?.length) && { updateImages }),
    }
    const updateVariants = buildVariantUpdates(product, {
      ...values,
      price: values.price,
    })
    if (updateVariants.length) updatePayload.updateVariants = updateVariants

    updateMutate(
      { id: product.id.trim(), body: updatePayload },
      {
        onSuccess: () => {
          toast.success(SUCCESS_MESSAGES.PRODUCT_UPDATED)
          finish()
          router.push(ROUTES.DASHBOARD_PRODUCTS)
        },
        onError: (error) =>
          handleServerError(error, (field) =>
            updateProductErrorTarget(field, updatePayload),
          ),
      },
    )
  }

  return (
    <ProductForm
      mode="edit"
      formId="edit-product-form"
      title="Edit Product"
      description="Update this entry in your sensory collection."
      breadcrumbItems={[
        { label: 'Dashboard', href: ROUTES.DASHBOARD },
        { label: 'Products', href: ROUTES.DASHBOARD_PRODUCTS },
        {
          label: 'Edit Product',
          href:
            productId !== ''
              ? dashboardEditPath(ROUTES.DASHBOARD_PRODUCTS, productId)
              : ROUTES.DASHBOARD_PRODUCTS,
        },
      ]}
      submitLabel="Save changes"
      resetLabel="Reset changes"
      initialState={initialState}
      requireChange
      isPending={isUpdatePending}
      onSubmit={handleSubmit}
    />
  )
}

export default function PageContent() {
  const params = useParams()
  const rawId = params.id
  const productId =
    typeof rawId === 'string'
      ? rawId
      : Array.isArray(rawId)
        ? (rawId[0] ?? '')
        : ''

  const { product, isLoading, isError, errorMessage, refetch } = useProductById(
    productId,
    { asAdmin: true },
  )

  if (!productId) {
    return (
      <div className="px-6 py-12 text-center text-muted-foreground">
        Missing product id.
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="px-6 py-12 text-center text-muted-foreground">
        <Spinner size="lg" />
      </div>
    )
  }

  if (isError || !product) {
    return (
      <div className="flex flex-col items-center gap-4 px-6 py-12 text-center">
        <p className="text-muted-foreground">
          {errorMessage ?? 'Could not load product.'}
        </p>
        <Button
          className="w-fit px-6"
          variant="destructive"
          size="sm"
          onClick={() => void refetch()}
        >
          Retry
        </Button>
      </div>
    )
  }

  if (product.deletedAt) {
    return (
      <div className="flex flex-col items-center gap-4 px-6 py-12 text-center">
        <p className="text-muted-foreground">
          {NOTICE_MESSAGES.PRODUCT_DELETED.MESSAGE}
        </p>
        <Link
          href={ROUTES.DASHBOARD_PRODUCTS}
          className={cn(
            buttonVariants({ variant: 'outline', size: 'sm' }),
            'w-fit px-6',
          )}
        >
          {NOTICE_MESSAGES.PRODUCT_DELETED.ACTION}
        </Link>
      </div>
    )
  }

  return <EditProductForm product={product} productId={productId} />
}
