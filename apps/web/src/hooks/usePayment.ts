'use client'

import { useAuth } from '@clerk/nextjs'
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { CLERK_SESSION_TEMPLATE } from '@/constants/common'
import { ordersQueryKeys } from '@/hooks/useOrder'
import { startPayment } from '@/services/payment'
import type { PaymentCheckout } from '@/types/order'
import { throwIfServiceFailed } from '@/utils/query'

export function useStartPayment() {
  const queryClient = useQueryClient()
  const { getToken } = useAuth()

  return useMutation({
    mutationFn: async (orderId: string): Promise<PaymentCheckout> => {
      const result = await startPayment(orderId, {
        getToken: () => getToken({ template: CLERK_SESSION_TEMPLATE }),
      })
      if (!result.ok) throwIfServiceFailed(result)
      return result.checkout
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ordersQueryKeys.root })
    },
  })
}
