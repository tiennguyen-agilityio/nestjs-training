'use client'

import { ChevronDown, Pencil, Trash2 } from 'lucide-react'

// Types
import type { User } from '@/types/user'
import { UserRole, UserStatus } from '@repo/constants'

// Components
import { Avatar } from '@/components/Avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ROLES_OPTIONS } from '@/constants/user'

// Utils
import { formatUserListEmailForDisplay, getNameInitials } from '@/utils/common'
import { cn } from '@/utils/styles'
import { TABLE_CELL_BADGE_CLASS } from '@/constants/common'

export interface UserTableRowProps {
  user: User
  onRequestRoleChange?: (user: User, nextRole: UserRole) => void
  onRequestEdit?: (user: User) => void
  onRequestDelete?: (user: User) => void
  isRoleDisabled?: boolean
  isEditDisabled?: boolean
  isDeleteDisabled?: boolean
}

export function UserTableRow({
  user,
  onRequestRoleChange,
  onRequestEdit,
  onRequestDelete,
  isRoleDisabled = false,
  isEditDisabled = false,
  isDeleteDisabled = false,
}: UserTableRowProps) {
  const name = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim()
  const initials = getNameInitials(user.firstName, user.lastName)
  const emailRaw = user.email ?? ''
  const emailDisplay = formatUserListEmailForDisplay(emailRaw)
  const imageUrl = user.avatarUrl ?? ''
  const rowRole = user.role ?? UserRole.USER
  const status = user.status ?? UserStatus.INACTIVE
  const isActive = status === UserStatus.ACTIVE
  const isAdmin = rowRole === UserRole.ADMIN
  const isUserDeleted = Boolean(user.deletedAt)
  const roleChangeSubject =
    [name.trim(), emailDisplay].find((segment) => segment.length > 0) ?? 'user'

  return (
    <>
      <td className="min-w-0 px-6 py-4 align-middle">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar size="lg" name={initials} src={imageUrl} alt={name} />
          <div className="min-w-0 flex-1 space-y-0.5">
            <p
              title={name || undefined}
              className="truncate font-semibold text-foreground"
            >
              {name}
            </p>
            <p
              title={emailDisplay === '' ? undefined : emailDisplay}
              className="truncate text-sm text-muted-foreground"
            >
              {emailDisplay}
            </p>
          </div>
        </div>
      </td>
      <td
        data-label="Role"
        className="min-w-0 px-6 py-4 align-middle text-center"
      >
        {onRequestRoleChange ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              disabled={isRoleDisabled}
              aria-label={`Change role for ${roleChangeSubject}`}
              className="inline-flex"
            >
              <Badge
                className={cn(
                  TABLE_CELL_BADGE_CLASS,
                  'transition',
                  isRoleDisabled
                    ? 'cursor-not-allowed opacity-70'
                    : 'cursor-pointer hover:opacity-90',
                  isAdmin
                    ? 'bg-foreground text-background'
                    : 'bg-primary/20 text-primary',
                )}
              >
                {rowRole}
                <ChevronDown className="ml-1 size-3" aria-hidden />
              </Badge>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" className="min-w-32">
              {ROLES_OPTIONS.map((nextRole) => (
                <DropdownMenuItem
                  key={nextRole.value}
                  disabled={isRoleDisabled || nextRole.value === rowRole}
                  onClick={() => onRequestRoleChange(user, nextRole.value)}
                >
                  {nextRole.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Badge
            className={cn(
              TABLE_CELL_BADGE_CLASS,
              isRoleDisabled && 'opacity-70',
              isAdmin
                ? 'bg-foreground text-background'
                : 'bg-primary/20 text-primary',
            )}
          >
            {rowRole}
          </Badge>
        )}
      </td>
      <td
        data-label="Status"
        className="min-w-[65px] px-6 py-4 align-middle text-center"
      >
        <span
          className={cn(
            'inline-flex items-center gap-2 text-sm font-medium',
            isActive ? 'text-foreground' : 'text-muted-foreground',
          )}
        >
          <span
            className={cn(
              'size-2 rounded-full',
              isActive ? 'bg-emerald-500' : 'bg-muted-foreground/40',
            )}
            aria-hidden
          />
          {status}
        </span>
      </td>
      <td
        data-label="Actions"
        className="min-w-0 px-6 py-4 align-middle text-center"
      >
        <div className="flex justify-center gap-1">
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            disabled={isEditDisabled}
            title={
              isUserDeleted ? 'Deleted users cannot be modified' : undefined
            }
            aria-label={`Edit ${name}`}
            onClick={() => onRequestEdit?.(user)}
          >
            <Pencil className="size-4" aria-hidden />
          </Button>
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            disabled={isDeleteDisabled}
            title={
              isDeleteDisabled
                ? isUserDeleted
                  ? 'Deleted users cannot be modified'
                  : 'Delete action in progress'
                : undefined
            }
            aria-label={`Delete ${name}`}
            onClick={() => onRequestDelete?.(user)}
          >
            <Trash2 className="size-4" aria-hidden />
          </Button>
        </div>
      </td>
    </>
  )
}
