'use client'

import { useQuery } from '@tanstack/react-query'

import { fetchShippingMethods } from '@/services/shippingMethod'
import type { ShippingMethod } from '@/types/shippingMethod'
import {
  listQueryOptions,
  throwIfServiceFailed,
  toQueryResult,
  type QueryResultState,
} from '@/utils/query'

export interface UseShippingMethodsResult extends QueryResultState {
  shippingMethods: ShippingMethod[]
}

const NO_SHIPPING_METHODS: ShippingMethod[] = []

export function shippingMethodsListQueryKey() {
  return ['shipping-methods', 'list'] as const
}

/** The methods a shopper can pick at checkout (a public read, no token). */
export const useShippingMethods = (): UseShippingMethodsResult => {
  const query = useQuery({
    queryKey: shippingMethodsListQueryKey(),
    queryFn: async () => {
      const result = await fetchShippingMethods()
      if (!result.ok) throwIfServiceFailed(result)
      return result.shippingMethods
    },
    ...listQueryOptions,
  })

  return {
    shippingMethods: query.data ?? NO_SHIPPING_METHODS,
    ...toQueryResult(query),
    // Pending, not fetching: a request paused offline has no answer yet, so
    // checkout must not read it as "no delivery options".
    isLoading: query.isPending,
  }
}
