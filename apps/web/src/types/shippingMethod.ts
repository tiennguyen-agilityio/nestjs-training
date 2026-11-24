import type { ShippingMethodStatus } from '@repo/constants'

export interface ShippingMethod {
  id: string
  name: string
  description: string
  price: number
  status: ShippingMethodStatus
  createdBy?: string | null
  updatedBy?: string | null
  deletedBy?: string | null
  createdAt: string | null
  updatedAt: string | null
  deletedAt: string | null
}
