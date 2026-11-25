import { act, renderHook, waitFor } from '@testing-library/react'
import { useAuth as useClerkAuth } from '@clerk/nextjs'

import { CLERK_SESSION_TEMPLATE } from '@/constants/common'
import { API_FALLBACK_ERRORS } from '@/constants/messages'
import { useAuth } from '@/hooks/useAuth'
import { fetchUser } from '@/services/user'
import { useUserStore } from '@/store/useUserStore'
import type { User, UserAddress } from '@/types/user'

jest.mock('@clerk/nextjs', () => ({ useAuth: jest.fn() }))
jest.mock('@/services/user', () => ({ fetchUser: jest.fn() }))

const mockUseClerkAuth = jest.mocked(useClerkAuth)
const mockFetchUser = jest.mocked(fetchUser)

const address: UserAddress = {
  id: 'address-1',
  userId: 'user-1',
  addressLine: '12 Roast Street',
  ward: 'Ben Nghe',
  district: 'District 1',
  city: 'Ho Chi Minh',
  postalCode: '700000',
  isDefault: true,
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
}

const profile: User = {
  id: 'user-1',
  email: 'jane@example.com',
  firstName: 'Jane',
  lastName: 'Doe',
  name: 'Jane Doe',
  avatarUrl: null,
  addresses: [],
}

const getToken = jest.fn(async () => 'tok')

const signIn = () =>
  mockUseClerkAuth.mockReturnValue({
    isLoaded: true,
    isSignedIn: true,
    getToken,
  } as unknown as ReturnType<typeof useClerkAuth>)

const renderSignedIn = async () => {
  signIn()
  mockFetchUser.mockResolvedValueOnce({ ok: true, user: profile })
  const hook = renderHook(() => useAuth())
  await waitFor(() => expect(hook.result.current.user).toEqual(profile))
  return hook
}

describe('useAuth', () => {
  beforeEach(() => {
    mockFetchUser.mockReset()
    getToken.mockClear()
    useUserStore.getState().reset()
  })

  it('useAuth refresh replaces the user with the one the API returns', async () => {
    const { result } = await renderSignedIn()
    const withAddress = { ...profile, addresses: [address] }
    mockFetchUser.mockResolvedValueOnce({ ok: true, user: withAddress })

    await act(() => result.current.refresh())

    expect(result.current.user).toEqual(withAddress)
    expect(result.current.error).toBeNull()
  })

  it('useAuth refresh asks for the session template token', async () => {
    const { result } = await renderSignedIn()
    getToken.mockClear()
    mockFetchUser.mockImplementationOnce(async (readToken) => {
      await readToken?.()
      return { ok: true, user: profile }
    })

    await act(() => result.current.refresh())

    expect(getToken).toHaveBeenCalledWith({ template: CLERK_SESSION_TEMPLATE })
  })

  it('useAuth refresh clears the error a failed load left', async () => {
    signIn()
    mockFetchUser.mockResolvedValueOnce({
      ok: false,
      error: API_FALLBACK_ERRORS.PROFILE_LOAD,
    })
    const { result } = renderHook(() => useAuth())
    await waitFor(() =>
      expect(result.current.error).toBe(API_FALLBACK_ERRORS.PROFILE_LOAD),
    )
    mockFetchUser.mockResolvedValueOnce({ ok: true, user: profile })

    await act(() => result.current.refresh())

    expect(result.current.user).toEqual(profile)
    expect(result.current.error).toBeNull()
  })

  it('useAuth refresh keeps the user and sets no error when the request fails', async () => {
    const { result } = await renderSignedIn()
    mockFetchUser.mockResolvedValueOnce({
      ok: false,
      error: API_FALLBACK_ERRORS.PROFILE_LOAD,
    })

    await act(() => result.current.refresh())

    expect(result.current.user).toEqual(profile)
    expect(result.current.error).toBeNull()
  })

  it('useAuth refresh does not turn the loading state on', async () => {
    const { result } = await renderSignedIn()
    const loadingStates: boolean[] = []
    const unsubscribe = useUserStore.subscribe((state) =>
      loadingStates.push(state.isLoading),
    )
    mockFetchUser.mockResolvedValueOnce({ ok: true, user: profile })

    await act(() => result.current.refresh())
    unsubscribe()

    expect(loadingStates).not.toContain(true)
  })
})
