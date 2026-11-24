import type { ShippingMethodStatus } from '@repo/constants'

export interface ShippingMethod {
  id: string
  name: string
  description: string
  price: number
  status: ShippingMethodStatus
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}
