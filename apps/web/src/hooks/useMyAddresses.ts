'use client'

import { useAuth } from '@clerk/nextjs'
import { useQuery } from '@tanstack/react-query'

import { CLERK_SESSION_TEMPLATE } from '@/constants/common'
import { fetchMyAddresses } from '@/services/user'
import type { UserAddress } from '@/types/user'
import {
  detailQueryOptions,
  throwIfServiceFailed,
  toQueryResult,
  type QueryResultState,
} from '@/utils/query'

export const addressQueryKeys = {
  root: ['addresses'] as const,
  mine: (userId: string | null | undefined) =>
    ['addresses', 'mine', userId ?? null] as const,
}

export interface UseMyAddressesResult extends QueryResultState {
  addresses: UserAddress[]
  defaultAddress: UserAddress | null
}

const NO_ADDRESSES: UserAddress[] = []

export const useMyAddresses = (): UseMyAddressesResult => {
  const { isLoaded, isSignedIn, userId, getToken } = useAuth()

  const query = useQuery({
    queryKey: addressQueryKeys.mine(userId),
    queryFn: async () => {
      const result = await fetchMyAddresses(() =>
        getToken({ template: CLERK_SESSION_TEMPLATE }),
      )
      if (!result.ok) throwIfServiceFailed(result)
      return result.addresses
    },
    enabled: Boolean(isLoaded && isSignedIn && userId),
    ...detailQueryOptions,
  })

  const addresses = query.data ?? NO_ADDRESSES

  return {
    addresses,
    defaultAddress: addresses.find((address) => address.isDefault) ?? null,
    ...toQueryResult(query),
  }
}
