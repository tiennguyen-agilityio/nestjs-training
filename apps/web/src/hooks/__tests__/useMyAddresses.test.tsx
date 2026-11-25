import type { ReactNode } from 'react'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAuth } from '@clerk/nextjs'

import { API_FALLBACK_ERRORS } from '@/constants/messages'
import { addressQueryKeys, useMyAddresses } from '@/hooks/useMyAddresses'
import { fetchMyAddresses } from '@/services/user'
import type { UserAddress } from '@/types/user'

jest.mock('@clerk/nextjs', () => ({ useAuth: jest.fn() }))
jest.mock('@/services/user', () => ({ fetchMyAddresses: jest.fn() }))

const mockUseAuth = jest.mocked(useAuth)
const mockFetchMyAddresses = jest.mocked(fetchMyAddresses)

const addressOf = (overrides: Partial<UserAddress> = {}): UserAddress => ({
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
  ...overrides,
})

const signedIn = (isSignedIn: boolean, userId: string | null = 'clerk-1') =>
  mockUseAuth.mockReturnValue({
    isLoaded: true,
    isSignedIn,
    userId: isSignedIn ? userId : null,
    getToken: jest.fn().mockResolvedValue('session-token'),
  } as unknown as ReturnType<typeof useAuth>)

const renderWithClient = () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { client, ...renderHook(() => useMyAddresses(), { wrapper }) }
}

describe('useMyAddresses', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('useMyAddresses uses the addresses query key and returns the default address', async () => {
    signedIn(true)
    const other = addressOf({
      id: 'address-2',
      addressLine: '5 Side Lane',
      isDefault: false,
    })
    const preferred = addressOf()
    mockFetchMyAddresses.mockResolvedValue({
      ok: true,
      addresses: [other, preferred],
    })

    const { result, client } = renderWithClient()

    await waitFor(() =>
      expect(result.current.defaultAddress?.addressLine).toBe(
        '12 Roast Street',
      ),
    )
    expect(addressQueryKeys.root).toEqual(['addresses'])
    expect(addressQueryKeys.mine('clerk-1')).toEqual([
      'addresses',
      'mine',
      'clerk-1',
    ])
    expect(client.getQueryData(addressQueryKeys.mine('clerk-1'))).toEqual([
      other,
      preferred,
    ])
    expect(result.current.addresses).toEqual([other, preferred])
  })

  it("useMyAddresses never shows another account's cached addresses", async () => {
    signedIn(true, 'clerk-1')
    mockFetchMyAddresses.mockResolvedValue({
      ok: true,
      addresses: [addressOf()],
    })
    const { rerender, result } = renderWithClient()
    await waitFor(() => expect(result.current.defaultAddress).not.toBeNull())

    signedIn(true, 'clerk-2')
    mockFetchMyAddresses.mockReturnValue(new Promise(() => undefined))
    rerender()

    expect(result.current.defaultAddress).toBeNull()
    expect(mockFetchMyAddresses).toHaveBeenCalledTimes(2)
  })

  it('useMyAddresses surfaces the error message', async () => {
    signedIn(true)
    mockFetchMyAddresses.mockResolvedValue({
      ok: false,
      error: API_FALLBACK_ERRORS.ADDRESSES_LOAD,
    })

    const { result } = renderWithClient()

    await waitFor(() =>
      expect(result.current.errorMessage).toBe(
        API_FALLBACK_ERRORS.ADDRESSES_LOAD,
      ),
    )
    expect(result.current.defaultAddress).toBeNull()
  })

  it('useMyAddresses does not fetch when signed out', async () => {
    signedIn(false)

    const { result } = renderWithClient()

    await waitFor(() => expect(result.current.isFetching).toBe(false))
    expect(mockFetchMyAddresses).not.toHaveBeenCalled()
    expect(result.current.defaultAddress).toBeNull()
  })
})
