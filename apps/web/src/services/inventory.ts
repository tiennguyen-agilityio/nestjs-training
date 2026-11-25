import type { AdjustStockPayload, RestockStockPayload } from '@repo/schemas'
import type { InventoryMovementType } from '@repo/constants'

import { IDEMPOTENCY } from '@/constants/common'
import { API_FALLBACK_ERRORS } from '@/constants/messages'
import { API_ROUTES } from '@/constants/routes'
import { apiClient, type ApiResult } from '@/services/api'
import type {
  ApiErrorResponse,
  Response as ApiResponse,
  ResponseMeta,
} from '@/types/api'
import type {
  InventoryItem,
  InventoryMovement,
  StockChangeResult,
} from '@/types/inventory'

type TokenGetter = () => Promise<string | null>

export interface FetchInventoryOptions {
  getToken?: TokenGetter
  page?: number
  limit?: number
  search?: string
  lowStock?: boolean
  /** Only ACTIVE products (the sidebar alert). */
  activeOnly?: boolean
  sort?: 'availableQuantity' | 'stockQuantity' | 'sku'
  order?: 'ASC' | 'DESC'
}

export interface FetchMovementsOptions {
  getToken?: TokenGetter
  page?: number
  limit?: number
  type?: InventoryMovementType
}

interface ReadFailure {
  ok: false
  error: ApiErrorResponse
}

type WriteResult =
  | { ok: true; result: StockChangeResult }
  | {
      ok: false
      error: string
      status?: number
      errorResponse?: ApiErrorResponse
    }

const toApiErrorResponse = (input: {
  error: string
  status?: number
  errorResponse?: ApiErrorResponse
}): ApiErrorResponse =>
  input.errorResponse ?? {
    statusCode: input.status ?? 500,
    message: input.error,
    errors: [],
  }

const variantPath = (id: string) =>
  `${API_ROUTES.PRODUCT_VARIANTS}/${encodeURIComponent(id)}`

/** `GET /inventory`: one row per variant, with the stock level. */
export async function fetchInventory(
  options: FetchInventoryOptions = {},
): Promise<
  { ok: true; items: InventoryItem[]; meta?: ResponseMeta } | ReadFailure
> {
  const { getToken, search, lowStock, activeOnly, ...rest } = options
  const result = await apiClient.get<ApiResponse<InventoryItem[]>>(
    API_ROUTES.INVENTORY,
    {
      getToken,
      query: {
        ...rest,
        search: search?.trim(),
        // An unset flag is left out of the URL.
        lowStock: lowStock ? true : undefined,
        activeOnly: activeOnly ? true : undefined,
      },
      fallbackError: API_FALLBACK_ERRORS.INVENTORY_LOAD,
    },
  )
  if (!result.ok) return { ok: false, error: toApiErrorResponse(result) }

  const { data, meta } = result.data
  return { ok: true, items: Array.isArray(data) ? data : [], meta }
}

/** `GET /product-variants/:id`: fresh numbers for the Adjust dialog. */
export async function fetchInventoryItem(
  id: string,
  options: { getToken?: TokenGetter } = {},
): Promise<{ ok: true; item: InventoryItem } | ReadFailure> {
  const result = await apiClient.get<ApiResponse<InventoryItem>>(
    variantPath(id),
    {
      getToken: options.getToken,
      fallbackError: API_FALLBACK_ERRORS.INVENTORY_ITEM_LOAD,
    },
  )
  if (!result.ok) return { ok: false, error: toApiErrorResponse(result) }

  return { ok: true, item: result.data.data }
}

const postStockChange = async (
  url: string,
  body: RestockStockPayload | AdjustStockPayload,
  options: { getToken?: TokenGetter; idempotencyKey: string },
  fallbackError: string,
): Promise<WriteResult> => {
  // `post` unwraps the `{ data }` envelope.
  const result: ApiResult<StockChangeResult> =
    await apiClient.post<StockChangeResult>(url, body, {
      getToken: options.getToken,
      fallbackError,
      headers: { [IDEMPOTENCY.HEADER]: options.idempotencyKey },
    })
  if (!result.ok) return result

  return { ok: true, result: result.data }
}

/** `POST /product-variants/:id/restock`: adds received units. */
export function restockVariant(
  id: string,
  body: RestockStockPayload,
  options: { getToken?: TokenGetter; idempotencyKey: string },
): Promise<WriteResult> {
  return postStockChange(
    `${variantPath(id)}/restock`,
    body,
    options,
    API_FALLBACK_ERRORS.STOCK_RESTOCK,
  )
}

/** `POST /product-variants/:id/adjustments`: a signed change with a reason. */
export function adjustVariant(
  id: string,
  body: AdjustStockPayload,
  options: { getToken?: TokenGetter; idempotencyKey: string },
): Promise<WriteResult> {
  return postStockChange(
    `${variantPath(id)}/adjustments`,
    body,
    options,
    API_FALLBACK_ERRORS.STOCK_ADJUST,
  )
}

/** `GET /product-variants/:id/movements`: the variant's history, newest first. */
export async function fetchVariantMovements(
  id: string,
  options: FetchMovementsOptions = {},
): Promise<
  | { ok: true; movements: InventoryMovement[]; meta?: ResponseMeta }
  | ReadFailure
> {
  const { getToken, page, limit, type } = options
  const result = await apiClient.get<ApiResponse<InventoryMovement[]>>(
    `${variantPath(id)}/movements`,
    {
      getToken,
      query: { page, limit, type },
      fallbackError: API_FALLBACK_ERRORS.STOCK_HISTORY_LOAD,
    },
  )
  if (!result.ok) return { ok: false, error: toApiErrorResponse(result) }

  const { data, meta } = result.data
  return { ok: true, movements: Array.isArray(data) ? data : [], meta }
}
