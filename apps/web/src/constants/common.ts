export const PAGE_SIZE = 12
export const LIST_QUERY_STALE_MS = 60_000
export const LIST_QUERY_GC_MS = 300_000

export const SEARCH_URL_DEBOUNCE_MS = 300

export const LOCAL_STORAGE_KEYS = {
  MANUAL_SIGN_OUT: 'manualSignOut',
}

export const CLERK_SESSION_TEMPLATE = 'custom-session'

/** The API's `Idempotency-Key` contract for create requests. */
export const IDEMPOTENCY = {
  HEADER: 'Idempotency-Key',
  /** errCode of the 409 the API sends while a request with the same key runs. */
  IN_FLIGHT_ERR_CODE: 'duplicateResource',
  IN_FLIGHT_RETRY_MS: 1000,
  IN_FLIGHT_MAX_RETRIES: 5,
} as const
