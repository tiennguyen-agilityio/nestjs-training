import type { UploadImageGalleryItem } from '@/components/UploadImage/Gallery'
import { LOW_STOCK_LABEL, OUT_OF_STOCK_LABEL } from '@/constants/order'
import { type RoastCollection } from '@/constants/roast'
import type { EditProductFormValues } from '@/schemas/product'
import {
  DiscountType,
  ProductStatus,
  type ProductUnit,
  RoastLevel,
} from '@repo/constants'
import type { ServerFieldError } from '@/utils/form'
import {
  type Product,
  type ProductFormValues,
  type ProductImage,
} from '@/types/product'
import type {
  CreateProductImagePayload,
  CreateProductPayload,
  CreateProductVariantPayload,
  UpdateProductImagePayload,
  UpdateProductPayload,
  UpdateProductVariantPayload,
} from '@repo/schemas'
import { getPrimaryVariantQuantity } from '@/utils/inventory'
import { pricingOf } from '@/utils/pricing'

/**
 * The variant name the API works out from size and unit ("250g", "1.5kg"),
 * for a variant the web built itself (the API returns `name` otherwise).
 */
export const formatVariantName = (size: number, unit: ProductUnit): string =>
  `${Number(size)}${unit.toLowerCase()}`

export const LOW_STOCK_THRESHOLD = 10

function formatProductRoastMeta(product: Product): string {
  const levelLabel: Record<RoastLevel, string> = {
    [RoastLevel.LIGHT]: 'Light roast',
    [RoastLevel.MEDIUM]: 'Medium roast',
    [RoastLevel.DARK]: 'Dark roast',
  }
  const origin = product.origin?.trim()
  const roast = levelLabel[product.roastLevel]
  const roastLine = origin ? `${origin} | ${roast}` : roast
  const variantName = product.variants[0]?.name
  return variantName ? `${variantName} · ${roastLine}` : roastLine
}

function productFlavorLine(product: Product): string {
  const notes = product.tastingNotes?.trim()
  if (notes) return notes
  const description = product.description?.trim()
  if (description) return description
  return '—'
}

export function getProductListPrice(product: Product): number {
  const firstVariant = product.variants[0]
  if (!firstVariant) return 0
  return Number.isFinite(firstVariant.price) ? firstVariant.price : 0
}

/** The first variant's list price and the sale price the API charges for it. */
export function getProductPricing(product: Product): {
  listPrice: number
  salePrice: number
} {
  const firstVariant = product.variants[0]
  if (!firstVariant) return { listPrice: 0, salePrice: 0 }
  const { price, salePrice } = pricingOf({
    price: Number.isFinite(firstVariant.price) ? firstVariant.price : 0,
    discountType: firstVariant.discountType,
    discountValue: firstVariant.discountValue,
  })
  return { listPrice: price, salePrice }
}

export function getProductPrimaryImageUrl(product: Product): string | null {
  if (product.images.length === 0) return null
  const primary = product.images.find((image) => image.isPrimary)
  const first = primary ?? product.images[0]
  const url = first?.url?.trim() ?? ''
  return url || null
}

/** The image badge for the first variant's stock: out of stock, low, or none. */
export function getStockBadgeLabel(product: Product): string | undefined {
  const quantity = getPrimaryVariantQuantity(product)
  if (quantity <= 0) return OUT_OF_STOCK_LABEL
  if (quantity < LOW_STOCK_THRESHOLD) return LOW_STOCK_LABEL
  return undefined
}

export function mapProductToRoastCollection(
  product: Product,
  placeholderImageUrl: string,
): RoastCollection {
  const { listPrice: price, salePrice } = getProductPricing(product)
  const imageUrl = getProductPrimaryImageUrl(product) ?? placeholderImageUrl
  const badgeLabel = getStockBadgeLabel(product)

  return {
    id: product.id,
    name: product.name,
    price,
    salePrice,
    flavorNotes: productFlavorLine(product),
    roastMeta: formatProductRoastMeta(product),
    roastLevel: product.roastLevel,
    imageUrl,
    badgeLabel,
  }
}

export function parseTastingNotesString(
  notes: string | null | undefined,
): string[] {
  return (notes ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

export function mapProductToEditFormValues(
  product: Product,
): EditProductFormValues {
  const variant = product.variants[0]

  return {
    categoryId: product.categoryId,
    name: product.name,
    description: product.description,
    roastLevel: product.roastLevel,
    isOrganic: product.isOrganic,
    isFairTrade: product.isFairTrade,
    size: variant?.size ?? '',
    unit: variant?.unit ?? '',
    price: variant?.price ?? 0,
    discountType: variant?.discountType ?? DiscountType.PERCENT,
    discountValue: variant?.discountValue ?? 0,
    stockQuantity: variant?.stockQuantity ?? 0,
    origin: product.origin,
    processingMethod: product.processingMethod,
  }
}

// The status the Edit page sends, from the "Listed on Storefront" switch:
// listed is ACTIVE; unlisted keeps DRAFT and ARCHIVED, and turns ACTIVE into
// INACTIVE.
export function resolveEditedProductStatus(
  current: ProductStatus,
  isListedOnStorefront: boolean,
): ProductStatus {
  if (isListedOnStorefront) return ProductStatus.ACTIVE
  if (current === ProductStatus.ACTIVE) return ProductStatus.INACTIVE
  return current
}

/**
 * The Edit page edits the product's first variant only: one update entry with
 * every pricing field, so an unchanged value is sent as it is. None when the
 * product has no variant.
 */
export function buildVariantUpdates(
  product: Product,
  values: EditProductFormValues,
): UpdateProductVariantPayload[] {
  const id = product.variants[0]?.id
  if (!id) return []

  return [
    {
      id,
      ...(values.size !== '' && { size: values.size }),
      ...(values.unit !== '' && { unit: values.unit }),
      price: values.price,
      discountType: values.discountType,
      discountValue: values.discountValue,
    },
  ]
}

/** A Create form variant; the discount is always sent, 0 included. */
export function toCreateVariantPayload(
  values: Pick<
    ProductFormValues,
    'size' | 'price' | 'discountType' | 'discountValue'
  > & { unit: ProductUnit; stockQuantity: number },
  sku: string,
): CreateProductVariantPayload {
  return {
    sku,
    size: Number(values.size),
    unit: values.unit,
    price: Number(values.price),
    discountType: values.discountType,
    discountValue: Number(values.discountValue),
    stockQuantity: Number(values.stockQuantity),
  }
}

// Only fields the forms render an error for; the rest go to the fallback.
const PRODUCT_FORM_FIELDS = [
  'categoryId',
  'name',
  'description',
  'origin',
  'processingMethod',
] as const

const CREATE_VARIANT_FORM_FIELDS = [
  'price',
  'discountValue',
  'stockQuantity',
  'size',
  'unit',
] as const

export type ProductImageErrorTarget = 'avatar' | 'gallery'

export type CreateProductErrorTarget =
  | (typeof PRODUCT_FORM_FIELDS)[number]
  | (typeof CREATE_VARIANT_FORM_FIELDS)[number]
  | ProductImageErrorTarget

const isImageErrorTarget = (field: string): field is ProductImageErrorTarget =>
  field === 'avatar' || field === 'gallery'

/**
 * Separates the image box errors (kept in the form's own state) from the
 * react-hook-form field errors.
 */
export function splitImageErrors<K extends string>(
  fieldErrors: ServerFieldError<K>[],
): {
  imageErrors: Partial<Record<ProductImageErrorTarget, string>>
  formErrors: ServerFieldError<Exclude<K, ProductImageErrorTarget>>[]
} {
  const imageErrors: Partial<Record<ProductImageErrorTarget, string>> = {}
  const formErrors: ServerFieldError<Exclude<K, ProductImageErrorTarget>>[] = []
  for (const { field, message } of fieldErrors) {
    if (isImageErrorTarget(field)) {
      imageErrors[field] = message
    } else {
      formErrors.push({
        field: field as Exclude<K, ProductImageErrorTarget>,
        message,
      })
    }
  }
  return { imageErrors, formErrors }
}

const findField = <F extends string>(fields: readonly F[], name?: string) =>
  fields.find((field) => field === name)

/**
 * The Avatar box for an image entry the payload sent as primary, else the
 * Gallery box: `images` (the array itself) or an index not in the payload.
 */
export function imageErrorTarget(
  images: readonly { isPrimary?: boolean }[] | undefined,
  index?: string,
): ProductImageErrorTarget {
  return index !== undefined && images?.[Number(index)]?.isPrimary
    ? 'avatar'
    : 'gallery'
}

/**
 * The Add form target for an API error path: a field, an image box, or
 * undefined for the fallback. A duplicate SKU goes to Size, since the SKU
 * is built from Size + Unit.
 */
export function createProductErrorTarget(
  apiField: string,
  payload: CreateProductPayload,
): CreateProductErrorTarget | undefined {
  const [root, index, leaf] = apiField.split('.')
  if (root === 'sku') return 'size'
  if (root === 'images') return imageErrorTarget(payload.images, index)
  if (root === 'variants') {
    if (index !== '0') return undefined
    return leaf === 'sku' ? 'size' : findField(CREATE_VARIANT_FORM_FIELDS, leaf)
  }
  return index === undefined ? findField(PRODUCT_FORM_FIELDS, root) : undefined
}

const UPDATE_VARIANT_FORM_FIELDS = [
  'price',
  'discountValue',
  'size',
  'unit',
] as const

export type UpdateProductErrorTarget = CreateProductErrorTarget

/**
 * The Edit form target for an API error path: a field, an image box, or
 * undefined for the fallback. Image entries are looked up in the payload sent.
 */
export function updateProductErrorTarget(
  apiField: string,
  payload: UpdateProductPayload,
): UpdateProductErrorTarget | undefined {
  const [root, index, leaf] = apiField.split('.')
  if (root === 'addImages') return imageErrorTarget(payload.addImages, index)
  if (root === 'updateImages') {
    return imageErrorTarget(payload.updateImages, index)
  }
  if (root === 'removeImageIds') return 'gallery'
  if (root === 'updateVariants') {
    return index === '0'
      ? findField(UPDATE_VARIANT_FORM_FIELDS, leaf)
      : undefined
  }
  return index === undefined ? findField(PRODUCT_FORM_FIELDS, root) : undefined
}

export function mapProductToFormValues(product: Product): ProductFormValues {
  const variant = product.variants[0]
  const hasDiscount =
    Number(variant?.discountValue) > 0 &&
    Number.isFinite(Number(variant?.discountValue))

  const discountType =
    variant?.discountType === DiscountType.FIXED
      ? DiscountType.FIXED
      : DiscountType.PERCENT

  return {
    categoryId: product.categoryId,
    name: product.name,
    description: product.description,
    roastLevel: product.roastLevel,
    isOrganic: product.isOrganic,
    isFairTrade: product.isFairTrade,
    size: variant?.size ?? 0,
    unit: variant?.unit ?? '',
    price: variant?.price ?? 0,
    discountType,
    discountValue: hasDiscount ? (variant?.discountValue ?? 0) : 0,
    stockQuantity: variant?.stockQuantity ?? 0,
    origin: product.origin,
    processingMethod: product.processingMethod,
  }
}

export function splitProductImagesForGallery(product: Product): {
  primaryUrl: string | null
  galleryItems: UploadImageGalleryItem[]
} {
  if (!product.images.length) {
    return { primaryUrl: null, galleryItems: [] }
  }

  const sorted = [...product.images].sort((a, b) => a.sortOrder - b.sortOrder)
  const primary = sorted.find((image) => image.isPrimary) ?? sorted[0] ?? null
  const primaryUrl = primary?.url?.trim() ? primary.url.trim() : null

  const galleryItems: UploadImageGalleryItem[] = sorted
    .filter((image) => image !== primary)
    .map((image, index) => {
      const persistedId = image.id?.trim()
      return {
        id:
          persistedId !== undefined && persistedId !== ''
            ? persistedId
            : `existing-${index}-${image.sortOrder}`,
        url: image.url,
        name: `Gallery ${index + 1}`,
      }
    })

  return { primaryUrl, galleryItems }
}

function normalizeImageUrl(url: string): string {
  return url.trim()
}

export interface ProductUpdateImageDiff {
  addImages: CreateProductImagePayload[]
  removeImageIds: string[]
  updateImages: UpdateProductImagePayload[]
}

/**
 * Builds the desired full image list. Only the avatar (UploadImage) is primary;
 * every gallery image is secondary.
 */
export function buildProductImagesPayload({
  avatarUrl,
  galleryUrls,
}: {
  avatarUrl: string | null
  galleryUrls: string[]
}): CreateProductImagePayload[] {
  const payload: CreateProductImagePayload[] = []
  if (avatarUrl) {
    payload.push({ url: avatarUrl, isPrimary: true, sortOrder: 0 })
  }
  galleryUrls.forEach((url, index) => {
    payload.push({
      url,
      isPrimary: false,
      sortOrder: avatarUrl ? index + 1 : index,
    })
  })
  return payload
}

/**
 * Builds addImages / removeImageIds / updateImages from full desired image list vs initial API state.
 * Matches by URL, consuming each initial image once so duplicate URLs are handled correctly.
 */
export function buildProductUpdateImageDiff(
  initialImages: ProductImage[],
  finalImages: CreateProductImagePayload[],
): ProductUpdateImageDiff {
  const available = new Map<string, ProductImage[]>()
  for (const img of initialImages) {
    const url = normalizeImageUrl(img.url)
    available.set(url, [...(available.get(url) ?? []), img])
  }

  const addImages: CreateProductImagePayload[] = []
  const updateImages: UpdateProductImagePayload[] = []

  for (const fin of finalImages) {
    const url = normalizeImageUrl(fin.url)
    const candidates = available.get(url) ?? []
    // Prefer an unchanged match, then any persisted one.
    const matchIndex = candidates.findIndex(
      (c) =>
        c.id?.trim() &&
        c.sortOrder === fin.sortOrder &&
        c.isPrimary === fin.isPrimary,
    )
    const index =
      matchIndex !== -1
        ? matchIndex
        : candidates.findIndex((c) => Boolean(c.id?.trim()))

    if (index === -1) {
      addImages.push(fin)
      continue
    }

    const [init] = candidates.splice(index, 1)
    const persistedId = init?.id?.trim()
    if (
      persistedId &&
      (init.sortOrder !== fin.sortOrder || init.isPrimary !== fin.isPrimary)
    ) {
      updateImages.push({
        id: persistedId,
        sortOrder: fin.sortOrder,
        isPrimary: fin.isPrimary,
      })
    }
  }

  const removeImageIds: string[] = []
  for (const leftovers of available.values()) {
    for (const img of leftovers) {
      const id = img.id?.trim()
      if (id) removeImageIds.push(id)
    }
  }

  return { addImages, removeImageIds, updateImages }
}
