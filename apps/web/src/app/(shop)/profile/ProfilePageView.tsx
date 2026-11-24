'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Coffee, Pencil } from 'lucide-react'
import { useUser as useClerkUser } from '@clerk/nextjs'
import { OrderStatus } from '@repo/constants'

// Types
import type { ClerkUser } from '@/types/user'

// Constants
import { DEFAULT_AVATAR } from '@/constants/images'
import { ROUTES, profileOrderPath } from '@/constants/routes'
import { API_FALLBACK_ERRORS } from '@/constants/messages'
import {
  ALL_ORDER_STATUSES_VALUE,
  ORDER_STATUS_FILTER_OPTIONS,
  ORDERS_HISTORY_TABLE_COLUMNS,
} from '@/constants/order'

// Hooks
import { useAuth } from '@/hooks/useAuth'
import { useMyOrders } from '@/hooks/useOrder'

// Utils
import { resolveProfilePresentation } from '@/utils/api'

// Components
import { Button, buttonVariants } from '@/components/ui/button'
import { Avatar } from '@/components/Avatar'
import { EditProfileForm } from '@/sections/EditProfileForm'
import Table from '@/components/Table'
import Loading from '@/components/Loading'
import { Select } from '@/components/Select'
import { PaginationBar } from '@/components/Pagination'
import { ProfileOrderTableRow } from '@/sections/ProfileOrderTableRow'
import { ProfileAccountDialogs } from './ProfileAccountDialogs'

const ORDER_STATUS_VALUES = new Set<string>(Object.values(OrderStatus))

const toOrderStatus = (value: unknown): OrderStatus | undefined =>
  typeof value === 'string' && ORDER_STATUS_VALUES.has(value)
    ? (value as OrderStatus)
    : undefined

export function ProfilePageView() {
  const { user: apiUser, error, isSignedIn, isAuthLoaded } = useAuth()
  const { user: clerkUser, isLoaded: clerkLoaded } = useClerkUser()
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false)
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState<OrderStatus | undefined>(undefined)
  const router = useRouter()
  const { orders, meta, isLoading, isError, errorMessage, refetch } =
    useMyOrders(status ? { page, status } : { page })

  const handleStatusChange = (value: unknown) => {
    setStatus(toOrderStatus(value))
    setPage(1)
  }

  const { displayName, email, imageSrc } = resolveProfilePresentation(
    apiUser,
    (clerkLoaded ? clerkUser : apiUser) as ClerkUser,
    DEFAULT_AVATAR,
  )

  return (
    <div className="bg-background text-on-background">
      <div className="mx-auto max-w-7xl px-8 pb-24 pt-16 md:pt-20">
        <section className="mb-16 grid grid-cols-1 gap-8 lg:grid-cols-12">
          <div className="flex flex-col items-center gap-12 rounded-xl bg-surface-container-low p-8 md:flex-row md:items-start md:p-12 lg:col-span-8">
            <div className="relative shrink-0">
              <Avatar
                key={displayName}
                name={displayName}
                src={imageSrc}
                alt={displayName}
                isProfile
              />
              {/* <Button
                disabled={!isSignedIn}
                type="button"
                size="icon"
                variant="default"
                className="absolute -bottom-4 -right-4 size-12 rounded-full bg-primary text-on-primary shadow-lg hover:scale-105"
                aria-label="Edit profile photo"
                onClick={() => setIsEditProfileOpen(true)}
              >
                <Pencil className="size-5" aria-hidden />
              </Button> */}
            </div>

            <div className="min-w-0 flex-1 text-center md:text-left">
              <div className="mb-2 flex flex-col items-center gap-4 md:flex-row md:items-center md:justify-between">
                <h1 className="font-headline text-4xl text-on-surface md:text-5xl">
                  {displayName}
                </h1>
                <Button
                  disabled={!isSignedIn}
                  type="button"
                  variant="link"
                  className="h-auto w-auto gap-2 p-0 font-semibold text-primary hover:opacity-70"
                  onClick={() => setIsEditProfileOpen(true)}
                >
                  <Pencil className="size-4 shrink-0" aria-hidden />
                  Edit Profile
                </Button>
              </div>
              <p className="mb-2 text-lg text-on-surface-variant">
                {email.length > 0 ? email : '—'}
              </p>
              {isAuthLoaded && !isSignedIn && (
                <p className="mb-2 text-sm text-on-surface-variant">
                  Sign in to load your account from the API.
                </p>
              )}
              {error && isSignedIn && (
                <p className="mb-2 text-sm text-destructive" role="alert">
                  {error}
                </p>
              )}
              <div className="mt-8">
                <ProfileAccountDialogs />
              </div>
            </div>
          </div>

          <div className="relative flex flex-col justify-between overflow-hidden rounded-xl bg-linear-to-br from-primary to-primary-container p-10 text-on-primary lg:col-span-4">
            <div className="relative z-10">
              <p className="mb-2 font-sans text-xs font-medium uppercase tracking-widest opacity-80">
                The Sensory Member
              </p>
              <h2 className="font-headline text-3xl leading-tight text-on-primary">
                Expert <br />
                Brew Enthusiast
              </h2>
            </div>
            <div className="relative z-10 mt-8">
              <div className="mb-2 flex items-end justify-between">
                <span className="text-sm opacity-90">Beans Roasted</span>
                <span className="text-2xl font-bold">128kg</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/20">
                <div className="h-full w-3/4 rounded-full bg-white" />
              </div>
            </div>
            <Coffee
              className="pointer-events-none absolute -bottom-10 -right-10 size-36 opacity-10 md:size-48"
              strokeWidth={1}
              aria-hidden
            />
          </div>
        </section>

        <EditProfileForm
          open={isEditProfileOpen}
          onOpenChange={setIsEditProfileOpen}
        />

        <section className="space-y-8">
          <div className="flex items-center justify-between gap-4">
            <h2 className="font-headline text-3xl text-on-surface">
              Order History
            </h2>
            <div className="w-56">
              <Select
                ariaLabel="Filter by order status"
                options={ORDER_STATUS_FILTER_OPTIONS}
                selected={status ?? ALL_ORDER_STATUSES_VALUE}
                onValueChange={handleStatusChange}
              />
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl bg-surface-container-lowest">
            {isLoading ? (
              <Loading size="lg" label="Loading orders" />
            ) : isError ? (
              <div className="px-8 py-8 text-center">
                <div className="flex flex-col items-center gap-3">
                  <p className="text-sm text-destructive" role="alert">
                    {errorMessage?.trim()
                      ? errorMessage
                      : API_FALLBACK_ERRORS.ORDERS_LOAD}
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    onClick={() => void refetch()}
                  >
                    Retry
                  </Button>
                </div>
              </div>
            ) : orders.length === 0 && !status ? (
              <div className="flex flex-col items-center gap-4 px-8 py-12 text-center text-on-surface-variant">
                <p>No orders yet.</p>
                <Link href={ROUTES.ROASTS} className={buttonVariants()}>
                  Find your first bag
                </Link>
              </div>
            ) : (
              <Table
                columns={ORDERS_HISTORY_TABLE_COLUMNS}
                data={orders}
                getRowKey={(order) => order.id}
                renderRow={(order) => (
                  <ProfileOrderTableRow
                    order={order}
                    onOpen={(nextOrder) =>
                      router.push(profileOrderPath(nextOrder.orderNumber))
                    }
                  />
                )}
                emptyMessage="No orders found."
                tableClassName="w-full border-collapse text-left"
                resolveRowClassName={() =>
                  'cursor-pointer hover:bg-surface-container-low'
                }
                headerClassName="bg-surface-container-low"
                emptyRowClassName="px-8 py-8 text-center text-on-surface-variant"
              />
            )}
          </div>

          {meta && meta.pageCount > 1 && (
            <PaginationBar
              currentPage={page}
              totalPages={meta.pageCount}
              onPageChange={setPage}
              showingCount={orders.length}
              totalCount={meta.totalCount}
              entityLabel="orders"
            />
          )}
        </section>
      </div>
    </div>
  )
}
