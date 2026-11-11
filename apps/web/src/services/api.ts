import { ERROR_MESSAGES } from '@/constants/messages'
import type { ApiErrorResponse } from '@/types/api'

type TokenGetter = () => Promise<string | null>

type QueryValue = string | number | boolean | null | undefined

export interface ApiRequestOptions {
  getToken?: TokenGetter
  query?: Record<string, QueryValue>
  fallbackError: string
  /**
   * Public endpoint: never attach Authorization, even when a session exists.
   * Keeps the user's token off requests the API does not authenticate.
   */
  skipAuth?: boolean
}

/**
 * Fallback token source registered once (see AuthTokenBridge) so callers that
 * forget to pass `getToken` still get an Authorization header instead of
 * silently sending unauthenticated requests.
 */
let defaultTokenGetter: TokenGetter | null = null

export function setDefaultTokenGetter(getToken: TokenGetter | null) {
  defaultTokenGetter = getToken
}

export type ApiResult<T> =
  | { ok: true; data: T; status: number }
  | {
      ok: false
      error: string
      status?: number
      errorResponse?: ApiErrorResponse
    }

export class ApiClient {
  private buildUrlWithQuery(
    url: string,
    query?: Record<string, QueryValue>,
  ): string {
    if (!query) return url

    const next = new URL(url)
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === '') continue
      next.searchParams.set(key, String(value))
    }

    return next.toString()
  }

  private parseErrorResponse(body: unknown): ApiErrorResponse | null {
    if (!body || typeof body !== 'object') return null

    const root = body as Record<string, unknown>
    const statusCode = root.statusCode
    const message = root.message
    const errors = root.errors

    if (typeof statusCode !== 'number' || typeof message !== 'string') {
      return null
    }
    if (!Array.isArray(errors)) {
      return null
    }

    return {
      statusCode,
      message,
      errors,
    }
  }

  private async readErrorPayload(
    response: globalThis.Response,
    fallback: string,
  ): Promise<{ message: string; errorResponse?: ApiErrorResponse }> {
    try {
      const body: unknown = await response.json()
      const errorResponse = this.parseErrorResponse(body)
      if (errorResponse) {
        const first = errorResponse.errors?.[0]
        const message = first?.message?.trim()
        const description = first?.description?.trim()
        return {
          message: message ?? description ?? errorResponse.message ?? fallback,
          errorResponse,
        }
      }

      if (body && typeof body === 'object') {
        const root = body as Record<string, unknown>
        const message = root.message ?? root.error
        if (typeof message === 'string' && message.trim()) {
          return { message: message.trim() }
        }
      }
    } catch {
      // Keep fallback when body is empty or non-JSON.
    }

    return { message: fallback }
  }

  private async createHeaders(
    getToken?: TokenGetter,
    options?: { jsonBody?: boolean; skipAuth?: boolean },
  ): Promise<Headers> {
    const headers = new Headers({ Accept: 'application/json' })
    if (!options?.skipAuth) {
      const effectiveGetToken = getToken ?? defaultTokenGetter ?? undefined
      const token = effectiveGetToken ? await effectiveGetToken() : null
      if (token) {
        headers.set('Authorization', `Bearer ${token}`)
      }
    }
    if (options?.jsonBody) {
      headers.set('Content-Type', 'application/json')
    }
    return headers
  }

  private async request<TResponse>({
    url,
    method = 'GET',
    body,
    fallbackError,
    getToken,
    query,
    skipAuth,
    headers: extraHeaders,
    parseSuccess,
  }: {
    url: string
    method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
    body?: unknown
    fallbackError: string
    getToken?: TokenGetter
    query?: Record<string, QueryValue>
    skipAuth?: boolean
    headers?: Record<string, string>
    parseSuccess: (response: globalThis.Response) => Promise<TResponse>
  }): Promise<ApiResult<TResponse>> {
    const headers = await this.createHeaders(getToken, {
      jsonBody: body !== undefined,
      skipAuth,
    })
    for (const [name, value] of Object.entries(extraHeaders ?? {})) {
      headers.set(name, value)
    }
    const requestUrl = this.buildUrlWithQuery(url, query)

    try {
      const response = await fetch(requestUrl, {
        method,
        headers,
        credentials: 'include',
        body: body !== undefined ? JSON.stringify(body) : undefined,
      })

      if (!response.ok) {
        const errorPayload = await this.readErrorPayload(
          response,
          `${fallbackError} (${response.status})`,
        )

        return {
          ok: false,
          error: errorPayload.message,
          status: response.status,
          errorResponse: errorPayload.errorResponse,
        }
      }

      const data = await parseSuccess(response)
      return { ok: true, data, status: response.status }
    } catch (error) {
      return {
        ok: false,
        error:
          error instanceof Error ? error.message : ERROR_MESSAGES.NETWORK_ERROR,
      }
    }
  }

  async get<T>(url: string, options: ApiRequestOptions): Promise<ApiResult<T>> {
    const { getToken, query, fallbackError, skipAuth } = options

    return this.request<T>({
      url,
      getToken,
      query,
      skipAuth,
      fallbackError,
      parseSuccess: async (response) => (await response.json()) as T,
    })
  }

  async post<TResponse>(
    url: string,
    body: unknown,
    options: Omit<ApiRequestOptions, 'query'> & {
      headers?: Record<string, string>
    },
  ): Promise<ApiResult<TResponse>> {
    const { getToken, fallbackError, skipAuth, headers } = options

    return this.request<TResponse>({
      url,
      method: 'POST',
      body,
      getToken,
      skipAuth,
      headers,
      fallbackError,
      parseSuccess: async (response) => {
        try {
          return (await response.json()).data as TResponse
        } catch {
          return {} as TResponse
        }
      },
    })
  }

  async patch<TResponse>(
    url: string,
    body: unknown,
    options: Omit<ApiRequestOptions, 'query'>,
  ): Promise<ApiResult<TResponse>> {
    const { getToken, fallbackError, skipAuth } = options

    return this.request<TResponse>({
      url,
      method: 'PATCH',
      body,
      getToken,
      skipAuth,
      fallbackError,
      parseSuccess: async (response) => {
        try {
          return (await response.json()) as TResponse
        } catch {
          return {} as TResponse
        }
      },
    })
  }

  async put<TResponse>(
    url: string,
    body: unknown,
    options: Omit<ApiRequestOptions, 'query'>,
  ): Promise<ApiResult<TResponse>> {
    const { getToken, fallbackError, skipAuth } = options

    return this.request<TResponse>({
      url,
      method: 'PUT',
      body,
      getToken,
      skipAuth,
      fallbackError,
      parseSuccess: async (response) => {
        try {
          return (await response.json()) as TResponse
        } catch {
          return {} as TResponse
        }
      },
    })
  }

  async delete(
    url: string,
    options: Omit<ApiRequestOptions, 'query'>,
  ): Promise<ApiResult<undefined>> {
    const { getToken, fallbackError, skipAuth } = options

    return this.request<undefined>({
      url,
      method: 'DELETE',
      getToken,
      skipAuth,
      fallbackError,
      parseSuccess: async (response) => {
        const raw = await response.text()
        if (!raw.trim()) {
          return undefined
        }

        try {
          JSON.parse(raw) as unknown
        } catch {
          // Ignore non-JSON success bodies.
        }

        return undefined
      },
    })
  }
}
export const apiClient = new ApiClient()
