import type { UserRole, UserStatus } from '@repo/constants'

export interface User {
  id?: string
  deletedAt?: string | null
  email: string | null
  firstName: string | null
  lastName: string | null
  phoneNumber?: string | null
  name: string | null
  avatarUrl: string | null
  role?: UserRole
  status?: UserStatus
}

export interface UserAddress {
  id: string
  userId: string
  addressLine: string
  ward: string
  district: string
  city: string
  postalCode: string
  isDefault: boolean
  createdAt: string
  updatedAt: string
}

export interface ClerkUser extends User {
  fullName: string | null
  imageUrl: string | null
  primaryEmailAddress?: { emailAddress: string } | null
}
