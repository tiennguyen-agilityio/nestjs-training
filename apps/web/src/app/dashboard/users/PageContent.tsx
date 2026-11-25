'use client'

import { useEffect, useState } from 'react'
import { Download, Printer, UserPlus } from 'lucide-react'
import { toast } from 'sonner'

// Types
import type { UserRole } from '@repo/constants'
import type { User } from '@/types/user'

// Constants
import { ROUTES } from '@/constants/routes'
import { SUCCESS_MESSAGES } from '@/constants/messages'
import {
  ROLE_FILTER_OPTIONS,
  STATUS_FILTER_OPTIONS,
  STATUS_OPTIONS,
  USERS_TABLE_COLUMNS,
} from '@/constants/user'

// Hooks
import { useDeleteUser, useUpdateUserRole, useUsers } from '@/hooks/useUser'
import { useUrlState } from '@/hooks/useUrlState'
import { useDebouncedUrlSearch } from '@/hooks/useDebouncedUrlSearch'
import { usePageClamp } from '@/hooks/usePageClamp'

// Components
import ConfirmActionDialog from '@/components/ConfirmActionDialog'
import PageHeader from '@/components/PageHeader'
import Table from '@/components/Table'
import { PaginationBar } from '@/components/Pagination'
import { Select } from '@/components/Select'
import { SearchInput } from '@/components/SearchInput'
import { Button } from '@/components/ui/button'
import { UserTableRow } from '@/sections/UserTableRow'
import { EditUserForm } from '@/sections/EditUserForm'

// Utils
import { userUrlSchema } from '@/utils/url'
import { getErrorMessage } from '@/utils/form'
import ListBody from '@/components/ListBody'

export const PageContent = () => {
  const { state, update: updateUrl } = useUrlState(userUrlSchema)
  const { page, search, role, status, limit } = state
  const { searchInput, setSearchInput, searchInputRef } = useDebouncedUrlSearch(
    search,
    updateUrl,
  )

  const normalizedRole =
    role &&
    role !== ROLE_FILTER_OPTIONS[0] &&
    (ROLE_FILTER_OPTIONS as readonly string[]).includes(role)
      ? role
      : null

  const normalizedStatus =
    STATUS_OPTIONS.find((option) => option.value === status)?.value ?? null

  const { users, meta, isLoading, isFetching, isError, errorMessage, refetch } =
    useUsers({
      page,
      limit,
      search: search.trim(),
      role: normalizedRole ?? undefined,
      status: normalizedStatus ?? undefined,
    })

  const totalPages = Math.max(1, meta?.pageCount ?? 1)
  const totalCount = meta?.totalCount ?? users.length
  const showingCount = users.length
  const [pendingRoleUserId, setPendingRoleUserId] = useState<string | null>(
    null,
  )
  const [pendingDeleteUser, setPendingDeleteUser] = useState<User | null>(null)
  const [pendingEditUser, setPendingEditUser] = useState<User | null>(null)
  const [optimisticRoles, setOptimisticRoles] = useState<
    Partial<Record<string, UserRole>>
  >({})
  const { mutate: updateUserRoleMutate } = useUpdateUserRole()
  const { mutate: deleteUserMutate, isPending: isDeletePending } =
    useDeleteUser()

  usePageClamp({ meta, page, totalPages, updateUrl })

  useEffect(() => {
    setOptimisticRoles((current) => {
      let hasChanged = false
      const next = { ...current }
      users.forEach((user) => {
        const userId = user.id
        if (!userId) return
        if (next[userId] && next[userId] === user.role) {
          delete next[userId]
          hasChanged = true
        }
      })
      return hasChanged ? next : current
    })
  }, [users])

  const handleRoleChange = (value: unknown) => {
    if (typeof value !== 'string') return
    updateUrl({
      role: value === ROLE_FILTER_OPTIONS[0] ? null : value,
      page: 1,
    })
  }

  const handleStatusChange = (value: unknown) => {
    if (typeof value !== 'string') return
    updateUrl({
      status: value === STATUS_FILTER_OPTIONS[0].value ? null : value,
      page: 1,
    })
  }

  const handleQueryChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchInput(event.target.value)
  }

  const handleUserRoleUpdate = (user: User, nextRole: UserRole) => {
    const userId = user.id
    if (!userId) return

    setOptimisticRoles((current) => ({ ...current, [userId]: nextRole }))
    setPendingRoleUserId(userId)
    updateUserRoleMutate(
      { id: userId, role: nextRole },
      {
        onSuccess: () => {
          toast.success(SUCCESS_MESSAGES.USER_ROLE_UPDATED)
        },
        onError: (error) => {
          setOptimisticRoles((current) => {
            const next = { ...current }
            delete next[userId]
            return next
          })
          toast.error(getErrorMessage(error))
        },
        onSettled: () => {
          setPendingRoleUserId((current) =>
            current === userId ? null : current,
          )
        },
      },
    )
  }

  const handleUserDeleteRequest = (user: User) => {
    if (!user.id) return
    setPendingDeleteUser(user)
  }

  const handleUserEditRequest = (user: User) => {
    if (!user.id) return
    setPendingEditUser(user)
  }

  const pendingDeleteLabel = (() => {
    if (!pendingDeleteUser) {
      return 'this user'
    }
    const name = [pendingDeleteUser.firstName, pendingDeleteUser.lastName]
      .filter(
        (part): part is string =>
          typeof part === 'string' && part.trim().length > 0,
      )
      .join(' ')
      .trim()
    if (name.length > 0) {
      return name
    }
    return pendingDeleteUser.email ?? 'this user'
  })()

  return (
    <div className="flex flex-col gap-6">
      <ConfirmActionDialog
        data-testid="modal-confirm-delete-user"
        item={pendingDeleteUser}
        onClose={() => setPendingDeleteUser(null)}
        mutate={deleteUserMutate}
        isPending={isDeletePending}
        successMessage={SUCCESS_MESSAGES.USER_DELETED}
        title="Delete user?"
        renderDescription={() => (
          <p>
            Are you sure you want to delete <b>{pendingDeleteLabel}</b>? This
            action cannot be undone.
          </p>
        )}
        textAction="Delete"
      />
      <EditUserForm
        open={pendingEditUser !== null}
        onOpenChange={(open) => {
          if (!open) setPendingEditUser(null)
        }}
        user={pendingEditUser}
      />
      <PageHeader
        breadcrumbItems={[
          { label: 'Dashboard', href: ROUTES.DASHBOARD },
          { label: 'Users', href: ROUTES.DASHBOARD_USERS },
        ]}
        title="Manage Users"
        description="Oversee your users and their roles."
        actions={
          <Button
            variant="default"
            size="default"
            disabled
            className="gap-2 px-8"
          >
            <UserPlus className="size-4" aria-hidden />
            Invite User
          </Button>
        }
      />

      {/* <StatsCards items={USERS_DASHBOARD_STATS} /> */}

      <section className="overflow-hidden rounded-3xl border border-outline-variant/40 bg-card">
        <div className="flex min-w-0 flex-col gap-3 border-b border-outline-variant/30 p-4 md:flex-row md:flex-wrap md:items-center md:gap-3 lg:justify-between">
          <SearchInput
            ref={searchInputRef}
            value={searchInput}
            onChange={handleQueryChange}
            placeholder="Filter by name or email..."
            aria-label="Filter users by name or email"
            containerClassName="h-12 bg-surface-container-high w-full md:w-auto md:min-w-0 md:max-w-md md:flex-1"
          />
          <div className="flex min-w-0 flex-wrap items-center justify-end gap-3">
            <div className="min-w-40">
              <Select
                variant="filter"
                classNameTrigger="capitalize"
                selected={normalizedRole ?? ROLE_FILTER_OPTIONS[0]}
                onValueChange={handleRoleChange}
                options={ROLE_FILTER_OPTIONS.map((option) => ({
                  value: option,
                  label: option
                    .toLowerCase()
                    .replace(/_/g, ' ')
                    .replace(/\b\w/g, (char) => char.toUpperCase()),
                }))}
                placeholder="All Roles"
                ariaLabel="Role filter"
              />
            </div>
            <div className="min-w-40">
              <Select
                variant="filter"
                selected={normalizedStatus ?? STATUS_FILTER_OPTIONS[0].value}
                onValueChange={handleStatusChange}
                options={[...STATUS_FILTER_OPTIONS]}
                placeholder="All statuses"
                ariaLabel="Status filter"
              />
            </div>
            <Button
              disabled
              variant="outline"
              size="icon"
              aria-label="Export users list"
              className="size-11"
            >
              <Download className="size-4" aria-hidden />
            </Button>
            <Button
              disabled
              variant="outline"
              size="icon"
              aria-label="Print users list"
              className="size-11"
            >
              <Printer className="size-4" aria-hidden />
            </Button>
          </div>
        </div>

        <ListBody
          isLoading={isLoading}
          isError={isError}
          errorMessage={errorMessage}
          isFetching={isFetching}
          onRetry={() => void refetch()}
        >
          <Table
            columns={USERS_TABLE_COLUMNS}
            isStackedOnMobile
            data={users}
            getRowKey={(user, index) => user.id ?? `user-${index}`}
            resolveRowClassName={(user) =>
              user.deletedAt
                ? 'border-b border-border bg-muted-foreground/20'
                : ''
            }
            renderRow={(user) => (
              <UserTableRow
                user={
                  user.id && optimisticRoles[user.id]
                    ? { ...user, role: optimisticRoles[user.id] }
                    : user
                }
                onRequestRoleChange={handleUserRoleUpdate}
                onRequestEdit={handleUserEditRequest}
                onRequestDelete={handleUserDeleteRequest}
                isRoleDisabled={
                  pendingRoleUserId === user.id || Boolean(user.deletedAt)
                }
                isEditDisabled={Boolean(user.deletedAt)}
                isDeleteDisabled={isDeletePending || Boolean(user.deletedAt)}
              />
            )}
          />
        </ListBody>

        <footer className="border-t border-outline-variant/30 px-6 py-4">
          <PaginationBar
            currentPage={page}
            totalPages={totalPages}
            onPageChange={(next) => updateUrl({ page: next })}
            showingCount={showingCount}
            totalCount={totalCount}
          />
        </footer>
      </section>
    </div>
  )
}
