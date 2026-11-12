import { IDEMPOTENCY } from '@/constants/common'
import { API_FALLBACK_ERRORS } from '@/constants/messages'
import { API_ROUTES } from '@/constants/routes'
import type {
  ApiErrorResponse,
  Response as ApiResponse,
  ResponseMeta,
} from '@/types/api'
import { apiClient } from '@/services/api'
import { ProductStatus, RoastLevel } from '@repo/constants'
import type {
  CreateProductPayload,
  CreateProductVariantPayload,
  UpdateProductPayload,
} from '@repo/schemas'
import type { Product, ProductVariantSummary } from '@/types/product'

export interface ProductOptions {
  getToken?: () => Promise<string | null>
  // Send the session token, so the API answers as the signed-in admin (every
  // status, deleted products included) instead of as a shopper.
  asAdmin?: boolean
  page?: number
  limit?: number
  search?: string
  categoryId?: string
  status?: string
  minPrice?: number
  maxPrice?: number
  roastLevel?: string
  sortBy?: string
}

export async function createProduct(
  body: CreateProductPayload,
  options: Pick<ProductOptions, 'getToken'> & { idempotencyKey: string },
): Promise<
  | { ok: true; product: Product }
  | {
      ok: false
      error: string
      status?: number
      errorResponse?: ApiErrorResponse
    }
> {
  const result = await apiClient.post<unknown>(API_ROUTES.PRODUCTS, body, {
    getToken: options.getToken,
    fallbackError: API_FALLBACK_ERRORS.PRODUCT_CREATE,
    headers: { [IDEMPOTENCY.HEADER]: options.idempotencyKey },
  })
  if (!result.ok) return result

  const json = result.data
  let parsedProduct: Product | null = null
  if (json && typeof json === 'object') {
    const root = json as Record<string, unknown>
    const data = root.data
    if (data && typeof data === 'object') {
      parsedProduct = data as Product
    } else {
      parsedProduct = root as unknown as Product
    }
  }

  return {
    ok: true,
    product: parsedProduct ?? productFromBody('', body),
  }
}

export async function fetchProducts(
  options: ProductOptions = {},
): Promise<
  | { ok: true; products: Product[]; meta?: ResponseMeta }
  | { ok: false; error: string; status?: number }
> {
  const {
    getToken,
    asAdmin,
    page,
    limit,
    search,
    categoryId,
    status,
    minPrice,
    maxPrice,
    roastLevel,
    sortBy,
  } = options
  const result = await apiClient.get<ApiResponse<Product[]>>(
    API_ROUTES.PRODUCTS,
    {
      getToken,
      skipAuth: !asAdmin,
      query: {
        page,
        limit,
        search: search?.trim(),
        categoryId: categoryId?.trim(),
        status: status?.trim(),
        minPrice,
        maxPrice,
        roastLevel: roastLevel?.trim(),
        sortBy: sortBy?.trim(),
      },
      fallbackError: API_FALLBACK_ERRORS.PRODUCTS_LOAD,
    },
  )
  if (!result.ok) return result

  const { data, meta } = result.data
  return { ok: true, products: data, meta }
}

export async function deleteProduct(
  id: string,
  options: Pick<ProductOptions, 'getToken'> = {},
): Promise<{ ok: true } | { ok: false; error: string; status?: number }> {
  const trimmed = id.trim()
  const url = `${API_ROUTES.PRODUCTS}/${encodeURIComponent(trimmed)}`
  const result = await apiClient.delete(url, {
    getToken: options.getToken,
    fallbackError: API_FALLBACK_ERRORS.PRODUCT_DELETE,
  })
  if (!result.ok) return result
  return { ok: true }
}

function isProductShape(value: object): value is Product {
  return (
    'id' in value &&
    typeof (value as Record<string, unknown>).id === 'string' &&
    'name' in value &&
    typeof (value as Record<string, unknown>).name === 'string'
  )
}

function parseProductFromResponse(json: unknown): Product | null {
  if (!json || typeof json !== 'object') return null
  const root = json as Record<string, unknown>
  const data = root.data
  if (data && typeof data === 'object' && isProductShape(data)) {
    return data
  }
  if (isProductShape(root)) {
    return root
  }
  return null
}

export async function fetchProductById(
  id: string,
  options: Pick<ProductOptions, 'getToken' | 'asAdmin'> = {},
): Promise<
  { ok: true; product: Product } | { ok: false; error: string; status?: number }
> {
  const trimmed = id.trim()
  const url = `${API_ROUTES.PRODUCTS}/${encodeURIComponent(trimmed)}`
  const result = await apiClient.get<ApiResponse<Product>>(url, {
    getToken: options.getToken,
    skipAuth: !options.asAdmin,
    fallbackError: API_FALLBACK_ERRORS.PRODUCT_LOAD,
  })
  if (!result.ok) return result

  const parsed = parseProductFromResponse(result.data)
  if (!parsed) {
    return { ok: false, error: API_FALLBACK_ERRORS.PRODUCT_LOAD }
  }
  return { ok: true, product: parsed }
}

const toVariantSummary = (
  variant: CreateProductVariantPayload,
): ProductVariantSummary => ({
  sku: variant.sku,
  weight: variant.weight,
  unit: variant.unit,
  price: variant.price,
  discountType: variant.discountType ?? null,
  discountValue: variant.discountValue ?? null,
  quantity: variant.quantity ?? 0,
})

// Last resort when neither the response nor a refetch gives the product back:
// rebuild it from the body web sent. Web's forms send every core field, so the
// defaults only satisfy the type.
function productFromBody(
  id: string,
  body: CreateProductPayload | UpdateProductPayload,
): Product {
  return {
    id,
    categoryId: body.categoryId ?? '',
    name: body.name ?? '',
    description: body.description ?? '',
    roastLevel: body.roastLevel ?? RoastLevel.MEDIUM,
    isOrganic: body.isOrganic ?? false,
    isFairTrade: body.isFairTrade ?? false,
    status: body.status ?? ProductStatus.DRAFT,
    tastingNotes: body.tastingNotes ?? '',
    origin: body.origin ?? '',
    processingMethod: body.processingMethod ?? '',
    variants: 'variants' in body ? body.variants.map(toVariantSummary) : [],
    images:
      'images' in body
        ? body.images.map((image) => ({
            url: image.url,
            isPrimary: image.isPrimary ?? false,
            sortOrder: image.sortOrder ?? 0,
          }))
        : [],
    createdAt: null,
    updatedAt: null,
    deletedAt: null,
  }
}

export async function updateProduct(
  id: string,
  body: CreateProductPayload | UpdateProductPayload,
  options: Pick<ProductOptions, 'getToken'> = {},
): Promise<
  | { ok: true; product: Product }
  | {
      ok: false
      error: string
      status?: number
      errorResponse?: ApiErrorResponse
    }
> {
  const trimmed = id.trim()
  const url = `${API_ROUTES.PRODUCTS}/${encodeURIComponent(trimmed)}`
  const opts = {
    getToken: options.getToken,
    fallbackError: API_FALLBACK_ERRORS.PRODUCT_UPDATE,
  }

  const result = await apiClient.patch<unknown>(url, body, opts)
  if (!result.ok) return result

  const parsedProduct = parseProductFromResponse(result.data)
  if (parsedProduct) {
    return { ok: true, product: parsedProduct }
  }

  // Only an admin updates, and the product may not be ACTIVE.
  const refetched = await fetchProductById(trimmed, {
    asAdmin: true,
    getToken: options.getToken,
  })
  if (refetched.ok) {
    return { ok: true, product: refetched.product }
  }

  return { ok: true, product: productFromBody(trimmed, body) }
}
