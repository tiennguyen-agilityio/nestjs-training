import { API_FALLBACK_ERRORS, ERROR_MESSAGES } from '@/constants/messages'
import { API_ROUTES } from '@/constants/routes'
import { deleteUserById, fetchUser, fetchUsers } from '@/services/user'
import { UserRole, UserStatus } from '@repo/constants'

describe('fetchUsers', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('calls users endpoint and returns parsed users', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ id: 'u-1', email: 'user@example.com', role: 'USER' }],
      }),
    })
    globalThis.fetch = fetchMock as typeof fetch

    const result = await fetchUsers()

    expect(fetchMock).toHaveBeenCalledWith(
      `${API_ROUTES.USERS}`,
      expect.objectContaining({
        credentials: 'include',
      }),
    )
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined
    expect(init?.headers).toBeInstanceOf(Headers)
    expect((init?.headers as Headers).get('Accept')).toBe('application/json')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.users).toHaveLength(1)
      expect(result.users[0].id).toBe('u-1')
      expect(result.users[0].role).toBe(UserRole.USER)
    }
  })

  it('maps user_id and snake_case fields from list items', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          {
            user_id: 'usr-9',
            email: 'a@example.com',
            first_name: 'Ada',
            last_name: 'Lovelace',
            role: 'ADMIN',
          },
        ],
      }),
    })
    globalThis.fetch = fetchMock as typeof fetch

    const result = await fetchUsers()

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.users).toHaveLength(1)
      expect(result.users[0].id).toBe('usr-9')
      expect(result.users[0].firstName).toBe('Ada')
      expect(result.users[0].lastName).toBe('Lovelace')
      expect(result.users[0].role).toBe(UserRole.ADMIN)
      expect(result.users[0].deletedAt ?? null).toBeNull()
    }
  })

  it('maps deleted_at from list items when present', async () => {
    const deletedAt = '2026-01-02T00:00:00.000Z'
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          {
            id: 'u-del',
            email: 'gone@example.com',
            deleted_at: deletedAt,
          },
        ],
      }),
    })
    globalThis.fetch = fetchMock as typeof fetch

    const result = await fetchUsers()

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.users[0].deletedAt).toBe(deletedAt)
    }
  })

  it('appends page and limit as query params when provided', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [] }),
    })
    globalThis.fetch = fetchMock as typeof fetch

    await fetchUsers({ page: 2, limit: 15 })

    expect(fetchMock).toHaveBeenCalledWith(
      `${API_ROUTES.USERS}?page=2&limit=15`,
      expect.any(Object),
    )
  })

  it('appends search and role query params when provided', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [] }),
    })
    globalThis.fetch = fetchMock as typeof fetch

    await fetchUsers({ search: '  ada  ', role: 'ADMIN' })

    const calledUrl = String(fetchMock.mock.calls[0]?.[0])
    expect(calledUrl.startsWith(`${API_ROUTES.USERS}?`)).toBe(true)
    expect(calledUrl).toContain('search=ada')
    expect(calledUrl).toContain('role=ADMIN')
  })

  it('appends the status query param when provided', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [] }),
    })
    globalThis.fetch = fetchMock as typeof fetch

    await fetchUsers({ status: UserStatus.INACTIVE })

    const calledUrl = String(fetchMock.mock.calls[0]?.[0])
    expect(calledUrl).toContain('status=INACTIVE')
  })

  it('omits status when not provided', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [] }),
    })
    globalThis.fetch = fetchMock as typeof fetch

    await fetchUsers({ page: 1 })

    const calledUrl = String(fetchMock.mock.calls[0]?.[0])
    expect(calledUrl).not.toContain('status=')
  })

  it('returns http error when response is not ok', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      status: 403,
    })
    globalThis.fetch = fetchMock as typeof fetch

    const result = await fetchUsers()

    expect(result).toEqual({
      ok: false,
      error: `${API_FALLBACK_ERRORS.USERS_LOAD} (403)`,
      status: 403,
    })
  })

  it('returns network error when fetch throws non-error value', async () => {
    const fetchMock = jest.fn().mockRejectedValue('boom')
    globalThis.fetch = fetchMock as typeof fetch

    const result = await fetchUsers()

    expect(result).toEqual({ ok: false, error: ERROR_MESSAGES.NETWORK_ERROR })
  })
})

describe('deleteUserById', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('calls delete user endpoint and returns ok true', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 204,
      json: async () => ({}),
      text: async () => '',
    })
    globalThis.fetch = fetchMock as typeof fetch

    const result = await deleteUserById('u-123')

    expect(fetchMock).toHaveBeenCalledWith(
      `${API_ROUTES.USERS}/u-123`,
      expect.objectContaining({
        method: 'DELETE',
      }),
    )
    expect(result).toEqual({ ok: true })
  })

  it('returns fallback error with status when delete fails', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ message: API_FALLBACK_ERRORS.USER_DELETE }),
    })
    globalThis.fetch = fetchMock as typeof fetch

    const result = await deleteUserById('u-403')

    expect(result).toEqual({
      ok: false,
      error: API_FALLBACK_ERRORS.USER_DELETE,
      status: 403,
      errorResponse: undefined,
    })
  })

  it('returns network error when delete throws non-error value', async () => {
    const fetchMock = jest.fn().mockRejectedValue('boom')
    globalThis.fetch = fetchMock as typeof fetch

    const result = await deleteUserById('u-x')

    expect(result).toEqual({ ok: false, error: ERROR_MESSAGES.NETWORK_ERROR })
  })
})

describe('fetchUser', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  const address = {
    id: 'address-1',
    userId: 'u-1',
    addressLine: '12 Roast Street',
    ward: 'Ben Nghe',
    district: 'District 1',
    city: 'Ho Chi Minh',
    postalCode: '700000',
    isDefault: true,
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
  }

  const mockMe = (data: Record<string, unknown>) => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data }),
    })
    globalThis.fetch = fetchMock as typeof fetch
    return fetchMock
  }

  it('fetchUser GETs /users/me and returns phoneNumber and addresses', async () => {
    const fetchMock = mockMe({
      id: 'u-1',
      email: 'jane@example.com',
      firstName: 'Jane',
      lastName: 'Doe',
      phoneNumber: '0912345678',
      addresses: [address],
    })

    const result = await fetchUser(async () => 'session-token')

    expect(fetchMock).toHaveBeenCalledWith(
      API_ROUTES.ME,
      expect.objectContaining({ credentials: 'include' }),
    )
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit
    expect((init.headers as Headers).get('Authorization')).toBe(
      'Bearer session-token',
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.user.phoneNumber).toBe('0912345678')
      expect(result.user.addresses).toEqual([address])
    }
  })

  it('fetchUser returns no addresses when the response has none', async () => {
    mockMe({ id: 'u-1', email: 'jane@example.com', addresses: 'oops' })

    const result = await fetchUser(async () => 'session-token')

    expect(result.ok && result.user.addresses).toEqual([])
  })

  it('fetchUser drops address entries that are not objects', async () => {
    mockMe({ id: 'u-1', addresses: [address, null, 'x'] })

    const result = await fetchUser(async () => 'session-token')

    expect(result.ok && result.user.addresses).toEqual([address])
  })
})
